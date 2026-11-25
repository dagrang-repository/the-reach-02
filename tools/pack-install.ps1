# Reach 02 - pack installer. Puts each door's generated Calling-AI-Models pack onto that site's own folder.
# The hub builds one pack per door; it only works once the ORIGIN serves it. This finds each site's local
# folder, matches it to its door by the hostname the folder itself declares, and writes the files that are
# meant to be served into the site's web root. Nothing is deployed here: tools\pack-deploy.ps1 does that.
#
#   .\tools\pack-install.ps1                 scan only, writes nothing (default)
#   .\tools\pack-install.ps1 -Apply          write the files
#   .\tools\pack-install.ps1 -Apply -Door 3  one door only (its permanent door number)
#   -SearchRoot <path>   where to look for site folders (default: Desktop)
#
# The pack says what goes where: its MANIFEST.json lists what to serve (deploy), what to write only where the
# site has none (soft), what is paste-by-hand material (reference), which Pages control files stay the site's
# own, and which files an earlier pack left that this revision withdraws. A stored pack that predates the
# manifest is rebuilt on the hub first (POST /v1/sites/{id}/pack: a fresh probe, no new briefing); a pack that
# still has none is not installed.
#
# Only served files enter a web root. Everything else - reference material, the site sheet and the work
# order, the copy of anything replaced or withdrawn - is kept in <this repo>\_packs\<host>\, so it can never
# be published by any deploy mechanism.
#
# Safety:
#   - THE SITE'S OWN FILES WIN. A web root carries a pack when its robots.txt says so (the pack's own line).
#     Where it does not, the site has a machine surface of its own: every file already in place is kept, only
#     what is missing is written, and the pack's version of each kept file is saved beside the reference
#     material instead. A site whose own robots.txt states the opposite training answer is not touched at all;
#   - _headers and _redirects are the site's own unless they are a pack's (their text says so), on every site;
#   - a pack's earlier file is copied to _packs\<host>\replaced\<stamp>\ before it is replaced;
#   - a soft file (llms.txt and its family, manifest.json, sw.js) is written only where there is none, or
#     where the one in place is the copy this installer wrote and nobody changed since;
#   - a withdrawn file is moved out only when its text is exactly what an earlier pack wrote;
#   - every file is written as the bytes the hub holds: the pack is taken in one answer, as UTF-8, with no BOM.
param(
  [switch]$Apply,
  [switch]$IncludeNameMatches,   # accepted for old command lines; a folder is matched by its declared host only
  [int]$Door = 0,
  [string]$SearchRoot = "",
  [string]$Hub = "https://reach2.aplusz.app"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
$Hub = $Hub.TrimEnd("/")
$Repo = Split-Path -Parent $PSScriptRoot
$PackRoot = Join-Path $Repo "_packs"
$LogDir = Join-Path $Repo "_logs"
if (-not $SearchRoot) { $SearchRoot = Join-Path $env:USERPROFILE "Desktop" }
$Stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$Utf8 = New-Object Text.UTF8Encoding($false)
# the line a pack's robots.txt carries; the manifest restates it, this stands in for a manifest that does not
$PackMarker = 'names every documented agent \(\d+ named groups|MAXIMAL set: \d+ named groups'
# the training answer a robots.txt states in its first Content-Signal line: yes / no / "" (it does not say)
function Get-TrainingAnswer([string]$robots) {
  $m = [regex]::Match($robots, '(?im)^\s*content-signal\s*:.*?\bai-train\s*=\s*(yes|no)\b')
  if ($m.Success) { return $m.Groups[1].Value.ToLower() }
  return ""
}

function Get-Token {
  if ($env:REACH_ADMIN_TOKEN) { return $env:REACH_ADMIN_TOKEN }
  $f = Join-Path (Join-Path $env:USERPROFILE ".reach") "wd.env.json"
  if (!(Test-Path -LiteralPath $f)) { throw "no admin token: set REACH_ADMIN_TOKEN or keep $f" }
  $ss = ConvertTo-SecureString ((Get-Content -LiteralPath $f -Raw | ConvertFrom-Json).admin)
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))
}

