import { all, one, run } from "./db.js";
import { materializeTargets, refreshBriefing } from "./briefing.js";
import { applyFullStack, ensureAnswerChannel } from "./stack.js";
import { rebuildReachMap } from "./map.js";
import { pingAllSites } from "./ping.js";
import { deliverTarget, LIVE_TYPES } from "./deliver.js";
import { announceReachFeed, pingReachMesh, reachAnnounceItems } from "./mesh.js";
import { numberedSites } from "./hill.js";
import { ensureOutreachTables, recordChange } from "./outreach.js";
import { nowIso, uid } from "./util.js";

/** What the schedule really does (wrangler.jsonc triggers.crons). Keep these strings true; /v1/status serves them. */
export const CRONS = ["0 * * * *", "0 */6 * * *"];
export const CRON_TRUTH = {
  hourly: "0 * * * * UTC: re-capture the 3 stalest doors, refresh the briefing of ONE rotated site (oldest ping cursor first) and ping that site's changed URLs to the 7 IndexNow endpoints, rebuild the map, ping the hub mesh (hub-host URLs only), deliver up to BATCH_SIZE targets, one Wikidata and one Wayback tick",
  six_hourly: "0 */6 * * * UTC: rebuild the atlas from every door's own llms.txt",
  rotation: "one site per hour; with N doors a site is pinged about every N hours, and only URLs whose body hash changed",
};

export async function runCycle(env, trigger = "cron") {
  const runId = uid("run");
  await run(
    env,
    `INSERT INTO runs (id, started_at, trigger, ok, attempted, delivered, skipped, failed, detail)
     VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?)`,
    runId,
    nowIso(),
    trigger,
    "started"
  );

  const stats = { attempted: 0, delivered: 0, skipped: 0, failed: 0 };
  let detail = "";
  let pings = null;
  let map = null;

  try {
    await ensureAnswerChannel(env);
    await ensureOutreachTables(env);
    const sites = await all(env, "SELECT * FROM sites WHERE active = 1");
    if (!sites.length) {
      detail = "idle: no site. POST /v1/sites {name,url}.";
      await finish(env, runId, true, stats, detail);
      return { ok: true, idle: true, runId, stats, detail };
    }

    const due = await one(
      env,
      `SELECT s.* FROM sites s
       LEFT JOIN site_ping_cursor c ON c.site_id = s.id
       WHERE s.active = 1
       ORDER BY c.last_pinged_at IS NULL DESC, c.last_pinged_at ASC
       LIMIT 1`
    );
    /* the rotated site's briefing refresh is its own failure domain: an origin that answers 404 (or nothing) this
       hour is recorded and the cursor moves past it, so the map, the mesh ping and the deliveries below still run
       and the next hour rotates to the next site instead of the same one again */
    let rotateError = "";
    if (due) {
      try {
        const out = await refreshBriefing(env, due, false);
        if (out.refreshed || !(await one(env, "SELECT site_id FROM packs WHERE site_id = ?", due.id))) {
          await applyFullStack(env, due, out.briefing, out.intel);
        }
        await materializeTargets(env, due.id);
      } catch (err) {
        rotateError = String(err?.message || err).slice(0, 300);
        await recordChange(env, { kind: "rotate", detail: `${due.name}: briefing skipped - ${rotateError}` }).catch(() => null);
      }
    }

    map = await rebuildReachMap(env);
    await recordChange(env, { kind: "map", detail: `${map.sites} sites` });
    const slots = await numberedSites(env, all);
    /* never ping over a failing sweep (playbook PART 20): pingReachMesh and announceReachFeed read the last verdict
       posted by tools/reachability.ps1 themselves (src/sweep.js) - the one gate, inside the one function */
    const reachPing = await pingReachMesh(env, await reachAnnounceItems(env, slots), runId);
    if (reachPing.doors_changed) await announceReachFeed(env);
    pings = due ? await pingAllSites(env, runId, [due]) : { ok: true, stats: {}, report: [] };
    if (due) {
      await run(
        env,
        `INSERT INTO site_ping_cursor (site_id, last_pinged_at) VALUES (?, ?)
         ON CONFLICT(site_id) DO UPDATE SET last_pinged_at=excluded.last_pinged_at`,
        due.id,
        nowIso()
      );
    }
    pings.reach = reachPing.report;
    pings.rotated = due ? due.name : null;

    const batchSize = Math.max(1, Math.min(10, Number(env.BATCH_SIZE || 2)));
    const eligible = await all(
      env,
      `SELECT t.* FROM targets t
       JOIN channels c ON c.id = t.channel_id
       LEFT JOIN ledger l ON l.target_id = t.id
       LEFT JOIN (
         SELECT site_id, MAX(created_at) AS last_ok
         FROM pings WHERE ok = 1 GROUP BY site_id
       ) p ON p.site_id = t.site_id
       WHERE l.target_id IS NULL AND c.active = 1
       ORDER BY p.last_ok IS NULL DESC, p.last_ok ASC, t.created_at ASC LIMIT ?`,
      batchSize
    );

    for (const target of eligible) {
      stats.attempted += 1;
      const site = await one(env, "SELECT * FROM sites WHERE id = ?", target.site_id);
      const briefing = await one(env, "SELECT * FROM briefings WHERE site_id = ?", target.site_id);
      const channel = await one(env, "SELECT * FROM channels WHERE id = ?", target.channel_id);
      if (!site || !briefing || !channel || !LIVE_TYPES.has(channel.type)) {
        stats.skipped += 1;
        continue;
      }
      const out = await deliverTarget(env, { site, briefing, target, channel, runId });
      if (out.result === "delivered") stats.delivered += 1;
      else if (out.result === "skipped") stats.skipped += 1;
      else stats.failed += 1;
    }

    const pingsSkipped = pings.report?.[0]?.skipped ? ` (site pings skipped: ${pings.report[0].reason})` : "";
    detail = `rotated ${due ? due.name : "none"}${rotateError ? ` (briefing skipped: ${rotateError})` : ""} · pings ${pings.stats.indexnow || 0} indexnow / ${pings.stats.doors || 0} doors${pings.stats.host_mismatch ? ` / ${pings.stats.host_mismatch} host-mismatch dropped` : ""}${pingsSkipped} · map ${map.sites} sites${map.changed ? " (changed)" : " (unchanged)"}`;
    const ok = pings.ok;
    await finish(env, runId, ok, stats, detail);
    return { ok, runId, stats, detail, pings: pings.stats, map: { sites: map.sites, changed: !!map.changed, updated_at: map.updated_at }, ...(rotateError ? { rotate_error: rotateError } : {}) };
  } catch (err) {
    detail = String(err.message || err).slice(0, 800);
    await finish(env, runId, false, stats, detail);
    return { ok: false, runId, stats, detail };
  }
}

