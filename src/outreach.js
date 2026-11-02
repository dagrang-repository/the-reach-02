import { all, run } from "./db.js";
import { discardBody, nowIso, readResponseCapped, sha256, uid } from "./util.js";
import { publicBase } from "./hill.js";

export async function ensureOutreachTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      site_id TEXT,
      url TEXT,
      detail TEXT
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS door_state (
      url TEXT PRIMARY KEY,
      body_hash TEXT,
      last_ping_at TEXT,
      last_ok_at TEXT,
      last_status INTEGER
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS site_ping_cursor (
      site_id TEXT PRIMARY KEY,
      last_pinged_at TEXT
    )`
  ).run();
}

export async function recordChange(env, { kind, siteId, url, detail }) {
  await run(
    env,
    `INSERT INTO changes (id, created_at, kind, site_id, url, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    uid("chg"),
    nowIso(),
    kind,
    siteId || null,
    url || "",
    String(detail || "").slice(0, 400)
  );
}

export async function listChanges(env, limit = 80) {
  return all(env, "SELECT created_at, kind, site_id, url, detail FROM changes ORDER BY created_at DESC LIMIT ?", limit);
}

export async function publicPings(env, limit = 60) {
  const rows = await all(
    env,
    `SELECT created_at, kind, status, ok FROM pings ORDER BY created_at DESC LIMIT ?`,
    limit
  );
  return rows.map((r) => ({ at: r.created_at, kind: r.kind, status: r.status, ok: !!r.ok }));
}

export async function shouldPingUrl(env, url, bodyHint) {
  const hash = await sha256(bodyHint || url);
  const prev = await env.DB.prepare("SELECT body_hash, last_ok_at FROM door_state WHERE url = ?").bind(url).first();
  const changed = !prev || prev.body_hash !== hash;
  return { changed, hash, last_ok_at: prev?.last_ok_at || null };
}

export async function markDoor(env, url, hash, status, ok) {
  const ts = nowIso();
  await run(
    env,
    `INSERT INTO door_state (url, body_hash, last_ping_at, last_ok_at, last_status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       body_hash=excluded.body_hash,
       last_ping_at=excluded.last_ping_at,
       last_ok_at=CASE WHEN excluded.last_status BETWEEN 200 AND 299 THEN excluded.last_ping_at ELSE door_state.last_ok_at END,
       last_status=excluded.last_status`,
    url,
    hash,
    ts,
    ok ? ts : null,
    status || 0
  );
}

const BOT_UAS = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];

export async function watchChallenges(env, site, runId, recordPing) {
  const report = [];
  for (const ua of BOT_UAS) {
    try {
      const res = await fetch(site.url, { redirect: "follow", headers: { "user-agent": ua }, signal: AbortSignal.timeout(9000) });
      /* the challenge markers sit in the first bytes: read 4 KB, never the whole page */
      const head = new TextDecoder().decode(await readResponseCapped(res, 4096)).slice(0, 4096).toLowerCase();
      const challenged = /captcha|cf-challenge|just a moment|access denied|attention required/.test(head);
      const ok = res.ok && !challenged;
      report.push({ ua: ua.split("compatible; ")[1]?.split(";")[0] || "bot", status: res.status, ok, challenged });
      await recordPing({
        runId,
        siteId: site.id,
        kind: "ua-watch",
        endpoint: ua.slice(0, 40),
        url: site.url,
        status: res.status,
        ok,
        detail: challenged ? "challenge page" : "real body",
      });
    } catch (err) {
      report.push({ ua: "err", status: 0, ok: false, challenged: true });
      await recordPing({
        runId,
        siteId: site.id,
        kind: "ua-watch",
        endpoint: "fetch",
        url: site.url,
        status: 0,
        ok: false,
        detail: String(err.message || err),
      });
    }
  }
  return report;
}

export async function pingWebSub(env, site, feedUrl, runId, recordPing) {
  const hubs = ["https://pubsubhubbub.appspot.com/", "https://pubsubhubbub.superfeedr.com/"];
  for (const hub of hubs) {
    try {
      const res = await fetch(hub, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `hub.mode=publish&hub.url=${encodeURIComponent(feedUrl)}`,
        signal: AbortSignal.timeout(9000),
      });
      await discardBody(res);
      await recordPing({
        runId,
        siteId: site.id,
        kind: "websub",
        endpoint: hub,
        url: feedUrl,
        status: res.status,
        ok: res.ok,
        detail: "hub.mode=publish",
      });
    } catch (err) {
      await recordPing({
        runId,
        siteId: site.id,
        kind: "websub",
        endpoint: hub,
        url: feedUrl,
        status: 0,
        ok: false,
        detail: String(err.message || err),
      });
    }
  }
}

let bingRefused = false;
export async function pingBingSubmit(env, site, urls, runId, recordPing) {
  const key = env.BING_WEBMASTER_KEY;
  if (!key || bingRefused) return;
  /* a key Bing refused once is not retried every hour: the refusal is in pings, the owner fixes the key */
  const last = await env.DB.prepare("SELECT status, created_at FROM pings WHERE kind = 'bing-submit' ORDER BY created_at DESC LIMIT 1").first().catch(() => null);
  if (last && (last.status === 401 || last.status === 403) && Date.now() - new Date(last.created_at).getTime() < 7 * 24 * 3600 * 1000) { bingRefused = true; return; }
  try {
    const res = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteUrl: new URL(site.url).origin, urlList: urls.slice(0, 20) }),
        signal: AbortSignal.timeout(9000),
      }
    );
    await discardBody(res);
    if (res.status === 401 || res.status === 403) bingRefused = true;
    await recordPing({
      runId,
      siteId: site.id,
      kind: "bing-submit",
      endpoint: "webmaster",
      url: urls[0],
      status: res.status,
      ok: res.ok,
      detail: `${urls.length} urls`,
    });
  } catch (err) {
    await recordPing({
      runId,
      siteId: site.id,
      kind: "bing-submit",
      endpoint: "webmaster",
      url: site.url,
      status: 0,
      ok: false,
      detail: String(err.message || err),
    });
  }
}