# a pack key ("a/b/c.json") under a base folder, one segment at a time: never a path that climbs out
function Join-Key([string]$base, [string]$key) {
  $p = $base
  foreach ($seg in ($key -split '/')) { if ($seg -and $seg -ne "." -and $seg -ne "..") { $p = Join-Path $p $seg } }
  return $p
}
function New-Folder([string]$dir) { if ($dir -and !(Test-Path -LiteralPath $dir)) { [void][IO.Directory]::CreateDirectory($dir) } }
function Read-Text([string]$file) { try { return ([IO.File]::ReadAllText($file) -replace "`r`n", "`n") } catch { return "" } }
function Get-Sha([string]$file) { try { return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() } catch { return "" } }
function Test-AnyPattern([string]$text, $patterns) {
  foreach ($re in @($patterns)) { try { if ([regex]::IsMatch($text, [string]$re)) { return $true } } catch { } }
  return $false
}
function Copy-File([string]$from, [string]$to) { New-Folder (Split-Path -Parent $to); [IO.File]::Copy($from, $to, $true) }

function Get-WebRoot($folder) {
  # the directory that becomes the site root once deployed
  foreach ($c in "public", "site", "dist", "www", "build") {
    $p = Join-Path $folder $c
    if ((Test-Path -LiteralPath $p) -and (Test-Path -LiteralPath (Join-Path $p "index.html"))) { return $p }
  }
  if (Test-Path -LiteralPath (Join-Path $folder "index.html")) { return $folder }
  foreach ($c in "public", "site", "dist", "www") { $p = Join-Path $folder $c; if (Test-Path -LiteralPath $p) { return $p } }
  return $folder
}

# Every host a folder DECLARES as its own: canonical, og:url, CNAME, wrangler route, sitemap loc,
# robots Sitemap. Links TO other sites (the Reach footer mesh) are deliberately not evidence.
function Get-DeclaredHosts($folder) {
  $hosts = @{}
  $add = { param($h) if ($h) { $k = ($h -replace '^www\.', '').ToLower().Trim(); if ($k -match '^[a-z0-9.-]+\.[a-z]{2,}$') { $cur = 0; if ($hosts.ContainsKey($k)) { $cur = [int]$hosts[$k] }; $hosts[$k] = $cur + 1 } } }
  $files = @()
  foreach ($sub in "", "public", "site", "dist", "www", "build") {
    $d = if ($sub) { Join-Path $folder $sub } else { $folder }
    if (!(Test-Path -LiteralPath $d)) { continue }
    foreach ($f in "index.html", "CNAME", "sitemap.xml", "robots.txt", "wrangler.toml", "wrangler.jsonc", "wrangler.json", "manifest.json") {
      $p = Join-Path $d $f
      if (Test-Path -LiteralPath $p) { $files += $p }
    }
  }
  foreach ($p in $files) {
    $t = Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue
    if (-not $t) { continue }
    $name = Split-Path $p -Leaf
    if ($name -eq "CNAME") { & $add ($t.Trim()); continue }
    foreach ($m in [regex]::Matches($t, '(?i)<link[^>]+rel=["'']canonical["''][^>]+href=["'']https?://([a-z0-9.-]+)')) { & $add $m.Groups[1].Value }
    foreach ($m in [regex]::Matches($t, '(?i)property=["'']og:url["''][^>]+content=["'']https?://([a-z0-9.-]+)')) { & $add $m.Groups[1].Value }
    foreach ($m in [regex]::Matches($t, '(?i)<loc>\s*https?://([a-z0-9.-]+)')) { & $add $m.Groups[1].Value }
    foreach ($m in [regex]::Matches($t, '(?im)^\s*Sitemap:\s*https?://([a-z0-9.-]+)')) { & $add $m.Groups[1].Value }
    if ($name -like "wrangler*") {
      foreach ($m in [regex]::Matches($t, '(?i)(?:pattern|route|routes)["'']?\s*[:=]\s*\[?\s*["'']([a-z0-9.*-]+\.[a-z]{2,})')) { & $add ($m.Groups[1].Value -replace '^\*\.?', '') }
    }
  }
  return $hosts
}

function Build-FolderIndex($roots) {
  $idx = @()
  foreach ($r in $roots) {
    if (!(Test-Path -LiteralPath $r)) { continue }
    $dirs = @(Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue)
    $dirs += @($dirs | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue })
    foreach ($d in $dirs) {
      if ($d.FullName -match '[\\/](_reach-pack|_packs|_logs|node_modules)([\\/]|$)' -or $d.Name -like ".*") { continue }
      if ($idx | Where-Object { $_.folder -eq $d.FullName }) { continue }
      $h = Get-DeclaredHosts $d.FullName
      if ($h.Count -eq 0) { continue }
      $idx += [pscustomobject]@{ folder = $d.FullName; hosts = $h; name = $d.Name }
    }
  }
  return $idx
}

