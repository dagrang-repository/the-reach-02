# Reach 02 - pack installer. Puts each door's generated Calling-AI-Models pack onto that site's own folder.
# The hub builds 53 files per door; they only work once the ORIGIN serves them. This finds each site's local
# folder, matches it to its door by hostname, and writes the deployable files into the site's web root.
#
#   .\tools\pack-install.ps1                 scan only, writes nothing (default)
#   .\tools\pack-install.ps1 -Apply          write the files
#   .\tools\pack-install.ps1 -Apply -Door 3  one door only
#   -SearchRoot <path>   where to look for site folders (default: Desktop)
#
# Safety: never silently clobbers. Anything replaced is copied to <site>\_reach-pack\replaced\ first.
# manifest.json and sw.js are skipped when the site already has its own (its PWA wins).
# Reference-only files (head block, headers, JSON-LD, footer snippets) land in <site>\_reach-pack\ to paste by hand.
param(
  [switch]$Apply,
  [switch]$IncludeNameMatches,   # by default -Apply only writes where the folder proves the URL
  [int]$Door = 0,
  [string]$SearchRoot = "$env:USERPROFILE\Desktop",
  [string]$Hub = "https://reach2.aplusz.app"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# files that belong on the live origin, at this exact path
$DEPLOY = @(
  "robots.txt", "ai.txt", "license.xml",
  "tdmrep.json", "feed.xml", "feed.json", "status.json", "_headers", "_redirects",
  "seo/keywords.json", "seo/structure.json",
  ".well-known/llms.txt", ".well-known/tdmrep.json", ".well-known/security.txt", ".well-known/trust.txt",
  ".well-known/mcp-server-card", ".well-known/mcp.json", ".well-known/mcp/server-card.json",
  ".well-known/agent-card.json", ".well-known/agent.json", ".well-known/agents.json",
  ".well-known/agent-permissions.json", ".well-known/agent-skills/index.json",
  ".well-known/ai-catalog.json", ".well-known/api-catalog"
)
# only written when the site has none of its own (its own llms.txt is the atlas source of truth - never clobbered)
$SOFT = @("manifest.json", "sw.js", "llms.txt", "llms-small.txt", "llms-full.txt", "llms/api.txt", "opensearch.xml")
# paste-by-hand material - never written into the live tree
$REFERENCE = @(
  "head-block.html", "HTTP-HEADERS.md", "og-x-cards.html", "JSON-LD.json", "markdown-twin-footer.md",
  "reach-footer.html", "AGENTS.md", "server.json", "scripts/agents-diff.sh", "SKILL.md", "ping.sh",
  "oembed.html", "KEYWORDS.json", "SITE-STRUCTURE.md", "_reach-pack/SITE-STRUCTURE.md", "_reach-pack/NOT-SHIPPED.md",
  ".well-known/agent-skills/README.txt", "OPEN-DOORS.json", "BACKLINKS.json", "SEARCH-INTENT.json"
)

function Get-Token {
  if ($env:REACH_ADMIN_TOKEN) { return $env:REACH_ADMIN_TOKEN }
  $f = "$env:USERPROFILE\.reach\wd.env.json"
  if (!(Test-Path $f)) { throw "no admin token: set REACH_ADMIN_TOKEN or keep $f" }
  $ss = ConvertTo-SecureString ((Get-Content $f -Raw | ConvertFrom-Json).admin)
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))
}

