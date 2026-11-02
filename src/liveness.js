/** liveness.js - THE one liveness resolver (CONTRACT.md "door_status table + src/liveness.js").
 *
 *  One table, door_status, one row per door: every writer that has just looked at a door's live URL records what it
 *  saw here, and every surface reads the same row through numberedSites() (hill.js). A door no writer has seen is
 *  'unverified' with nulls - never a guess.
 *
 *  Writers: POST /v1/sweep (src/sweep.js, per body.doors[] entry that carries a numeric http_status), the hourly home
 *  probe (src/doors.js sweepDoors), captureSite (src/capture.js, the home fetch), pingAllSites (src/ping.js, the fetch
 *  of site.url) and verifyOriginKey (src/ping.js, the key file). The hub's own door is always live (source 'self'):
 *  no probe ever writes it, and the reader forces it.
 *
 *  Status rules (recordDoorStatus):
 *   - an ok observation  -> live, fails 0, first_fail_at/closed_since null, last_ok_at = at
 *   - a failed one       -> fails + 1, first_fail_at ||= at; closed once fails >= 2 (closed_since = first_fail_at);
 *                           with fails == 1 the previous status stands (a live door stays live, flagged degraded)
 *   - an observation older than the row's last_verified is ignored (a late sweep never overwrites a newer probe)
 *  ok = 2xx AND (when a body was read) >= 500 bytes AND not a challenge page - see homeOk().
 */
import { all, one, run } from "./db.js";
import { nowIso } from "./util.js";

export const STATUS = { LIVE: "live", CLOSED: "closed", UNVERIFIED: "unverified" };

/** The least a home page body may weigh to count as a page (the sweep's own rule, tools/reachability.ps1). */
export const MIN_HOME_BYTES = 500;

/** A challenge / bot-wall page, by the same markers the daily sweep uses (tools/reachability.ps1 Test-Challenge). */
export const CHALLENGE_RE = /cf-chl|cf_chl_|challenge-platform|Just a moment\.\.\.|Verify you are human|Checking your browser|Attention Required! \| Cloudflare|\/cdn-cgi\/challenge/i;

export function isChallengePage(text) {
  return CHALLENGE_RE.test(String(text || "").slice(0, 20000));
}

/** THE ok formula for a fetch of a door's live URL: 2xx, and when a body was read, >= 500 bytes and no challenge.
 *  `bytes`/`text` undefined = no body was read (a status-only observation, e.g. a sweep entry without bytes). */
export function homeOk(status, bytes = undefined, text = undefined) {
  const s = Number(status);
  if (!Number.isFinite(s) || s < 200 || s > 299) return false;
  if (bytes !== undefined && bytes !== null && Number(bytes) < MIN_HOME_BYTES) return false;
  if (text !== undefined && text !== null && isChallengePage(text)) return false;
  return true;
}

let ready = false;
export async function ensureDoorStatus(env) {
  if (ready) return;
  await run(
    env,
    `CREATE TABLE IF NOT EXISTS door_status (
      site_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      http_status INTEGER,
      last_verified TEXT,
      last_ok_at TEXT,
      first_fail_at TEXT,
      closed_since TEXT,
      fails INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      key_ok INTEGER,
      key_verified_at TEXT
    )`
  );
  ready = true;
}

/** An ISO stamp for an observation: a parseable time, never in the future (a skewed clock is clamped to now). */
function stampOf(at) {
  const t = Date.parse(String(at ?? ""));
  if (!Number.isFinite(t)) return nowIso();
  return new Date(Math.min(t, Date.now())).toISOString();
}

const isNewer = (at, prev) => !prev || !Number.isFinite(Date.parse(prev)) || Date.parse(at) >= Date.parse(prev);

/** Record one observation of a door's live URL. Returns the row as stored, or null when the observation was older
 *  than what the row already holds (ignored) or carried no site. */
export async function recordDoorStatus(env, siteId, { http_status = null, ok = false, source = "", at = nowIso() } = {}) {
  if (!siteId) return null;
  await ensureDoorStatus(env);
  const stamp = stampOf(at);
  const prev = await one(env, "SELECT * FROM door_status WHERE site_id = ?", siteId).catch(() => null);
  if (prev && prev.source === "self") return prev; // the hub's own door is never written by a probe
  if (prev && !isNewer(stamp, prev.last_verified)) return null;
  const code = Number.isFinite(Number(http_status)) && http_status !== null && http_status !== "" ? Math.trunc(Number(http_status)) : null;
  const src = String(source || "").slice(0, 40) || null;
  let row;
  if (ok) {
    row = {
      status: STATUS.LIVE, http_status: code, last_verified: stamp, last_ok_at: stamp,
      first_fail_at: null, closed_since: null, fails: 0, source: src,
    };
  } else {
    const fails = Number(prev?.fails || 0) + 1;
    const firstFail = prev?.first_fail_at || stamp;
    const before = prev?.status || STATUS.UNVERIFIED;
    row = {
      status: fails >= 2 ? STATUS.CLOSED : before,
      http_status: code,
      last_verified: stamp,
      last_ok_at: prev?.last_ok_at || null,
      first_fail_at: firstFail,
      closed_since: fails >= 2 ? (prev?.closed_since || firstFail) : null,
      fails,
      source: src,
    };
  }
  await run(
    env,
    `INSERT INTO door_status (site_id, status, http_status, last_verified, last_ok_at, first_fail_at, closed_since, fails, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET status = excluded.status, http_status = excluded.http_status,
       last_verified = excluded.last_verified, last_ok_at = excluded.last_ok_at, first_fail_at = excluded.first_fail_at,
       closed_since = excluded.closed_since, fails = excluded.fails, source = excluded.source`,
    siteId, row.status, row.http_status, row.last_verified, row.last_ok_at, row.first_fail_at, row.closed_since, row.fails, row.source
  );
  return { site_id: siteId, ...row, key_ok: prev?.key_ok ?? null, key_verified_at: prev?.key_verified_at ?? null };
}

