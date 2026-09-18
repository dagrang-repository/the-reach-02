# Deploy once

Cron: `0 * * * *` UTC (24 times a day).

Every run, for **every** active site:
1. Refresh briefing if older than 24h
2. Rebuild structure, doors, llms, gaps
3. Expand The Reach map
4. **PING** IndexNow (7 endpoints) + GET every pointing door

Put the generated `/{indexnow-key}.txt` file on each live origin root. Without that file IndexNow returns 202/403 and the ping is received but not verified.

## Wire

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
npx wrangler deploy
```

## Add a site

Required: **name** + **url**. Languages are detected. Origin key is not typed unless you want option 2.

### Option 1 — meta tag on the site (preferred)

Put this exact line in the site `<head>`. Same page The Reach fetches (usually the homepage).

```html
<meta name="indexnow-key" content="YOUR_KEY">
```

Rules:
- `name` must be exactly `indexnow-key`
- `content` is the same string as the origin file `https://the-site/YOUR_KEY.txt`
- 8–128 letters, digits, `_` or `-`
- Either attribute order is fine (`name` then `content`, or `content` then `name`)

On add (and later on cron if still empty), The Reach reads that tag and stores the key for good.

Also keep the IndexNow file on the origin root:

```
https://the-site/YOUR_KEY.txt
```

File body = `YOUR_KEY` only.

### Option 2 — inject at add (optional)

```bash
curl -s -X POST $HOST/v1/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Globe Warn","url":"https://globewarn.com/","key":"YOUR_ORIGIN_KEY"}'
```

Injected `key` wins over the meta tag.

Name + URL only:

```bash
curl -s -X POST $HOST/v1/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Globe Warn","url":"https://globewarn.com/"}'
```

Force a ping now:

```bash
curl -s -X POST $HOST/v1/ping -H "Authorization: Bearer $TOKEN"
curl -s $HOST/v1/pings -H "Authorization: Bearer $TOKEN"
curl -s $HOST/v1/map
```

Discord / webhook / Telegram are optional extras. Pings run without them.
