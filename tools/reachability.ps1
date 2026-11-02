#!/usr/bin/env pwsh
#Requires -Version 7.0
# Reach 02 - APPENDIX B reachability sweep, for the hub and for every door it lists.
# A port of the sibling repo's scripts/reachability.sh (the pool game) to PowerShell 7, so the same
# sweep runs on ubuntu-latest (GitHub Actions) and on the owner's Windows PC with no curl, no sh.
#
#   pwsh tools/reachability.ps1                              # the live hub + every door in /sites.json
#   pwsh tools/reachability.ps1 -HubOnly                     # the hub's 19 sections only
#   pwsh tools/reachability.ps1 -Hub http://127.0.0.1:8772   # a local Worker (wrangler dev / the rig)
#   pwsh tools/reachability.ps1 -Doors 1,2,9 -Echo           # three doors, log echoed to the console
#
# Prints ONE verdict line - "RESULT: PASS" or "RESULT: FAIL <first failure>" - then the log path.
# Exit code 1 on FAIL. Every fact goes to the log; next to it, reach-doors.json carries one verdict per door.
# Nothing is pinged over a failing sweep (PART 12, PART 22 step 6). The sweep never writes to the hub.
param(
  [string]$Hub = "https://reach2.aplusz.app",
  [string]$Key = "",                 # the hub's IndexNow key; read from wrangler.jsonc when omitted and present
  [switch]$HubOnly,
  [int[]]$Doors = @(),               # limit the per-door pass to these door numbers
  [string]$Log = "",
  [int]$TimeoutSec = 20,
  [string]$Post = "",                # admin token: POST reach-doors.json to $Hub/v1/sweep so the cycle never pings over a FAIL
  [switch]$Echo
)
$ErrorActionPreference = "Stop"
$Hub = $Hub.TrimEnd("/")
if ($Hub -notmatch '^https?://') { $Hub = "https://$Hub" }
$HubHost = ([uri]$Hub).Host
$script:UA = "ReachSweep/1.0 (+$Hub/humans.txt)"
$utf8 = [Text.UTF8Encoding]::new($false)
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
if (-not $Log) {
  if ($env:REACH_LOG) { $Log = $env:REACH_LOG }
  else {
    $desk = Join-Path $HOME "Desktop"
    $dir = if (Test-Path $desk) { $desk } else { $HOME }
    $Log = Join-Path $dir "reach-$stamp.log"
  }
}
$DoorsJson = Join-Path (Split-Path -Parent $Log) "reach-doors.json"
if (-not $Key) {
  $wr = Join-Path (Split-Path -Parent $PSScriptRoot) "wrangler.jsonc"
  if (Test-Path $wr) {
    $m = [regex]::Match((Get-Content $wr -Raw), '"INDEXNOW_KEY"\s*:\s*"([A-Za-z0-9_-]{8,128})"')
    if ($m.Success) { $Key = $m.Groups[1].Value }
  }
}

# ---------------------------------------------------------------- plumbing
$script:Lines = [System.Collections.Generic.List[string]]::new()
$script:Fails = [System.Collections.Generic.List[string]]::new()
$script:Fail = ""
function Log([string]$s) { $script:Lines.Add($s); if ($Echo) { Write-Host $s } }
function Note([string]$m) { if (-not $script:Fail) { $script:Fail = $m }; $script:Fails.Add($m); Log "  !! $m" }
function Warn([string]$m) { Log "  ?? $m" }
function Section([string]$t) { Log ""; Log "## $t" }
function Cut([string]$s, [int]$n) { $s = ($s -replace '\s+', ' '); if ($s.Length -gt $n) { $s.Substring(0, $n) } else { $s } }
# Served files name the canonical origin (publicBase). When -Hub is a local Worker, every hub URL inside a served
# file is rewritten to -Hub before it is probed, so the sweep never leaves the machine (and never pings).
$script:Canon = $Hub; $script:CanonHost = $HubHost
function Local([string]$u) { if ($u -eq $script:Canon -or $u.StartsWith("$($script:Canon)/")) { return $Hub + $u.Substring($script:Canon.Length) }; return $u }

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::All
$script:Client = [System.Net.Http.HttpClient]::new($handler)
$script:Client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$script:Client.DefaultRequestHeaders.ExpectContinue = $false

function Probe([string]$Url, [string]$Method = "GET", [hashtable]$Headers = @{}, $Body = $null, [string]$ContentType = "application/json") {
  $r = [pscustomobject]@{ Url = $Url; Code = 0; Status = "err"; Type = ""; Headers = @{}; Bytes = [byte[]]@(); Text = ""; Error = "" }
  for ($try = 0; $try -lt 2; $try++) {
    try {
      $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Url)
      $ua = if ($Headers.ContainsKey("User-Agent")) { $Headers["User-Agent"] } else { $script:UA }
      [void]$req.Headers.TryAddWithoutValidation("User-Agent", $ua)
      foreach ($k in $Headers.Keys) { if ($k -ne "User-Agent") { [void]$req.Headers.TryAddWithoutValidation($k, [string]$Headers[$k]) } }
      if ($null -ne $Body) { $req.Content = [System.Net.Http.StringContent]::new([string]$Body, $utf8, $ContentType) }
      $res = $script:Client.Send($req)
      $r.Code = [int]$res.StatusCode; $r.Status = [string]$r.Code
      $ct = $res.Content.Headers.ContentType; $r.Type = if ($ct) { $ct.ToString() } else { "" }
      foreach ($h in $res.Headers) { $r.Headers[$h.Key.ToLowerInvariant()] = ($h.Value -join ", ") }
      foreach ($h in $res.Content.Headers) { $r.Headers[$h.Key.ToLowerInvariant()] = ($h.Value -join ", ") }
      $r.Bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $r.Text = $utf8.GetString($r.Bytes)
      $r.Error = ""
      $res.Dispose()
      return $r
    } catch {
      $e = $_.Exception; $msg = $e.Message
      while ($e.InnerException) { $e = $e.InnerException; $msg = $e.Message }
      $r.Error = $msg; $r.Status = "err"; $r.Code = 0
      Start-Sleep -Milliseconds 400
    }
  }
  return $r
}
function Get-Code([string]$Url, [hashtable]$Headers = @{}) { (Probe $Url "GET" $Headers).Status }
function Get-Body([string]$Url, [hashtable]$Headers = @{}) { (Probe $Url "GET" $Headers).Text }
function Post-Json([string]$Url, $Obj, [hashtable]$Headers = @{}) { Probe $Url "POST" $Headers (ConvertTo-Json -InputObject $Obj -Depth 12 -Compress) }
function Hash([byte[]]$b) { if (-not $b -or $b.Length -eq 0) { return "empty" }; ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($b)) -replace "-", "").Substring(0, 16).ToLower() }
function Follow([string]$Url, [hashtable]$Headers = @{}, [int]$Hops = 4) {
  # the home page of a door may legitimately 301 (http->https, apex->www); the final answer is what counts
  $cur = $Url
  for ($i = 0; $i -le $Hops; $i++) {
    $r = Probe $cur "GET" $Headers
    if ($r.Code -in 301, 302, 303, 307, 308 -and $r.Headers.ContainsKey("location")) {
      $loc = $r.Headers["location"]
      $cur = if ($loc -match '^https?://') { $loc } else { ([uri]::new([uri]$cur, $loc)).AbsoluteUri }
      continue
    }
    $r | Add-Member -NotePropertyName Final -NotePropertyValue $cur -Force
    return $r
  }
  $r | Add-Member -NotePropertyName Final -NotePropertyValue $cur -Force
  return $r
}
function Test-Placeholder([string]$t) {
  # a 200 with a template string is a lie (PART 13). TODO is matched as a word, case-sensitive, so a door
  # whose copy says "to do" never trips it; the others are case-insensitive.
  if ($t -cmatch '\bTODO\b') { return "TODO" }
  $m = [regex]::Match($t, 'YOUR\.DOMAIN|YOUR_DOMAIN|your-domain|example\.com|REPLACE_WITH|https:///|lorem ipsum|YOUR_KEY\b|YOUR_ORIGIN_KEY|YOUR-INDEXNOW-KEY', 'IgnoreCase')
  if ($m.Success) { return $m.Value }
  return ""
}
function Test-Challenge([string]$t) { $t -match 'cf-chl|cf_chl_|challenge-platform|Just a moment\.\.\.|Verify you are human|Checking your browser|Attention Required! \| Cloudflare|/cdn-cgi/challenge' }
function Lines([string]$t) { ($t -replace "`r", "") -split "`n" }
function TrainingAnswer([string]$t) {
  # the one training answer a file gives: yes / no / "" (the file does not say)
  if ($t -match 'ai-train\s*=\s*yes') { return "yes" }
  if ($t -match 'ai-train\s*=\s*no') { return "no" }
  return ""
}
$ProtectedTokens = @("googlebot", "bingbot", "oai-searchbot", "claude-searchbot", "perplexitybot", "applebot", "duckassistbot", "meta-webindexer",
  "amzn-searchbot", "mistralai-index", "kimi-searchbot", "bravebot", "chatgpt-user", "claude-user", "perplexity-user", "mistralai-user", "amzn-user", "gemini-user", "kimi-user")
