/** mesh.js - the hub's own announcements: IndexNow for HUB-HOST URLs (the mesh) and WebSub for the hub's feeds.
 *  Split out of announce.js (which is now rendering only: JSON-LD, feeds, link headers). Every caller - the hourly
 *  cycle, an admin add, a paid join, a Wikidata link - comes through pingReachMesh / announceReachFeed, and the
 *  sweep gate (src/sweep.js) lives inside them: never over a failing sweep, never for an unchanged list. */
import { INDEXNOW_ENDPOINTS, postIndexNowPolite } from "./ping.js";
import { markDoor, pingWebSub, recordChange, shouldPingUrl } from "./outreach.js";
import { publicBase } from "./hill.js";
import { sweepAllowsPing } from "./sweep.js";
import { recordStamp } from "./announce.js";
import { one } from "./db.js";

export function reachKey(env) {
  return String(env.INDEXNOW_KEY || env.REACH_INDEXNOW_KEY || "reach2hilltopkey").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
}

export function hubHost(env) {
  try {
    return new URL(publicBase(env)).host;
  } catch {
    return "";
  }
}

/** The IndexNow batch for the hub key: ONLY URLs on the hub's own host. A live site's URL is on another host and
 *  the hub key cannot vouch for it (IndexNow answers 422 and the entry pads every batch), so s.url never goes in. */
export function reachAnnounceUrls(env, slots, extra = []) {
  const base = publicBase(env);
  const host = hubHost(env);
  const list = [
    `${base}/`,
    `${base}/index.md`,
    `${base}/llms.txt`,
    `${base}/sitemap.xml`,
    `${base}/catalog.json`,
    `${base}/changes.txt`,
    `${base}/feed.xml`,
    `${base}/robots.txt`,
    `${base}/sites.json`,
    `${base}/sites.md`,
    ...slots.filter((s) => !s.self).map((s) => s.path),
    ...slots.filter((s) => !s.self).map((s) => `${s.path}.md`),
    ...extra,
  ];
  return [...new Set(list)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
}

/** IndexNow takes up to 10,000 URLs per POST; the hub posts in chunks of this size so EVERY URL in the list is
 *  submitted (the gate below marks the whole list as announced, so nothing may be left out of the post). */
export const INDEXNOW_CHUNK = 1000;

/** THE mesh ping. Every caller (hourly cycle, admin add, paid join) comes through here, and the two gates live here:
 *  never over a failing sweep (src/sweep.js, playbook PART 20), never for an unchanged list (door_state fingerprint). */
/** The mesh list with a fingerprint per URL (rank 10): a door's two URLs move when ITS record moves (recordStamp,
 *  status, headline), the hub-level URLs move when the map's content moves (reach_map.updated_at). So a door whose
 *  description, question or liveness changed is re-announced within the hour, and nothing unchanged is. */
export async function reachAnnounceItems(env, slots) {
  const base = publicBase(env);
  const map = await one(env, "SELECT updated_at FROM reach_map WHERE id = 'reach'").catch(() => null);
  const hubFp = `map:${map?.updated_at || ""}`;
  const byPath = new Map();
  for (const s of slots.filter((x) => !x.self)) {
    const fp = `door:${recordStamp(s)}|${s.status || ""}|${s.question || ""}|${s.name || ""}`;
    byPath.set(s.path, fp);
    byPath.set(`${s.path}.md`, fp);
  }
  return reachAnnounceUrls(env, slots).map((url) => ({ url, fp: byPath.get(url) || (url.startsWith(`${base}/`) ? hubFp : url), door: byPath.has(url) }));
}

export async function pingReachMesh(env, urlsOrItems, runId) {
  const key = reachKey(env);
  const host = hubHost(env);
  const keyLocation = `${publicBase(env)}/${key}.txt`;
  const sweep = await sweepAllowsPing(env);
  if (!sweep.ok) {
    await recordChange(env, { kind: "reach-announce", detail: `skipped: ${sweep.reason}` }).catch(() => null);
    return { host, keyLocation, urls: [], report: [{ skipped: true, reason: sweep.reason }], runId };
  }
  /* per-URL change gate: plain strings fingerprint themselves (posted once, then never again unless the list grows);
     items from reachAnnounceItems carry the record's fingerprint */
  const items = (urlsOrItems || []).map((u) => (typeof u === "string" ? { url: u, fp: u } : u)).filter((x) => x && x.url);
  const changed = [];
  for (const it of items) {
    const g = await shouldPingUrl(env, it.url, it.fp);
    if (g.changed) changed.push({ ...it, hash: g.hash });
  }
  if (!changed.length) {
    return { host, keyLocation, urls: [], doors_changed: 0, report: [{ skipped: true, reason: "no hub URL changed" }], runId };
  }
  const urls = changed.map((x) => x.url);
  const chunks = [];
  for (let i = 0; i < urls.length; i += INDEXNOW_CHUNK) chunks.push(urls.slice(i, i + INDEXNOW_CHUNK));
  const report = [];
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    let status = 0;
    let ok = chunks.length > 0;
    let detail = "";
    for (const chunk of chunks) {
      try {
        const out = await postIndexNowPolite(env, endpoint, host, key, keyLocation, chunk);
        status = out.status;
        ok = ok && out.ok;
      } catch (err) {
        status = 0;
        ok = false;
        detail = String(err.message || err);
      }
    }
    report.push({ endpoint, status, ok, urls: urls.length, posts: chunks.length, ...(detail ? { detail } : {}) });
  }
  const accepted = report.some((r) => r.ok);
  /* a URL is marked announced only when at least one endpoint accepted it, so a total outage retries next hour */
  if (accepted) for (const c of changed) await markDoor(env, c.url, c.hash, 200, true);
  await recordChange(env, {
    kind: "reach-announce",
    detail: `${urls.length} urls · ${report.filter((r) => r.ok).length} endpoints`,
  });
  return { host, keyLocation, urls, doors_changed: changed.filter((c) => c.door).length, report, runId };
}

/** Every feed URL that declares the WebSub hub is published to it: /feed.xml (Atom), /feed.json (JSON Feed) and
 *  /rss.xml (RSS 2.0) each carry the hub link, so each is a topic the hub must be told about. */
export function reachFeedUrls(env) {
  const base = publicBase(env);
  return [`${base}/feed.xml`, `${base}/feed.json`, `${base}/rss.xml`];
}

export async function announceReachFeed(env) {
  const sweep = await sweepAllowsPing(env);
  if (!sweep.ok) return { published: [], skipped: true, reason: sweep.reason };
  const published = reachFeedUrls(env);
  for (const feed of published) {
    await pingWebSub(env, { id: "reach", url: publicBase(env) }, feed, "reach-feed", async () => {});
  }
  return { published, skipped: false };
}

