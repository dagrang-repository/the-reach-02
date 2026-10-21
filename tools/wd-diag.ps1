# Reach 02 — one-off probe: why Wikidata AbuseFilter 296 refuses the next door create.
# Runs on GitHub's clean IPs (Wikimedia blocks Cloudflare Workers egress). Reads only, writes nothing.
$ErrorActionPreference = "Stop"
$hub = "https://reach2.aplusz.app"; $api = "https://www.wikidata.org/w/api.php"; $ua = "VergeHeightsHub/1.0 (dagrang@gmail.com)"
function Note($level, $title, $m) {
  $one = ([string]$m) -replace "%", "%25" -replace "`r", "" -replace "`n", " "
  if (-not $one) { $one = "(empty)" }
  $i = 0
  while ($i -lt $one.Length -and $i -lt 3600) {
    $len = [Math]::Min(900, $one.Length - $i)
    "::${level} title=${title}::" + $one.Substring($i, $len)
    $i += $len
  }
}

# 1. public metadata for filter 296
try {
  $f = Invoke-RestMethod -Uri "${api}?action=query&list=abusefilters&abfstartid=296&abfendid=296&abfprop=id%7Cdescription%7Cactions%7Cstatus%7Cprivate&format=json" -UserAgent $ua -TimeoutSec 60
  Note "warning" "filter-296" (@($f.query.abusefilters) | ConvertTo-Json -Compress -Depth 5)
} catch { Note "warning" "filter-296" "lookup failed: $($_.Exception.Message)" }

# 2. the on-wiki warning text, which usually says what the filter objects to
try {
  $m = Invoke-RestMethod -Uri "${api}?action=query&prop=revisions&titles=MediaWiki%3AAbusefilter-warning-296&rvprop=content&rvslots=main&format=json&formatversion=2" -UserAgent $ua -TimeoutSec 60
  Note "warning" "warn-text-296" ($m.query.pages[0].revisions[0].slots.main.content)
} catch { Note "warning" "warn-text-296" "not found: $($_.Exception.Message)" }

# 3. what the bot account is on Wikidata — most filters exempt autoconfirmed/bot
$hdr = @{ authorization = "Bearer $env:REACH_ADMIN_TOKEN" }
$cr = Invoke-RestMethod -Uri "$hub/v1/wikidata/creds" -Headers $hdr -UserAgent $ua -TimeoutSec 60
$t = Invoke-RestMethod -Uri "${api}?action=query&meta=tokens&type=login&format=json" -UserAgent $ua -SessionVariable ws -TimeoutSec 60
$l = Invoke-RestMethod -Uri $api -Method Post -UserAgent $ua -WebSession $ws -TimeoutSec 60 -Body @{ action = "login"; lgname = $cr.user; lgpassword = $cr.pass; lgtoken = $t.query.tokens.logintoken; format = "json" }
if ($l.login.result -ne "Success") { Note "error" "login" "$($l.login.result) $($l.login.reason)"; "RESULT: FAIL login"; exit 0 }
$u = Invoke-RestMethod -Uri "${api}?action=query&meta=userinfo&uiprop=groups%7Ceditcount%7Cregistration&format=json" -UserAgent $ua -WebSession $ws -TimeoutSec 60
$ui = $u.query.userinfo
Note "warning" "bot-account" "name=$($ui.name) edits=$($ui.editcount) registered=$($ui.registrationdate) groups=$(@($ui.groups) -join ',')"

# 4. the exact payload the courier is trying to save
$q = Invoke-RestMethod -Uri "$hub/v1/wikidata/queue?limit=1" -Headers $hdr -UserAgent $ua -TimeoutSec 120
$it = @($q.items)[0]
if (-not $it) { Note "warning" "queue" "nothing pending"; "RESULT: PASS diag"; exit 0 }
Note "warning" "queue-item" "n=$($it.n) phase=$($it.phase) name=$($it.name) url=$($it.url) summary=$($it.summary)"
Note "warning" "entity-json" $it.entity_json
"RESULT: PASS diag"