function Test-RobotsShape([string]$R, [string]$label) {
  # returns the facts; notes the failures. Groups are parsed the RFC 9309 way: tokens accumulate until a rule.
  $ls = Lines $R
  $groups = @($ls | Where-Object { $_ -match '^\s*user-agent\s*:' }).Count
  $allows = @($ls | Where-Object { $_ -match '^\s*allow\s*:' }).Count
  $disallows = @($ls | Where-Object { $_ -match '^\s*disallow\s*:\s*\S' }).Count
  Log "  $label groups=$groups allows=$allows disallows=$disallows"
  $tokens = @(); $inRules = $false
  foreach ($l in $ls) {
    if ($l -match '^\s*user-agent\s*:\s*(.+?)\s*(#.*)?$') {
      if ($inRules) { $tokens = @(); $inRules = $false }
      $tok = $Matches[1]; $tokens += $tok.ToLowerInvariant()
      if ($tok -match 'mozilla/|like gecko|applewebkit/|\+http') { Note "$label robots.txt has a browser string as a token: $tok" }
      continue
    }
    if ($l -match '^\s*disallow\s*:\s*(\S+)') {
      $inRules = $true; $p = $Matches[1]
      if ($tokens -contains "*" -and $p -eq "/") { Note "$label robots.txt has Disallow: / under User-agent: * (unpublishing)" }
      foreach ($t in $tokens) { if ($ProtectedTokens -contains $t) { Note "$label robots.txt Disallows $t - a search index or user fetcher (PART 4 / PART 5)" } }
      continue
    }
    if ($l -match '^\s*(allow|crawl-delay|sitemap|content-signal|content-usage|license)\s*:') { $inRules = $true }
  }
  if ($R -notmatch '(?im)^\s*sitemap\s*:') { Note "$label robots.txt missing Sitemap:" }
  return @{ groups = $groups; allows = $allows; disallows = $disallows }
}
function Test-Policy([string]$origin, [string]$label, [bool]$requireA) {
  # PART 12 item 14: the same training answer in every file that states one. Doors are held to agreement;
  # the hub is held to Policy A (search=yes, ai-input=yes, ai-train=yes) in all six places.
  $R = Get-Body "$origin/robots.txt"
  $sig = (Lines $R | Where-Object { $_ -match '^\s*content-signal\s*:' } | Select-Object -First 1)
  $use = (Lines $R | Where-Object { $_ -match '^\s*content-usage\s*:' } | Select-Object -First 1)
  $managed = @(Lines $R | Where-Object { $_ -match 'BEGIN Cloudflare Managed' }).Count
  Log ("  {0,-26} {1}" -f "robots Content-Signal", ($(if ($sig) { $sig.Trim() } else { "(none)" })))
  Log ("  {0,-26} {1}" -f "robots Content-Usage", ($(if ($use) { $use.Trim() } else { "(none)" })))
  Log ("  {0,-26} {1} block(s)" -f "cloudflare managed", $managed)
  $answers = @{}
  $a = TrainingAnswer ([string]$sig); if ($a) { $answers["robots Content-Signal"] = $a }
  if ($use) {
    if ($use -match 'train-ai\s*=\s*y\b') { $answers["robots Content-Usage"] = "yes" } elseif ($use -match 'train-ai\s*=\s*n\b') { $answers["robots Content-Usage"] = "no" }
  }
  $ai = Probe "$origin/ai.txt"
  if ($ai.Code -eq 200) {
    $t = TrainingAnswer $ai.Text
    if (-not $t) { if ($ai.Text -match '(?im)^\s*training\s*:\s*allowed') { $t = "yes" } elseif ($ai.Text -match '(?im)^\s*training\s*:\s*(disallowed|not allowed|no)') { $t = "no" } }
    if ($t) { $answers["ai.txt"] = $t }
    Log ("  {0,-26} {1}" -f "ai.txt", ($(if ($t) { $t } else { "(no training line)" })))
  }
  $lic = Probe "$origin/license.xml"
  if ($lic.Code -eq 200) {
    $t = ""
    if ($lic.Text -match '<permits[^>]*>[^<]*ai-train') { $t = "yes" } elseif ($lic.Text -match '<prohibits[^>]*>[^<]*ai-train') { $t = "no" }
    if ($t) { $answers["license.xml"] = $t }
    Log ("  {0,-26} {1}" -f "license.xml", ($(if ($t) { $t } else { "(ai-train not stated)" })))
  }
  $td = Probe "$origin/tdmrep.json"
  if ($td.Code -ne 200) { $td = Probe "$origin/.well-known/tdmrep.json" }
  if ($td.Code -eq 200) {
    $t = ""
    $flat = $td.Text -replace '\s', ''
    if ($flat -match '"tdm-reservation":0') { $t = "yes" } elseif ($flat -match '"tdm-reservation":1') { $t = "no" }
    if ($t) { $answers["tdmrep.json"] = $t }
    Log ("  {0,-26} {1}" -f "tdmrep.json", ($(if ($t) { $t } else { "(no reservation field)" })))
  }
  $ll = Probe "$origin/llms.txt"
  if ($ll.Code -eq 200) {
    $t = TrainingAnswer $ll.Text
    if (-not $t) {
      $line = (Lines $ll.Text | Where-Object { $_ -match 'ai-train' } | Select-Object -First 1)
      if ($line -match 'ai-train[^.]*\b(permitted|allowed)\b' -and $line -notmatch '\bnot\b') { $t = "yes" }
      elseif ($line -match 'ai-train[^.]*(not permitted|not allowed|prohibited|reserved)') { $t = "no" }
    }
    if ($t) { $answers["llms.txt terms"] = $t }
    Log ("  {0,-26} {1}" -f "llms.txt terms", ($(if ($t) { $t } else { "(no terms line)" })))
  }
  $ap = Probe "$origin/.well-known/agent-permissions.json"
  if ($ap.Code -eq 200) {
    $t = ""
    try { $j = $ap.Text | ConvertFrom-Json; if ($null -ne $j.defaults.train) { $t = $(if ($j.defaults.train) { "yes" } else { "no" }) } } catch {}
    if ($t) { $answers["agent-permissions"] = $t }
    Log ("  {0,-26} {1}" -f "agent-permissions", ($(if ($t) { $t } else { "(no defaults.train)" })))
  }
  $distinct = @($answers.Values | Sort-Object -Unique)
  if ($distinct.Count -gt 1) {
    $who = ($answers.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ", "
    Note "$label training answers disagree: $who"
  }
  if ($requireA) {
    foreach ($need in @("robots Content-Signal", "license.xml", "ai.txt", "tdmrep.json", "llms.txt terms", "agent-permissions")) {
      if (-not $answers.ContainsKey($need)) { Note "$label $need does not state a training answer (Policy A needs all six)" }
      elseif ($answers[$need] -ne "yes") { Note "$label $need says ai-train=$($answers[$need]) - Policy A is yes" }
    }
    if ($sig -notmatch 'search\s*=\s*yes' -or $sig -notmatch 'ai-input\s*=\s*yes') { Note "$label Content-Signal is not search=yes, ai-input=yes" }
  } elseif ($answers.Count) {
    Log "  $label training answer: $($distinct -join '/') in $($answers.Count) file(s)"
  } else {
    Log "  $label states no training answer in any file"
  }
  return $R
}
$UAs = @(
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
function ShortUA([string]$ua) { $m = [regex]::Match($ua, '(?:compatible[;,] )?([A-Za-z-]+bot|[A-Za-z]+-User|Applebot|Chrome)', 'IgnoreCase'); if ($m.Success) { $m.Groups[1].Value } else { "ua" } }
function Test-UAProbe([string]$url, [string]$label, [int]$minBytes) {
  $dead = $false
  foreach ($ua in $UAs) {
    $short = ShortUA $ua
    if ($dead) { Log ("  {0,-6} {1,-8} {2}" -f "skip", "-", $short); continue }
    $r = Follow $url @{ "User-Agent" = $ua }
    $n = $r.Bytes.Length
    Log ("  {0,-6} {1,-8} {2}" -f $r.Status, $n, $short)
    if ($r.Status -eq "err") { Note "$label UA $short -> $($r.Error)"; $dead = $true; continue }
    if ($r.Code -ne 200) { Note "$label UA $short -> $($r.Code) (PART 6, the CDN gate)"; continue }
    if ($n -lt $minBytes) { Note "$label UA $short got only ${n}B - a challenge page?" }
    elseif (Test-Challenge $r.Text) { Note "$label UA $short got a challenge page" }
  }
}

# ================================================================ the hub
$B = $Hub
Log "### reachability sweep  $B  $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))  pwsh $($PSVersionTable.PSVersion) on $([Environment]::OSVersion.Platform)"
$sitesRes = Probe "$B/sites.json"
$sites = @()
try { $sites = @(($sitesRes.Text | ConvertFrom-Json).sites) } catch { }
if ($sitesRes.Code -ne 200 -or $sites.Count -lt 1) { Note "hub /sites.json -> $($sitesRes.Status) with $($sites.Count) doors $($sitesRes.Error)" }
$first = if ($sites.Count) { [int]$sites[0].n } else { 1 }
$last = if ($sites.Count) { [int]$sites[-1].n } else { 1 }
$missingN = $last + 99968
if ($sites.Count -and [string]$sites[0].door -match '^(https://[^/]+)') { $script:Canon = $Matches[1]; $script:CanonHost = ([uri]$script:Canon).Host }
$Canon = $script:Canon; $CanonHost = $script:CanonHost
Log "doors in /sites.json: $($sites.Count) (first $first, last $last)"
if ($Canon -ne $B) { Log "canonical origin named in the served files: $Canon (probed at $B)" }

Section "1. every declared path"
$card = Probe "$B/.well-known/mcp-server-card"
$cardName = ""; try { $cardName = ($card.Text | ConvertFrom-Json).name } catch {}
$paths = @(
  "/", "/index.md", "/robots.txt", "/ai.txt", "/sitemap.xml", "/sitemap-index.xml", "/sitemap-doors.xml", "/sitemap-machine.xml",
  "/llms.txt", "/llms-full.txt", "/llms-small.txt", "/llms/api.txt", "/.well-known/llms.txt",
  "/license.xml", "/tdmrep.json", "/.well-known/tdmrep.json", "/opensearch.xml", "/manifest.json", "/sw.js",
  "/feed.xml", "/atom.xml", "/rss.xml", "/feed.json", "/openapi.json", "/status.json", "/server.json",
  "/.well-known/security.txt", "/.well-known/trust.txt", "/.well-known/agent-permissions.json", "/.well-known/agents.json",
  "/.well-known/ai-catalog.json", "/.well-known/api-catalog",
  "/.well-known/mcp-server-card", "/.well-known/mcp.json", "/.well-known/mcp/server-card.json", "/.well-known/mcp-server",
  "/.well-known/agent-card.json", "/.well-known/agent.json",
  "/.well-known/agent-skills/index.json", "/.well-known/skills/index.json", "/.well-known/agent-skills/reach/SKILL.md", "/skills/reach/SKILL.md",
  "/sites.json", "/sites.md", "/atlas.json", "/atlas.md", "/match?q=visa", "/jsonld.json", "/wikidata.json", "/wayback.json",
  "/catalog.json", "/OPEN-DOORS.json", "/AGENTS.md", "/humans.txt", "/seo/keywords.json", "/seo/structure.json",
  "/$first", "/$first.md", "/$first.json", "/$last", "/$last.md", "/v1/health", "/doors", "/api/oembed?url=$([uri]::EscapeDataString("$Canon/$first"))"
)
if ($cardName) { $paths += "/.well-known/mcp-server-card/$cardName" }
$hubProbe = @{}
foreach ($p in $paths) {
  $r = Probe "$B$p"; $hubProbe[$p] = $r
  Log ("  {0,-6} {1}" -f $r.Status, $p)
  if ($r.Code -notin 200, 301, 302) { Note "path $p -> $($r.Status) $($r.Error)" }
}
Log "  -- these MUST NOT 200 (they would be lies):"
foreach ($p in @("/.well-known/oauth-protected-resource", "/.well-known/ai-plugin.json", "/$missingN", "/$missingN.md", "/$missingN.json", "/no-such-page.md")) {
  $r = Probe "$B$p"; Log ("  {0,-6} {1}" -f $r.Status, $p)
  if ($r.Code -ne 404) { Note "$p answers $($r.Status) - it must be a real 404" }
  elseif ($r.Text -match '(?i)<!doctype html|<html') { Note "$p is a 404 wearing an HTML body (soft 404)" }
}

Section "2. content types"
$want = @(
  @("/llms.txt", "markdown"), @("/llms-full.txt", "markdown"), @("/llms-small.txt", "markdown"), @("/$first.md", "markdown"), @("/index.md", "markdown"),
  @("/license.xml", "rsl"), @("/openapi.json", "openapi"), @("/robots.txt", "text/plain"), @("/ai.txt", "text/plain"),
  @("/.well-known/mcp-server-card", "json"), @("/.well-known/agent-card.json", "json"), @("/.well-known/api-catalog", "linkset"),
  @("/feed.xml", "atom"), @("/rss.xml", "rss"), @("/feed.json", "feed+json"), @("/opensearch.xml", "opensearchdescription"),
  @("/manifest.json", "manifest"), @("/sitemap.xml", "xml"), @("/sitemap-doors.xml", "xml"), @("/sitemap-machine.xml", "xml"),
  @("/skills/reach/SKILL.md", "markdown"), @("/$first.json", "json"), @("/$first", "text/html"), @("/", "text/html"), @("/tdmrep.json", "json")
)
foreach ($w in $want) {
  $p = $w[0]; $t = $hubProbe[$p].Type
  Log ("  {0,-44} {1}" -f $p, $t)
  if ($t -notmatch [regex]::Escape($w[1])) { Note "content-type $p is '$t' (wanted $($w[1]))" }
  if ($t -and $t -notmatch 'charset=utf-8' -and $p -notmatch '\.(png|ico)$') { Warn "$p has no charset=utf-8" }
}

Section "3. interpolation - no placeholder survived into a served body; absolute HTTPS URLs only"
$discovery = @("/robots.txt", "/ai.txt", "/llms.txt", "/llms-full.txt", "/llms-small.txt", "/llms/api.txt", "/openapi.json", "/license.xml", "/tdmrep.json",
  "/.well-known/mcp-server-card", "/.well-known/agent-card.json", "/.well-known/agents.json", "/.well-known/agent-permissions.json",
  "/.well-known/ai-catalog.json", "/.well-known/api-catalog", "/.well-known/agent-skills/index.json", "/skills/reach/SKILL.md",
  "/sitemap.xml", "/sitemap-doors.xml", "/sitemap-machine.xml", "/feed.xml", "/rss.xml", "/feed.json", "/server.json", "/opensearch.xml",
  "/manifest.json", "/AGENTS.md", "/humans.txt", "/seo/keywords.json", "/seo/structure.json", "/.well-known/security.txt", "/.well-known/trust.txt",
  "/status.json", "/sites.json", "/sites.md", "/catalog.json", "/jsonld.json", "/index.md", "/$first.md", "/$first.json")
foreach ($p in $discovery) {
  $t = $hubProbe[$p].Text
  $hit = Test-Placeholder $t
  if ($hit) { Log "  PLACEHOLDER  $p ($hit)"; Note "placeholder '$hit' in $p" } else { Log "  clean        $p" }
  if ($p -match '\.json$|api-catalog|mcp-server-card|agent-card') {
    if ($t -match '"url"\s*:\s*"/') { Note "$p carries a relative url (cards are fetched from registries with no base)" }
    if ($t -match "http://$([regex]::Escape($CanonHost))") { Note "$p links to the hub over plain http" }
  }
}

Section "4. card path parity - byte-identical aliases"
$h = @{}
foreach ($p in @("/.well-known/mcp-server-card", "/.well-known/mcp.json", "/.well-known/mcp/server-card.json", "/.well-known/mcp-server")) { $h[$p] = Hash $hubProbe[$p].Bytes }
if ($cardName) { $h["/.well-known/mcp-server-card/$cardName"] = Hash $hubProbe["/.well-known/mcp-server-card/$cardName"].Bytes }
Log "  mcp card: $(($h.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ')"
if (@($h.Values | Sort-Object -Unique).Count -ne 1) { Note "mcp card aliases differ" }
$a1 = Hash $hubProbe["/.well-known/agent-card.json"].Bytes; $a2 = Hash $hubProbe["/.well-known/agent.json"].Bytes
Log "  agent-card:$a1 / agent.json:$a2"; if ($a1 -ne $a2) { Note "a2a card aliases differ" }
$pairs = @(
  @("/.well-known/agent-skills/index.json", "/.well-known/skills/index.json", "skills index aliases differ"),
  @("/tdmrep.json", "/.well-known/tdmrep.json", "tdmrep aliases differ"),
  @("/llms.txt", "/.well-known/llms.txt", "llms.txt aliases differ"),
  @("/feed.xml", "/atom.xml", "feed.xml / atom.xml differ"),
  @("/sitemap.xml", "/sitemap-index.xml", "sitemap.xml / sitemap-index.xml differ"),
  @("/skills/reach/SKILL.md", "/.well-known/agent-skills/reach/SKILL.md", "SKILL.md aliases differ")
)
foreach ($pr in $pairs) { $x = Hash $hubProbe[$pr[0]].Bytes; $y = Hash $hubProbe[$pr[1]].Bytes; Log "  $($pr[0]):$x / $($pr[1]):$y"; if ($x -ne $y) { Note $pr[2] } }
$cardJson = $null; try { $cardJson = $card.Text | ConvertFrom-Json } catch { Note "mcp card is not JSON" }
if ($cardJson) {
  if ([string]$cardJson.'$schema' -notmatch 'server-card\.schema\.json') { Note "mcp card missing SEP-2127 `$schema" }
  $remote = @($cardJson.remotes)[0]
  if (-not $remote -or [string]$remote.url -ne "$Canon/mcp") { Note "mcp card remotes[0].url is '$($remote.url)', not $Canon/mcp" }
}
$agentJson = $null; try { $agentJson = $hubProbe["/.well-known/agent-card.json"].Text | ConvertFrom-Json } catch { Note "a2a card is not JSON" }
if ($agentJson) {
  if ([string]$agentJson.protocolVersion -ne "1.0") { Note "a2a card protocolVersion is '$($agentJson.protocolVersion)', not 1.0" }
  if ([string]$agentJson.url -ne "$Canon/a2a") { Note "a2a card url is '$($agentJson.url)', not $Canon/a2a" }
  foreach ($cap in @("streaming", "pushNotifications", "stateTransitionHistory", "extendedAgentCard")) { if ($agentJson.capabilities.$cap) { Warn "a2a card declares $cap=true - only if it is served" } }
}
$srv = $null; try { $srv = $hubProbe["/server.json"].Text | ConvertFrom-Json } catch { Note "server.json is not JSON" }
if ($srv -and $cardJson) {
  if ([string]$srv.name -ne [string]$cardJson.name) { Note "server.json name '$($srv.name)' != mcp card name '$($cardJson.name)'" }
  if ([string]$srv.version -ne [string]$cardJson.version) { Note "server.json version '$($srv.version)' != mcp card version '$($cardJson.version)'" }
  if ([string]$srv.description -and $srv.description.Length -gt 100) { Note "server.json description is $($srv.description.Length) chars - the registry caps it at 100" }
}

Section "5. markdown twins + negotiation"
foreach ($n in @($first, $last) | Sort-Object -Unique) {
  $cm = $hubProbe["/$n.md"].Status
  $neg = Probe "$B/$n" "GET" @{ "Accept" = "text/markdown" }
  $vary = if ($neg.Headers.ContainsKey("vary")) { $neg.Headers["vary"] } else { "none" }
  $chm = Probe "$B/$n.html.md"
  Log ("  {0,-10} .md={1}  neg={2}  vary={3}  .html.md={4}" -f "/$n", $cm, $neg.Type, $vary, $chm.Status)
  if ($cm -ne "200") { Note "twin /$n.md -> $cm" }
  if ($neg.Type -notmatch 'markdown') { Note "negotiation on /$n returned $($neg.Type)" }
  if ($vary -notmatch 'Accept') { Note "missing Vary: Accept on /$n" }
  if ($chm.Code -ne 301) { Note "/$n.html.md did not 301 (got $($chm.Status))" }
  elseif ($chm.Headers["location"] -ne "$Canon/$n.md") { Note "/$n.html.md 301s to '$($chm.Headers["location"])', not $Canon/$n.md" }
  $jn = Probe "$B/$n" "GET" @{ "Accept" = "application/json" }
  if ($jn.Type -notmatch 'json') { Note "Accept: application/json on /$n returned $($jn.Type)" }
}
$homeNeg = Probe "$B/" "GET" @{ "Accept" = "text/markdown" }
Log "  /  neg=$($homeNeg.Type)  vary=$($homeNeg.Headers['vary'])"
if ($homeNeg.Type -notmatch 'markdown') { Note "negotiation on / returned $($homeNeg.Type)" }
$miss = Probe "$B/$missingN.md"; Log "  missing twin -> $($miss.Status)"
if ($miss.Code -ne 404) { Note "missing twin soft-$($miss.Status)" }

Section "6. resolution - different inputs MUST differ, a miss is honest"
$j1 = $hubProbe["/$first.json"].Text; $j2 = $hubProbe["/$last.json"].Text
if ($first -ne $last -and $j1 -eq $j2) { Note "door $first and door $last serve the same JSON" }
$m1 = Get-Body "$B/match?q=visa"; $m2 = Get-Body "$B/match?q=karaoke+songs"; $m3 = Get-Body "$B/match?q=zzqqxxzzqq"
Log "  match visa   : $(Cut $m1 110)"
Log "  match karaoke: $(Cut $m2 110)"
Log "  match nonsense: $(Cut $m3 110)"
if ($m1 -notmatch '"best"' -or $m3 -notmatch '"best"') { Note "/match does not carry best" }
if ($m3 -notmatch '"best":\s*null' -and $m3 -notmatch '"found":\s*false') { Note "a nonsense question still gets a best door - the matcher invents" }
$sj = $null; try { $sj = $sitesRes.Text | ConvertFrom-Json } catch {}
if ($sj -and [int]$sj.count -ne $sites.Count) { Note "sites.json count=$($sj.count) but sites[] has $($sites.Count)" }
foreach ($s in $sites) {
  if ($null -ne $s.languages -and $null -ne $s.languages_count -and @($s.languages).Count -ne [int]$s.languages_count) { Note "door #$($s.n) languages[] has $(@($s.languages).Count) but languages_count=$($s.languages_count)" }
  foreach ($f in @("url", "door", "door_md", "key_url", "sitemap", "llms_txt", "feed")) {
    $v = [string]$s.$f
    if ($v -and $v -notmatch '^https://' -and $v -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?/') { Note "door #$($s.n) $f is not an absolute https URL: $v" }
  }
}

Section "7. MCP - MODERN era (2026-07-28)"
$MV = "2026-07-28"
$meta = @{ "io.modelcontextprotocol/protocolVersion" = $MV; "io.modelcontextprotocol/clientInfo" = @{ name = "sweep"; version = "1" }; "io.modelcontextprotocol/clientCapabilities" = @{} }
$hd = @{ "MCP-Protocol-Version" = $MV; "Mcp-Method" = "server/discover"; "Accept" = "application/json, text/event-stream" }
$disc = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 1; method = "server/discover"; params = @{ _meta = $meta } } $hd
Log "  server/discover: $($disc.Status) $(Cut $disc.Text 200)"
if ($disc.Text -notmatch '"supportedProtocolVersions"') { Note "modern server/discover failed ($($disc.Status) $($disc.Error))" }
if ($disc.Text -notmatch '"resultType":\s*"complete"') { Note "modern result missing resultType" }
$discJson = $null; try { $discJson = $disc.Text | ConvertFrom-Json } catch {}
if ($discJson -and $cardJson) {
  $vEnd = @($discJson.result.supportedProtocolVersions) -join ","; $vCard = @(@($cardJson.remotes)[0].supportedProtocolVersions) -join ","
  if ($vEnd -ne $vCard) { Note "card supportedProtocolVersions [$vCard] != endpoint [$vEnd]" }
  if ($discJson.result.serverInfo.name -ne $cardJson.name) { Note "serverInfo.name '$($discJson.result.serverInfo.name)' != card name '$($cardJson.name)'" }
  if ($discJson.result.serverInfo.version -ne $cardJson.version) { Note "serverInfo.version != card version" }
}
$disc2 = Post-Json "$B/.well-known/mcp-server" @{ jsonrpc = "2.0"; id = 1; method = "server/discover"; params = @{ _meta = $meta } } $hd
if ($disc2.Text -notmatch '"supportedProtocolVersions"') { Note "POST on /.well-known/mcp-server does not answer server/discover" }
$hd["Mcp-Method"] = "tools/list"
$tl = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 2; method = "tools/list"; params = @{ _meta = $meta } } $hd
Log "  tools/list: $(Cut $tl.Text 160)"
if ($tl.Text -notmatch '"ttlMs"') { Note "modern tools/list missing ttlMs" }
$toolNames = @(); try { $toolNames = @(($tl.Text | ConvertFrom-Json).result.tools | ForEach-Object { $_.name }) } catch {}
foreach ($t in @("match", "door", "list_doors")) { if ($toolNames -notcontains $t) { Note "tool $t missing from tools/list [$($toolNames -join ',')]" } }
# every version the endpoint advertises must answer when a client names it per request (no version in the list the endpoint does not speak)
if ($discJson) {
  foreach ($pv in @($discJson.result.supportedProtocolVersions)) {
    $hv = @{ "MCP-Protocol-Version" = "$pv"; "Mcp-Method" = "tools/list"; "Accept" = "application/json, text/event-stream" }
    $rv = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 6; method = "tools/list"; params = @{ _meta = @{ "io.modelcontextprotocol/protocolVersion" = "$pv" } } } $hv
    if ($rv.Text -notmatch '"tools"') { Note "advertised protocol version $pv does not answer tools/list ($($rv.Status))" }
  }
}
# a JSON-RPC batch (2025-03-26 transport) is answered element by element
$bt = Post-Json "$B/mcp" @(@{ jsonrpc = "2.0"; id = 7; method = "ping" }, @{ jsonrpc = "2.0"; id = 8; method = "tools/list" }) @{}
if ($bt.Text -notmatch '^\s*\[' -or $bt.Text -notmatch '"tools"') { Note "batch request not answered as a batch ($($bt.Status) $(Cut $bt.Text 120))" }
$hd["Mcp-Method"] = "tools/call"; $hd["Mcp-Name"] = "match"
$tc = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 3; method = "tools/call"; params = @{ name = "match"; arguments = @{ q = "do I need a visa for Japan" }; _meta = $meta } } $hd
Log "  tools/call: $(Cut $tc.Text 200)"
if ($tc.Text -notmatch '"structuredContent"') { Note "modern tools/call failed" }
$hm = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 4; method = "tools/list"; params = @{ _meta = $meta } } @{}
Log "  headers missing -> $($hm.Status) (400 expected)"; if ($hm.Code -ne 400) { Note "header mismatch answered $($hm.Status)" }
$bv = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 5; method = "tools/list"; params = @{ _meta = @{ "io.modelcontextprotocol/protocolVersion" = "1900-01-01" } } } @{ "MCP-Protocol-Version" = "1900-01-01"; "Mcp-Method" = "tools/list" }
Log "  bad version: $(Cut $bv.Text 180)"
if ($bv.Text -notmatch '-32022') { Note "a bad protocol version is not -32022" }
if ($bv.Text -notmatch '"supported"') { Note "-32022 does not list supported versions" }
$g = Get-Code "$B/mcp"; Log "  GET /mcp -> $g (405 expected)"; if ($g -ne "405") { Note "GET /mcp is $g" }

