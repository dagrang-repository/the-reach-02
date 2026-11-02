import { all, one, run } from "./db.js";
import { keyForUrl } from "./known-keys.js";
import { discardBody, extractIndexNowKeyFromHtml, normalizeOriginKey, nowIso, readResponseCapped, uid } from "./util.js";
import { homeOk, recordDoorStatus, recordKeyStatus } from "./liveness.js";
import {
  markDoor,
  pingBingSitemap,
  pingBingSubmit,
  pingSearchConsoleSitemap,
  pingWebSub,
  recordChange,
  shouldPingUrl,
  watchChallenges,
} from "./outreach.js";
import { isSelfUrl, selfDoor } from "./self.js";
import { sweepAllowsPing } from "./sweep.js";
import { markOriginAnnounced, originDeltas, readOriginSitemap } from "./origin-urls.js";

/** Official IndexNow endpoints — ping ALL of them every cycle. */
export const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://indexnow.amazonbot.amazon/indexnow",
  "https://www.bing.com/indexnow",
  "https://searchadvisor.naver.com/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://yandex.com/indexnow",
  "https://indexnow.yep.com/indexnow",
];

export function makeIndexNowKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureIndexNowKey(env, site) {
  if (site.indexnow_key) return site.indexnow_key;
  const known = keyForUrl(site.url);
  if (known) {
    await rememberOriginKey(env, site, known);
    return known;
  }
  try {
    const found = await readKeyFromOrigin(site.url);
    if (found.key) {
      await rememberOriginKey(env, site, found.key);
      return found.key;
    }
  } catch {
    /* no meta yet */
  }
  return site.indexnow_key || "";
}

export function keyFileUrl(site) {
  const origin = new URL(site.url).origin;
  return `${origin}/${site.indexnow_key}.txt`;
}

/* bounded reads of a foreign origin (CONTRACT.md rule 6): a key file is a few dozen bytes, a home page's <head> sits
   in its first bytes, a door body is hashed on its first 8,000 characters, a feed is told from a soft-200 page by its
   first 2,000 characters (at most 8,000 bytes of UTF-8), an IndexNow reply is logged by its first 200 characters;
   nothing past these caps is ever read, and every such fetch gives up after ORIGIN_TIMEOUT_MS */
const KEY_FILE_MAX = 4096;
const KEY_PAGE_MAX = 262144;
const DOOR_BODY_MAX = 65536;
const FEED_HEAD_MAX = 8192;
const INDEXNOW_REPLY_MAX = 2048;
const ORIGIN_TIMEOUT_MS = 9000;
const utf8 = (bytes) => new TextDecoder().decode(bytes);

async function confirmKeyFile(origin, key) {
  const loc = `${origin}/${key}.txt`;
  try {
    const res = await fetch(loc, { redirect: "follow", headers: { "user-agent": "TheReach02-keyread/1.1" }, signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS) });
    if (!res.ok) {
      await discardBody(res);
      return "";
    }
    const body = utf8(await readResponseCapped(res, KEY_FILE_MAX)).trim();
    return body.includes(key) ? key : "";
  } catch {
    return "";
  }
}

export async function readKeyFromOrigin(url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return { key: "", status: 0 };
  }
  const hints = [`${origin}/indexnow.txt`, `${origin}/.well-known/indexnow.txt`, url];
  let lastStatus = 0;
  for (const loc of hints) {
    try {
      const res = await fetch(loc, {
        redirect: "follow",
        headers: { "user-agent": "TheReach02-keyread/1.1", accept: "text/html,text/plain" },
        signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
      });
      lastStatus = res.status;
      if (!res.ok) {
        await discardBody(res);
        continue;
      }
      const text = utf8(await readResponseCapped(res, loc === url ? KEY_PAGE_MAX : KEY_FILE_MAX));
      const candidate = normalizeOriginKey(text.trim()) || extractIndexNowKeyFromHtml(text);
      if (candidate) {
        const ok = (await confirmKeyFile(origin, candidate)) || candidate;
        if (ok) return { key: ok, status: res.status };
      }
    } catch {
      /* next hint */
    }
  }
  return { key: "", status: lastStatus };
}