function Find-Folder($hostName, $index, $taken) {
  $bare = ($hostName -replace '^www\.', '').ToLower()
  $best = $null; $bestScore = 0
  foreach ($e in $index) {
    if ($taken.ContainsKey($e.folder)) { continue }
    if (-not $e.hosts.ContainsKey($bare)) { continue }
    $score = [int]$e.hosts[$bare]
    # a folder that declares only this host is a stronger owner than one declaring many
    if ($e.hosts.Count -eq 1) { $score += 10 }
    $slug = ($bare -split '\.')[0] -replace '[^a-z0-9]', ''
    if ((($e.name -replace '[^a-z0-9]', '').ToLower()) -eq $slug) { $score += 5 }
    if ($score -gt $bestScore) { $bestScore = $score; $best = $e }
  }
  if ($best) { return [pscustomobject]@{ folder = $best.folder; how = "url" } }
  return $null
}

# what this installer wrote into a web root, by content hash: the proof that a soft file is still its own copy
function Read-Ledger([string]$file) {
  $map = @{}
  if (Test-Path -LiteralPath $file) {
    try { $j = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json; if ($j.files) { foreach ($p in $j.files.PSObject.Properties) { $map[$p.Name] = [string]$p.Value } } } catch { }
  }
  return $map
}
function Write-Ledger([string]$file, $map, [string]$built, [string]$webRoot) {
  $files = [ordered]@{}
  foreach ($k in ($map.Keys | Sort-Object)) { $files[$k] = $map[$k] }
  $doc = [ordered]@{ installed_at = (Get-Date).ToUniversalTime().ToString("o"); pack_built = $built; web_root = $webRoot; files = $files }
  New-Folder (Split-Path -Parent $file)
  [IO.File]::WriteAllText($file, (($doc | ConvertTo-Json -Depth 4) + "`n"), $Utf8)
}

$tok = Get-Token
$hdr = @{ authorization = "Bearer $tok" }
# One door's whole pack in one answer: every file by its key. The answer is saved as the bytes the hub sent and read
# as UTF-8 here, so nothing depends on how this PowerShell guesses a charset or a media type (Windows PowerShell
# hands back a byte array for a type it does not know as text). No pack yet is an empty list, not an error.
function Get-Pack([string]$siteId, [string]$scratchDir) {
  $files = @{}
  New-Folder $scratchDir
  $f = Join-Path $scratchDir "pack.json"
  try { Invoke-WebRequest -Uri "$Hub/v1/sites/$siteId/pack" -Headers $hdr -UseBasicParsing -TimeoutSec 180 -OutFile $f | Out-Null } catch { return $files }
  $j = [IO.File]::ReadAllText($f, $Utf8) | ConvertFrom-Json
  if ($j.pack -and $j.pack.files) {
    foreach ($p in $j.pack.files.PSObject.Properties) { if ($p.Value -is [string]) { $files[$p.Name] = $p.Value } }
  }
  return $files
}

$sites = @((Invoke-RestMethod -Uri "$Hub/v1/sites" -Headers $hdr -TimeoutSec 120).sites)
$order = @($sites | Sort-Object created_at)
$roots = @($SearchRoot, (Join-Path $SearchRoot "Mini sites"), (Join-Path $SearchRoot "The Base"))
$index = Build-FolderIndex $roots
$hubHost = ([uri]$Hub).Host
$taken = @{}
$rows = @(); $problems = @()
$installed = 0; $written = 0; $same = 0; $skipped = 0; $keptOwn = 0; $withdrawn = 0; $rebuilt = 0; $waiting = 0; $policyHeld = 0; $ownSurface = 0

