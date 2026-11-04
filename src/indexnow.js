/* Reach 02 - IndexNow, done politely (ported from "We push your site to the World", adapted to D1).
 * Every IndexNow POST of the hub goes through politePost():
 *  - a URL already pushed to an engine within 24 h is not pushed to it again yet: it waits in that engine's queue
 *    and goes out once its 24 h are over (a later change is never lost, it is only paced)
 *  - an HTTP 429 holds that engine for that host: Retry-After if given, else 1 h -> 2 h -> 4 h ... at most 24 h;
 *    the URLs wait in the queue meanwhile
 *  - the hourly cron drains what is due (drainIndexNow), at most DRAIN_MAX engine/host pairs per tick
 * "accepted" means HTTP 200/202 only; a held or queued push is reported as waiting, never as done.
 * Why: the change gate marks a door seen before it is pinged, so a 429 used to lose that change for good. */
import { all, one, run } from "./db.js";
import { nowIso } from "./util.js";

const HOUR = 3600000;
const DAY = 86400000;
const DRAIN_MAX = 20;
const QUEUE_MAX = 10000;

export async function ensureIndexNowTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS indexnow_hold (
      endpoint TEXT NOT NULL,
      host TEXT NOT NULL,
      key TEXT,
      key_location TEXT,
      urls_json TEXT NOT NULL DEFAULT '[]',
      not_before INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      updated_at TEXT,
      kind TEXT NOT NULL DEFAULT 'hold',
      PRIMARY KEY (endpoint, host, kind)
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS indexnow_sent (
      endpoint TEXT NOT NULL,
      url TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      PRIMARY KEY (endpoint, url)
    )`
  ).run();
}

const parseJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* Two queues per engine and host, never mixed: "hold" = URLs waiting out a 429 backoff (its time only grows),
   "wait" = URLs waiting for their own 24 h (sent from the earliest due one on; politePost re-checks each URL). */
async function queueOf(env, endpoint, host, kind) {
  return one(env, "SELECT * FROM indexnow_hold WHERE endpoint = ? AND host = ? AND kind = ?", endpoint, host, kind);
}
const holdOf = (env, endpoint, host) => queueOf(env, endpoint, host, "hold");

/** Add URLs to one queue of an engine/host; that queue is sent from notBefore on. */
async function enqueue(env, kind, endpoint, host, key, keyLocation, urls, notBefore, reason, level = null) {
  const prev = await queueOf(env, endpoint, host, kind);
  const had = parseJson(prev?.urls_json || "[]", []);
  const merged = [...new Set([...had, ...urls])].slice(0, QUEUE_MAX);
  const prevNb = Number(prev?.not_before || 0);
  const nb = kind === "hold" ? Math.max(prevNb, notBefore) : had.length && prevNb ? Math.min(prevNb, notBefore) : notBefore;
  await run(env,
    `INSERT INTO indexnow_hold (endpoint, host, kind, key, key_location, urls_json, not_before, level, reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint, host, kind) DO UPDATE SET key = excluded.key, key_location = excluded.key_location, urls_json = excluded.urls_json,
       not_before = excluded.not_before, level = excluded.level, reason = excluded.reason, updated_at = excluded.updated_at`,
    endpoint, host, kind, key, keyLocation, JSON.stringify(merged), nb, level ?? Number(prev?.level || 0), reason, nowIso());
  return { waiting: merged.length, until: nb };
}

/** When each of these URLs was last accepted by this engine (ms), for the 24 h rule. */
async function lastSent(env, endpoint, urls) {
  const rows = await all(env,
    "SELECT s.url, s.sent_at FROM indexnow_sent s JOIN json_each(?) j ON j.value = s.url WHERE s.endpoint = ?",
    JSON.stringify(urls), endpoint);
  return new Map(rows.map((r) => [r.url, Number(r.sent_at)]));
}

const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/**
 * POST urls to one IndexNow engine, politely. `rawPost(endpoint, host, key, keyLocation, urls)` does the HTTP
 * and returns { status, ok, body, retryAfter } (retryAfter in seconds, 0 when absent).
 * Returns the same shape plus { queued, recent, waiting } so callers can report honestly.
 */
export async function politePost(env, rawPost, endpoint, host, key, keyLocation, urls) {
  await ensureIndexNowTables(env);
  const now = Date.now();
  urls = [...new Set(urls.filter(Boolean))];
  if (!urls.length) return { status: 0, ok: false, body: "no urls" };

  // 24 h rule: a URL this engine accepted less than a day ago waits for its turn
  const sent = await lastSent(env, endpoint, urls);
  const fresh = urls.filter((u) => !(sent.has(u) && now - sent.get(u) < DAY));
  const later = urls.filter((u) => !fresh.includes(u));
  if (later.length) {
    const due = Math.min(...later.map((u) => sent.get(u) + DAY));
    await enqueue(env, "wait", endpoint, host, key, keyLocation, later, due, "pushed to this engine less than 24 h ago");
  }

  // a 429 hold: everything waits until it is over
  const hold = await holdOf(env, endpoint, host);
  if (hold && Number(hold.not_before) > now && fresh.length) {
    const q = await enqueue(env, "hold", endpoint, host, key, keyLocation, fresh, Number(hold.not_before), hold.reason || "429");
    return { status: 429, ok: false, queued: true, waiting: q.waiting, body: `held after 429 until ${when(Number(hold.not_before))}; ${q.waiting} URL(s) waiting` };
  }
  if (!fresh.length) {
    return { status: 0, ok: true, recent: true, body: `already pushed to this engine within 24 h; ${later.length} URL(s) go out after their 24 h` };
  }

  const res = await rawPost(endpoint, host, key, keyLocation, fresh);
  if (res.ok) {
    await run(env, "INSERT OR REPLACE INTO indexnow_sent (endpoint, url, sent_at) SELECT ?, value, ? FROM json_each(?)",
      endpoint, now, JSON.stringify(fresh));
    if (hold && Number(hold.level) > 0) await run(env, "UPDATE indexnow_hold SET level = 0, not_before = 0, reason = NULL WHERE endpoint = ? AND host = ? AND kind = 'hold'", endpoint, host);
    return res;
  }
  if (res.status === 429) {
    const level = Math.min(5, Number(hold?.level || 0) + 1);
    const wait = Math.min(DAY, Math.max((Number(res.retryAfter) || 0) * 1000, HOUR * 2 ** (level - 1)));
    const q = await enqueue(env, "hold", endpoint, host, key, keyLocation, fresh, now + wait, `429 (level ${level})`, level);
    return { ...res, queued: true, waiting: q.waiting, body: `429 - retry after ${when(now + wait)}; ${q.waiting} URL(s) waiting` };
  }
  return res;
}

/** Hourly: send what is due. onSent(row, result) lets the caller record each send. Returns how many were sent. */
export async function drainIndexNow(env, rawPost, onSent = null) {
  await ensureIndexNowTables(env);
  const now = Date.now();
  const due = await all(env,
    "SELECT * FROM indexnow_hold WHERE urls_json != '[]' AND not_before <= ? ORDER BY not_before ASC LIMIT ?", now, DRAIN_MAX);
  let sent = 0;
  for (const row of due) {
    const urls = parseJson(row.urls_json, []);
    // take the queue first: politePost puts back whatever must wait again
    await run(env, "UPDATE indexnow_hold SET urls_json = '[]' WHERE endpoint = ? AND host = ? AND kind = ?", row.endpoint, row.host, row.kind);
    if (!urls.length || !row.key) continue;
    const out = await politePost(env, rawPost, row.endpoint, row.host, row.key, row.key_location, urls).catch((e) => ({ status: 0, ok: false, body: String(e.message || e) }));
    if (out.ok && !out.recent) sent++;
    if (onSent) await onSent(row, out, urls).catch(() => null);
  }
  // keep the 24 h memory small: two days is all the rule ever needs
  await run(env, "DELETE FROM indexnow_sent WHERE sent_at < ?", now - 2 * DAY).catch(() => null);
  return sent;
}

/** What is waiting, for the admin view. */
export async function indexNowQueue(env) {
  await ensureIndexNowTables(env);
  const rows = await all(env, "SELECT endpoint, host, kind, urls_json, not_before, level, reason, updated_at FROM indexnow_hold WHERE urls_json != '[]' OR level > 0 ORDER BY not_before ASC LIMIT 200");
  return rows.map((r) => ({ endpoint: r.endpoint, host: r.host, queue: r.kind, waiting: parseJson(r.urls_json, []).length, not_before: r.not_before ? new Date(Number(r.not_before)).toISOString() : "", level: r.level, reason: r.reason || "" }));
}