export async function rememberOriginKey(env, site, key) {
  if (!key || site.indexnow_key === key) return site;
  await run(env, "UPDATE sites SET indexnow_key = ?, updated_at = ? WHERE id = ?", key, nowIso(), site.id);
  site.indexnow_key = key;
  return site;
}

/** The host an IndexNow key vouches for: the host of the key file, which is the host of the site URL. */
export function keyHostOf(site) {
  try {
    return new URL(site.url).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Split a URL list into the ones the key can vouch for and the ones on another host. IndexNow answers
 *  422 for a URL whose host is not the key's host, so a foreign URL can never succeed and only pads the batch. */
export function splitByKeyHost(site, urls) {
  const host = keyHostOf(site);
  const same = [];
  const mismatch = [];
  for (const u of urls || []) {
    let h = "";
    try { h = new URL(u).host.toLowerCase(); } catch { h = ""; }
    (h && h === host ? same : mismatch).push(u);
  }
  return { host, same, mismatch };
}

/** PART 20 / APPENDIX B §14: the key file must answer on the canonical host itself. A key file that
 *  redirects to another host (apex → www) vouches for that other host, not for the URLs in the batch.
 *  The body must BE the key (whitespace aside) - the sweep's own rule (tools/reachability.ps1): a soft-200 page that
 *  merely mentions the key is not a key file. With `env`, the result is recorded as the door's key status
 *  (door_status.key_ok, src/liveness.js) - the one place key_ok is written. */
export async function verifyOriginKey(site, env = null) {
  if (!site.indexnow_key) {
    return { url: "", status: 0, ok: false, detail: "no key yet — add meta or inject on add" };
  }
  const url = keyFileUrl(site);
  const host = keyHostOf(site);
  let out;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "TheReach02-keycheck/1.1" },
      signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
    });
    const body = res.ok ? utf8(await readResponseCapped(res, KEY_FILE_MAX)) : "";
    if (!res.ok) await discardBody(res);
    let finalHost = host;
    try { finalHost = new URL(res.url || url).host.toLowerCase(); } catch { finalHost = host; }
    const holds = res.ok && body.replace(/\s+/g, "") === String(site.indexnow_key);
    const sameHost = finalHost === host;
    const ok = holds && sameHost;
    const detail = ok
      ? "origin holds key on the canonical host"
      : holds
        ? `key file answers on ${finalHost}, not on ${host}: it cannot vouch for ${host} URLs`
        : res.ok && body.includes(site.indexnow_key)
          ? "key file answers but its body is not the key alone"
          : "key file missing or mismatch";
    out = { url, status: res.status, ok, detail, final_host: finalHost };
  } catch (err) {
    out = { url, status: 0, ok: false, detail: String(err.message || err) };
  }
  if (env && site.id) await recordKeyStatus(env, site.id, out.ok).catch(() => null);
  return out;
}

