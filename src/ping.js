import { all, one, run } from "./db.js";
import { keyForUrl } from "./known-keys.js";
import { extractIndexNowKeyFromHtml, normalizeOriginKey, nowIso, uid } from "./util.js";
import {
  markDoor,
  pingBingSubmit,
  pingSearchConsoleSitemap,
  pingWebSub,
  recordChange,
  shouldPingUrl,
  watchChallenges,
} from "./outreach.js";
import { isSelfUrl, selfDoor } from "./self.js";

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

async function confirmKeyFile(origin, key) {
  const loc = `${origin}/${key}.txt`;
  try {
    const res = await fetch(loc, { redirect: "follow", headers: { "user-agent": "TheReach02-keyread/1.1" } });
    if (!res.ok) return "";
    const body = (await res.text()).trim();
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
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const text = await res.text();
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

export async function verifyOriginKey(site) {
  if (!site.indexnow_key) {
    return { url: "", status: 0, ok: false, detail: "no key yet — add meta or inject on add" };
  }
  const url = keyFileUrl(site);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "TheReach02-keycheck/1.1" },
    });
    const body = (await res.text()).trim();
    const ok = res.ok && body.includes(site.indexnow_key);
    return { url, status: res.status, ok, detail: ok ? "origin holds key" : "key file missing or mismatch" };
  } catch (err) {
    return { url, status: 0, ok: false, detail: String(err.message || err) };
  }
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
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, ok: res.status === 200 || res.status === 202, body: text.slice(0, 200) };
}

async function fetchDoor(url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": "TheReach02-ping/1.1" },
  });
  const body = await res.text();
  return { status: res.status, ok: res.ok, final: res.url || url, body };
}

/**
 * MUST: every cron, every active site, ping every outward endpoint
 * plus re-fetch every pointing door.
 */
export async function pingAllSites(env, runId, onlySites = null) {
  const sites = onlySites || (await all(env, "SELECT * FROM sites WHERE active = 1"));
  const stats = { sites: 0, indexnow: 0, doors: 0, failed: 0, skipped_unchanged: 0, key_red: 0 };
  const report = [];
  const rec = (row) => record(env, row);

  for (const site of sites) {
    stats.sites += 1;
    const selfSite = isSelfUrl(site.url, env);
    await ensureIndexNowKey(env, site);
    const keyCheck = selfSite
      ? { url: keyFileUrl(site), status: 200, ok: true, detail: "self: worker serves its own key file" }
      : await verifyOriginKey(site);
    if (!keyCheck.ok) {
      stats.key_red += 1;
      await recordChange(env, { kind: "key-red", siteId: site.id, url: keyCheck.url, detail: keyCheck.detail });
    }
    if (!selfSite) await watchChallenges(env, site, runId, rec);
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
    const pingList = changedUrls;

    const host = new URL(site.url).host;
    const keyLocation = keyFileUrl(site);
    const endpoints =
      String(env.PING_ALL_ENDPOINTS || "1") === "1" ? INDEXNOW_ENDPOINTS : [INDEXNOW_ENDPOINTS[0]];

    const siteReport = { site: site.name, url: site.url, indexnow: [], doors: [], keyLocation, key_ok: keyCheck.ok };

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
    } else if (keyCheck.ok) {
      siteReport.indexnow.push({ skipped: true, reason: "unchanged bodies — silent" });
    } else {
      siteReport.indexnow.push({ skipped: true, reason: "origin key file missing" });
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
      const origin = new URL(site.url).origin;
      for (const feed of [`${origin}/feed`, `${origin}/rss.xml`, `${origin}/atom.xml`]) {
        try {
          const res = await fetch(feed, { method: "GET", headers: { "user-agent": "TheReach02-ping/1.1" } });
          if (res.ok) await pingWebSub(env, site, feed, runId, rec);
        } catch {
          /* no feed */
        }
      }
    }

    report.push(siteReport);
  }

  return { ok: stats.sites > 0, stats, report };
}

export async function recentPings(env, limit = 80) {
  return all(env, "SELECT * FROM pings ORDER BY created_at DESC LIMIT ?", limit);
}
