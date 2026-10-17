/** Wayback layer — every door, every live site and every machine surface gets archived at web.archive.org on a
 *  rolling schedule (a few URLs per hourly tick, each URL again after WAYBACK_DAYS days). Archived pages land in the
 *  corpora AI training runs draw from (Internet Archive, Common Crawl partners).
 *  Keyless by default (anonymous Save Page Now). With WAYBACK_ACCESS + WAYBACK_SECRET (archive.org S3 keys) it uses
 *  SPN2 with JSON job replies and higher limits.
 *  Public: /wayback.json   Admin: GET /v1/wayback · POST /v1/wayback[?limit=N&url=…]
 */
import { all, one, run } from "./db.js";
import { nowIso } from "./util.js";
import { numberedSites, publicBase } from "./hill.js";
import { recordChange } from "./outreach.js";

const UA = "TheReach02-wayback/1.0 (+https://reach2.aplusz.app; dagrang@gmail.com)";

let ready = false;
export async function ensureWaybackTable(env) {
  if (ready) return;
  await run(env, `CREATE TABLE IF NOT EXISTS wayback (url TEXT PRIMARY KEY, kind TEXT, site_id TEXT, last_try_at TEXT, last_saved_at TEXT, last_status INTEGER, snapshot TEXT, job_id TEXT, fails INTEGER DEFAULT 0, detail TEXT)`);
  ready = true;
}

function cfg(env) {
  return {
    access: String(env.WAYBACK_ACCESS || "").trim(),
    secret: String(env.WAYBACK_SECRET || "").trim(),
    days: Math.max(1, Number(env.WAYBACK_DAYS || 7)),
    perTick: Math.max(1, Math.min(10, Number(env.WAYBACK_PER_TICK || 4))),
  };
}

/** Everything worth a snapshot, in priority order. */
export function waybackTargets(slots, base) {
  const list = [
    { url: `${base}/`, kind: "hub" },
    { url: `${base}/llms.txt`, kind: "hub" },
    { url: `${base}/sites.md`, kind: "hub" },
    { url: `${base}/atlas.md`, kind: "hub" },
    { url: `${base}/sites.json`, kind: "hub" },
    { url: `${base}/wikidata.json`, kind: "hub" },
  ];
  for (const s of slots) {
    list.push({ url: s.url, kind: "site", site_id: s.id });
    if (s.llms_url) list.push({ url: s.llms_url, kind: "llms", site_id: s.id });
    list.push({ url: s.path, kind: "door", site_id: s.id });
    list.push({ url: `${s.path}.md`, kind: "door", site_id: s.id });
  }
  const seen = new Set();
  return list.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true)));
}

async function saveOne(env, target) {
  const c = cfg(env);
  const headers = { "user-agent": UA, accept: "application/json" };
  let status = 0;
  let snapshot = "";
  let jobId = "";
  let detail = "";
  try {
    if (c.access && c.secret) {
      headers.authorization = `LOW ${c.access}:${c.secret}`;
      headers["content-type"] = "application/x-www-form-urlencoded";
      const body = new URLSearchParams({ url: target.url, skip_first_archive: "1", if_not_archived_within: `${c.days}d`, capture_outlinks: "0", delay_wb_availability: "1" });
      const res = await fetch("https://web.archive.org/save", { method: "POST", headers, body: body.toString(), signal: AbortSignal.timeout(25000) });
      status = res.status;
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        jobId = j.job_id || "";
        detail = j.message || (jobId ? `job ${jobId}` : text.slice(0, 160));
      } catch {
        detail = text.slice(0, 160);
      }
      if (res.ok) snapshot = `https://web.archive.org/web/2/${target.url}`;
    } else {
      const res = await fetch(`https://web.archive.org/save/${target.url}`, { method: "GET", headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(28000) });
      status = res.status;
      const loc = res.headers.get("location") || res.headers.get("content-location") || "";
      snapshot = loc ? (loc.startsWith("http") ? loc : `https://web.archive.org${loc}`) : (res.ok ? `https://web.archive.org/web/2/${target.url}` : "");
      detail = res.ok || (status >= 300 && status < 400) ? "saved (anonymous SPN)" : `HTTP ${status}`;
      if (status === 429) detail = "rate limited — retried next tick";
    }
  } catch (err) {
    detail = String((err && err.message) || err).slice(0, 160);
  }
  const ok = !!snapshot && status !== 429 && status < 400;
  const ts = nowIso();
  const prev = await one(env, "SELECT fails FROM wayback WHERE url = ?", target.url).catch(() => null);
  await run(
    env,
    `INSERT INTO wayback (url, kind, site_id, last_try_at, last_saved_at, last_status, snapshot, job_id, fails, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET kind=excluded.kind, site_id=excluded.site_id, last_try_at=excluded.last_try_at,
       last_saved_at=CASE WHEN excluded.last_saved_at IS NOT NULL THEN excluded.last_saved_at ELSE wayback.last_saved_at END,
       last_status=excluded.last_status, snapshot=CASE WHEN excluded.snapshot != '' THEN excluded.snapshot ELSE wayback.snapshot END,
       job_id=excluded.job_id, fails=excluded.fails, detail=excluded.detail`,
    target.url, target.kind, target.site_id || null, ts, ok ? ts : null, status, snapshot, jobId, ok ? 0 : Number(prev?.fails || 0) + 1, detail
  );
  return { url: target.url, ok, status, snapshot, detail };
}

