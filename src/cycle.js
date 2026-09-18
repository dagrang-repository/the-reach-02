import { all, one, run } from "./db.js";
import { materializeTargets, refreshBriefing } from "./briefing.js";
import { applyFullStack, ensureAnswerChannel } from "./stack.js";
import { rebuildReachMap } from "./map.js";
import { pingAllSites } from "./ping.js";
import { deliverTarget, LIVE_TYPES } from "./deliver.js";
import { announceReachFeed, pingReachMesh, reachAnnounceUrls } from "./announce.js";
import { numberedSites } from "./hill.js";
import { ensureOutreachTables, recordChange } from "./outreach.js";
import { nowIso, uid } from "./util.js";

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
    if (due) {
      const out = await refreshBriefing(env, due, false);
      if (out.refreshed || !(await one(env, "SELECT site_id FROM packs WHERE site_id = ?", due.id))) {
        await applyFullStack(env, due, out.briefing, out.intel);
      }
      await materializeTargets(env, due.id);
    }

    map = await rebuildReachMap(env);
    await recordChange(env, { kind: "map", detail: `${map.sites} sites` });
    const slots = await numberedSites(env, all);
    const reachPing = await pingReachMesh(env, reachAnnounceUrls(env, slots), runId);
    if (reachPing.urls?.length) await announceReachFeed(env);
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

    detail = `pings ${pings.stats.indexnow} indexnow / ${pings.stats.doors} doors · map ${map.sites} sites`;
    const ok = pings.ok;
    await finish(env, runId, ok, stats, detail);
    return { ok, runId, stats, detail, pings: pings.stats, map: { sites: map.sites } };
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
    cron: "0 */2 * * * UTC",
    must: "outward IndexNow + door pings every cycle, every site",
    sites,
    last_run: lastRun,
    ping_counts: lastPings,
    same_target_twice: false,
  };
}
