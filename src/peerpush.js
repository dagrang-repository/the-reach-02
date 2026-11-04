/* Reach 02 - PeerPush listings, hands-free. The hub keeps the state; the work runs on GitHub (tools/peerpush-bot.mjs),
 * because claiming a listing needs a browser and the bot account's sign-in codes reach this Worker by email.
 *   create  -> REST POST /api/v1/products (the bot's own API key), once per door (Idempotency-Key)
 *   claim   -> the private claim link, signed in as peerpush@aplusz.app; details confirmed; the FREE plan only
 *   watch   -> REST status until the listing is published; then the door's listing URL is kept here
 * Which doors: every active door with a real description, except the owner-approved skips (not software, or a
 * duplicate): PEERPUSH_SKIP, default 6,13,28,29,33. Pace: PEERPUSH_PER_DAY new listings a day (default 3).
 * Secrets: the bot's PeerPush API key and each claim link are kept AES-GCM encrypted (key derived from ADMIN_TOKEN),
 * handed out only through the admin gate, never listed, never public. */
import { all, one, run } from "./db.js";
import { json, nowIso } from "./util.js";
import { numberedSites } from "./hill.js";
import { captureView } from "./capture.js";
import { confidenceOf } from "./liveness.js";
import { publicBase } from "./hill.js";
import { COPY } from "./peerpush-copy.js";

export const SKIP_DEFAULT = "6,13,26,28,29,30,31,32,33";   // not software, duplicates, support pages (owner, Nov 3 2026)
export const PER_DAY_DEFAULT = 3;
export const CONTACT_EMAIL = "contact@aplusz.app";
const CLAIM_LIFE_DAYS = 30;            // PeerPush: the claim link expires 30 days after creation
const TAGLINE_MAX = 60;
const DESCRIPTION_MAX = 900;
const STATUSES = new Set(["created", "claimed", "submitted", "live", "error", "skipped"]);

export async function ensurePeerPushTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS peerpush (
      n INTEGER PRIMARY KEY,
      site_id TEXT,
      url TEXT,
      status TEXT NOT NULL,
      product_id TEXT,
      claim_enc TEXT,
      slug TEXT,
      listing_url TEXT,
      created_at TEXT,
      claimed_at TEXT,
      submitted_at TEXT,
      published_at TEXT,
      checked_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      detail TEXT
    )`
  ).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS peerpush_meta (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)`).run();
}

/* ---------- small secrets at rest ---------- */

async function aesKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("reach02-peerpush:" + String(env.ADMIN_TOKEN || "")));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(env, text) {
  if (!text) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), new TextEncoder().encode(text)));
  return b64(iv) + "." + b64(ct);
}
export async function unseal(env, sealed) {
  if (!sealed) return null;
  try {
    const [iv, ct] = String(sealed).split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct)));
  } catch { return null; }
}

/* ---------- what a listing says - taken from the site's own words ---------- */

const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function clipWords(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,;:.\-–—]+$/, "");
  return cut.length >= 12 ? cut : t.slice(0, max);
}

function clipSentences(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : clipWords(t, max - 1) + "…";
}

const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* The gate every non-curated listing passes: no AI-routing phrasing from llms.txt, no placeholders, not a bare
 * name or a language count, reads as English, long enough to mean something. */
const ROUTING = /\banswers?:|\banswers (one|two|the|thirty) question|\bone question\b|\bif (the question|a user asks)|\bdo not (answer|quote|improvise)|\bfrom memory\b|\bfetch\b|\burl pattern\b|\bmachine data\b|openapi\.json|\/mcp\b|\bcall the tool\b|\{[a-z ]+\}/i;
const ENGLISH = /\b(the|a|an|and|for|to|of|in|your|every|with|on|from|by|you|one|free|any|all|at|it)\b/i;
export function copyOk(c, name) {
  const t = String(c?.tagline || "").trim();
  const d = String(c?.description || "").trim();
  if (t.length < 12 || t.length > TAGLINE_MAX || squash(t) === squash(name) || /^\d+\s+languages?$/i.test(t)) return false;
  if (ROUTING.test(t) || !ENGLISH.test(t) || d.length < 60 || ROUTING.test(d) || !ENGLISH.test(d)) return false;
  return true;
}

