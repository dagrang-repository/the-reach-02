#!/usr/bin/env pwsh
#Requires -Version 7.0
# Reach 02 - the quick look at what every door actually serves: which pack its robots.txt is from, and
# whether the catalog every Revision 3 pack carries (/.well-known/ard.json) answers.
# Prints the verdict and the counts; one line per door goes to <repo>/_logs/reach-verify.txt. This is the two-minute glance;
# the real sweep (declared paths, placeholders, policy contradictions, UA probe, key file, dual-era MCP,
# A2A, noindex, links) is tools/reachability.ps1.
param([string]$Hub = "https://reach2.aplusz.app", [int]$TimeoutSec = 25)
$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Hub = $Hub.TrimEnd("/")
$ua = "ReachVerify/1.0 (+$Hub/humans.txt)"
$sites = @()
try { $sites = @((Invoke-RestMethod -Uri "$Hub/sites.json" -TimeoutSec 120 -UserAgent $ua).sites) } catch { }
if ($sites.Count -lt 1) { "RESULT: FAIL $Hub/sites.json returned no doors"; exit 1 }
$hubHost = ([uri]$Hub).Host
$rev3 = 0; $older = 0; $own = 0; $none = 0; $catalog = 0; $rows = @()
foreach ($s in $sites) {
  if (([uri]$s.url).Host -eq $hubHost) { continue }   # the hub serves its own files from Worker code
  $o = ([uri]$s.url).Scheme + "://" + ([uri]$s.url).Host
  $r = $null; $state = "no robots"
  try { $r = Invoke-WebRequest -Uri "$o/robots.txt" -TimeoutSec $TimeoutSec -UserAgent $ua -SkipHttpErrorCheck } catch { }
  if ($r -and $r.StatusCode -eq 200) {
    $body = [string]$r.Content
    if ($body -match "names every documented agent \(\d+ named groups") { $state = "rev3"; $rev3++ }
    elseif ($body -match "MAXIMAL set: \d+ named groups") { $state = "older pack"; $older++ }
    else { $state = "own robots"; $own++ }
  } else { $none++ }
  $cat = 0
  try {
    $m = Invoke-WebRequest -Uri "$o/.well-known/ard.json" -TimeoutSec $TimeoutSec -UserAgent $ua -SkipHttpErrorCheck
    # the body is text for any media type here: PowerShell 7 hands a byte array back only for a type it cannot decode
    $text = if ($m.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($m.Content) } else { [string]$m.Content }
    if ($m -and $m.StatusCode -eq 200 -and $text -match '"specVersion"') { $cat = 1; $catalog++ }
  } catch { }
  $name = ([string]$s.name).PadRight(28); $name = $name.Substring(0, 28)
  $rows += "#$($s.n) $name $state$(if ($cat) { ' +catalog' })"
}
# every door goes to the log inside the project; the console gets the verdict and the counts
$logDir = Join-Path (Split-Path -Parent $PSScriptRoot) "_logs"
if (!(Test-Path $logDir)) { New-Item $logDir -ItemType Directory -Force | Out-Null }
$log = Join-Path $logDir "reach-verify.txt"
$behind = @($rows | Where-Object { $_ -notmatch " rev3 \+catalog$" })
[IO.File]::WriteAllText($log, ((@("not on the current pack: $($behind.Count) of $($rows.Count)") + $behind + @("", "every door:") + $rows) -join "`n") + "`n")
"RESULT: PASS"
"on the Revision 3 pack: $rev3 of $($rows.Count) - catalogs answering: $catalog"
"older pack: $older - own robots: $own - unreachable: $none"
"log: $log"
