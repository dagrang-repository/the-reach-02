# Reach 02 - pack deployer. Pushes the installed packs live, one site at a time, using each folder's own
# deploy mechanism. Detects the mechanism instead of guessing: a wrong Pages project name would create a
# brand-new empty project, so anything ambiguous is reported, never run.
#
#   .\tools\pack-deploy.ps1            plan only, runs nothing (default)
#   .\tools\pack-deploy.ps1 -Apply     run the planned command per site
#   -Only "<name fragment>"            one site only
#
# Housekeeping done first in both modes: reference material (_reach-pack) is moved out of the web root so it
# never ships publicly, and _reach-pack is added to .gitignore where a repo exists.
param(
  [switch]$Apply,
  [string]$Only = "",
  [string]$SearchRoot = "$env:USERPROFILE\Desktop",
  [string]$Hub = "https://reach2.aplusz.app"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Read-Json($p) { try { Get-Content $p -Raw | ConvertFrom-Json } catch { $null } }

# find every folder that now holds an installed pack (robots.txt written by us carries this marker)
function Get-PackFolders($roots) {
  $found = @()
  foreach ($r in $roots) {
    if (!(Test-Path $r)) { continue }
    $dirs = @(Get-ChildItem $r -Directory -ErrorAction SilentlyContinue)
    $dirs += @($dirs | ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue })
    $dirs += @($dirs | ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue })
    foreach ($d in ($dirs | Sort-Object FullName -Unique)) {
      if ($d.Name -eq "node_modules" -or $d.Name -like ".*" -or $d.FullName -like "*_reach-pack*") { continue }
      $rb = Join-Path $d.FullName "robots.txt"
      if (!(Test-Path $rb)) { continue }
      $t = Get-Content $rb -Raw -ErrorAction SilentlyContinue
      if ($t -and $t -match "MAXIMAL set: \d+ named groups") { $found += $d.FullName }
    }
  }
  return $found | Sort-Object -Unique
}

function Get-Project($web) {
  # the folder that holds the deploy config: the web root itself, or its parent when the web root is public/site/dist
  $leaf = Split-Path $web -Leaf
  if ($leaf -in @("public", "site", "dist", "www", "build")) {
    $parent = Split-Path $web -Parent
    foreach ($c in "wrangler.toml", "wrangler.jsonc", "wrangler.json", "package.json", ".git") {
      if (Test-Path (Join-Path $parent $c)) { return $parent }
    }
    return $parent
  }
  return $web
}

function Get-Plan($web) {
  $proj = Get-Project $web
  $cfgName = ""; $isWorker = $false; $isPages = $false
  foreach ($c in "wrangler.jsonc", "wrangler.json", "wrangler.toml") {
    $p = Join-Path $proj $c
    if (!(Test-Path $p)) { continue }
    $raw = Get-Content $p -Raw
    if ($c -like "*.json*") {
      $j = Read-Json $p
      if ($j) { $cfgName = [string]$j.name; if ($j.main) { $isWorker = $true }; if ($j.pages_build_output_dir) { $isPages = $true } }
    } else {
      if ($raw -match '(?m)^\s*name\s*=\s*"([^"]+)"') { $cfgName = $Matches[1] }
      if ($raw -match '(?m)^\s*main\s*=') { $isWorker = $true }
      if ($raw -match '(?m)^\s*pages_build_output_dir\s*=') { $isPages = $true }
    }
    break
  }
  $hasGit = Test-Path (Join-Path $proj ".git")
  $remote = ""
  if ($hasGit) { Push-Location $proj; $remote = (git remote get-url origin 2>$null); Pop-Location }
  if ($isWorker -and -not $isPages) { return [pscustomobject]@{ proj = $proj; web = $web; kind = "worker"; cmd = "npx wrangler deploy"; note = $cfgName } }
  if ($isPages) { return [pscustomobject]@{ proj = $proj; web = $web; kind = "pages-config"; cmd = "npx wrangler pages deploy"; note = $cfgName } }
  if ($remote) { return [pscustomobject]@{ proj = $proj; web = $web; kind = "git"; cmd = "git add -A; git commit; git push"; note = ($remote -replace '.*[/:]', '') } }
  return [pscustomobject]@{ proj = $proj; web = $web; kind = "manual"; cmd = ""; note = "no wrangler config, no git remote" }
}

