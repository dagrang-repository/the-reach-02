# Deploy

The Reach 02 is one Cloudflare Worker (`src/index.js`) with one D1 database and the Workers AI binding.
Every served file comes from the Worker; nothing in this repository is served statically.

## The deploy line (Windows, PowerShell)

```powershell
Set-Location "$env:USERPROFILE\Desktop\The Reach 02"; npx wrangler deploy
```

Then prove it before anything is pinged (one verdict line, the log next to it):

```powershell
pwsh .\tools\reachability.ps1 -HubOnly        # the hub's 19 sections
pwsh .\tools\reachability.ps1                 # the hub + every door in /sites.json
```

`RESULT: PASS` or `RESULT: FAIL <first failure>`. Nothing is pinged over a failing sweep.

## Crons

Two crons, declared in `wrangler.jsonc`:

| Cron | What runs |
|---|---|
| `0 * * * *` (hourly, UTC) | re-capture the 3 stalest door records; refresh the briefing of **one rotated site** (oldest ping cursor first) and ping only that site's **changed** URLs to the seven IndexNow endpoints; rebuild the map; ping the hub mesh (hub-host URLs only); deliver up to `BATCH_SIZE` targets; one Wikidata tick, one Wayback tick |
| `0 */6 * * *` (every six hours) | re-ingest every door's own `llms.txt` into the atlas that backs `/match` |

With N doors a given site is pinged about every N hours. Unchanged URLs are never re-pinged.
Put the generated `/{indexnow-key}.txt` file on each live origin root: without it IndexNow receives the ping but does not verify it.

## First-time wiring

```bash
cd "The Reach 02"
npm i
npx wrangler login
npx wrangler d1 create the-reach-02
```

Paste `database_id` into `wrangler.jsonc`.

```bash
npx wrangler d1 execute the-reach-02 --file=./schema.sql --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put WD_USER        # Wikidata bot user, handed back to the courier
npx wrangler secret put WD_BOTPASS
npx wrangler deploy
```

GitHub Actions needs one repository secret, `REACH_ADMIN_TOKEN` (the same value as `ADMIN_TOKEN`), for `.github/workflows/reach-daily.yml`: the Wikidata courier, the repo sync and the reachability sweep run there daily, never from a workstation.

## Add a site

Required: **name** + **url**. Languages are detected. The origin key is not typed unless you want option 2.

### Option 1 - meta tag on the site (preferred)

Put this exact line in the site `<head>`, on the page The Reach fetches (usually the homepage):

```html
<meta name="indexnow-key" content="THE_SITE_KEY">
```

Rules:
- `name` must be exactly `indexnow-key`
- `content` is the same string as the origin file `https://the-site/THE_SITE_KEY.txt`
- 8-128 letters, digits, `_` or `-`
- either attribute order is fine

On add (and later on cron if still empty), The Reach reads that tag and stores the key. Keep the key file on the origin root; its body is the key only.

### Option 2 - inject at add (optional)

```bash
curl -s -X POST $HOST/v1/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Globe Warn","url":"https://globewarn.com/","key":"THE_SITE_KEY"}'
```

An injected `key` wins over the meta tag. Name + URL only:

```bash
curl -s -X POST $HOST/v1/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Globe Warn","url":"https://globewarn.com/"}'
```

Force a ping now, read the ledger, read the map:

```bash
curl -s -X POST $HOST/v1/ping -H "Authorization: Bearer $TOKEN"
curl -s $HOST/v1/pings -H "Authorization: Bearer $TOKEN"
curl -s $HOST/v1/map
```

Discord / webhook / Telegram are optional extras. Pings run without them.

## One-time registry steps for the owner

Everything below needs an account only a human holds. Each is done once; the Worker keeps the files it points at served. Do every step **after** `tools/reachability.ps1` prints `RESULT: PASS` against the live hub - a registry is a directory of live endpoints, not a wishlist (playbook PART 10).

### 1. MCP registry - publish `server.json`

The official registry is `https://registry.modelcontextprotocol.io`. Third-party directories mirror it; they are not a substitute for being in it.

1. Generate the signing key once and keep it **outside** this repository, permanently (every future update needs it):
   ```bash
   openssl genpkey -algorithm Ed25519 -out reach2-registry-key.pem
   ```
