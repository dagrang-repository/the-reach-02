/** THE SWEEP'S VERDICT, in one place. tools/reachability.ps1 posts its reach-doors.json to POST /v1/sweep after every
 *  run; the latest verdict decides whether anything may be pinged (playbook PART 20: never ping over a failing sweep).
 *  mesh.js asks sweepAllowsPing() inside pingReachMesh and announceReachFeed themselves, so EVERY caller - the
 *  hourly cycle, an admin add, a paid join, a Wikidata link - is gated by the same line. No second gate exists. */
import { one, run } from "./db.js";
import { homeOk, recordDoorStatus } from "./liveness.js";
import { isSelfUrl } from "./self.js";

/** The most a sweep body may weigh. index.js refuses a larger POST with 413 before it is parsed; nothing is ever
 *  cut mid-JSON, so what is stored always parses back. */
export const SWEEP_BODY_MAX = 400000;

async function ensureSweeps(env) {
  await run(env, `CREATE TABLE IF NOT EXISTS sweeps (id INTEGER PRIMARY KEY AUTOINCREMENT, swept_at TEXT NOT NULL, verdict TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)`);
}

export async function storeSweep(env, body) {
  await ensureSweeps(env);
  const verdict = String(body.verdict || "").slice(0, 400);
  const failures = Array.isArray(body.failures) ? body.failures.length : 0;
  const sweptAt = typeof body.swept_at === "string" ? body.swept_at.slice(0, 40) : new Date().toISOString();
  const text = JSON.stringify(body);
  if (text.length > SWEEP_BODY_MAX) throw new Error(`sweep body too large: ${SWEEP_BODY_MAX} bytes at most`);
  await run(env, "INSERT INTO sweeps (swept_at, verdict, failures, body) VALUES (?, ?, ?, ?)", sweptAt, verdict, failures, text);
  await run(env, "DELETE FROM sweeps WHERE id NOT IN (SELECT id FROM sweeps ORDER BY id DESC LIMIT 30)").catch(() => null);
  const liveness = await recordSweepDoors(env, body.doors, sweptAt).catch(() => ({ recorded: 0, skipped: 0 }));
  return { swept_at: sweptAt, verdict, failures, liveness };
}

/** The sweep is a liveness writer (src/liveness.js): every body.doors[] entry that carries a numeric http_status is
 *  one observation of that door's home page, dated swept_at. The entry's own `ok` mixes every check of the section
 *  (robots, key file, sitemap...) and is NOT liveness. Optional entry fields sharpen the observation the same way the
 *  hub's own probes are judged: `bytes` (body length read; under 500 = not live) and `challenge` (true = a challenge
 *  page). An entry is matched to its door by `site_id`, else by its permanent number `n`; an entry whose `host`
 *  names another host is skipped (never a fact written to the wrong door), and the hub's own door is never written. */
async function recordSweepDoors(env, doors, sweptAt) {
  const out = { recorded: 0, skipped: 0 };
  if (!Array.isArray(doors)) return out;
  for (const d of doors.slice(0, 1000)) {
    const raw = d && typeof d === "object" ? d.http_status : undefined;
    const code = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d{1,3}\s*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isFinite(code)) { out.skipped++; continue; }
    let site = null;
    if (typeof d.site_id === "string" && d.site_id) site = await one(env, "SELECT id, url, active FROM sites WHERE id = ?", d.site_id).catch(() => null);
    else if (Number.isInteger(Number(d.n)) && Number(d.n) > 0) site = await one(env, "SELECT id, url, active FROM sites WHERE door_n = ?", Number(d.n)).catch(() => null);
    if (!site || Number(site.active) !== 1 || isSelfUrl(site.url, env)) { out.skipped++; continue; }
    if (typeof d.host === "string" && d.host.trim()) {
      let host = "";
      try { host = new URL(site.url).host.toLowerCase(); } catch { host = ""; }
      if (host !== d.host.trim().toLowerCase()) { out.skipped++; continue; }
    }
    const bytes = typeof d.bytes === "number" && Number.isFinite(d.bytes) ? d.bytes : undefined;
    const ok = homeOk(code, bytes) && d.challenge !== true;
    const row = await recordDoorStatus(env, site.id, { http_status: code, ok, source: "sweep", at: sweptAt }).catch(() => null);
    if (row) out.recorded++;
    else out.skipped++;
  }
  return out;
}

export async function latestSweep(env) {
  await ensureSweeps(env);
  const row = await one(env, "SELECT swept_at, verdict, failures, body FROM sweeps ORDER BY id DESC LIMIT 1").catch(() => null);
  if (!row) return null;
  let body = null;
  try { body = JSON.parse(row.body); } catch { body = null; }
  return { swept_at: row.swept_at, verdict: row.verdict, failures: row.failures, doors: body && body.doors ? body.doors : [] };
}

/** { ok, reason }: no sweep yet = allowed; the last verdict must start with RESULT: PASS. */
/** { ok, reason }: pings need a PASS that is recent (SWEEP_MAX_AGE_HOURS, default 36: the daily CI sweep plus slack).
 *  No sweep at all keeps the gate closed (playbook PART 22: deploy -> sweep -> ping), unless the owner sets
 *  ALLOW_UNSWEPT_PINGS = "1" for a first run. */
export async function sweepAllowsPing(env) {
  const s = await latestSweep(env).catch(() => null);
  if (!s) {
    return String(env?.ALLOW_UNSWEPT_PINGS || "") === "1"
      ? { ok: true, reason: "no sweep recorded yet (ALLOW_UNSWEPT_PINGS=1)" }
      : { ok: false, reason: "no sweep recorded yet: run tools/reachability.ps1 -Post (the daily CI does) before anything is pinged" };
  }
  if (!/^RESULT: PASS/.test(s.verdict)) return { ok: false, reason: `last sweep ${s.swept_at}: ${s.verdict.slice(0, 160)}` };
  const maxH = Number(env?.SWEEP_MAX_AGE_HOURS || 36);
  const age = (Date.now() - new Date(s.swept_at).getTime()) / 3600000;
  if (!Number.isFinite(age) || age > maxH) return { ok: false, reason: `last PASS sweep is ${Number.isFinite(age) ? Math.round(age) : "?"} h old (limit ${maxH} h): run tools/reachability.ps1 -Post` };
  return { ok: true, reason: "last sweep passed" };
}
