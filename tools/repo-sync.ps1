# Reach 02 — repo sync. Daily on your PC (Task Scheduler "Reach repo sync"): pulls the hub's door records and
# rewrites README.md + sites.json in this public repo, then commits and pushes with the local git credentials
# (no GitHub token anywhere). GitHub is crawled heavily by search engines and AI training sets.
$ErrorActionPreference = "Stop"
$hub = "https://reach2.aplusz.app"; $repo = "https://github.com/dagrang-repository/the-reach-02"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$log = "$env:USERPROFILE\.reach\repo-sync.log"
function Write-Log($m) { "$(Get-Date -Format s) $m" | Out-File $log -Append -Encoding utf8 }
function Esc($t) { [string]$t -replace '\|', '\|' -replace "[`r`n]+", ' ' }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Set-Location $root
  $sites = Invoke-RestMethod -Uri "$hub/sites.json" -TimeoutSec 120
  $wd = Invoke-RestMethod -Uri "$hub/wikidata.json" -TimeoutSec 120
  $wb = Invoke-RestMethod -Uri "$hub/wayback.json" -TimeoutSec 120
  $rows = @($sites.sites)
  if ($rows.Count -lt 1) { throw "sites.json returned no doors" }
  $wdCount = [int]$wd.count; $wbSaved = [int]$wb.saved
  $utf8 = New-Object Text.UTF8Encoding($false)
  # sites.json — the machine copy, verbatim from the hub (pretty-printed)
  [IO.File]::WriteAllText("$root\sites.json", (($sites | ConvertTo-Json -Depth 12) -replace "`r`n", "`n") + "`n", $utf8)
  # README.md — human copy with every door
  $table = foreach ($s in $rows) {
    $desc = Esc $s.description; if ($desc.Length -gt 140) { $desc = $desc.Substring(0, 137) + "..." }
    $hostName = ([uri]$s.url).Host -replace '^www\.', ''
    $langs = if ($s.languages_count) { $s.languages_count } else { "1" }
    $q = if ($s.wikidata) { $id = ($s.wikidata -split '/')[-1]; "[$id]($($s.wikidata))" } else { "" }
    "| $($s.n) | [$(Esc $s.name)]($($s.door)) | [$hostName]($($s.url)) | $desc | $langs | $q |"
  }
  $day = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  $readme = @"
# The Reach 02 — The AI Hill Top Lighthouse

AI-visibility hub on Cloudflare Workers — live at https://reach2.aplusz.app

> Nothing you build ever starts invisible again.

A shared directory AI models fetch to find the live sites in this network: each site gets a numbered door, a full machine record (sitemap, IndexNow key, llms.txt, description, languages, feed), a Wikidata item with labels in every language it publishes, rolling Wayback snapshots, and a which-site-answers-X matcher. IndexNow mesh pings (7 endpoints), per-site Calling-AI-Models file packs, Workers AI briefings, hourly cron with change-gated pings.

## Machine surfaces

- Doors for models: https://reach2.aplusz.app/llms.txt · https://reach2.aplusz.app/llms-full.txt
- Door records (name, URL, sitemap, IndexNow key, llms.txt, description, languages, Wikidata): https://reach2.aplusz.app/sites.json · https://reach2.aplusz.app/sites.md
- Atlas + matcher: https://reach2.aplusz.app/atlas.json · https://reach2.aplusz.app/match?q=your+question
- Knowledge graph (Organization → doors → Wikidata): https://reach2.aplusz.app/jsonld.json · https://reach2.aplusz.app/wikidata.json
- Network sitemap index: https://reach2.aplusz.app/sitemap-index.xml · feed: https://reach2.aplusz.app/feed.xml
- Wayback snapshots: https://reach2.aplusz.app/wayback.json

## Doors ($($rows.Count)) — auto-updated $day from [sites.json](sites.json)

| # | Door | Live | What it answers | Languages | Wikidata |
|---|---|---|---|---|---|
$($table -join "`n")

Wikidata items: $wdCount · Wayback snapshots: $wbSaved · one more door: https://reach2.aplusz.app/add

## Deploy

``npx wrangler deploy`` from this folder (see DEPLOY.md). Secrets: ADMIN_TOKEN, WD_USER, WD_BOTPASS (Cloudflare). The Wikidata and repo writes run from a daily scheduled task (``tools/``) because Wikimedia blocks Workers egress.
"@
  [IO.File]::WriteAllText("$root\README.md", ($readme -replace "`r`n", "`n") + "`n", $utf8)
  $null = cmd /c "git add README.md sites.json 2>&1"
  cmd /c "git diff --cached --quiet 2>&1" | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Log "no change ($($rows.Count) doors)"; "RESULT: PASS"; "repo: unchanged ($($rows.Count) doors, $wdCount wikidata, $wbSaved wayback)"; return }
  $out = cmd /c "git commit -q -m `"doors: $($rows.Count) sites, $wdCount Wikidata items, $wbSaved Wayback snapshots (auto $day)`" 2>&1 && git push -q 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "git: $($out | Select-Object -Last 2)" }
  Write-Log "pushed ($($rows.Count) doors, $wdCount wikidata, $wbSaved wayback)"
  "RESULT: PASS"; "repo: pushed $($rows.Count) doors, $wdCount wikidata, $wbSaved wayback → $repo"
} catch {
  Write-Log "FAIL $($_.Exception.Message)"
  "RESULT: FAIL $($_.Exception.Message)"
}