2. Install the publisher: `brew install mcp-publisher` (macOS) or download the release binary from `https://github.com/modelcontextprotocol/registry/releases`.
3. Fetch the manifest the hub serves and keep it next to the key: `curl -sS https://reach2.aplusz.app/server.json -o server.json`. The namespace is the reverse DNS of the hub, `app.aplusz.reach2`, so the server name is `app.aplusz.reach2/hub` exactly as the card says.
4. Prove the domain. DNS route - add this TXT record on `reach2.aplusz.app` (Cloudflare DNS, the public key is printed by `openssl pkey -in reach2-registry-key.pem -pubout -outform DER | tail -c 32 | base64`):
   ```
   v=MCPv1; k=ed25519; p=<base64 public key>
   ```
   then `mcp-publisher login dns --domain reach2.aplusz.app --private-key $(openssl pkey -in reach2-registry-key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')`.
   HTTP route (`mcp-publisher login http --domain reach2.aplusz.app ...`) is the better route when the Worker serves the proof file at the path the publisher names; use it only once `curl -sS -o /dev/null -w '%{http_code}' https://reach2.aplusz.app/<that path>` prints 200, and never remove that file afterwards.
5. Publish from the folder holding `server.json`: `mcp-publisher publish`.
6. Confirm the listing is live and flagged latest:
   ```bash
   curl -sS "https://registry.modelcontextprotocol.io/v0.1/servers?search=app.aplusz.reach2"
   ```
   (if `/v0.1/` 404s, read `https://registry.modelcontextprotocol.io/docs` for the current read path before assuming the publish failed).
7. Updates: bump `version` in the served card (`src/surfaces.js`, the MCP card `version`), redeploy, re-fetch `server.json`, publish again with the same key. Versions are immutable; no silent edits.

### 2. Sitemaps - Google Search Console and Bing Webmaster Tools

IndexNow does not reach Google; the sitemap index must be submitted by hand once. Submit the **index**, not the partitions - the children are discovered from it.

- Google Search Console: `https://search.google.com/search-console` - property `reach2.aplusz.app` (URL-prefix `https://reach2.aplusz.app/` or the domain property) - Sitemaps - paste `https://reach2.aplusz.app/sitemap.xml` - Submit.
- Bing Webmaster Tools: `https://www.bing.com/webmasters` - add the site (or import it from Search Console) - Sitemaps - Submit sitemap - paste `https://reach2.aplusz.app/sitemap.xml`. Bing also shows the IndexNow submissions the hub already makes with its key file at `https://reach2.aplusz.app/<INDEXNOW_KEY>.txt` (the key is the `INDEXNOW_KEY` var in `wrangler.jsonc`; an IndexNow key is public by protocol, the endpoints verify it by fetching that file. To keep it out of the repository instead, delete the var and run `npx wrangler secret put INDEXNOW_KEY` once - the Worker reads either).

Re-submit only after a change that genuinely altered the sitemap's shape; identical re-submissions are throttled.

### 2b. Google Search Console and Bing - automatic from now on (one-time setup)

The hub submits its own sitemap to Search Console (every six hours, only when the map changed, never over a failing sweep) and each origin's sitemap once a day on its rotation - with a Google service account, so no token ever expires on you. Nothing runs until the secrets exist.

1. https://console.cloud.google.com - new project - APIs & Services - enable **Google Search Console API** - Credentials - Create credentials - Service account - Keys - Add key - JSON (a file downloads).
2. https://search.google.com/search-console - each property (start with `sc-domain:aplusz.app`, which covers every *.aplusz.app door) - Settings - Users and permissions - Add user - the service account's `client_email` - Full.
3. In the project folder (PowerShell), one line each:

```powershell
Get-Content "$env:USERPROFILE\Downloads\<the-key-file>.json" -Raw | npx wrangler secret put GSC_SA_JSON
```
```powershell
"sc-domain:aplusz.app" | npx wrangler secret put GSC_PROPERTIES
```

Add more properties comma-separated (`sc-domain:aplusz.app,https://urgentvisa.org/`). Then delete the downloaded key file.

