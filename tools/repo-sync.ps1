#!/usr/bin/env pwsh
#Requires -Version 7.0
# Reach 02 - repo sync. Runs ONLY on GitHub Actions (.github/workflows/reach-daily.yml): pulls the hub's door
# records and rewrites README.md + sites.json in this public repo, then commits and pushes with the workflow's
# own credentials. No PC is in the loop - a workstation clone goes stale and its push is rejected anyway.
# GitHub is crawled heavily by search engines and AI training sets, so what this writes is what they read.
#
# This file is pure ASCII on purpose: every non-ASCII character in the README (the em dash, the middle dot,
# the arrow) is built from its code point, so pwsh can never read the template as Latin-1 and ship mojibake.
# Paths are joined with Join-Path, never with a backslash: on the ubuntu runner "$root\README.md" is a file
# literally named that in the parent directory, and the real README quietly goes stale.
#
#   ./tools/repo-sync.ps1                       # CI only; outside Actions it skips
#   ./tools/repo-sync.ps1 -Local                # manual run on a PC (commits and pushes)
#   ./tools/repo-sync.ps1 -Local -NoGit -Hub http://127.0.0.1:8772   # regenerate the two files from a local Worker
param([switch]$Local, [switch]$NoGit, [string]$Hub = "https://reach2.aplusz.app", [string]$Root = "")
$ErrorActionPreference = "Stop"; if ($PSVersionTable.PSVersion.Major -ge 7) { $PSNativeCommandUseErrorActionPreference = $false }
if (-not $env:GITHUB_ACTIONS -and -not $Local) { "RESULT: PASS"; "repo: skipped - this sync runs on GitHub Actions (pass -Local to override)"; return }
$Hub = $Hub.TrimEnd("/")
$repo = "https://github.com/dagrang-repository/the-reach-02"
$root = if ($Root) { $Root } else { Split-Path -Parent $PSScriptRoot }
$homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$logDir = Join-Path $homeDir ".reach"; $log = Join-Path $logDir "repo-sync.log"
if (!(Test-Path $logDir)) { New-Item $logDir -ItemType Directory -Force | Out-Null }
$utf8 = [Text.UTF8Encoding]::new($false)
$EM = [string][char]0x2014      # em dash
$DOT = [string][char]0x00B7     # middle dot
$ARROW = [string][char]0x2192   # right arrow
$NL = "`n"
function Write-Log($m) { "$(Get-Date -Format s) $m" | Out-File $log -Append -Encoding utf8 }
function Write-Note($level, $title, $m) {
  if (-not $env:GITHUB_ACTIONS) { return }
  $one = ([string]$m) -replace "%", "%25" -replace "`r", "" -replace "`n", " "
  "::${level} title=${title}::" + $one.Substring(0, [Math]::Min(900, $one.Length))
}
function Repair-Mojibake([string]$t) {
  # a description captured once as UTF-8 bytes read as cp1252 (a-circumflex + euro + quote for the em dash, A-circumflex + middle dot)
  # is re-decoded; text without that signature is returned untouched. The human copy must not show it.
  if ($t -notmatch '\u00E2\u20AC|\u00C2[\u00A0-\u00BF]|\u00C3[\u0080-\u00BF]') { return $t }
  try {
    [Text.Encoding]::RegisterProvider([Text.CodePagesEncodingProvider]::Instance)
    $fixed = [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(1252).GetBytes($t))
    if ($fixed -notmatch '\uFFFD') { return $fixed }
  } catch { }
  return $t
}
function Esc($t) { ((Repair-Mojibake ([string]$t)) -replace '\|', '\|' -replace "[`r`n]+", ' ' -replace '\s{2,}', ' ').Trim() }
function Clip([string]$t, [int]$max = 240) {
  # never mid-sentence: whole text when it fits; else the sentences that fit; else the words that fit plus an ellipsis
  $t = Esc $t
  if ($t.Length -le $max) { return $t }
  $head = $t.Substring(0, $max)
  $cut = -1
  foreach ($m in [regex]::Matches($head, '[.!?][\u0022\u201D)]?(\s|$)')) { $end = $m.Index + $m.Length; if ($end -gt $cut) { $cut = $end } }
  if ($cut -ge 60) { return $head.Substring(0, $cut).TrimEnd() }
  $sp = $head.LastIndexOf(' ')
  if ($sp -lt 40) { $sp = $max }
  return $head.Substring(0, $sp).TrimEnd(" ,;:-") + [string][char]0x2026
}
function Get-Text([string]$url) {
  # raw bytes, decoded as UTF-8 - never re-serialized, so the file in the repo is what the hub served
  $c = [System.Net.Http.HttpClient]::new(); $c.Timeout = [TimeSpan]::FromSeconds(120)
  [void]$c.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "ReachRepoSync/1.0 (+$repo)")
  try { $bytes = $c.GetByteArrayAsync($url).GetAwaiter().GetResult() } finally { $c.Dispose() }
  return $utf8.GetString($bytes)
}
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Set-Location $root
  if ($env:GITHUB_ACTIONS -and -not $NoGit) { git config user.name "Reach bot" 2>&1 | Out-Null; git config user.email "dagrang@gmail.com" 2>&1 | Out-Null }
  $sitesText = Get-Text "$Hub/sites.json"
  $sites = $sitesText | ConvertFrom-Json
  $rows = @($sites.sites)
  if ($rows.Count -lt 1) { throw "sites.json returned no doors" }
  $wdCount = "n/a"; $wbSaved = "n/a"
  try { $wdCount = [string][int](Invoke-RestMethod -Uri "$Hub/wikidata.json" -TimeoutSec 120).count } catch { Write-Log "wikidata.json unavailable: $($_.Exception.Message)" }
  try { $wbSaved = [string][int](Invoke-RestMethod -Uri "$Hub/wayback.json" -TimeoutSec 120).saved } catch { Write-Log "wayback.json unavailable: $($_.Exception.Message)" }
  $withQid = @($rows | Where-Object { $_.wikidata }).Count
  $day = if ($sites.generated -match '^(\d{4}-\d{2}-\d{2})') { $Matches[1] } else { (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd") }
  $public = "https://reach2.aplusz.app"

  # sites.json - the machine copy, byte-for-byte what the hub served (LF line ends, one trailing newline)
  $sitesOut = ($sitesText -replace "`r`n", "`n").TrimEnd() + $NL
  [IO.File]::WriteAllText((Join-Path $root "sites.json"), $sitesOut, $utf8)

  # README.md - the human copy with every door
  $table = foreach ($s in $rows) {
    $desc = Clip $s.description 240
    $hostName = ([uri]$s.url).Host -replace '^www\.', ''
    $langs = if ($s.languages_count) { $s.languages_count } elseif ($s.languages) { @($s.languages).Count } else { "1" }
    $q = if ($s.wikidata) { $id = ([string]$s.wikidata -split '/')[-1]; "[$id]($($s.wikidata))" } else { "" }
    "| $($s.n) | [$(Esc $s.name)]($($s.door)) | [$hostName]($($s.url)) | $desc | $langs | $q |"
  }
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("# The Reach 02 $EM The AI Hill Top Lighthouse")
  $L.Add("")
  $L.Add("AI-visibility hub on Cloudflare Workers + D1 $EM live at $public/")
  $L.Add("")
  $L.Add("> Nothing you build ever starts invisible again.")
  $L.Add("")
  $L.Add("A shared directory AI models and search engines fetch to find the live sites in this network. Each site gets a numbered door with a full machine record (name, live URL, sitemap, IndexNow key, llms.txt, description, languages, feed), a Markdown and a JSON twin of its page, rolling Wayback snapshots, a Wikidata link where an item exists, and a which-site-answers-X matcher that returns the live URL to cite $EM or ``best: null`` when no door answers, never an invented one. Hourly change-gated IndexNow pings to seven endpoints, per-site Calling-AI-Models file packs, Workers AI briefings.")
  $L.Add("")
  $L.Add("Everything below the fold of this README is generated: ``README.md`` and ``sites.json`` are rewritten daily from the hub by ``tools/repo-sync.ps1`` on GitHub Actions. Do not hand-edit them.")
  $L.Add("")
  $L.Add("## Machine surfaces")
  $L.Add("")
  $L.Add("Every file is served by the Worker (``src/``) from one resolver; there are no static copies in this repository. Absolute HTTPS URLs throughout.")
  $L.Add("")
  $L.Add("| Surface | URL |")
  $L.Add("|---|---|")
  $L.Add("| Doors for models | $public/llms.txt $DOT $public/llms-full.txt $DOT $public/llms-small.txt $DOT $public/.well-known/llms.txt |")
  $L.Add("| API pointer for models | $public/llms/api.txt |")
  $L.Add("| Door records | $public/sites.json $DOT $public/sites.md |")
  $L.Add("| One door | $public/{n} (HTML; negotiates ``Accept: text/markdown`` and ``application/json``) $DOT $public/{n}.md $DOT $public/{n}.json |")
  $L.Add("| Home twin | $public/index.md |")
  $L.Add("| Atlas + matcher | $public/atlas.json $DOT $public/atlas.md $DOT $public/match?q=your+question |")
  $L.Add("| OpenAPI 3.1 | $public/openapi.json |")
  $L.Add("| MCP server card (SEP-2127) | $public/.well-known/mcp-server-card $DOT aliases $public/.well-known/mcp.json $DOT $public/.well-known/mcp/server-card.json |")
  $L.Add("| MCP endpoint (dual era: ``server/discover`` 2026-07-28 and legacy ``initialize``) | $public/mcp (POST) |")
  $L.Add("| MCP registry manifest | $public/server.json |")
  $L.Add("| A2A 1.0 agent card | $public/.well-known/agent-card.json $DOT alias $public/.well-known/agent.json |")
  $L.Add("| A2A endpoint (``message/send``) | $public/a2a (POST) |")
  $L.Add("| Agent skills | $public/.well-known/agent-skills/index.json $DOT $public/skills/reach/SKILL.md |")
  $L.Add("| API catalog (RFC 9727) | $public/.well-known/api-catalog |")
  $L.Add("| AI catalog (ARD) | $public/.well-known/ai-catalog.json |")
  $L.Add("| Agent permissions / agents | $public/.well-known/agent-permissions.json $DOT $public/.well-known/agents.json |")
  $L.Add("| Policy, one answer in every file | $public/robots.txt $DOT $public/ai.txt $DOT $public/license.xml (RSL) $DOT $public/tdmrep.json $DOT $public/.well-known/tdmrep.json |")
  $L.Add("| Sitemaps | $public/sitemap.xml (index) $ARROW $public/sitemap-doors.xml $DOT $public/sitemap-machine.xml |")
  $L.Add("| Feeds | $public/feed.xml (Atom) $DOT $public/rss.xml (RSS 2.0) $DOT $public/feed.json (JSON Feed, WebSub) |")
  $L.Add("| OpenSearch | $public/opensearch.xml |")
  $L.Add("| Keywords and structure | $public/seo/keywords.json $DOT $public/seo/structure.json |")
  $L.Add("| Knowledge graph | $public/jsonld.json $DOT $public/wikidata.json $DOT $public/wayback.json |")
  $L.Add("| Catalog, changes, pings | $public/catalog.json $DOT $public/changes.txt $DOT $public/pings |")
  $L.Add("| Status, security, trust, humans | $public/status.json $DOT $public/.well-known/security.txt $DOT $public/.well-known/trust.txt $DOT $public/humans.txt |")
  $L.Add("| oEmbed | $public/api/oembed?url=$public/{n} |")
  $L.Add("| PWA | $public/manifest.json $DOT $public/sw.js |")
  $L.Add("| Add a door | $public/add |")
  $L.Add("")
  $L.Add("## Doors ($($rows.Count)) $EM auto-updated $day from [sites.json](sites.json)")
  $L.Add("")
  $L.Add("| # | Door | Live | What it answers | Languages | Wikidata |")
  $L.Add("|---|---|---|---|---|---|")
  foreach ($row in $table) { $L.Add($row) }
  $L.Add("")
  $L.Add("Doors with a Wikidata item: $withQid of $($rows.Count) (hub count: $wdCount) $DOT Wayback snapshots: $wbSaved $DOT one more door: $public/add")
  $L.Add("")
  $L.Add("## How it runs")
  $L.Add("")
  $L.Add("- **Hourly cron** (``0 * * * *``): re-capture the stalest door records, refresh the briefing of ONE rotated site and ping only its changed URLs to the seven IndexNow endpoints, rebuild the map, ping the hub mesh (hub-host URLs only), one Wikidata and one Wayback tick.")
  $L.Add("- **6-hourly cron** (``0 */6 * * *``): re-ingest every door's own llms.txt into the atlas that backs ``/match``.")
  $L.Add("- **Daily on GitHub Actions** (``.github/workflows/reach-daily.yml``, one repository secret ``REACH_ADMIN_TOKEN``): the Wikidata courier (Wikimedia blocks Workers egress; at most one new item per day, deferrals recorded with their cause in ``runs/deferrals.json``), this repo sync, then the APPENDIX B reachability sweep ``tools/reachability.ps1`` over the hub and every door $EM one verdict line, the full log as a build artifact, the result in the job summary. A failing sweep is reported, not hidden, and nothing is pinged over it.")
  $L.Add("")
  $L.Add("## Deploy")
  $L.Add("")
  $L.Add("From the folder on the owner's PC: ``Set-Location `"`$env:USERPROFILE\Desktop\The Reach 02`"; npx wrangler deploy`` (see DEPLOY.md). Worker secrets: ``ADMIN_TOKEN``, ``WD_USER``, ``WD_BOTPASS``. The Wikidata and repo writes never run from a workstation.")
  $L.Add("")
  $L.Add("## Layout")
  $L.Add("")
  $L.Add("| Path | Role |")
  $L.Add("|---|---|")
  $L.Add("| ``src/`` | the Worker: router, resolver, every served file, MCP, A2A, the crons |")
  $L.Add("| ``schema.sql`` | the D1 schema |")
  $L.Add("| ``wrangler.jsonc`` | bindings, the two crons, public vars |")
  $L.Add("| ``tools/`` | the daily CI scripts (``wd-courier.ps1``, ``repo-sync.ps1``, ``reachability.ps1``, ``verify-live.ps1``) and the per-site pack installers |")
  $L.Add("| ``runs/`` | run notes and the deferral ledger |")
  $L.Add("| ``sites.json`` | the door records, mirrored from the hub |")
  $readme = ($L -join $NL) + $NL
  [IO.File]::WriteAllText((Join-Path $root "README.md"), $readme, $utf8)

  if ($NoGit) { "RESULT: PASS"; "repo: wrote README.md and sites.json ($($rows.Count) doors, $withQid with Wikidata, $wbSaved wayback) - no git"; return }
  $ErrorActionPreference = "Continue"   # git talks on stderr; only exit codes matter below
  git add README.md sites.json 2>&1 | Out-Null
  if (Test-Path (Join-Path $root "runs" "deferrals.json")) { git add runs/deferrals.json 2>&1 | Out-Null }
  git diff --cached --quiet 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Log "no change ($($rows.Count) doors)"; "RESULT: PASS"
    Write-Note "notice" "Repo sync" "unchanged - $($rows.Count) doors, $withQid with Wikidata, $wbSaved wayback"
    "repo: unchanged ($($rows.Count) doors, $withQid with Wikidata, $wbSaved wayback)"; return
  }
  $out = git commit -q -m "doors: $($rows.Count) sites, $withQid Wikidata items, $wbSaved Wayback snapshots (auto $day)" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git commit: $($out | Select-Object -Last 2)" }
  $out = git push -q 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git push: $($out | Select-Object -Last 2)" }
  Write-Log "pushed ($($rows.Count) doors, $withQid wikidata, $wbSaved wayback)"
  Write-Note "notice" "Repo sync" "pushed - $($rows.Count) doors, $withQid with Wikidata, $wbSaved wayback"
  "RESULT: PASS"; "repo: pushed $($rows.Count) doors, $withQid with Wikidata, $wbSaved wayback $ARROW $repo"
} catch {
  Write-Log "FAIL $($_.Exception.Message)"
  Write-Note "error" "Repo sync" $_.Exception.Message
  "RESULT: FAIL $($_.Exception.Message)"
  if ($env:GITHUB_ACTIONS) { exit 1 }
}