function Get-WebRoot($folder) {
  # the directory that becomes the site root once deployed
  foreach ($c in "public", "site", "dist", "www", "build") {
    $p = Join-Path $folder $c
    if ((Test-Path $p) -and (Get-ChildItem $p -Filter "index.html" -ErrorAction SilentlyContinue)) { return $p }
  }
  if (Test-Path (Join-Path $folder "index.html")) { return $folder }
  foreach ($c in "public", "site", "dist", "www") { $p = Join-Path $folder $c; if (Test-Path $p) { return $p } }
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
    if (!(Test-Path $d)) { continue }
    foreach ($f in "index.html", "CNAME", "sitemap.xml", "robots.txt", "wrangler.toml", "wrangler.jsonc", "wrangler.json", "manifest.json") {
      $p = Join-Path $d $f
      if (Test-Path $p) { $files += $p }
    }
  }
  foreach ($p in $files) {
    $t = Get-Content $p -Raw -ErrorAction SilentlyContinue
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
    if (!(Test-Path $r)) { continue }
    $dirs = @(Get-ChildItem $r -Directory -ErrorAction SilentlyContinue)
    $dirs += @($dirs | ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue })
    foreach ($d in $dirs) {
      if ($d.FullName -like "*\_reach-pack*" -or $d.Name -eq "node_modules" -or $d.Name -like ".*") { continue }
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

$tok = Get-Token
$hdr = @{ authorization = "Bearer $tok" }
$sites = (Invoke-RestMethod -Uri "$Hub/v1/sites" -Headers $hdr -TimeoutSec 120).sites
$order = @($sites | Sort-Object created_at)
$roots = @($SearchRoot, "$SearchRoot\Mini sites", "$SearchRoot\The Base")
$index = Build-FolderIndex $roots
$taken = @{}
$rows = @()
$installed = 0; $written = 0; $skipped = 0

for ($i = 0; $i -lt $order.Count; $i++) {
  $s = $order[$i]; $n = $i + 1
  if ($Door -and $n -ne $Door) { continue }
  $hostName = ([uri]$s.url).Host
  $hit = Find-Folder $hostName $index $taken
  if (-not $hit) { $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = "-"; files = 0; note = "no folder declares $hostName" }; continue }
  $taken[$hit.folder] = $n
  $web = Get-WebRoot $hit.folder
  if ($Apply -and $hit.how -eq "name" -and -not $IncludeNameMatches) {
    $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $web.Replace("$env:USERPROFILE\", "~\"); files = 0; note = "name-only match - skipped (use -IncludeNameMatches)" }
    continue
  }
  if (-not $Apply) {
    $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $web.Replace("$env:USERPROFILE\", "~\"); files = 0; note = "match by $($hit.how) - ready" }
    continue
  }
  $pack = (Invoke-RestMethod -Uri "$Hub/v1/sites/$($s.id)/files" -Headers $hdr -TimeoutSec 180).files
  $bak = Join-Path $web "_reach-pack\replaced"
  $ref = Join-Path $web "_reach-pack"
  $cnt = 0
  foreach ($f in @($pack)) {
    $isDeploy = $DEPLOY -contains $f
    $isSoft = $SOFT -contains $f
    $isRef = $REFERENCE -contains $f
    $isKey = $f -match '^[0-9a-f]{8,}\.txt$'
    if (-not ($isDeploy -or $isSoft -or $isRef -or $isKey)) { continue }
    try { $body = Invoke-WebRequest -Uri "$Hub/v1/sites/$($s.id)/files/$f" -Headers $hdr -UseBasicParsing -TimeoutSec 120 } catch { continue }
    # a pack key that already starts with _reach-pack/ is written under the site root once, never nested twice
    $target = if ($isRef -and $f -notlike '_reach-pack/*') { Join-Path $ref $f } else { Join-Path $web $f }
    if ($isSoft -and (Test-Path $target)) { $skipped++; continue }
    $dir = Split-Path $target -Parent
    if (!(Test-Path $dir)) { New-Item $dir -ItemType Directory -Force | Out-Null }
    if ((Test-Path $target) -and -not $isRef) {
      $bp = Join-Path $bak $f; $bd = Split-Path $bp -Parent
      if (!(Test-Path $bd)) { New-Item $bd -ItemType Directory -Force | Out-Null }
      Copy-Item $target $bp -Force
    }
    [IO.File]::WriteAllText($target, ($body.Content -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
    $cnt++; $written++
  }
  $installed++
  $rows += [pscustomobject]@{ n = $n; site = $s.name; folder = $web.Replace("$env:USERPROFILE\", "~\"); files = $cnt; note = "installed" }
}

$found = @($rows | Where-Object { $_.folder -ne "-" }).Count
$byUrl = @($rows | Where-Object { $_.note -like "match by url*" }).Count
$byName = @($rows | Where-Object { $_.note -like "match by name*" }).Count
$report = Join-Path $env:TEMP "reach-pack-map.txt"
($rows | Format-Table -AutoSize | Out-String) | Set-Content $report -Encoding utf8
foreach ($r in $rows) { "#$($r.n) $($r.site) | $($r.folder) | $($r.files) | $($r.note)" }
if ($Apply) {
  "RESULT: PASS"
  "packs installed: $installed sites, $written files written, $skipped soft-skipped"
  "map: $report - deploy each folder yourself; nothing was deployed"
} else {
  "RESULT: PASS"
  "scan: $found of $($rows.Count) doors matched - $byUrl by url (safe), $byName by name (needs -IncludeNameMatches)"
  "map: $report"
}
