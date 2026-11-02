#!/usr/bin/env pwsh
#Requires -Version 7.0
# Reach 02 - the quick look at what every door actually serves: robots.txt generation and the MCP card.
# One line per door that is not on the current pack, then a count line. This is the two-minute glance;
# the real APPENDIX B sweep (declared paths, placeholders, policy contradictions, UA probe, key file,
# dual-era MCP, A2A) is tools/reachability.ps1 - run that before anything is pinged.
param([string]$Hub = "https://reach2.aplusz.app", [int]$TimeoutSec = 25)
$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Hub = $Hub.TrimEnd("/")
$ua = "ReachVerify/1.0 (+$Hub/humans.txt)"
$sites = @()
try { $sites = @((Invoke-RestMethod -Uri "$Hub/sites.json" -TimeoutSec 120 -UserAgent $ua).sites) } catch { }
if ($sites.Count -lt 1) { "RESULT: FAIL $Hub/sites.json returned no doors"; exit 1 }
$v3 = 0; $old = 0; $none = 0; $card = 0; $rows = @()
foreach ($s in $sites) {
  $o = ([uri]$s.url).Scheme + "://" + ([uri]$s.url).Host
  $r = $null; $state = "no robots"
  try { $r = Invoke-WebRequest -Uri "$o/robots.txt" -TimeoutSec $TimeoutSec -UserAgent $ua -SkipHttpErrorCheck } catch { }
  if ($r -and $r.StatusCode -eq 200) {
    if ($r.Content -match "MAXIMAL set: 217 named groups") { $state = "v3"; $v3++ }
    elseif ($r.Content -match "MAXIMAL set: \d+ named groups") { $state = "older pack"; $old++ }
    else { $state = "own robots"; $old++ }
  } else { $none++ }
  $mc = 0
  try { $m = Invoke-WebRequest -Uri "$o/.well-known/mcp-server-card" -TimeoutSec $TimeoutSec -UserAgent $ua -SkipHttpErrorCheck; if ($m -and $m.StatusCode -eq 200) { $mc = 1; $card++ } } catch { }
  $name = ([string]$s.name).PadRight(28); $name = $name.Substring(0, 28)
  $rows += "#$($s.n) $name $state$(if ($mc) { ' +card' })"
}
$rows | Where-Object { $_ -notmatch " v3 \+card$" }
"RESULT: PASS"
"live v3 robots: $v3 of $($sites.Count) - mcp cards: $card - older/own: $old - unreachable: $none"
"full sweep: pwsh tools/reachability.ps1 (hub + every door, one verdict line)"
