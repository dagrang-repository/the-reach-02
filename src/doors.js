/** Door sweeps. The public routes (/doors, /v1/doors, /crawler-check) serve the LAST STORED sweep from D1;
 *  only scheduled() and an admin POST run the live probes. A public GET never fans out to foreign origins. */
import { all } from "./db.js";
import { listSiteDoors } from "./stack.js";
import { isSelfUrl } from "./self.js";
import { decodeBody, discardBody, nowIso, readResponseCapped } from "./util.js";
import { homeOk, recordDoorStatus } from "./liveness.js";

const UAS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Googlebot", "CCBot"];

let sweepTableReady = false;
export async function ensureSweepTable(env) {
  if (sweepTableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS door_sweeps (
      kind TEXT PRIMARY KEY,
      checked_at TEXT NOT NULL,
      result_json TEXT NOT NULL
    )`
  ).run();
  sweepTableReady = true;
}

export async function storeSweep(env, kind, result) {
  await ensureSweepTable(env);
  await env.DB.prepare(
    `INSERT INTO door_sweeps (kind, checked_at, result_json) VALUES (?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET checked_at = excluded.checked_at, result_json = excluded.result_json`
  )
    .bind(kind, result.checked_at || nowIso(), JSON.stringify(result))
    .run();
  return result;
}

/** The last stored sweep of one kind, or an honest "none stored yet" (still ok:false, never a made-up result). */
export async function loadSweep(env, kind) {
  await ensureSweepTable(env);
  const row = await env.DB.prepare("SELECT checked_at, result_json FROM door_sweeps WHERE kind = ?").bind(kind).first();
  if (!row) return { ok: false, stored: false, kind, checked_at: null, note: "No sweep stored yet; the hourly scheduled run writes one." };
  try {
    return { stored: true, ...JSON.parse(row.result_json) };
  } catch {
    return { ok: false, stored: false, kind, checked_at: row.checked_at, note: "Stored sweep unreadable." };
  }
}

/** How much of a door's home page the hourly probe reads: enough to judge the 500-byte floor and a challenge page. */
const HOME_PROBE_BYTES = 65536;
/** Home probes in flight at once (a Worker keeps six connections open per invocation). */
const HOME_PROBE_PARALLEL = 6;

/** One look at a door's live URL: GET, 9 s, at most HOME_PROBE_BYTES read and the rest cancelled. `ok` is the
 *  liveness formula (src/liveness.js homeOk): 2xx, >= 500 bytes, not a challenge page. */
export async function probeHome(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "TheReach02-doors/1.1", accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      await discardBody(res);
      return { status: res.status, ok: false, bytes: 0 };
    }
    const buf = await readResponseCapped(res, HOME_PROBE_BYTES);
    const text = decodeBody(buf, res.headers.get("content-type") || "");
    return { status: res.status, ok: homeOk(res.status, buf.byteLength, text), bytes: buf.byteLength };
  } catch (err) {
    return { status: 0, ok: false, bytes: 0, error: String((err && err.message) || err).slice(0, 120) };
  }
}

/** THE hourly liveness probe: the home page of every active door, each observation written to door_status. The
 *  hub's own door is never probed (it is live by definition, source self). Returns url -> probe result. */
export async function probeDoorHomes(env) {
  const homes = new Map();
  const rows = await all(env, "SELECT id, url FROM sites WHERE active = 1 ORDER BY created_at ASC, rowid ASC").catch(() => []);
  const foreign = rows.filter((r) => {
    if (!isSelfUrl(r.url, env)) return true;
    homes.set(r.url, { status: null, ok: true, self: true });
    return false;
  });
  for (let i = 0; i < foreign.length; i += HOME_PROBE_PARALLEL) {
    const chunk = foreign.slice(i, i + HOME_PROBE_PARALLEL);
    const seen = await Promise.all(chunk.map((r) => probeHome(r.url)));
    for (let k = 0; k < chunk.length; k++) {
      homes.set(chunk[k].url, seen[k]);
      await recordDoorStatus(env, chunk[k].id, { http_status: seen[k].status, ok: seen[k].ok, source: "probe", at: nowIso() }).catch(() => null);
    }
  }
  return homes;
}

/** Live probe of every site's home page (liveness, above) and of its doors (the pack's door list).
 *  Called by scheduled() and the admin refresh only. */
export async function sweepDoors(env) {
  const homes = env ? await probeDoorHomes(env) : new Map();
  const listed = env ? await listSiteDoors(env) : [];
  const sites = [];
  for (const row of listed) {
    const self = isSelfUrl(row.url, env); // the hub never probes its own host (it is answering this request)
    const doors = [];
    for (const door of self ? [] : (row.doors || []).slice(0, 12)) {
      try {
        const res = await fetch(door.there, {
          headers: { "user-agent": "TheReach02-doors/1.1" },
          redirect: "follow",
          signal: AbortSignal.timeout(9000),
        });
        await discardBody(res);
        doors.push({ ...door, status: res.status, open: res.ok });
      } catch (err) {
        doors.push({ ...door, status: 0, open: false, error: String(err.message || err) });
      }
    }
    const home = homes.get(row.url);
    sites.push({
      site: row.site,
      url: row.url,
      ...(home ? { home: home.self ? { self: true, ok: true } : { status: home.status, ok: home.ok, bytes: home.bytes } } : {}),
      doors,
      all_open: doors.every((d) => d.open),
    });
  }
  return { ok: true, checked_at: nowIso(), sites };
}

/** Live AI-crawler UA probe of up to three registered origins. Called by scheduled() and the admin refresh only. */
export async function probeCrawlers(env, slots, base) {
  const targets = slots.filter((s) => !isSelfUrl(s.url, env)).slice(0, 3).map((s) => ({ name: s.name, url: s.url }));
  const probes = await Promise.all(
    targets.map(async (t) => {
      const results = await Promise.all(
        UAS.map(async (ua) => {
          try {
            const r = await fetch(t.url, { headers: { "user-agent": `${ua} (crawler-check)` }, redirect: "follow", signal: AbortSignal.timeout(9000) });
            await discardBody(r); // the status is the answer; the body is never read (CONTRACT.md rule 6)
            return { ua, status: r.status, ok: r.ok };
          } catch (err) {
            return { ua, status: 0, ok: false, error: String(err.message || err).slice(0, 120) };
          }
        })
      );
      return { ...t, results, blocked: results.filter((r) => !r.ok).map((r) => r.ua) };
    })
  );
  return {
    ok: probes.every((p) => p.blocked.length === 0),
    checked_at: nowIso(),
    note: `Probes registered origins with AI-crawler UAs. The hub itself is this Worker; verify it externally: curl -A GPTBot ${base}/`,
    targets: probes,
  };
}

/** Run both live probes and store them. The hourly cron and POST /v1/doors (Bearer) call this. */
export async function refreshSweeps(env, slots, base) {
  const doors = await storeSweep(env, "doors", await sweepDoors(env));
  const crawlers = await storeSweep(env, "crawler-check", await probeCrawlers(env, slots, base));
  return { ok: true, refreshed_at: nowIso(), doors, crawlers };
}