async function finish(env, runId, ok, stats, detail) {
  await run(
    env,
    `UPDATE runs SET finished_at = ?, ok = ?, attempted = ?, delivered = ?, skipped = ?, failed = ?, detail = ?
     WHERE id = ?`,
    nowIso(),
    ok ? 1 : 0,
    stats.attempted,
    stats.delivered,
    stats.skipped,
    stats.failed,
    detail,
    runId
  );
}

export async function status(env) {
  await ensureAnswerChannel(env);
  const sites = await all(env, "SELECT id, name, url, active, indexnow_key, created_at FROM sites");
  const lastRun = await one(env, "SELECT * FROM runs ORDER BY started_at DESC LIMIT 1");
  const lastPings = await all(env, "SELECT kind, ok, COUNT(*) AS c FROM pings GROUP BY kind, ok");
  return {
    ok: sites.length > 0,
    crons: CRONS,
    schedule: CRON_TRUTH,
    must: "every hourly cron: one rotated site gets its briefing refreshed and its changed URLs pinged; the hub mesh is pinged every cron; nothing unchanged is re-pinged",
    sites,
    last_run: lastRun,
    ping_counts: lastPings,
    same_target_twice: false,
  };
}

/* ---------------- the sweep's verdict lives in src/sweep.js; re-exported so index.js keeps one import ---------------- */
export { SWEEP_BODY_MAX, latestSweep, storeSweep, sweepAllowsPing } from "./sweep.js";