/** Hourly: save the N most overdue targets (never saved first, then oldest), skipping anything saved within WAYBACK_DAYS. */
export async function waybackTick(env, limit = null, onlyUrl = "") {
  await ensureWaybackTable(env);
  const c = cfg(env);
  const base = publicBase(env);
  const slots = await numberedSites(env, all);
  const targets = waybackTargets(slots, base);
  const rows = await all(env, "SELECT url, last_saved_at, last_try_at, fails FROM wayback");
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  const cutoff = Date.now() - c.days * 24 * 3600 * 1000;
  const retryCutoff = Date.now() - 6 * 3600 * 1000;
  let due = targets.filter((t) => {
    const r = byUrl.get(t.url);
    if (!r) return true;
    const saved = r.last_saved_at ? new Date(r.last_saved_at).getTime() : 0;
    const tried = r.last_try_at ? new Date(r.last_try_at).getTime() : 0;
    if (saved > cutoff) return false;
    if (tried > retryCutoff) return false; // failed recently — back off a few hours
    return Number(r.fails || 0) < 8;
  });
  if (onlyUrl) due = targets.filter((t) => t.url === onlyUrl);
  due.sort((a, b) => {
    const ra = byUrl.get(a.url), rb = byUrl.get(b.url);
    const sa = ra?.last_saved_at || "", sb = rb?.last_saved_at || "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  const batch = due.slice(0, Math.max(1, Math.min(10, limit || c.perTick)));
  const report = [];
  for (const t of batch) {
    report.push(await saveOne(env, t));
  }
  const saved = report.filter((r) => r.ok).length;
  if (saved) await recordChange(env, { kind: "wayback", detail: `${saved}/${report.length} saved · ${c.access ? "spn2" : "anonymous"}` }).catch(() => null);
  return { mode: c.access && c.secret ? "spn2" : "anonymous", targets: targets.length, due: due.length, tried: report.length, saved, report };
}

export async function waybackJson(env, slots, base) {
  await ensureWaybackTable(env);
  const rows = await all(env, "SELECT url, kind, site_id, last_saved_at, snapshot, last_status FROM wayback ORDER BY last_saved_at DESC");
  const targets = waybackTargets(slots, base);
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  return {
    name: "The AI Hill Top Lighthouse — Wayback snapshots",
    generated: nowIso(),
    targets: targets.length,
    saved: rows.filter((r) => r.last_saved_at).length,
    latest: targets.map((t) => {
      const r = byUrl.get(t.url);
      return { url: t.url, kind: t.kind, saved_at: r?.last_saved_at || "", snapshot: r?.snapshot || "", history: `https://web.archive.org/web/*/${t.url}` };
    }),
  };
}

export async function handleWayback(path, request, url, env) {
  if (path === "/v1/wayback" && request.method === "GET") {
    await ensureWaybackTable(env);
    const rows = await all(env, "SELECT * FROM wayback ORDER BY last_try_at DESC LIMIT 200");
    const c = cfg(env);
    return Response.json({ ok: true, mode: c.access && c.secret ? "spn2" : "anonymous", days: c.days, per_tick: c.perTick, rows });
  }
  if (path === "/v1/wayback" && request.method === "POST") {
    const limit = Number(url.searchParams.get("limit") || 0) || null;
    const only = String(url.searchParams.get("url") || "").trim();
    return Response.json({ ok: true, ...(await waybackTick(env, limit, only)) });
  }
  return null;
}