Section "8. MCP - LEGACY era (initialize)"
$init = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2025-06-18"; capabilities = @{}; clientInfo = @{ name = "sweep"; version = "1" } } }
Log "  initialize: $(Cut $init.Text 200)"
if ($init.Text -notmatch '"serverInfo"') { Note "legacy initialize failed - dual-era required" }
$lt = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 2; method = "tools/list" }
if ($lt.Text -notmatch '"tools"') { Note "legacy tools/list failed" }
if ($lt.Text -match '"resultType"') { Note "legacy result carries resultType (modern-only field)" }
$lc = Post-Json "$B/mcp" @{ jsonrpc = "2.0"; id = 3; method = "tools/call"; params = @{ name = "list_doors"; arguments = @{} } }
Log "  legacy call: $(Cut $lc.Text 160)"
if ($lc.Text -notmatch '"structuredContent"') { Note "legacy tools/call failed" }
$init2 = Post-Json "$B/.well-known/mcp-server" @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2025-06-18"; capabilities = @{}; clientInfo = @{ name = "sweep"; version = "1" } } }
if ($init2.Text -notmatch '"serverInfo"') { Note "POST on /.well-known/mcp-server does not answer initialize" }

Section "9. A2A 1.0"
$aa = Post-Json "$B/a2a" @{ jsonrpc = "2.0"; id = 1; method = "message/send"; params = @{ message = @{ role = "user"; messageId = "m1"; parts = @(@{ kind = "text"; text = "do I need a visa for Japan" }); metadata = @{ skill = "match" } } } } @{ "A2A-Version" = "1.0" }
Log "  message/send: $(Cut $aa.Text 200)"
if ($aa.Text -notmatch '"kind":\s*"message"') { Note "a2a message/send failed ($($aa.Status))" }
$ad = Post-Json "$B/a2a" @{ jsonrpc = "2.0"; id = 2; method = "message/send"; params = @{ message = @{ role = "user"; messageId = "m2"; parts = @() }; metadata = @{ skill = "doors" } } } @{ "A2A-Version" = "1.0" }
if ($ad.Text -notmatch '"kind":\s*"message"') { Note "a2a doors skill failed" }
$av = Post-Json "$B/a2a" @{ jsonrpc = "2.0"; id = 3; method = "message/send"; params = @{} } @{ "A2A-Version" = "9.9" }
if ($av.Text -notmatch 'VersionNotSupportedError') { Note "a2a does not reject an unspoken version" }
$ga = Get-Code "$B/a2a"; Log "  GET /a2a -> $ga (405 expected)"; if ($ga -ne "405") { Note "GET /a2a is $ga" }