for ($i = 0; $i -lt $order.Count; $i++) {
  $s = $order[$i]
  # the door's permanent number; the position stands in only for a hub that does not send one
  $n = if ($null -ne $s.door_n -and [int]$s.door_n -gt 0) { [int]$s.door_n } else { $i + 1 }
  if ($Door -and $n -ne $Door) { continue }
  if ($null -ne $s.active -and [int]$s.active -eq 0) { $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = "-"; files = 0; note = "door closed - skipped" }; continue }
  $hostName = ([uri]$s.url).Host
  if ($hostName -eq $hubHost) { $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = "-"; files = 0; note = "the hub itself - the Worker serves these from code" }; continue }
  $hit = Find-Folder $hostName $index $taken
  if (-not $hit) { $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = "-"; files = 0; note = "no folder declares $hostName" }; continue }
  $taken[$hit.folder] = $n
  $web = Get-WebRoot $hit.folder
  $short = $web
  if ($env:USERPROFILE -and $web.StartsWith($env:USERPROFILE)) { $short = "~" + $web.Substring($env:USERPROFILE.Length) }
  if (-not $Apply) { $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $short; files = 0; note = "match by $($hit.how) - ready" }; continue }

  $kit = Join-Path $PackRoot (($hostName -replace '^www\.', '').ToLower() -replace '[^a-z0-9.-]', '_')
  $scratch = Join-Path $kit ".incoming"
  $cnt = 0; $notes = @()
  try {
    $packFiles = Get-Pack $s.id $scratch
    if (-not $packFiles.ContainsKey("_reach-pack/MANIFEST.json")) {
      # no pack yet, or one built before the manifest: the hub probes the origin again and rebuilds it now
      Invoke-RestMethod -Method Post -Uri "$Hub/v1/sites/$($s.id)/pack" -Headers $hdr -TimeoutSec 180 | Out-Null
      $packFiles = Get-Pack $s.id $scratch
      $rebuilt++
    }
    if (-not $packFiles.ContainsKey("_reach-pack/MANIFEST.json")) {
      $waiting++
      $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $short; files = 0; note = "the hub's pack for this door has no manifest - not installed" }
      if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
      continue
    }
    $pack = @($packFiles.Keys | Sort-Object)
    # the pack's own list of what goes where
    $manText = [string]$packFiles["_reach-pack/MANIFEST.json"]
    [IO.Directory]::CreateDirectory($kit) | Out-Null
    [IO.File]::WriteAllText((Join-Path $kit "MANIFEST.json"), $manText, $Utf8)
    $man = $manText | ConvertFrom-Json
    $deployList = @($man.deploy); $softList = @($man.soft); $refList = @($man.reference)
    $ownWins = @($man.own_wins); $withdrawList = @($man.withdraw)
    # the build stamp as the hub wrote it (a newer PowerShell turns a date string into a date; the text is the truth)
    $built = [regex]::Match($manText, '"built"\s*:\s*"([^"]+)"').Groups[1].Value
    $ledgerFile = Join-Path $kit "installed.json"
    $ledger = Read-Ledger $ledgerFile

    # does this web root carry a pack? Its robots.txt says so. Decided once, before anything is written.
    $marker = if ($man.pack_marker) { [string]$man.pack_marker } else { $PackMarker }
    $robotsFile = Join-Path $web "robots.txt"
    $ownRobots = if (Test-Path -LiteralPath $robotsFile) { Read-Text $robotsFile } else { "" }
    $carriesPack = ($ownRobots -ne "") -and (Test-AnyPattern $ownRobots @($marker))
    if ($ownRobots -ne "" -and -not $carriesPack) {
      # the site keeps its own robots.txt: the other places that state a policy must not contradict it
      $theirs = Get-TrainingAnswer $ownRobots
      $ours = if ([string]$man.policy -eq "B") { "no" } else { "yes" }
      if ($theirs -and $theirs -ne $ours) {
        $policyHeld++
        $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $short; files = 0; note = "not installed: its own robots.txt says ai-train=$theirs, the pack says $ours - the door's policy must match the site first" }
        if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
        continue
      }
    }
    $kept = @()

    foreach ($f in $pack) {
      $f = [string]$f
      if ($f -eq "_reach-pack/MANIFEST.json") { continue }
      $isInternal = $f.StartsWith("_reach-pack/")
      $isDeploy = $deployList -contains $f
      $isSoft = $softList -contains $f
      $isRef = $refList -contains $f
      if (-not ($isInternal -or $isDeploy -or $isSoft -or $isRef)) { continue }
      $tmp = Join-Key (Join-Path $scratch "files") $f
      New-Folder (Split-Path -Parent $tmp)
      [IO.File]::WriteAllText($tmp, [string]$packFiles[$f], $Utf8)
      if ($isInternal) { Copy-File $tmp (Join-Key $kit $f.Substring("_reach-pack/".Length)); continue }
      if ($isRef) { Copy-File $tmp (Join-Key $kit $f); continue }

      $target = Join-Key $web $f
      $exists = Test-Path -LiteralPath $target
      $newSha = Get-Sha $tmp
      $curSha = if ($exists) { Get-Sha $target } else { "" }
      $mine = ($exists -and $ledger.ContainsKey($f) -and $ledger[$f] -eq $curSha)   # the copy this installer wrote, untouched
      if ($exists -and $curSha -eq $newSha) { $ledger[$f] = $newSha; $same++; continue }
      if ($isSoft -and $exists -and -not $mine) { $skipped++; continue }
      if ($exists -and -not $mine) {
        # whose file is in place? A control file answers for itself; anything else is a pack's only where the
        # web root carries a pack. The site's own stays, and the pack's version waits beside the reference material.
        $own = @($ownWins | Where-Object { $_.path -eq $f })[0]
        $isPacks = if ($own) { Test-AnyPattern (Read-Text $target) $own.ours } else { $carriesPack }
        if (-not $isPacks) { Copy-File $tmp (Join-Key $kit $f); $keptOwn++; $kept += $f; continue }
        Copy-File $target (Join-Key (Join-Path (Join-Path $kit "replaced") $Stamp) $f)
      }
      Copy-File $tmp $target
      $ledger[$f] = $newSha
      $cnt++; $written++
    }

    # what an earlier pack left in the web root and this revision withdraws: only when the text is that pack's own
    foreach ($w in $withdrawList) {
      $t = Join-Key $web ([string]$w.path)
      if (!(Test-Path -LiteralPath $t)) { continue }
      if (-not (Test-AnyPattern (Read-Text $t) @([string]$w.pattern))) { continue }
      Copy-File $t (Join-Key (Join-Path $kit "withdrawn") ([string]$w.path))
      [IO.File]::Delete($t)
      if ($ledger.ContainsKey([string]$w.path)) { $ledger.Remove([string]$w.path) }
      $withdrawn++; $notes += "withdrew $($w.path)"
    }

    # an earlier install kept its reference material inside the web root: it moves out, whole
    $legacy = Join-Path $web "_reach-pack"
    if (Test-Path -LiteralPath $legacy) {
      $dest = Join-Path $kit "earlier-$Stamp"
      New-Folder $kit
      Copy-Item -LiteralPath $legacy -Destination $dest -Recurse -Force
      if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $legacy -Recurse -Force; $notes += "moved _reach-pack out of the web root" }
    }

    if ($kept.Count) { $notes += "own kept ($($kept.Count)): " + (($kept | Select-Object -First 6) -join ", ") + $(if ($kept.Count -gt 6) { ", ..." } else { "" }) }
    if ($ownRobots -ne "" -and -not $carriesPack) { $ownSurface++ }
    Write-Ledger $ledgerFile $ledger $built $web
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
    $installed++
    $note = "installed"
    if ($notes.Count) { $note += "; " + ($notes -join "; ") }
    $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $short; files = $cnt; note = $note }
  } catch {
    $msg = ([string]$_.Exception.Message -replace '\s+', ' ')
    if ($msg.Length -gt 160) { $msg = $msg.Substring(0, 160) }
    $problems += "door #$n $hostName : $msg"
    $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $short; files = $cnt; note = "FAILED: $msg" }
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