# Cloudflare's own list of Pages projects, with the domains each one answers on. Table output only:
# the first cell is the project name, the second its domains. No guessing from folder names.
function Get-PagesProjects() {
  $out = @()
  $raw = cmd /c "npx wrangler pages project list 2>&1"
  foreach ($l in $raw) {
    # wrangler prints a space-aligned table: Project Name | Project Domains | Git Provider | Last Modified
    $line = (([string]$l) -replace '[^\x20-\x7E]', '').TrimEnd()
    if (-not $line.Trim()) { continue }
    $cells = @($line.Trim() -split '\s{2,}' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($cells.Count -lt 2) { continue }
    $name = $cells[0]
    if ($name -notmatch '^[a-z0-9][a-z0-9-]{1,62}$') { continue }
    $domains = $cells[1]
    if ($domains -notmatch '\.') { continue }
    $out += [pscustomobject]@{ name = $name; domains = $domains }
  }
  return $out
}
function Resolve-Project($hostName, $projects) {
  if (-not $hostName) { return @() }
  $bare = ($hostName -replace '^www\.', '').ToLower()
  $slug = (($bare -split '\.')[0] -replace '[^a-z0-9]', '')
  # 1. the project that actually serves this domain
  $byDomain = @($projects | Where-Object { $_.domains -and ($_.domains.ToLower() -like "*$bare*") })
  if ($byDomain.Count -eq 1) { return @($byDomain[0].name) }
  # 2. exact slug match on the project name
  $bySlug = @($projects | Where-Object { ($_.name -replace '[^a-z0-9]', '') -eq $slug })
  if ($bySlug.Count -eq 1) { return @($bySlug[0].name) }
  return @()
}
function Get-WebHost($web) {
  # the agent card the installer wrote carries this site's own origin - the most reliable source
  $ac = Join-Path $web ".well-known\agent-card.json"
  if (Test-Path $ac) {
    try { $j = Get-Content $ac -Raw | ConvertFrom-Json; if ($j.provider.url) { return ([uri]$j.provider.url).Host } } catch { }
  }
  foreach ($f in "index.html", "sitemap.xml", "CNAME") {
    $p = Join-Path $web $f
    if (!(Test-Path $p)) { continue }
    $t = Get-Content $p -Raw -ErrorAction SilentlyContinue
    if ($t -match '(?i)rel=["'']canonical["''][^>]+href=["'']https?://([a-z0-9.-]+)') { return $Matches[1] }
    if ($t -match '(?i)<loc>\s*https?://([a-z0-9.-]+)') { return $Matches[1] }
    if ($f -eq "CNAME") { return $t.Trim() }
  }
  return ""
}

$roots = @($SearchRoot, "$SearchRoot\Mini sites", "$SearchRoot\The Base")
$folders = Get-PackFolders $roots
$projects = @()
$lines = @(); $ran = 0; $okCount = 0; $failed = @()

foreach ($web in $folders) {
  if ($Only -and ($web -notlike "*$Only*")) { continue }
  $plan = Get-Plan $web
  $short = $web.Replace("$env:USERPROFILE\", "~\")

  # the hub serves its own files from Worker code - an installed pack there is inert clutter the repo would commit
  if ($plan.note -eq "the-reach-02") {
    foreach ($f in "robots.txt", "ai.txt", "license.xml", "tdmrep.json", "feed.xml", "feed.json", "status.json", "_headers", "_redirects") {
      $t = Join-Path $web $f; if (Test-Path $t) { Remove-Item $t -Force -ErrorAction SilentlyContinue }
    }
    foreach ($d in "seo", ".well-known", "_reach-pack") {
      $t = Join-Path $web $d; if (Test-Path $t) { Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Get-ChildItem $web -Filter "*.txt" -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match '^[0-9a-f]{16,}$' } | Remove-Item -Force -ErrorAction SilentlyContinue
    $lines += "HUB    $short  (pack removed - the Worker serves these from code)"
    continue
  }

  # a folder with no config: ask Cloudflare for the real Pages project names, match by host slug
  if ($plan.kind -eq "manual") {
    if ($projects.Count -eq 0) { $projects = Get-PagesProjects }
    $h = Get-WebHost $web
    $hit = Resolve-Project $h $projects
    if ($hit.Count -eq 1) {
      $plan = [pscustomobject]@{ proj = $plan.proj; web = $web; kind = "pages-name"; cmd = "npx wrangler pages deploy . --project-name=$($hit[0])"; note = $hit[0] }
    } else {
      $plan = [pscustomobject]@{ proj = $plan.proj; web = $web; kind = "manual"; cmd = ""; note = "host '$h' -> no single Pages project (of $($projects.Count) listed)" }
    }
  }

  # housekeeping: reference material must not ship
  $refInWeb = Join-Path $web "_reach-pack"
  if ((Test-Path $refInWeb) -and ($plan.proj -ne $web)) {
    $dest = Join-Path $plan.proj "_reach-pack"
    if (!(Test-Path $dest)) { New-Item $dest -ItemType Directory -Force | Out-Null }
    Copy-Item "$refInWeb\*" $dest -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $refInWeb -Recurse -Force -ErrorAction SilentlyContinue
  }
  $gi = Join-Path $plan.proj ".gitignore"
  if (Test-Path (Join-Path $plan.proj ".git")) {
    $cur = if (Test-Path $gi) { Get-Content $gi -Raw } else { "" }
    if ($cur -notmatch "_reach-pack") { Add-Content $gi "`n_reach-pack/" }
  }

  if (-not $Apply) { $lines += "$($plan.kind.PadRight(12)) $short  ->  $($plan.cmd) $($plan.note)"; continue }
  if ($plan.kind -eq "manual") { $lines += "SKIP   $short  ($($plan.note))"; continue }

  Push-Location $plan.proj
  try {
    $log = ""
    if ($plan.kind -eq "worker") { $log = cmd /c "npx wrangler deploy 2>&1" }
    elseif ($plan.kind -eq "pages-config") { $log = cmd /c "npx wrangler pages deploy 2>&1" }
    elseif ($plan.kind -eq "pages-name") { Pop-Location; Push-Location $web; $log = cmd /c "npx wrangler pages deploy . --project-name=$($plan.note) 2>&1" }
    else {
      $log = cmd /c "git add -A 2>&1"
      cmd /c "git diff --cached --quiet 2>&1" | Out-Null
      if ($LASTEXITCODE -eq 0) { $lines += "NOCHG  $short"; Pop-Location; continue }
      $log = cmd /c "git commit -q -m `"Calling-AI-Models pack v3 (robots 218 groups, MCP SEP-2127, A2A 1.0, pick layer)`" 2>&1"
      if ($LASTEXITCODE -eq 0) { $log = cmd /c "git push 2>&1" }
    }
    $ran++
    if ($LASTEXITCODE -eq 0) { $okCount++; $lines += "OK     $short  ($($plan.kind))" }
    else {
      $failed += $short
      $tail = @($log | Where-Object { $_ } | ForEach-Object { ([string]$_ -replace '[^\x20-\x7E]', '').Trim() } | Where-Object { $_ } | Select-Object -Last 4) -join " / "
      $lines += "FAIL   $short  ($($plan.kind)): $tail"
    }
  } catch {
    $failed += $short; $lines += "FAIL   $short : $($_.Exception.Message)"
  }
  Pop-Location
}

$logFile = Join-Path $env:TEMP "reach-deploy-log.txt"
$lines | Set-Content $logFile -Encoding utf8
$lines
$kinds = ($lines | ForEach-Object { ($_ -split '\s+')[0] } | Group-Object | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join " "
if ($Apply) {
  if ($failed.Count) { "RESULT: FAIL $($failed.Count) of $ran deploys failed"; "failed: $(($failed | Select-Object -First 3) -join ', ')" }
  else { "RESULT: PASS" }
  "deployed: $okCount of $ran - $kinds"
  "log: $logFile"
} else {
  "RESULT: PASS"
  "plan: $($folders.Count) folders - $kinds"
  "log: $logFile - run with -Apply to deploy"
}