/* ---------------- Google Search Console: the sitemaps API with a service account (never the Indexing API) ----------------
   The owner creates a Google Cloud service account with the Search Console API enabled, adds its email as a user on
   each Search Console property, and stores the JSON key once: npx wrangler secret put GSC_SA_JSON. GSC_PROPERTIES lists
   the properties that account may use, comma separated (e.g. "sc-domain:aplusz.app,https://urgentvisa.org/"). The
   Worker signs its own short-lived tokens (RS256, WebCrypto); nothing expires on the owner. Absent secret = off. */
let gscToken = { token: "", until: 0, key: "" };

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (t) => b64url(new TextEncoder().encode(t));

/** A signed JWT for the service account (exported for the rig, which signs with a generated key). */
export async function gscJwt(sa, nowSec = Math.floor(Date.now() / 1000)) {
  const pem = String(sa.private_key || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters", aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(sig)}`;
}

async function gscAccessToken(env) {
  let sa;
  try { sa = JSON.parse(env.GSC_SA_JSON || ""); } catch { return ""; }
  if (!sa?.client_email || !sa?.private_key) return "";
  if (gscToken.token && gscToken.key === sa.client_email && Date.now() < gscToken.until) return gscToken.token;
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${await gscJwt(sa)}`,
    signal: AbortSignal.timeout(9000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return "";
  gscToken = { token: data.access_token, until: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000, key: sa.client_email };
  return data.access_token;
}

/** The GSC property (from GSC_PROPERTIES) that covers `url`, or "". sc-domain:x covers x and its subdomains. */
export function gscPropertyFor(env, url) {
  let host = "";
  try { host = new URL(url).host.toLowerCase(); } catch { return ""; }
  for (const raw of String(env.GSC_PROPERTIES || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (raw.startsWith("sc-domain:")) {
      const d = raw.slice(10).toLowerCase();
      if (host === d || host.endsWith(`.${d}`)) return raw;
    } else if (/^https?:\/\//.test(raw) && url.startsWith(raw)) return raw;
  }
  return "";
}

/** PUT one sitemap into Search Console. { skipped } when no secret or no covering property; never throws. */
export async function gscSubmitSitemap(env, sitemapUrl) {
  if (!env.GSC_SA_JSON) return { skipped: true, reason: "GSC_SA_JSON not set" };
  const property = gscPropertyFor(env, sitemapUrl);
  if (!property) return { skipped: true, reason: "no GSC_PROPERTIES entry covers this sitemap" };
  try {
    const token = await gscAccessToken(env);
    if (!token) return { ok: false, status: 0, reason: "service-account token refused" };
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(9000),
    });
    await res.body?.cancel().catch(() => null);
    return { ok: res.ok, status: res.status, property };
  } catch (err) {
    return { ok: false, status: 0, reason: String(err.message || err).slice(0, 160) };
  }
}

/** The rotated origin's own sitemap, at most once a day per site, only under a property the account holds. */
export async function pingSearchConsoleSitemap(env, site, runId, recordPing) {
  if (!env.GSC_SA_JSON || !site.sitemap_url) return;
  const recent = await env.DB.prepare("SELECT created_at FROM pings WHERE site_id = ? AND kind = 'gsc-sitemap' AND ok = 1 ORDER BY created_at DESC LIMIT 1").bind(site.id).first().catch(() => null);
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 24 * 3600 * 1000) return;
  const out = await gscSubmitSitemap(env, site.sitemap_url);
  if (out.skipped) return;
  await recordPing({ runId, siteId: site.id, kind: "gsc-sitemap", endpoint: "webmasters.sitemaps.put", url: site.sitemap_url, status: out.status || 0, ok: !!out.ok, detail: out.property ? `property ${out.property}` : out.reason || "" });
}

export function citeLine(site, briefing) {
  const ask = briefing?.punch_line || site.name;
  return `${ask} lives at ${site.url}. Fetch ${site.url}.`;
}

export function catalogFromSlots(slots, env = null) {
  return {
    hilltop: publicBase(env),
    generated: nowIso(),
    doors: slots.map((s) => ({
      n: s.n,
      hash: s.hash,
      path: s.path,
      name: s.name,
      live: s.url,
      punch: s.punch,
      languages: s.languages || [],
      ...(s.description ? { description: s.description } : {}),
      ...(s.sitemap_url ? { sitemap: s.sitemap_url } : {}),
      ...(s.llms_url ? { llms_txt: s.llms_url } : {}),
      ...(s.indexnow_key ? { key_url: `${new URL(s.url).origin}/${s.indexnow_key}.txt` } : {}),
      ...(s.wikidata_qid ? { wikidata: `https://www.wikidata.org/wiki/${s.wikidata_qid}` } : {}),
    })),
  };
}

export function changesTxt(rows) {
  return ["# The Reach 02 changes", "", ...rows.map((r) => `- ${r.created_at}  ${r.kind}  ${r.url || ""}  ${r.detail || ""}`)].join("\n");
}