Section "10. skill digest"
$skIdx = $null; try { $skIdx = $hubProbe["/.well-known/agent-skills/index.json"].Text | ConvertFrom-Json } catch { Note "skills index is not JSON" }
if ($skIdx) {
  foreach ($sk in @($skIdx.skills)) {
    $declared = ([string]$sk.digest) -replace '^sha256:', ''
    if ([string]$sk.url -notmatch "^https://$([regex]::Escape($CanonHost))/") { Note "skill $($sk.name) url is not on the hub: $($sk.url)" }
    $md = Probe (Local ([string]$sk.url))
    $actual = if ($md.Code -eq 200) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($md.Bytes)) -replace "-", "").ToLower() } else { "unfetchable $($md.Status)" }
    Log "  $($sk.name) declared=$declared"; Log "  $($sk.name) actual  =$actual"
    if (-not $declared -or $declared -ne $actual) { Note "skill digest mismatch for $($sk.name)" }
    if ($md.Code -eq 200 -and $md.Text -notmatch "(?m)^name:\s*$([regex]::Escape([string]$sk.name))\s*$") { Note "SKILL.md name != index name '$($sk.name)' (agentskills.io requires name == parent directory)" }
  }
}

Section "11. UA probe - every one must see the real body (hub /)"
Test-UAProbe "$B/" "hub" 2000