/** Record the result of a key-file check (verifyOriginKey). Never touches the liveness columns; a door with no row
 *  yet gets one that stays 'unverified' until a liveness writer sees it. */
export async function recordKeyStatus(env, siteId, ok, at = nowIso()) {
  if (!siteId) return null;
  await ensureDoorStatus(env);
  const stamp = stampOf(at);
  await run(
    env,
    `INSERT INTO door_status (site_id, status, fails, key_ok, key_verified_at) VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET key_ok = excluded.key_ok, key_verified_at = excluded.key_verified_at`,
    siteId, STATUS.UNVERIFIED, ok ? 1 : 0, stamp
  );
  return { site_id: siteId, key_ok: !!ok, key_verified_at: stamp };
}

/** Every stored row, keyed by site id. An unreadable table is an empty map (every door 'unverified'), never a throw. */
export async function doorStatusMap(env) {
  try {
    await ensureDoorStatus(env);
    const rows = await all(env, "SELECT * FROM door_status");
    return new Map(rows.map((r) => [r.site_id, r]));
  } catch {
    return new Map();
  }
}

/** The slot's liveness fields from its door_status row (numberedSites calls this; nothing else computes them).
 *  `self` = the hub's own door: always live, source self. No row = unverified with nulls. */
export function livenessFields(row, self = false) {
  const keyOk = row && row.key_ok !== null && row.key_ok !== undefined ? Number(row.key_ok) === 1 : null;
  if (self) {
    return {
      status: STATUS.LIVE, http_status: null, last_verified: null, last_ok_at: null, closed_since: null,
      degraded: false, key_ok: keyOk, status_source: "self",
    };
  }
  if (!row) {
    return {
      status: STATUS.UNVERIFIED, http_status: null, last_verified: null, last_ok_at: null, closed_since: null,
      degraded: false, key_ok: null, status_source: null,
    };
  }
  const status = [STATUS.LIVE, STATUS.CLOSED, STATUS.UNVERIFIED].includes(row.status) ? row.status : STATUS.UNVERIFIED;
  const code = row.http_status === null || row.http_status === undefined ? null : Number(row.http_status);
  return {
    status,
    http_status: Number.isFinite(code) ? code : null,
    last_verified: row.last_verified || null,
    last_ok_at: row.last_ok_at || null,
    closed_since: status === STATUS.CLOSED ? row.closed_since || row.first_fail_at || null : null,
    degraded: status === STATUS.LIVE && Number(row.fails || 0) >= 1,
    key_ok: keyOk,
    status_source: row.source || null,
  };
}

/** Where a description came from counts as the origin's own words when it is one of these capture sources. */
const ORIGIN_SOURCES = new Set(["llms.txt", "meta description", "og:description", "override", "self"]);

/** THE one confidence formula (door page, atlas, MCP, A2A, sites.json all use it):
 *   stale     - the last capture attempt failed (stale_since set)
 *   captured  - the last home fetch answered 200 and the description came from the origin (llms.txt, meta, og) or
 *               an override
 *   described - a description exists, but not from a successful capture
 *   thin      - the name is all there is */
export function confidenceOf(slot) {
  if (!slot) return "thin";
  if (slot.stale_since) return "stale";
  const description = String(slot.description || "").trim();
  if (!description) return "thin";
  let capture = {};
  try {
    capture = typeof slot.capture_json === "string" ? JSON.parse(slot.capture_json || "{}") || {} : slot.capture_json || {};
  } catch {
    capture = {};
  }
  const source = capture?.source?.description || "";
  const overridden = Array.isArray(capture?.overrides) && capture.overrides.includes("description");
  const status = slot.attempt_status !== null && slot.attempt_status !== undefined && slot.attempt_status !== ""
    ? Number(slot.attempt_status)
    : Number(capture?.homepage_status);
  if (status === 200 && (ORIGIN_SOURCES.has(source) || overridden)) return "captured";
  return "described";
}