Ownership proofs (served by the Worker, so verification needs no file upload): in Search Console choose **HTML tag**, copy only the `content` value, then `"<value>" | npx wrangler secret put GOOGLE_SITE_VERIFICATION`; for Bing choose **Meta tag** and run `"<value>" | npx wrangler secret put BING_SITE_AUTH`; deploy, then press Verify. Optional Bing URL submission: `"<api key>" | npx wrangler secret put BING_WEBMASTER_KEY` (Bing Webmaster - Settings - API access); a key Bing refuses is not retried.

### 2c. Deploy from GitHub (no PC)

`.github/workflows/deploy.yml` deploys on every push to `main` that touches `src/`, then sweeps and posts the verdict. It needs three repository secrets (GitHub repo - Settings - Secrets and variables - Actions): `CLOUDFLARE_API_TOKEN` (https://dash.cloudflare.com/profile/api-tokens - Create token - permissions Workers Scripts: Edit, D1: Edit, Account Settings: Read), `CLOUDFLARE_ACCOUNT_ID` (Cloudflare dashboard, right column) and `REACH_ADMIN_TOKEN` (already set for the daily job).

### The ping gate

Nothing is pinged (IndexNow, WebSub, Search Console) unless the last posted sweep says `RESULT: PASS` and is at most `SWEEP_MAX_AGE_HOURS` (36) old. After a deploy, run `pwsh .\tools\reachability.ps1 -HubOnly -Post <ADMIN_TOKEN>` once (the daily GitHub job does it every day after that). `/status.json` shows what is red.

### 3. llms.txt directories

Both take a form, no API. Paste the same three values in each:

| Field | Value |
|---|---|
| URL | `https://reach2.aplusz.app/llms.txt` |
| Name | `The Reach 02 - The AI Hill Top Lighthouse` |
| Description | `Which of these live sites answers my question? A directory AI models fetch to find and cite the live sites in this network.` |

- `https://directory.llmstxt.cloud` - "Submit" at the top of the page.
- `https://llmstxt.site` - "Add your site".

### 4. A2A and agent directories

Playbook PART 10 names exactly one registry worth publishing to: the MCP registry above. A2A 1.0 has no registry - the card at `https://reach2.aplusz.app/.well-known/agent-card.json` (alias `/.well-known/agent.json`) *is* the registration, by the A2A well-known URI. Nothing to submit; keep it served and byte-identical on both paths (the sweep checks this).

The agent directories the playbook lists (APPENDIX E) are read-only lists of crawlers to poll quarterly, not places to list a site: `https://radar.cloudflare.com/bots/directory`, `https://knownagents.com/agents`, `https://www.indexnow.org/searchengines.json`, `https://static.modelcontextprotocol.io/schemas/`. Third-party MCP directories (Glama, Smithery, PulseMCP, mcp.so) mirror the official registry; listing there is optional and only after step 1.

### 5. Cloudflare - AI Crawl Control and the managed robots.txt (playbook PART 6)

The dashboard can change the served `robots.txt` without a deploy, so check it, then re-run the sweep.

1. `https://dash.cloudflare.com` - zone `aplusz.app` - **AI Crawl Control** (Security). The hub runs Policy A (search=yes, ai-input=yes, ai-train=yes in all six files), so set **Search = Allow**, **Agent = Allow**, **Training = Allow**. If training is ever to be opted out of, use **Disallow** (writes robots.txt directives, excludes the mixed-use crawlers) and change the six policy files in the same change - **never "Block"**: a zone that blocks Training can 403 Googlebot, Applebot and Bingbot on pages with ads, which is unpublishing dressed as a training opt-out.
2. Turn **off** the legacy "Block AI bots" toggle and any Bot Fight Mode / Super Bot Fight Mode rule that challenges the hub; allow verified bots. The ten-UA probe in the sweep (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Googlebot, bingbot, Applebot, Chrome) must see 200 and the real body.
3. Read the served file: `curl -sS https://reach2.aplusz.app/robots.txt | head -20`. If it starts with `# BEGIN Cloudflare Managed content`, Bot Preference Sync or managed robots.txt is prepending lines; reconcile them with the Worker's file (`src/playbook.js`, `buildRobotsTxt`) so the Content-Signal and the Disallow lines do not contradict Policy A, or switch the managed file off.
4. Re-check after every Cloudflare product announcement: the defaults flipped on 15 September 2026 and will flip again.