Section "12. contradiction sweep - the same answer in six files (Policy A)"
$robotsHub = Test-Policy $B "hub" $true

Section "13. robots.txt shape"
[void](Test-RobotsShape $robotsHub "hub")
if ($robotsHub -notmatch '(?im)^\s*license\s*:') { Note "hub robots.txt missing License:" }
$dupes = @(Lines $robotsHub | Where-Object { $_ -match '^\s*user-agent\s*:' } | ForEach-Object { ($_ -replace '^\s*user-agent\s*:\s*', '').Trim().ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 }).Count
Log "  duplicate tokens (twins are deliberate, rules identical): $dupes"
$hubSelf = $sites | Where-Object { ([uri]$_.url).Host -eq $CanonHost } | Select-Object -First 1

Section "14. indexnow key file"
if (-not $Key -and $hubSelf -and $hubSelf.indexnow_key) { $Key = [string]$hubSelf.indexnow_key }
if ($Key) {
  $kf = Probe "$B/$Key.txt"; $kb = ($kf.Text -replace '\s', '')
  Log "  $($kf.Status)  /$Key.txt  body-matches-key=$(if ($kb -eq $Key) { 'yes' } else { 'NO' })  type=$($kf.Type)"
  if ($kf.Code -ne 200 -or $kb -ne $Key) { Note "indexnow key file /$Key.txt ($($kf.Status))" }
  if ($kf.Type -notmatch 'text/plain') { Note "indexnow key file is $($kf.Type), not text/plain" }
} else { Log "  (no key: pass -Key, or set INDEXNOW_KEY in wrangler.jsonc - skipped)" }