$found = @($rows | Where-Object { $_.folder -ne "-" }).Count
New-Folder $LogDir
$report = Join-Path $LogDir "reach-pack-map.txt"
$lines = @($rows | Sort-Object n | ForEach-Object { "#$($_.n) $($_.site) | $($_.folder) | $($_.files) | $($_.note)" })
[IO.File]::WriteAllText($report, (($lines -join "`r`n") + "`r`n"), $Utf8)
if ($problems.Count) {
  "RESULT: FAIL install: $($problems.Count) door(s) failed"
  $problems | Select-Object -First 4
  "map: _logs\reach-pack-map.txt"
} elseif ($Apply) {
  "RESULT: PASS"
  "installed: $installed site(s) - $written file(s) written, $same unchanged, $skipped soft kept"
  "site's own files kept: $keptOwn - withdrawn: $withdrawn - rebuilt on the hub: $rebuilt"
  "not installed: $waiting without a manifest, $policyHeld on a policy mismatch"
  "own robots.txt on $ownSurface site(s): pack-deploy skips those - deploy them their own way"
  "map: _logs\reach-pack-map.txt - kit: _packs\ - nothing was deployed"
} else {
  "RESULT: PASS"
  "scan: $found of $($rows.Count) doors matched to a folder - nothing written"
  "map: _logs\reach-pack-map.txt - run with -Apply to install"
}