async function record(env, row) {
  await run(
    env,
    `INSERT INTO pings (id, run_id, site_id, kind, endpoint, url, status, ok, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid("ping"),
    row.runId,
    row.siteId,
    row.kind,
    row.endpoint,
    row.url || "",
    row.status ?? 0,
    row.ok ? 1 : 0,
    String(row.detail || "").slice(0, 400),
    nowIso()
  );
}

export async function postIndexNowRaw(endpoint, host, key, keyLocation, urlList) {
  return postIndexNow(endpoint, host, key, keyLocation, urlList);
}

async function postIndexNow(endpoint, host, key, keyLocation, urlList) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
  });
  const text = utf8(await readResponseCapped(res, INDEXNOW_REPLY_MAX).catch(() => new Uint8Array(0)));
  return { status: res.status, ok: res.status === 200 || res.status === 202, body: text.slice(0, 200) };
}

async function fetchDoor(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "TheReach02-ping/1.1" },
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
  });
  const bytes = await readResponseCapped(res, DOOR_BODY_MAX);
  return { status: res.status, ok: res.ok, final: res.url || url, body: utf8(bytes), bytes: bytes.byteLength };
}

/**
 * For the sites handed in (the hourly cron hands in ONE rotated site; the admin route may hand in all):
 * verify the key file on the canonical host, re-fetch every door, post only the CHANGED URLs on the key's
 * host to every IndexNow endpoint, and publish any real feed to the WebSub hubs.
 * The key check and the fetch of the door's live URL are observations (door_status, src/liveness.js): they are
 * recorded whatever the sweep says. Only what is SENT waits for a passing sweep.
 */
export async function pingAllSites(env, runId, onlySites = null) {
  const stats = { sites: 0, indexnow: 0, doors: 0, failed: 0, skipped_unchanged: 0, key_red: 0, host_mismatch: 0 };
  /* never ping over a failing sweep (playbook PART 20, src/sweep.js): the site pinger carries the gate itself, so the
     hourly cycle and POST /v1/ping are both held by the same line as the hub mesh. The gate holds the pings (IndexNow,
     Bing, Search Console, WebSub) and the change gate that picks them, never the key and liveness observations */
  const sweep = await sweepAllowsPing(env);
  if (!sweep.ok) {
    stats.skipped_sweep = 1;
    await recordChange(env, { kind: "ping", detail: `skipped: ${sweep.reason}` }).catch(() => null);
  }
  const sites = onlySites || (await all(env, "SELECT * FROM sites WHERE active = 1"));
  const report = [];
  const rec = (row) => record(env, row);

  for (const site of sites) {
    stats.sites += 1;
    const selfSite = isSelfUrl(site.url, env);
    await ensureIndexNowKey(env, site);
    const keyCheck = selfSite
      ? { url: keyFileUrl(site), status: 200, ok: true, detail: "self: worker serves its own key file" }
      : await verifyOriginKey(site, env);
    if (!keyCheck.ok) {
      stats.key_red += 1;
      await recordChange(env, { kind: "key-red", siteId: site.id, url: keyCheck.url, detail: keyCheck.detail });
    }
    if (!sweep.ok) {
      /* the sweep is red: observations only. One bounded fetch of the door's own live URL, recorded as liveness.
         Nothing is posted and the change gate (door_state) is left alone, so a change seen now is still pinged once
         the sweep passes */
      const doors = [];
      if (!selfSite) {
        let seen;
        try {
          const out = await fetchDoor(site.url);
          seen = { status: out.status, ok: out.ok, live: homeOk(out.status, out.bytes, out.body) };
        } catch {
          seen = { status: 0, ok: false, live: false };
        }
        doors.push({ url: site.url, status: seen.status, ok: seen.ok });
        await recordDoorStatus(env, site.id, { http_status: seen.status, ok: seen.live, source: "ping" }).catch(() => null);
      }
      report.push({ site: site.name, url: site.url, skipped: true, reason: sweep.reason, key_ok: keyCheck.ok, doors });
      continue;
    }
    const pack = await one(env, "SELECT ping_urls_json, doors_json FROM packs WHERE site_id = ?", site.id);
    let urls = [];
    try {
      urls = JSON.parse(pack?.ping_urls_json || "[]");
    } catch {
      urls = [];
    }
    if (!urls.length) urls = [site.url];
    urls = [...new Set(urls)].slice(0, 40);
    const changedUrls = [];
    const fetched = {};
    for (const u of urls) {
      try {
        const got = selfSite ? selfDoor(u) : await fetchDoor(u);
        fetched[u] = got;
        const gate = await shouldPingUrl(env, u, `${got.status}:${got.body || ""}`.slice(0, 8000));
        if (got.ok && gate.changed) changedUrls.push(u);
        else stats.skipped_unchanged += 1;
        await markDoor(env, u, gate.hash, got.status, got.ok);
      } catch {
        stats.skipped_unchanged += 1;
      }
    }
    // only URLs the key vouches for go in the batch; a foreign host is recorded, never posted
    const split = splitByKeyHost(site, changedUrls);
    const pingList = split.same;
    for (const u of split.mismatch) {
      stats.host_mismatch = (stats.host_mismatch || 0) + 1;
      await record(env, {
        runId,
        siteId: site.id,
        kind: "host-mismatch",
        endpoint: "indexnow",
        url: u,
        status: 0,
        ok: false,
        detail: `dropped: host is not ${split.host}, the key cannot vouch for it`,
      });
    }

    const host = split.host || new URL(site.url).host;
    const keyLocation = keyFileUrl(site);
    const endpoints =
      String(env.PING_ALL_ENDPOINTS || "1") === "1" ? INDEXNOW_ENDPOINTS : [INDEXNOW_ENDPOINTS[0]];

    const siteReport = { site: site.name, url: site.url, indexnow: [], doors: [], keyLocation, key_ok: keyCheck.ok, host_mismatch: split.mismatch };

    if (keyCheck.ok && pingList.length) {
    for (const endpoint of endpoints) {
      try {
        const out = await postIndexNow(endpoint, host, site.indexnow_key, keyLocation, pingList);
        siteReport.indexnow.push({ endpoint, status: out.status, ok: out.ok });
        if (out.ok) stats.indexnow += 1;
        else stats.failed += 1;
        await record(env, {
          runId,
          siteId: site.id,
          kind: "indexnow",
          endpoint,
          url: pingList[0],
          status: out.status,
          ok: out.ok,
          detail: out.body || `${pingList.length} urls`,
        });
      } catch (err) {
        stats.failed += 1;
        siteReport.indexnow.push({ endpoint, status: 0, ok: false });
        await record(env, {
          runId,
          siteId: site.id,
          kind: "indexnow",
          endpoint,
          url: pingList[0],
          status: 0,
          ok: false,
          detail: String(err.message || err),
        });
      }
    }
    await pingBingSubmit(env, site, pingList, runId, rec);
    await pingSearchConsoleSitemap(env, site, runId, rec);
    await pingBingSitemap(env, site, runId, rec);
    }
    /* rank 5: the origin's own sitemap - every new or changed page, not only the homepage. Same gates as above
       (sweep PASS is checked at the top of pingAllSites; the key must verify on the key host). */
    if (keyCheck.ok && !selfSite && site.sitemap_url) {
      try {
        const smHost = keyHostOf(site);
        const deltas = await originDeltas(env, site.id, await readOriginSitemap(site.sitemap_url, smHost));
        if (deltas.length) {
          let accepted = false;
          for (const endpoint of endpoints) {
            for (let i = 0; i < deltas.length; i += 10000) {
              const chunk = deltas.slice(i, i + 10000).map((u) => u.url);
              try {
                const out = await postIndexNow(endpoint, smHost, site.indexnow_key, keyLocation, chunk);
                accepted = accepted || out.ok;
                await record(env, { runId, siteId: site.id, kind: "indexnow-sitemap", endpoint, url: chunk[0], status: out.status, ok: out.ok, detail: `${chunk.length} sitemap urls` });
              } catch (err) {
                await record(env, { runId, siteId: site.id, kind: "indexnow-sitemap", endpoint, url: chunk[0], status: 0, ok: false, detail: String(err.message || err).slice(0, 160) });
              }
            }
          }
          if (accepted) await markOriginAnnounced(env, site.id, deltas);
          stats.sitemap_urls = (stats.sitemap_urls || 0) + (accepted ? deltas.length : 0);
          siteReport.sitemap = { announced: accepted ? deltas.length : 0, attempted: deltas.length };
        } else siteReport.sitemap = { announced: 0, reason: "no new or changed sitemap URL" };
      } catch (err) {
        siteReport.sitemap = { announced: 0, error: String(err.message || err).slice(0, 160) };
      }
    }
    if (keyCheck.ok && pingList.length) {
      /* reported above */
    } else if (keyCheck.ok) {
      siteReport.indexnow.push({ skipped: true, reason: split.mismatch.length && !changedUrls.length ? "unchanged bodies — silent" : split.mismatch.length ? "every changed URL was on another host" : "unchanged bodies — silent" });
    } else {
      siteReport.indexnow.push({ skipped: true, reason: keyCheck.detail || "origin key file missing" });
    }

    let doors = [];
    try {
      doors = JSON.parse(pack?.doors_json || "[]");
    } catch {
      doors = [];
    }
    const doorUrls = [...new Set([site.url, ...doors.map((d) => d.there).filter(Boolean)])].slice(0, 16);
    for (const door of doorUrls) {
      try {
        const out = selfSite ? selfDoor(door) : await fetchDoor(door);
        siteReport.doors.push({ url: door, status: out.status, ok: out.ok });
        if (out.ok) stats.doors += 1;
        else stats.failed += 1;
        /* the fetch of the door's own live URL is a liveness observation (src/liveness.js); the hub's own door never is */
        if (!selfSite && door === site.url) await recordDoorStatus(env, site.id, { http_status: out.status, ok: homeOk(out.status, out.bytes, out.body), source: "ping" }).catch(() => null);
        await record(env, {
          runId,
          siteId: site.id,
          kind: "door",
          endpoint: "GET",
          url: door,
          status: out.status,
          ok: out.ok,
          detail: out.final,
        });
      } catch (err) {
        stats.failed += 1;
        siteReport.doors.push({ url: door, status: 0, ok: false });
        if (!selfSite && door === site.url) await recordDoorStatus(env, site.id, { http_status: 0, ok: false, source: "ping" }).catch(() => null);
        await record(env, {
          runId,
          siteId: site.id,
          kind: "door",
          endpoint: "GET",
          url: door,
          status: 0,
          ok: false,
          detail: String(err.message || err),
        });
      }
    }

    if (!selfSite) {
      for (const feed of feedCandidates(site)) {
        try {
          const res = await fetch(feed, {
            method: "GET",
            redirect: "follow",
            headers: { "user-agent": "TheReach02-ping/1.1", accept: "application/atom+xml, application/rss+xml, application/feed+json, application/json, application/xml, text/xml" },
            signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
          });
          if (!res.ok) {
            await discardBody(res);
            continue;
          }
          // only a real feed is published to the hubs: a soft-200 HTML page is not one. Its first 2,000 characters
          // tell; nothing past FEED_HEAD_MAX bytes of a foreign feed is ever read
          const head = utf8(await readResponseCapped(res, FEED_HEAD_MAX)).slice(0, 2000);
          if (!looksFeed(head)) continue;
          await pingWebSub(env, site, feed, runId, rec);
        } catch {
          /* no feed */
        }
      }
    }

    /* the bot-UA watch (src/outreach.js) runs last: the key and liveness observations above are already recorded
       whatever it meets on the way */
    if (!selfSite) await watchChallenges(env, site, runId, rec);

    report.push(siteReport);
  }

  return sweep.ok ? { ok: stats.sites > 0, stats, report } : { ok: true, stats, report, runId };
}

/** Feed probe order: the feed the capture found on the page first, then the conventional paths. */
export function feedCandidates(site) {
  let origin = "";
  try { origin = new URL(site.url).origin; } catch { return []; }
  const list = [site.feed_url, `${origin}/feed.xml`, `${origin}/feed.json`, `${origin}/atom.xml`, `${origin}/rss.xml`, `${origin}/feed`];
  return [...new Set(list.filter(Boolean).map((u) => { try { return new URL(u, origin).toString(); } catch { return ""; } }).filter(Boolean))];
}

const looksFeed = (t) => /<(feed|rss)\b/i.test(t) || /"version"\s*:\s*"https:\/\/jsonfeed\.org\//.test(t);

export async function recentPings(env, limit = 80) {
  return all(env, "SELECT * FROM pings ORDER BY created_at DESC LIMIT ?", limit);
}