Section "15. sitemap vs structure"
$SM = $hubProbe["/sitemap.xml"].Text
$children = @([regex]::Matches($SM, '<loc>([^<]+)</loc>') | ForEach-Object { $_.Groups[1].Value })
Log "  sitemap index children: $($children.Count)"
if ($SM -notmatch '<sitemapindex') { Note "/sitemap.xml is not a sitemap index" }
$allLocs = @(); $lastmods = @()
foreach ($c in $children) {
  if ($c -notmatch "^https://$([regex]::Escape($CanonHost))/") { Note "sitemap child on a foreign host or plain http: $c"; continue }
  $cp = Probe (Local $c)
  if ($cp.Code -ne 200) { Note "sitemap child $c -> $($cp.Status)"; continue }
  $allLocs += @([regex]::Matches($cp.Text, '<loc>([^<]+)</loc>') | ForEach-Object { $_.Groups[1].Value })
  $lastmods += @([regex]::Matches($cp.Text, '<lastmod>([^<]+)</lastmod>') | ForEach-Object { $_.Groups[1].Value.Substring(0, 10) })
}
Log "  urls across partitions: $($allLocs.Count); distinct lastmod days: $(@($lastmods | Sort-Object -Unique).Count)"
foreach ($l in $allLocs) { if ($l -notmatch "^https://$([regex]::Escape($CanonHost))(/|$)") { Note "sitemap lists a URL off the hub: $l"; break } }
$mustList = @("$Canon/", "$Canon/llms.txt", "$Canon/llms-full.txt", "$Canon/openapi.json", "$Canon/.well-known/mcp-server-card", "$Canon/.well-known/ai-catalog.json", "$Canon/sites.md", "$Canon/atlas.md", "$Canon/feed.xml")
# the hub's own door is the home page itself (it 301s to / and /index.md): every OTHER door and its twin must be listed
foreach ($s in $sites) { $so = ([uri]$s.url).GetLeftPart([UriPartial]::Authority); if ($so -eq $Canon -or $so -eq $B) { continue }; $mustList += "$Canon/$($s.n)"; $mustList += "$Canon/$($s.n).md" }
$missingLocs = @($mustList | Where-Object { $allLocs -notcontains $_ })
if ($missingLocs.Count) { Log "  MISSING $($missingLocs.Count): $(($missingLocs | Select-Object -First 6) -join ' ')"; Note "sitemap missing $($missingLocs[0])" } else { Log "  listed: every door, every twin, every machine entry point" }
$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
if ($lastmods.Count -gt 5 -and @($lastmods | Sort-Object -Unique).Count -eq 1 -and $lastmods[0] -eq $today) { Warn "every lastmod is today - a uniform 'updated today' reads as false freshness (PART 13)" }

