import { all, run } from "./db.js";
import { nowIso, sha256, uid } from "./util.js";
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
      const res = await fetch(site.url, { redirect: "follow", headers: { "user-agent": ua } });
      const head = (await res.text()).slice(0, 200).toLowerCase();
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
      });
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

export async function pingBingSubmit(env, site, urls, runId, recordPing) {
  const key = env.BING_WEBMASTER_KEY;
  if (!key) return;
  try {
    const res = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteUrl: new URL(site.url).origin, urlList: urls.slice(0, 20) }),
      }
    );
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

export async function pingSearchConsoleSitemap(env, site, runId, recordPing) {
  const token = env.GSC_TOKEN;
  if (!token) return;
  const sitemap = `${new URL(site.url).origin}/sitemap.xml`;
  const siteUrl = encodeURIComponent(new URL(site.url).origin + "/");
  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/sitemaps/${encodeURIComponent(sitemap)}`,
      { method: "PUT", headers: { authorization: `Bearer ${token}` } }
    );
    await recordPing({
      runId,
      siteId: site.id,
      kind: "gsc-sitemap",
      endpoint: "webmasters.sitemaps.put",
      url: sitemap,
      status: res.status,
      ok: res.ok,
      detail: "Search Console sitemap PUT — not Indexing API",
    });
  } catch (err) {
    await recordPing({
      runId,
      siteId: site.id,
      kind: "gsc-sitemap",
      endpoint: "webmasters.sitemaps.put",
      url: sitemap,
      status: 0,
      ok: false,
      detail: String(err.message || err),
    });
  }
}

export function citeLine(site, briefing) {
  const ask = briefing?.punch_line || site.name;
  return `${ask} lives at ${site.url}. Fetch ${site.url}.`;
}

export function catalogFromSlots(slots) {
  return {
    hilltop: publicBase(),
    generated: nowIso(),
    doors: slots.map((s) => ({
      n: s.n,
      hash: s.hash,
      path: s.path,
      name: s.name,
      live: s.url,
      punch: s.punch,
      languages: s.languages || [],
    })),
  };
}

export function changesTxt(rows) {
  return ["# The Reach 02 changes", "", ...rows.map((r) => `- ${r.created_at}  ${r.kind}  ${r.url || ""}  ${r.detail || ""}`)].join("\n");
}
