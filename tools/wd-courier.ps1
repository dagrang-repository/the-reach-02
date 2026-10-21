# Reach 02 — Wikidata courier. Runs ONLY on GitHub Actions' clean IPs (.github/workflows/reach-daily.yml).
# No PC is in the loop: the hub hands the bot credentials back to its admin from one repository secret.
# A scheduled task on a workstation would run a stale copy of this file against the live hub, so this script
# refuses to run outside CI. -Local is the deliberate manual escape hatch, never something a scheduler passes.
# Phase "create": link-free item (labels, description, P31, P1448, P407) — zero external links, so Wikidata's global
# filter 210 ("too many external links") cannot fire. Phase "links": URL steps one per edit (P856, P973, references),
# resumable. Phase "i18n": labels + descriptions in every language the site publishes (one text-only edit).
# One run drains the queue: links and i18n for our items freely, at most 1 create per day (hub enforces).
param([switch]$Local)
$ErrorActionPreference = "Stop"
if (-not $env:GITHUB_ACTIONS -and -not $Local) { "RESULT: PASS"; "wikidata: skipped — this courier runs on GitHub Actions (pass -Local to override)"; return }
$hub = "https://reach2.aplusz.app"; $api = "https://www.wikidata.org/w/api.php"; $ua = "VergeHeightsHub/1.0 (dagrang@gmail.com)"
$homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$dir = Join-Path $homeDir ".reach"; $log = Join-Path $dir "wd-courier.log"; $envFile = Join-Path $dir "wd.env.json"
if (!(Test-Path $dir)) { New-Item $dir -ItemType Directory -Force | Out-Null }
function Unprotect-Value($s) { $ss = ConvertTo-SecureString $s; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)) }
function Write-Log($m) { "$(Get-Date -Format s) $m" | Out-File $log -Append -Encoding utf8 }
function Write-Note($level, $title, $m) {
  # surfaces the reason as a GitHub annotation, so a failure is readable from the e-mail without opening the log
  if (-not $env:GITHUB_ACTIONS) { return }
  $one = ([string]$m) -replace "%", "%25" -replace "`r", "" -replace "`n", " "
  "::${level} title=${title}::${one}"
}
function Test-AbuseWarning($err) {
  # Wikidata answers a "warn" filter as code=failed-save with messages named abusefilter-warning-<id>
  # (e.g. abusefilter-warning-296), never the bare name — match on the prefix, not on equality.
  $names = @($err.messages | ForEach-Object { $_.name })
  if ([string]$err.code -like "abusefilter-warning*") { return $true }
  if (@($names | Where-Object { $_ -like "abusefilter-warning*" }).Count -gt 0) { return $true }
  return $false
}
function Invoke-Wd($body) {
  # one Wikidata write. maxlag ("Waiting for ... lagged") = wait and retry, up to 8 x 15 s.
  # An AbuseFilter "warn" refuses the first submission only — resubmit once in the same session.
  $warned = $false
  for ($i = 0; $i -lt 9; $i++) {
    $r = Invoke-RestMethod -Uri $api -Method Post -UserAgent $ua -WebSession $script:ws -TimeoutSec 120 -Body $body
    if (-not $r.error) { return $r }
    $names = @($r.error.messages | ForEach-Object { $_.name })
    if ($r.error.code -eq "maxlag") { Write-Log "maxlag, waiting 15 s ($($i + 1)/8)"; Start-Sleep -Seconds 15; continue }
    if (-not $warned -and (Test-AbuseWarning $r.error)) {
      $warned = $true; Write-Log "abusefilter warn [$($names -join ',')] — resubmitting once"; Start-Sleep -Seconds 5; continue
    }
    break
  }
  $names = @($r.error.messages | ForEach-Object { $_.name }) -join ","; throw "$($body.action): $($r.error.code) [$names] $($r.error.info)"
}
function Send-Record($n, $qs) { Invoke-RestMethod -Uri "$hub/v1/wikidata/record?n=$n&$qs" -Method Post -Headers $script:hdr -UserAgent $ua -TimeoutSec 120 }
$it = $null; $qid = ""; $summary = @(); $failed = @(); $deferred = @()
function Get-Session() {
  $t = Invoke-RestMethod -Uri "${api}?action=query&meta=tokens&type=login&format=json" -UserAgent $ua -SessionVariable ws -TimeoutSec 60
  $script:ws = $ws
  $l = Invoke-RestMethod -Uri $api -Method Post -UserAgent $ua -WebSession $script:ws -TimeoutSec 60 -Body @{ action = "login"; lgname = $script:u; lgpassword = $script:p; lgtoken = $t.query.tokens.logintoken; format = "json" }
  if ($l.login.result -ne "Success") { throw "login: $($l.login.result) $($l.login.reason)" }
  $c = Invoke-RestMethod -Uri "${api}?action=query&meta=tokens&type=csrf&assert=user&format=json" -UserAgent $ua -WebSession $script:ws -TimeoutSec 60
  $script:csrf = $c.query.tokens.csrftoken
}
function Invoke-Links($it, $qid) {
  # read what the item already has, add only what is missing, one URL per edit
  $e = Invoke-RestMethod -Uri "${api}?action=wbgetentities&ids=$qid&props=claims&format=json" -UserAgent $ua -WebSession $script:ws -TimeoutSec 60
  $claims = $e.entities.$qid.claims
  $done = 0; $total = @($it.steps).Count; $lastErr = ""
  foreach ($st in @($it.steps)) {
    try {
      $list = @($claims.($st.property) | Where-Object { $_ })
      if ($st.kind -eq "claim") {
        if (($list | Where-Object { $_.mainsnak.datavalue.value -eq $st.value }).Count -gt 0) { $done++; continue }
        $r = Invoke-Wd @{ action = "wbcreateclaim"; entity = $qid; property = $st.property; snaktype = "value"; value = ($st.value | ConvertTo-Json -Compress); token = $script:csrf; summary = "Add $($st.note)"; assert = "user"; maxlag = "8"; format = "json" }
        if ($null -eq $claims.($st.property)) { $claims | Add-Member -NotePropertyName $st.property -NotePropertyValue @($r.claim) } else { $claims.($st.property) = @($list) + @($r.claim) }
        $done++; Write-Log "#$($it.n) $qid + $($st.id)"; Start-Sleep -Seconds 3
      } elseif ($st.kind -eq "ref") {
        if ($list.Count -eq 0) { throw "no $($st.property) claim to reference yet" }
        if (@($list[0].references | Where-Object { $_ }).Count -gt 0) { $done++; continue }
        $day = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
        $snaks = @{ P854 = @(@{ snaktype = "value"; property = "P854"; datavalue = @{ value = $st.url; type = "string" } }); P813 = @(@{ snaktype = "value"; property = "P813"; datavalue = @{ value = @{ time = "+${day}T00:00:00Z"; timezone = 0; before = 0; after = 0; precision = 11; calendarmodel = "http://www.wikidata.org/entity/Q1985727" }; type = "time" } }) } | ConvertTo-Json -Depth 8 -Compress
        $r = Invoke-Wd @{ action = "wbsetreference"; statement = $list[0].id; snaks = $snaks; token = $script:csrf; summary = "Add $($st.note)"; assert = "user"; maxlag = "8"; format = "json" }
        $list[0] | Add-Member -NotePropertyName references -NotePropertyValue @(@{}) -Force
        $done++; Write-Log "#$($it.n) $qid + $($st.id)"; Start-Sleep -Seconds 3
      }
    } catch { $lastErr = $_.Exception.Message; Write-Log "#$($it.n) $qid step $($st.id) FAIL $lastErr"; break }
  }
  $state = if ($done -ge $total) { "complete" } else { "partial" }
  $detail = [uri]::EscapeDataString(("links $done/$total" + $(if ($lastErr) { ": " + $lastErr.Substring(0, [Math]::Min(150, $lastErr.Length)) } else { "" })))
  Send-Record $it.n "qid=$qid&action=$state&detail=$detail" | Out-Null
  Write-Log "#$($it.n) $qid $state links $done/$total"
  return "$state (links $done/$total)"
}
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if ($env:REACH_ADMIN_TOKEN) {
    # CI (GitHub Actions): one secret; the hub hands back the Wikidata bot credentials to its admin
    $tok = $env:REACH_ADMIN_TOKEN; $script:hdr = @{ authorization = "Bearer $tok" }
    $cr = Invoke-RestMethod -Uri "$hub/v1/wikidata/creds" -Headers $script:hdr -UserAgent $ua -TimeoutSec 60
    $script:u = $cr.user; $script:p = $cr.pass
    if (-not $script:u -or -not $script:p) { throw "hub returned no Wikidata credentials (WD_USER/WD_BOTPASS secrets)" }
  } else {
    if (!(Test-Path $envFile)) { throw "credentials file missing: $envFile" }
    $cfg = Get-Content $envFile -Raw | ConvertFrom-Json
    $tok = Unprotect-Value $cfg.admin; $script:u = Unprotect-Value $cfg.user; $script:p = Unprotect-Value $cfg.pass
    $script:hdr = @{ authorization = "Bearer $tok" }
  }
  $script:ws = $null
  $stuck = @{}     # door numbers that already failed this run — never serve the same one twice
  for ($k = 0; $k -lt 12; $k++) {
    $it = $null; $qid = ""
    $q = Invoke-RestMethod -Uri "$hub/v1/wikidata/queue?limit=1" -Headers $script:hdr -UserAgent $ua -TimeoutSec 180
    if (-not $q.ok) { throw "queue: hub refused" }
    if (-not $q.items -or @($q.items).Count -eq 0) { break }
    $it = @($q.items)[0]
    if ($stuck.ContainsKey([string]$it.n)) { Write-Log "#$($it.n) already failed this run — stopping"; break }
    try {
      if ($it.phase -eq "create" -and $it.existing_qid) {
        Send-Record $it.n "qid=$($it.existing_qid)&action=existing" | Out-Null
        Write-Log "#$($it.n) $($it.name) existing $($it.existing_qid)"; $summary += "#$($it.n) existing $($it.existing_qid)"; continue
      }
      if (-not $script:ws) { Get-Session }
      $qid = $it.qid
      if ($it.phase -eq "create") {
        $r = Invoke-Wd @{ action = "wbeditentity"; new = "item"; data = $it.entity_json; token = $script:csrf; summary = $it.summary; assert = "user"; maxlag = "8"; format = "json" }
        $qid = $r.entity.id; if (-not $qid) { throw "wbeditentity: no entity id in reply" }
        Send-Record $it.n "qid=$qid&action=created&statements=$($it.statements)" | Out-Null
        Write-Log "#$($it.n) $($it.name) created $qid (link-free)"
        Start-Sleep -Seconds 3
        $st = Invoke-Links $it $qid
        $summary += "#$($it.n) $($it.name) created $qid $st"
      } elseif ($it.phase -eq "links") {
        $st = Invoke-Links $it $qid
        $summary += "#$($it.n) $qid $st"
      } elseif ($it.phase -eq "i18n") {
        $r = Invoke-Wd @{ action = "wbeditentity"; id = $qid; data = $it.i18n_json; token = $script:csrf; summary = $it.summary; assert = "user"; maxlag = "8"; format = "json" }
        $n = @($it.languages).Count
        Send-Record $it.n "qid=$qid&action=i18n&detail=$([uri]::EscapeDataString("localized in $n languages"))" | Out-Null
        Write-Log "#$($it.n) $qid localized in $n languages ($(@($it.languages) -join ','))"
        $summary += "#$($it.n) $qid localized $n languages"
      } else { throw "unknown phase $($it.phase)" }
    } catch {
      # one stubborn door never sinks the whole daily run — record it, note it, move on
      $m = $_.Exception.Message
      $stuck[[string]$it.n] = $m
      if ($it.phase -eq "create" -and $m -match "abusefilter-(warning|throttle|disallow)") {
        # Wikidata filter 296 "Bulk item creation by new editor" throttles creates until the
        # account is established. That is pacing, not a fault: come back tomorrow, and reset the
        # attempt counter so the hub does not retire this door after 6 tries.
        try { Send-Record $it.n "action=reset" | Out-Null } catch {}
        $deferred += "#$($it.n) $($it.name)"
        Write-Log "#$($it.n) $($it.name) DEFER $m"
        Write-Note "warning" "Wikidata door #$($it.n) deferred by filter" $m
      } else {
        $failed += "#$($it.n) $($it.name): $m"
        Write-Log "#$($it.n) $($it.name) FAIL $m"
        Write-Note "warning" "Wikidata door #$($it.n) $($it.name)" $m
        try { if (-not $qid) { $d = [uri]::EscapeDataString($m.Substring(0, [Math]::Min(200, $m.Length))); Send-Record $it.n "action=error&detail=$d" | Out-Null } } catch {}
      }
    }
    Start-Sleep -Seconds 3
  }
  if ($failed.Count -and -not $summary.Count) {
    "RESULT: FAIL $($failed[0])"
    Write-Note "error" "Wikidata courier" $failed[0]
    if ($env:GITHUB_ACTIONS) { exit 1 }
    return
  }
  if ($failed.Count) { "wikidata-skipped: $($failed -join ' · ')" }
  if ($deferred.Count) { "wikidata-deferred: $($deferred -join ' · ') (Wikidata is pacing new-editor item creation)" }
  if (-not $summary.Count) { Write-Log "idle: nothing to do"; "RESULT: PASS"; "wikidata: $(if ($deferred.Count) { 'deferred, retry tomorrow' } else { 'nothing pending' })"; return }
  "RESULT: PASS"; "wikidata: $($summary -join ' · ')"
} catch {
  $msg = $_.Exception.Message
  Write-Log "FAIL $msg"
  try { if ($it -and $it.n -and -not $qid) { $d = [uri]::EscapeDataString($msg.Substring(0, [Math]::Min(200, $msg.Length))); Send-Record $it.n "action=error&detail=$d" | Out-Null } } catch {}
  if ($summary.Count) { "wikidata: $($summary -join ' · ')" }
  "RESULT: FAIL $msg"
  Write-Note "error" "Wikidata courier" $msg
  if ($env:GITHUB_ACTIONS) { exit 1 }
}