Section "16. graph shape - one title, one graph, one canonical; visible date == dateModified"
foreach ($p in @("/", "/$first")) {
  $html = $hubProbe[$p].Text
  $t = ([regex]::Matches($html, '<title>')).Count; $graphs = ([regex]::Matches($html, 'application/ld\+json')).Count; $c = ([regex]::Matches($html, 'rel="canonical"')).Count
  $v = [regex]::Match($html, '<time[^>]*datetime="(\d{4}-\d{2}-\d{2})').Groups[1].Value
  $g = [regex]::Match($html, '"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})').Groups[1].Value
  Log ("  {0,-8} titles={1} graphs={2} canonical={3} visible={4} dateModified={5}" -f $p, $t, $graphs, $c, $(if ($v) { $v } else { "none" }), $(if ($g) { $g } else { "none" }))
  if ($t -ne 1 -or $graphs -ne 1 -or $c -ne 1) { Note "graph shape on $p (titles=$t graphs=$graphs canonical=$c)" }
  if ($html -notmatch '"isAccessibleForFree"\s*:\s*true') { Note "$p missing isAccessibleForFree" }
  if (-not $v -or $v -ne $g) { Note "$p visible date '$v' != dateModified '$g'" }
  $canonHref = [regex]::Match($html, '<link[^>]*rel="canonical"[^>]*href="([^"]+)"').Groups[1].Value
  if ($canonHref -and $canonHref -notmatch "^https://$([regex]::Escape($CanonHost))") { Note "$p canonical is off the hub: $canonHref" }
}

Section "17. oembed"
$oe = $hubProbe["/api/oembed?url=$([uri]::EscapeDataString("$Canon/$first"))"].Text
Log "  $(Cut $oe 200)"
if ($oe -notmatch '"type":\s*"rich"') { Note "oembed did not return a rich object" }
$ox = Get-Code "$B/api/oembed?url=https%3A%2F%2Fevil.example%2Fx"; Log "  foreign url -> $ox (404 expected)"; if ($ox -ne "404") { Note "oembed accepts a foreign url" }
$oxm = Get-Code "$B/api/oembed?url=$([uri]::EscapeDataString("$Canon/$first"))&format=xml"; Log "  format=xml -> $oxm (501 expected)"; if ($oxm -ne "501") { Note "oembed format=xml answered $oxm" }

Section "18. status.json is a real call"
$st = $hubProbe["/status.json"].Text; Log "  $(Cut $st 200)"
if ($st -notmatch '"ok":\s*true') { Note "status.json is not ok" }
try { $stj = $st | ConvertFrom-Json; if ([int]$stj.doors -ne $sites.Count) { Note "status.json doors=$($stj.doors) but sites.json has $($sites.Count)" } } catch { Note "status.json is not JSON" }

Section "19. openapi + api-catalog point at live paths"
$oa = $null; try { $oa = $hubProbe["/openapi.json"].Text | ConvertFrom-Json } catch { Note "openapi.json is not JSON" }
if ($oa) {
  $srvUrl = [string](@($oa.servers)[0].url)
  if ($srvUrl -ne $Canon -and $srvUrl -ne "$Canon/") { Note "openapi servers[0].url is '$srvUrl', not $Canon" }
  foreach ($pp in @($oa.paths.PSObject.Properties.Name)) {
    $probePath = $pp -replace '\{n\}', $first -replace '\{[^}]+\}', '1'
    if ($probePath -match '\?|{' ) { continue }
    $q = if ($probePath -eq "/match") { "?q=visa" } else { "" }
    $c = Get-Code "$B$probePath$q"
    Log ("  {0,-6} {1}" -f $c, $pp)
    if ($c -ne "200") { Note "openapi path $pp -> $c" }
  }
}
$cat = $hubProbe["/.well-known/api-catalog"].Text
foreach ($m in [regex]::Matches($cat, '"href"\s*:\s*"([^"]+)"')) {
  $u = $m.Groups[1].Value
  if ($u -notmatch '^https://') { Note "api-catalog href is not absolute https: $u"; continue }
  if ($u.StartsWith("$Canon/")) { $c = Get-Code (Local $u); if ($c -ne "200") { Note "api-catalog href $u -> $c" } }
}