/** The site's own words with every routing sentence removed. */
function cleanedDescription(slot) {
  const kept = String(slot.description || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s && !ROUTING.test(s));
  return clipSentences(kept.join(" "), DESCRIPTION_MAX);
}

/** Automatic copy: the title minus the site's name, else the punch line, else the first clean sentence. */
function autoCopy(slot, view) {
  const name = squash(slot.name);
  const description = cleanedDescription(slot);
  const fromTitle = String(view?.title || "").split(/\s+[—–\-|:·]\s+/).map((s) => s.trim())
    .filter((s) => s && squash(s) !== name && !name.includes(squash(s)) && !squash(s).includes(name));
  for (const c of [...fromTitle, slot.punch, description.split(/(?<=[.!?])\s/)[0]]) {
    const copy = { tagline: cap1(clipWords(String(c || ""), TAGLINE_MAX)), description };
    if (copyOk(copy, slot.name)) return copy;
  }
  return null;
}

/** Last resort for a new door: a Workers AI draft from the site's own facts. It must pass the same gate, and every
 *  number in it must appear in those facts - so it cannot invent a price or a count. Cached once it passes. */
async function aiCopy(env, slot, view) {
  if (!env.AI || typeof env.AI.run !== "function") return null;
  const key = `copy:${slot.n}`;
  const cached = await one(env, "SELECT v FROM peerpush_meta WHERE k = ?", key).catch(() => null);
  if (cached) { try { return JSON.parse(cached.v); } catch { /* redraft */ } }
  const facts = { name: slot.name, url: slot.url, title: view?.title || "", description: cleanedDescription(slot) || String(slot.punch || "") };
  if (!facts.description) return null;
  try {
    const out = await env.AI.run(env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct", {
      max_tokens: 320,
      messages: [
        { role: "system", content: "You write listings for a software product directory. Use ONLY the facts given. Never invent features, numbers, prices or claims. Plain English, no hype, no questions, no URLs. Reply with JSON only: {\"tagline\": \"at most 60 characters\", \"description\": \"2 or 3 sentences\"}." },
        { role: "user", content: JSON.stringify(facts) }
      ]
    });
    const m = String(out?.response || "").match(/\{[\s\S]*\}/);
    const draft = m ? JSON.parse(m[0]) : null;
    const copy = draft ? { tagline: clipWords(String(draft.tagline || ""), TAGLINE_MAX), description: clipSentences(String(draft.description || ""), DESCRIPTION_MAX) } : null;
    const source = JSON.stringify(facts).replace(/,(?=\d{3})/g, "");
    const numbersTrue = copy && (`${copy.tagline} ${copy.description}`.replace(/,(?=\d{3})/g, "").match(/\d+(\.\d+)?/g) || []).every((x) => source.includes(x));
    if (!copy || !numbersTrue || !copyOk(copy, slot.name)) return null;
    await run(env, "INSERT INTO peerpush_meta (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
      key, JSON.stringify(copy), nowIso()).catch(() => null);
    return copy;
  } catch { return null; }
}

/** The listing for a door: curated copy (src/peerpush-copy.js), else clean automatic copy, else (only when asked)
 *  a gated AI draft. null = no copy good enough yet - the door waits instead of going out with junk. */
export async function listingFor(slot, env, { ai = false } = {}) {
  const view = captureView(slot, env, publicBase(env));
  const copy = COPY[slot.n] || autoCopy(slot, view) || (ai ? await aiCopy(env, slot, view) : null);
  if (!copy) return null;
  return {
    n: slot.n,
    name: String(slot.name || "").slice(0, 80),
    websiteUrl: slot.url,
    tagline: copy.tagline,
    description: copy.description,
    copy: COPY[slot.n] ? "curated" : "auto",
    og_image: slot.og_image || "",
    contactEmail: CONTACT_EMAIL
  };
}

