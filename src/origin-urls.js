/** origin-urls.js - each origin's own sitemap URLs (url, lastmod) as last read by the hub, and the IndexNow deltas
 *  they produce (rank 5): the hub announces every citable page of the network, not just 31 homepages.
 *  - Read on the hourly rotation for the rotated site only (pingAllSites), from the sitemap the capture recorded;
 *    a sitemap index is followed to at most CHILD_MAX children; each file is read to SITEMAP_BYTES at most.
 *  - Only URLs on the key's own host are kept (IndexNow rejects another host); MAX_URLS per site.
 *  - The first read seeds the table and announces every URL once; later reads announce only URLs that are new or
 *    whose <lastmod> advanced. A URL is marked announced only after an endpoint accepted it.
 *  The gates (sweep PASS, key verified) are the caller's: this module never posts on its own. */
import { all, one, run } from "./db.js";
import { discardBody, nowIso, readResponseCapped } from "./util.js";

export const SITEMAP_BYTES = 4 * 1024 * 1024;
export const CHILD_MAX = 5;
export const MAX_URLS = 50000;
export const PER_RUN = 10000;

let ready = false;
export async function ensureOriginUrls(env) {
  if (ready) return;
  await run(env, `CREATE TABLE IF NOT EXISTS origin_urls (site_id TEXT NOT NULL, url TEXT NOT NULL, lastmod TEXT, seen_at TEXT, pinged_lastmod TEXT, pinged_at TEXT, PRIMARY KEY (site_id, url))`);
  ready = true;
}

async function getXml(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "TheReach02-sitemap/1.0", accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) { await discardBody(res); return ""; }
    return new TextDecoder().decode(await readResponseCapped(res, SITEMAP_BYTES));
  } catch {
    return "";
  }
}

const unxml = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

/** Parse one sitemap file: { children: [url], urls: [{url, lastmod}] }. */
export function parseSitemap(xml) {
  const out = { children: [], urls: [] };
  if (/<sitemapindex\b/i.test(xml)) {
    for (const m of xml.matchAll(/<sitemap\b[^>]*>[\s\S]*?<loc>\s*([\s\S]*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) out.children.push(unxml(m[1]));
    return out;
  }
  for (const m of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = (m[1].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i) || [])[1];
    if (!loc) continue;
    const lastmod = (m[1].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i) || [])[1] || "";
    out.urls.push({ url: unxml(loc), lastmod: unxml(lastmod) });
  }
  return out;
}

/** Read the origin's sitemap (index followed) and return its URLs on `host`, at most MAX_URLS. */
export async function readOriginSitemap(sitemapUrl, host) {
  const first = parseSitemap(await getXml(sitemapUrl));
  let urls = first.urls;
  for (const child of first.children.slice(0, CHILD_MAX)) {
    if (urls.length >= MAX_URLS) break;
    urls = urls.concat(parseSitemap(await getXml(child)).urls);
  }
  const seen = new Set();
  return urls.filter((u) => {
    let h = "";
    try { const p = new URL(u.url); if (!/^https?:$/.test(p.protocol)) return false; h = p.host.toLowerCase(); } catch { return false; }
    if (h !== host || seen.has(u.url)) return false;
    seen.add(u.url);
    return true;
  }).slice(0, MAX_URLS);
}

/** Store what the sitemap says now and return the URLs to announce: new ones, and ones whose lastmod advanced
 *  past the lastmod last announced. At most PER_RUN per call (the rest go on the next rotation). */
export async function originDeltas(env, siteId, urls) {
  await ensureOriginUrls(env);
  const known = new Map((await all(env, "SELECT url, pinged_lastmod, pinged_at FROM origin_urls WHERE site_id = ?", siteId)).map((r) => [r.url, r]));
  const at = nowIso();
  const out = [];
  for (const u of urls) {
    const k = known.get(u.url);
    if (!k) {
      await run(env, "INSERT INTO origin_urls (site_id, url, lastmod, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(site_id, url) DO UPDATE SET lastmod = excluded.lastmod, seen_at = excluded.seen_at", siteId, u.url, u.lastmod || null, at);
      out.push(u);
    } else {
      await run(env, "UPDATE origin_urls SET lastmod = ?, seen_at = ? WHERE site_id = ? AND url = ?", u.lastmod || null, at, siteId, u.url);
      if (!k.pinged_at || (u.lastmod && u.lastmod !== k.pinged_lastmod && u.lastmod > String(k.pinged_lastmod || ""))) out.push(u);
    }
    if (out.length >= PER_RUN) break;
  }
  return out;
}

export async function markOriginAnnounced(env, siteId, urls) {
  const at = nowIso();
  for (const u of urls) await run(env, "UPDATE origin_urls SET pinged_lastmod = ?, pinged_at = ? WHERE site_id = ? AND url = ?", u.lastmod || "", at, siteId, u.url);
}

/** The origin's most recently changed URLs: [{ url, lastmod }] newest first, at most `limit` (only URLs whose
 *  sitemap gives a lastmod - a feed entry needs a real date). */
export async function recentOriginChanges(env, siteId, limit = 50) {
  await ensureOriginUrls(env);
  return all(env, "SELECT url, lastmod FROM origin_urls WHERE site_id = ? AND lastmod IS NOT NULL AND lastmod != '' ORDER BY lastmod DESC LIMIT ?", siteId, limit).catch(() => []);
}

export async function originUrlCount(env, siteId) {
  await ensureOriginUrls(env);
  const r = await one(env, "SELECT COUNT(*) AS c, SUM(CASE WHEN pinged_at IS NOT NULL THEN 1 ELSE 0 END) AS p FROM origin_urls WHERE site_id = ?", siteId).catch(() => null);
  return { urls: Number(r?.c || 0), announced: Number(r?.p || 0) };
}