# ================================================================ the doors
$doorReport = [System.Collections.Generic.List[object]]::new()
$hubFails = $script:Fails.Count
if (-not $HubOnly) {
  Section "20. doors - the subset that applies to an origin"
  $list = $sites
  if ($Doors.Count) { $list = @($sites | Where-Object { $Doors -contains [int]$_.n }) }
  foreach ($s in $list) {
    $n = [int]$s.n; $u = [uri]$s.url; $origin = "$($u.Scheme)://$($u.Authority)"
    $label = "door #$n $($u.Authority)"
    $before = $script:Fails.Count
    Log ""; Log "  --- $label  $($s.url)"
    if ($origin -eq $B -or $origin -eq $Canon) { Log "  (the hub itself - covered by sections 1-19)"; $doorReport.Add([pscustomobject]@{ n = $n; host = $u.Authority; ok = ($hubFails -eq 0); failures = @(); note = "hub" }); continue }
    if ($u.Scheme -ne "https" -and $u.Host -notmatch '^(127\.0\.0\.1|localhost)$') { Note "$label live URL is not https" }
    $homeRes = Follow $s.url
    Log ("  {0,-6} {1,-8} home ({2})" -f $homeRes.Status, $homeRes.Bytes.Length, $homeRes.Final)
    if ($homeRes.Code -ne 200) { Note "$label home -> $($homeRes.Status) $($homeRes.Error)" }
    elseif ($homeRes.Bytes.Length -lt 500 -or (Test-Challenge $homeRes.Text)) { Note "$label home is a challenge page or empty" }
    if ($homeRes.Code -eq 200) {
      $declared = @()
      foreach ($f in @("sitemap", "llms_txt", "key_url", "feed")) { $v = [string]$s.$f; if ($v) { $declared += , @($f, $v) } }
      $declared += , @("robots", "$origin/robots.txt")
      foreach ($d in $declared) {
        $r = Probe $d[1]
        Log ("  {0,-6} {1,-9} {2}  {3}" -f $r.Status, $d[0], $d[1], $r.Type)
        if ($r.Code -ne 200) { Note "$label $($d[0]) $($d[1]) -> $($r.Status) $($r.Error)"; continue }
        $hit = Test-Placeholder $r.Text; if ($hit) { Note "$label placeholder '$hit' in $($d[1])" }
        if ($d[0] -eq "key_url") {
          $kb = ($r.Text -replace '\s', '')
          if ($kb -ne [string]$s.indexnow_key) { Note "$label key file body != indexnow_key" }
          if ($r.Type -notmatch 'text/plain') { Note "$label key file is $($r.Type), not text/plain" }
        }
        if ($d[0] -eq "robots") {
          if ($r.Type -notmatch 'text/plain') { Note "$label robots.txt is $($r.Type), not text/plain" }
          [void](Test-RobotsShape $r.Text $label)
        }
        if ($d[0] -eq "sitemap" -and $r.Text -notmatch '<(urlset|sitemapindex)') { Note "$label sitemap is not XML sitemap markup" }
        if ($d[0] -eq "llms_txt" -and $r.Text -notmatch '(?m)^# ') { Note "$label llms.txt has no H1" }
      }
      [void](Test-Policy $origin $label $false)
      Test-UAProbe $s.url $label 500
    }
    $mine = @($script:Fails | Select-Object -Skip $before)
    # http_status/bytes/challenge are what POST /v1/sweep records as the door's liveness (ok mixes every check)
    $isChallenge = ($homeRes.Code -eq 200 -and (Test-Challenge $homeRes.Text))
    $doorReport.Add([pscustomobject]@{ n = $n; host = $u.Authority; ok = ($mine.Count -eq 0); failures = $mine; note = ""; http_status = [int]$homeRes.Code; bytes = [int]$homeRes.Bytes.Length; challenge = [bool]$isChallenge })
    Log "  => $label $(if ($mine.Count) { "FAIL ($($mine.Count))" } else { 'ok' })"
  }
  $okDoors = @($doorReport | Where-Object { $_.ok }).Count
  Log ""; Log "  doors ok: $okDoors / $($doorReport.Count)"
}

# ================================================================ verdict
Log ""; Log "### failures: $($script:Fails.Count)"
foreach ($f in $script:Fails) { Log "  - $f" }
$verdict = if ($script:Fail) { "RESULT: FAIL $($script:Fail)" } else { "RESULT: PASS" }
Log $verdict
$logDir = Split-Path -Parent $Log
if ($logDir -and !(Test-Path $logDir)) { New-Item $logDir -ItemType Directory -Force | Out-Null }
[IO.File]::WriteAllText($Log, (($script:Lines -join "`n") + "`n"), $utf8)
[IO.File]::WriteAllText($DoorsJson, (([pscustomobject]@{ hub = $B; swept_at = (Get-Date).ToUniversalTime().ToString("o"); verdict = $verdict; failures = @($script:Fails); doors = @($doorReport) } | ConvertTo-Json -Depth 6) + "`n"), $utf8)
if ($env:GITHUB_STEP_SUMMARY) {
  $sum = [System.Collections.Generic.List[string]]::new()
  $sum.Add("## Reachability sweep - $B"); $sum.Add(""); $sum.Add("**$verdict**"); $sum.Add("")
  if ($script:Fails.Count) { $sum.Add("$($script:Fails.Count) failure(s):"); $sum.Add(""); foreach ($f in $script:Fails | Select-Object -First 40) { $sum.Add("- $f") }; $sum.Add("") }
  if ($doorReport.Count) {
    $sum.Add("| door | host | verdict |"); $sum.Add("|---|---|---|")
    foreach ($d in $doorReport) { $sum.Add("| $($d.n) | $($d.host) | $(if ($d.ok) { 'ok' } elseif ($d.note) { $d.note } else { "FAIL: " + ($d.failures[0] -replace '\|', '/') }) |") }
    $sum.Add("")
  }
  $sum.Add("Full log: the reachability artifact of this run.")
  Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value ($sum -join "`n") -Encoding utf8
}
$verdict
"log: $Log"
"doors: $DoorsJson"
if ($Post) {
  try {
    Invoke-RestMethod -Method Post -Uri "$Hub/v1/sweep" -Headers @{ authorization = "Bearer $Post" } -ContentType "application/json; charset=utf-8" -Body ([IO.File]::ReadAllText($DoorsJson)) -TimeoutSec 30 | Out-Null
    "verdict posted to $Hub/v1/sweep"
  } catch { "verdict not posted: $($_.Exception.Message)"; exit 2 }
}
if ($script:Fail) { exit 1 }
exit 0
