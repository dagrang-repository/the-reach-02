/** health.js - the hub's one self-report. Named checks, each {ok, detail, since?}; `red` lists the critical checks
 *  that failed (the hub cannot do its job), `warn` the door-level problems the owner should fix. /status.json is
 *  public and ok only when nothing critical is red; /v1/status (admin) carries the same report. Nothing here is
 *  assumed: a check with no data says so. */
import { all, one } from "./db.js";
import { latestSweep } from "./sweep.js";

const HOUR = 3600000;
const ageH = (iso) => {
  const t = new Date(iso || "").getTime();
  return Number.isFinite(t) ? (Date.now() - t) / HOUR : null;
};

export async function healthReport(env, slots = null) {
  const checks = {};
  const maxSweepH = Number(env?.SWEEP_MAX_AGE_HOURS || 36);

  const sweep = await latestSweep(env).catch(() => null);
  if (!sweep) {
    checks.sweep = { ok: false, critical: true, detail: "no reachability sweep recorded: run tools/reachability.ps1 -Post (the daily CI does); nothing is pinged until one passes" };
  } else {
    const h = ageH(sweep.swept_at);
    const pass = /^RESULT: PASS/.test(sweep.verdict || "");
    checks.sweep = {
      ok: pass && h !== null && h <= maxSweepH,
      critical: true,
      detail: `${sweep.verdict} (${h === null ? "unknown age" : `${Math.round(h)} h ago`}, limit ${maxSweepH} h)`,
      since: sweep.swept_at,
    };
  }

  const run = await one(env, "SELECT started_at, finished_at, ok, detail FROM runs WHERE trigger = 'cron' ORDER BY started_at DESC LIMIT 1").catch(() => null);
  if (!run) checks.hourly_cron = { ok: false, critical: true, detail: "no hourly cron run recorded yet" };
  else {
    const h = ageH(run.started_at);
    checks.hourly_cron = {
      ok: h !== null && h <= 2 && !!run.ok,
      critical: true,
      detail: `last run ${h === null ? "?" : `${Math.round(h * 10) / 10} h ago`}, ${run.ok ? "ok" : "failed"}: ${String(run.detail || "").slice(0, 200)}`,
      since: run.started_at,
    };
  }

  const list = (slots || []).filter((s) => !s.self);
  if (slots) {
    const closed = list.filter((s) => s.status === "closed");
    const unverified = list.filter((s) => s.status === "unverified");
    const keyRed = list.filter((s) => s.indexnow_key && (s.key_ok === false || s.key_ok === 0));
    const stale = list.filter((s) => s.stale_since);
    const noLlms = list.filter((s) => !s.llms_url);
    const ref = (a) => a.map((s) => `#${s.n} ${s.name}`).join(", ");
    checks.doors_closed = { ok: !closed.length, detail: closed.length ? `${closed.length} closed: ${ref(closed)}` : "none" };
    checks.doors_unverified = { ok: !unverified.length, detail: unverified.length ? `${unverified.length} not yet verified by a probe: ${ref(unverified)}` : "none" };
    checks.keys_red = { ok: !keyRed.length, detail: keyRed.length ? `${keyRed.length} IndexNow key files missing or wrong on the origin: ${ref(keyRed)}` : "none" };
    checks.capture_stale = { ok: !stale.length, detail: stale.length ? `${stale.length} records stale (last capture failed): ${ref(stale)}` : "none" };
    checks.origin_llms_missing = { ok: !noLlms.length, detail: noLlms.length ? `${noLlms.length} origins serve no llms.txt: ${ref(noLlms)}` : "none" };
  }

  const red = Object.entries(checks).filter(([, c]) => c.critical && !c.ok).map(([k]) => k);
  const warn = Object.entries(checks).filter(([, c]) => !c.critical && !c.ok).map(([k]) => k);
  return { ok: red.length === 0, checks, red, warn, checked_at: new Date().toISOString() };
}

/** The public /status.json body: the health verdict plus the counts a model or a monitor needs. */
export async function statusJson(env, slots, publicMap) {
  const h = await healthReport(env, slots);
  const list = slots.filter((s) => !s.self);
  const sweep = await latestSweep(env).catch(() => null);
  const atlas = await one(env, "SELECT MAX(updated_at) AS at FROM atlas").catch(() => null);
  const runs = await all(env, "SELECT ok FROM runs WHERE trigger = 'cron' ORDER BY started_at DESC LIMIT 24").catch(() => []);
  return {
    ok: h.ok,
    service: "the-reach-02",
    red: h.red,
    warn: h.warn,
    doors: slots.length, // every numbered door, as in /sites.json (the hub's own door included)
    sites: list.length, // the live sites behind them (the hub's own door excluded) - the home page's count
    doors_live: list.filter((s) => s.status === "live").length,
    doors_closed: list.filter((s) => s.status === "closed").length,
    doors_unverified: list.filter((s) => s.status === "unverified").length,
    records_captured: list.filter((s) => s.confidence === "captured").length,
    records_stale: list.filter((s) => s.stale_since).length,
    wikidata_items: list.filter((s) => s.wikidata_qid).length,
    sweep_verdict: sweep?.verdict || null,
    swept_at: sweep?.swept_at || null,
    hourly_runs_ok_24: runs.length ? `${runs.filter((r) => r.ok).length}/${runs.length}` : null,
    atlas_updated_at: atlas?.at || null,
    map_updated_at: publicMap?.updated_at || null,
    checks: Object.fromEntries(Object.entries(h.checks).map(([k, c]) => [k, { ok: c.ok, detail: c.detail }])),
    checked_at: h.checked_at,
  };
}