/* NEVER: doors the owner keeps out of PeerPush for good - no setting can put them back (#13 One Life, #36 We push your site to the World). */
export const NEVER = new Set([13, 36]);   // #36 We push your site to the World (owner, Nov 5 2026)
const skipSet = (env) => new Set([...NEVER, ...String(env.PEERPUSH_SKIP ?? SKIP_DEFAULT).split(",").map((s) => Number(s.trim())).filter(Boolean)]);
const perDay = (env) => Math.max(0, Math.min(20, Number(env.PEERPUSH_PER_DAY ?? PER_DAY_DEFAULT)));

export function eligible(slot, env) {
  if (!slot?.n || skipSet(env).has(Number(slot.n))) return { ok: false, why: "skipped by owner" };
  const c = confidenceOf(slot);
  if (c === "stale") return { ok: false, why: "door not live (stale)" };
  if (c === "thin") return { ok: false, why: "no description yet" };
  return { ok: true };
}

/* ---------- the work queue ---------- */

export async function queueFor(env, { limit = 3, only = 0 } = {}) {
  await ensurePeerPushTables(env);
  const slots = await numberedSites(env, all);
  const rows = new Map((await all(env, "SELECT * FROM peerpush")).map((r) => [Number(r.n), r]));
  const items = [];
  const now = Date.now();

  // 1. finish what is started: claim links not yet claimed, claimed listings without a plan, listings in the queue
  for (const slot of slots) {
    if (only && slot.n !== only) continue;
    const r = rows.get(slot.n);
    if (!r || !["created", "claimed", "submitted"].includes(r.status)) continue;
    if (r.status === "created" && r.created_at && now - Date.parse(r.created_at) > (CLAIM_LIFE_DAYS - 1) * 86400000) {
      await run(env, "UPDATE peerpush SET status = 'error', detail = ? WHERE n = ?", "claim link expired before it was claimed", slot.n);
      continue;
    }
    const phase = r.status === "submitted" ? "watch" : "claim";
    const L = (await listingFor(slot, env)) || { n: slot.n, name: slot.name, websiteUrl: slot.url };
    items.push({ phase, ...L, product_id: r.product_id, slug: r.slug || "", status: r.status,
      claim_url: phase === "claim" ? await unseal(env, r.claim_enc) : null });
  }

  // 2. new listings, door order, within today's pace
  const today = new Date().toISOString().slice(0, 10);
  const madeToday = (await one(env, "SELECT COUNT(*) AS c FROM peerpush WHERE substr(created_at, 1, 10) = ?", today))?.c || 0;
  let room = Math.max(0, (only ? 1 : perDay(env)) - madeToday);
  for (const slot of slots) {
    if (room <= 0 || items.filter((i) => i.phase === "create").length >= limit) break;
    if (only && slot.n !== only) continue;
    const prev = rows.get(slot.n);
    if (prev && !(prev.status === "error" && !prev.product_id && Number(prev.attempts || 0) < 30
      && (!prev.checked_at || now - Date.parse(prev.checked_at) > 20 * 3600000))) continue;   // a failed create retries ~daily, on its own
    if (!eligible(slot, env).ok) continue;
    const L = await listingFor(slot, env, { ai: true });
    if (!L) continue;                       // no copy good enough yet: the door waits, nothing goes out with junk
    items.push({ phase: "create", ...L });
    room--;
  }
  return { ok: true, made_today: madeToday, per_day: perDay(env), items: items.slice(0, Math.max(limit, 1) + 20) };
}

export async function recordFor(env, body) {
  await ensurePeerPushTables(env);
  const n = Number(body?.n || 0);
  const status = String(body?.status || "");
  if (!n || !STATUSES.has(status)) return { ok: false, error: "n and a valid status are required" };
  const slots = await numberedSites(env, all);
  const slot = slots.find((s) => s.n === n);
  if (!slot) return { ok: false, error: "no door at that number" };
  const prev = await one(env, "SELECT * FROM peerpush WHERE n = ?", n);
  const now = nowIso();
  const claimEnc = body.claim_url ? await seal(env, String(body.claim_url)) : prev?.claim_enc || null;
  const at = (k, when) => (status === k ? prev?.[when] || now : prev?.[when] || null);
  await run(env,
    `INSERT INTO peerpush (n, site_id, url, status, product_id, claim_enc, slug, listing_url, created_at, claimed_at, submitted_at, published_at, checked_at, attempts, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(n) DO UPDATE SET status = excluded.status, product_id = excluded.product_id, claim_enc = excluded.claim_enc,
       slug = excluded.slug, listing_url = excluded.listing_url, created_at = excluded.created_at, claimed_at = excluded.claimed_at,
       submitted_at = excluded.submitted_at, published_at = excluded.published_at, checked_at = excluded.checked_at,
       attempts = excluded.attempts, detail = excluded.detail`,
    n, slot.id, slot.url, status,
    String(body.product_id || prev?.product_id || "") || null,
    claimEnc,
    String(body.slug || prev?.slug || "") || null,
    String(body.listing_url || prev?.listing_url || "") || null,
    prev?.created_at || (status === "created" ? now : null),
    at("claimed", "claimed_at"),
    at("submitted", "submitted_at"),
    status === "live" ? String(body.published_at || prev?.published_at || now) : prev?.published_at || null,
    now,
    Number(prev?.attempts || 0) + (status === "error" ? 1 : 0),
    String(body.detail || "").slice(0, 300)
  );
  return { ok: true, n, status };
}

/* ---------- admin endpoints (the admin gate runs before this) ---------- */

export async function handlePeerPush(path, request, url, env) {
  if (!path.startsWith("/v1/peerpush")) return null;
  await ensurePeerPushTables(env);
  const method = request.method;

  if (path === "/v1/peerpush" && method === "GET") {
    const slots = await numberedSites(env, all);
    const rows = new Map((await all(env, "SELECT * FROM peerpush")).map((r) => [Number(r.n), r]));
    return json({
      ok: true, per_day: perDay(env), skip: [...skipSet(env)],
      doors: slots.map((s) => {
        const r = rows.get(s.n);
        const e = eligible(s, env);
        return { n: s.n, name: s.name, status: r?.status || (e.ok ? "queued" : "skipped"), why: r ? r.detail || "" : e.ok ? "" : e.why,
          copy: COPY[s.n] ? "curated" : "auto or AI draft",
          slug: r?.slug || "", listing_url: r?.listing_url || "", created_at: r?.created_at || "", claimed_at: r?.claimed_at || "",
          submitted_at: r?.submitted_at || "", published_at: r?.published_at || "", attempts: r?.attempts || 0 };
      })
    });
  }
  if (path === "/v1/peerpush/key" && method === "GET") {
    const row = await one(env, "SELECT v, updated_at FROM peerpush_meta WHERE k = 'api_key'");
    return json({ ok: true, key: row ? await unseal(env, row.v) : null, updated_at: row?.updated_at || "" });
  }
  if (path === "/v1/peerpush/key" && method === "POST") {
    let body = null; try { body = await request.json(); } catch { body = null; }
    const key = String(body?.key || "");
    if (!/^pp_(live|test)_[A-Za-z0-9_-]{8,}$/.test(key)) return json({ ok: false, error: "not a PeerPush key" }, 400);
    await run(env, "INSERT INTO peerpush_meta (k, v, updated_at) VALUES ('api_key', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
      await seal(env, key), nowIso());
    return json({ ok: true, stored: true });
  }
  if (path === "/v1/peerpush/queue" && method === "GET") {
    const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") || 3)));
    const only = Number(url.searchParams.get("n") || 0);
    return json(await queueFor(env, { limit, only }));
  }
  if (path === "/v1/peerpush/record" && method === "POST") {
    let body = null; try { body = await request.json(); } catch { body = null; }
    const out = await recordFor(env, body);
    return json(out, out.ok ? 200 : 400);
  }
  return json({ ok: false, error: "unknown peerpush endpoint" }, 404);
}
