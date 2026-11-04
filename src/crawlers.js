/* Reach 02 - proof that AI crawlers really read the hub (ported from "We push your site to the World", adapted to D1).
 * Every request from a known AI/search crawler is logged AFTER the response is sent (ctx.waitUntil): the door it
 * read (/N, /N.md, /N.json; 0 = a hub page), the bot, what the visit is for, and whether it is VERIFIED:
 *   - the IP sits inside the ranges the vendor publishes (OpenAI, Perplexity, Google, Bing, Apple), or
 *   - the request carries a valid Web Bot Auth signature (RFC 9421 + the web-bot-auth directory draft).
 * A visit that only claims a name is kept as "claimed". No IP address is ever stored - only verified yes/no.
 * Public: /crawlers.json (totals per bot, per class and per door, 24 h and 30 days). Admin: GET /v1/crawlers.
 * Ranges refresh daily, hits are kept 90 days (crawlerTick, six-hourly cron). */
import { all, one, run } from "./db.js";
import { json } from "./util.js";

const BOTS = [
  ["GPTBot", /GPTBot/i, "https://openai.com/gptbot.json"],
  ["OAI-SearchBot", /OAI-SearchBot/i, "https://openai.com/searchbot.json"],
  ["ChatGPT-User", /ChatGPT-User/i, "https://openai.com/chatgpt-user.json"],
  ["Claude-SearchBot", /Claude-SearchBot/i, null],
  ["Claude-User", /Claude-User/i, null],
  ["ClaudeBot", /ClaudeBot|anthropic-ai/i, null],
  ["Perplexity-User", /Perplexity-User/i, "https://www.perplexity.ai/perplexity-user.json"],
  ["PerplexityBot", /PerplexityBot/i, "https://www.perplexity.ai/perplexitybot.json"],
  ["Googlebot", /Googlebot|Google-Extended|GoogleOther|Google-CloudVertexBot/i, "https://developers.google.com/static/search/apis/ipranges/googlebot.json"],
  ["Bingbot", /bingbot|BingPreview/i, "https://www.bing.com/toolbox/bingbot.json"],
  ["Applebot", /Applebot/i, "https://search.developer.apple.com/applebot.json"],
  ["CCBot", /CCBot/i, null],
  ["Bytespider", /Bytespider/i, null],
  ["Meta", /meta-externalagent|meta-externalfetcher|FacebookBot/i, null],
  ["DuckAssistBot", /DuckAssistBot/i, null],
  ["Amazonbot", /Amazonbot/i, null],
  ["MistralAI", /MistralAI-User/i, null],
  ["GrokBot", /GrokBot|xAI-Bot|Grok-/i, null],
  ["YandexBot", /YandexBot|YandexAdditional/i, null],
  ["cohere-ai", /cohere-ai|cohere-training/i, null],
  ["YouBot", /YouBot/i, null],
];
const CLASS = {
  "OAI-SearchBot": "search", "Claude-SearchBot": "search", PerplexityBot: "search", Googlebot: "search", Bingbot: "search",
  Applebot: "search", DuckAssistBot: "search", Amazonbot: "search", YandexBot: "search", YouBot: "search",
  GPTBot: "train", ClaudeBot: "train", CCBot: "train", Bytespider: "train", Meta: "train", "cohere-ai": "train",
  "ChatGPT-User": "user", "Claude-User": "user", "Perplexity-User": "user", MistralAI: "user", GrokBot: "user",
};
export const botClass = (name) => CLASS[name] || (String(name).startsWith("signed:") ? "user" : "other");
export function whichBot(ua) { for (const [name, re] of BOTS) if (re.test(ua || "")) return name; return null; }

let ready = false;
export async function ensureCrawlerTables(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS crawler_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, door INTEGER NOT NULL DEFAULT 0, bot TEXT NOT NULL, class TEXT, path TEXT,
    status INTEGER, verified INTEGER NOT NULL DEFAULT 0, signed TEXT, at INTEGER NOT NULL)`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS crawler_hits_at ON crawler_hits (at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS crawler_hits_door ON crawler_hits (door, at)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS bot_ranges (bot TEXT PRIMARY KEY, cidrs_json TEXT NOT NULL, at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS wba_directory (url TEXT PRIMARY KEY, keys_json TEXT, at INTEGER NOT NULL)").run();
  ready = true;
}

/* ---------- verification by published IP ranges ---------- */

function ip4(ip) {
  const p = String(ip).split(".").map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : -1));
  return p.length === 4 && p.every((x) => x >= 0 && x < 256) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null;
}
export function in4(ip, cidr) {
  const [net, bitsS] = cidr.split("/");
  const a = ip4(ip), b = ip4(net), bits = Number(bitsS);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((a & m) >>> 0) === ((b & m) >>> 0);
}
function ip6(ip) {
  let s = String(ip).toLowerCase().split("%")[0];
  if (!s.includes(":")) return null;
  const tail4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail4) { const v = ip4(tail4[1]); if (v === null) return null; s = s.slice(0, -tail4[1].length) + ((v >>> 16).toString(16)) + ":" + ((v & 0xffff).toString(16)); }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [], tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array(fill).fill("0"), ...tail];
  if (parts.length !== 8 || !parts.every((x) => /^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map((x) => parseInt(x, 16));
}
export function in6(ip, cidr) {
  const [net, bitsS] = cidr.split("/");
  const a = ip6(ip), b = ip6(net);
  let n = Number(bitsS);
  if (!a || !b || !(n >= 0 && n <= 128)) return false;
  for (let i = 0; i < 8 && n > 0; i++, n -= 16) {
    const m = n >= 16 ? 0xffff : (0xffff << (16 - n)) & 0xffff;
    if ((a[i] & m) !== (b[i] & m)) return false;
  }
  return true;
}

export async function refreshRanges(env) {
  await ensureCrawlerTables(env);
  let n = 0;
  for (const [name, , url] of BOTS) {
    if (!url) continue;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const d = await r.json();
      const cidrs = (d.prefixes || []).map((p) => p.ipv4Prefix || p.ipv6Prefix).filter((c) => typeof c === "string" && c.includes("/")).slice(0, 5000);
      if (!cidrs.length) continue;                       // a bad answer never wipes the ranges we have
      await run(env, "INSERT OR REPLACE INTO bot_ranges (bot, cidrs_json, at) VALUES (?, ?, ?)", name, JSON.stringify(cidrs), Date.now());
      n++;
    } catch { /* keep the previous ranges */ }
  }
  return n;
}

let rangeCache = { at: 0, map: null };
async function rangesOf(env, bot) {
  if (!rangeCache.map || Date.now() - rangeCache.at > 3600000) {
    const rows = await all(env, "SELECT bot, cidrs_json FROM bot_ranges").catch(() => []);
    const map = {};
    for (const r of rows) { try { map[r.bot] = JSON.parse(r.cidrs_json); } catch { /* skip */ } }
    rangeCache = { at: Date.now(), map };
  }
  return rangeCache.map[bot] || [];
}
export async function verifyBotIp(env, bot, ip) {
  if (!ip) return false;
  const list = await rangesOf(env, bot);
  return list.some((c) => (c.includes(":") ? in6(ip, c) : in4(ip, c)));
}

/* ---------- verification by Web Bot Auth (signed agents) ---------- */

const RFC_EXAMPLE_X = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs";   // the RFC's example key - never a real agent
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function thumb(jwk) {
  return b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`)));
}
function safeAgentUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(h) || /^[\d.]+$/.test(h) || h.includes(":")) return null;
  if (!u.pathname.includes("/.well-known/")) u = new URL("/.well-known/http-message-signatures-directory", u.origin);
  return u;
}
async function directory(env, url) {
  const cached = await one(env, "SELECT keys_json, at FROM wba_directory WHERE url = ?", url.href).catch(() => null);
  if (cached) {
    const fresh = Date.now() - Number(cached.at) < (cached.keys_json ? 3600000 : 300000);
    if (fresh) { try { return cached.keys_json ? JSON.parse(cached.keys_json) : null; } catch { return null; } }
  }
  let keys = null;
  try {
    const r = await fetch(url.href, { redirect: "manual", signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/http-message-signatures-directory+json, application/json" } });
    if (r.ok) {
      const j = JSON.parse((await r.text()).slice(0, 65536));
      keys = (Array.isArray(j.keys) ? j.keys : []).filter((x) => x && x.kty === "OKP" && x.crv === "Ed25519" && x.x).slice(0, 20);
    }
  } catch { keys = null; }
  await run(env, "INSERT OR REPLACE INTO wba_directory (url, keys_json, at) VALUES (?, ?, ?)", url.href, keys && keys.length ? JSON.stringify(keys) : null, Date.now()).catch(() => null);
  return keys && keys.length ? keys : null;
}
/** { state: none | invalid | unverified | verified, agent? } */
export async function webBotAuth(env, req) {
  const si = req.headers.get("Signature-Input"), sg = req.headers.get("Signature"), sa = req.headers.get("Signature-Agent");
  if (!si || !sg) return { state: "none" };
  try {
    const m = /^\s*([A-Za-z0-9_-]+)=(\(([^)]*)\)(.*))$/.exec(si.split(/,(?=\s*[A-Za-z0-9_-]+=\()/)[0]);
    if (!m) return { state: "invalid" };
    const label = m[1], params = m[2], comps = (m[3].match(/"[^"]+"/g) || []).map((x) => x.slice(1, -1)), p = m[4];
    const prm = (n) => { const r = new RegExp(`;${n}=("([^"]*)"|(\\d+))`).exec(p); return r ? (r[2] ?? r[3]) : null; };
    if (prm("tag") !== "web-bot-auth") return { state: "none" };
    const created = Number(prm("created")), expires = Number(prm("expires")), now = Math.floor(Date.now() / 1000), keyid = prm("keyid");
    if (!created || !expires || !keyid || created > now + 60 || expires < now || expires - created > 86400) return { state: "invalid" };
    const sm = new RegExp(`(?:^|,)\\s*${label}=:([A-Za-z0-9+/=_-]+):`).exec(sg);
    if (!sm) return { state: "invalid" };
    const agentRaw = sa ? (/"(https:[^"]+)"/.exec(sa) || [])[1] || sa.trim().replace(/^"|"$/g, "") : null;
    const url = agentRaw ? safeAgentUrl(agentRaw) : null;
    if (!url) return { state: "unverified" };
    const keys = await directory(env, url);
    if (!keys) return { state: "unverified", agent: url.host };
    let jwk = null;
    for (const k of keys) { if (k.x !== RFC_EXAMPLE_X && (await thumb(k)) === keyid) { jwk = k; break; } }
    if (!jwk) return { state: "unverified", agent: url.host };
    const u = new URL(req.url), lines = [];
    for (const c of comps) {
      let v;
      if (c === "@authority") v = u.host.toLowerCase();
      else if (c === "@target-uri") v = u.href;
      else if (c === "@method") v = req.method.toUpperCase();
      else if (c === "@path") v = u.pathname;
      else if (c === "@query") v = u.search || "?";
      else if (c === "@scheme") v = u.protocol.replace(":", "");
      else if (c.startsWith("@")) return { state: "invalid" };
      else { v = req.headers.get(c); if (v === null) return { state: "invalid" }; v = v.trim(); }
      lines.push(`"${c}": ${v}`);
    }
    lines.push(`"@signature-params": ${params}`);
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, unb64(sm[1]), new TextEncoder().encode(lines.join("\n")));
    return { state: ok ? "verified" : "invalid", agent: url.host };
  } catch { return { state: "invalid" }; }
}

/* ---------- logging (after the response is sent) ---------- */

/** Worth logging at all: a known crawler name, or a signed request. Cheap - runs on every request. */
export const maybeCrawler = (request) => !!whichBot(request.headers.get("User-Agent") || "") || request.headers.has("Signature-Input");

export function doorOfPath(path) {
  const m = String(path || "").match(/^\/(\d+)(\.md|\.json|\.html\.md)?$/);
  return m ? Number(m[1]) : 0;
}

export async function logCrawlerHit(env, request, path, status) {
  await ensureCrawlerTables(env);
  const ua = request.headers.get("User-Agent") || "";
  let bot = whichBot(ua);
  const sig = request.headers.get("Signature-Input") ? await webBotAuth(env, request) : { state: "none" };
  if (!bot && sig.state === "verified" && sig.agent) bot = "signed:" + sig.agent;
  if (!bot) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const verified = sig.state === "verified" || (await verifyBotIp(env, bot, ip));
  await run(env, "INSERT INTO crawler_hits (door, bot, class, path, status, verified, signed, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    doorOfPath(path), bot, botClass(bot), String(path).slice(0, 200), Number(status) || 0, verified ? 1 : 0, sig.state === "none" ? null : sig.state, Date.now());
  return true;
}

/** Six-hourly: refresh the published ranges once a day, keep 90 days of hits. */
export async function crawlerTick(env) {
  await ensureCrawlerTables(env);
  const newest = await one(env, "SELECT MAX(at) AS at FROM bot_ranges").catch(() => null);
  let refreshed = 0;
  if (!newest?.at || Date.now() - Number(newest.at) > 23 * 3600000) refreshed = await refreshRanges(env);
  await run(env, "DELETE FROM crawler_hits WHERE at < ?", Date.now() - 90 * 86400000).catch(() => null);
  return { refreshed };
}

/* ---------- surfaces ---------- */

export async function crawlersJson(env, slots = []) {
  await ensureCrawlerTables(env);
  const now = Date.now(), d1 = now - 86400000, d30 = now - 30 * 86400000;
  const bots = await all(env,
    `SELECT bot, class, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS c1, COUNT(*) AS c30,
            SUM(CASE WHEN verified = 1 AND at > ? THEN 1 ELSE 0 END) AS v1, SUM(verified) AS v30, MAX(at) AS last
       FROM crawler_hits WHERE at > ? GROUP BY bot ORDER BY v30 DESC, c30 DESC`, d1, d1, d30);
  const doors = await all(env,
    `SELECT door, COUNT(*) AS c30, SUM(verified) AS v30, COUNT(DISTINCT bot) AS bots, MAX(at) AS last
       FROM crawler_hits WHERE at > ? GROUP BY door ORDER BY v30 DESC, c30 DESC`, d30);
  const names = new Map((slots || []).map((s) => [Number(s.n), s.name]));
  const byClass = {};
  for (const b of bots) {
    const c = b.class || botClass(b.bot);
    byClass[c] = byClass[c] || { verified_30d: 0, claimed_30d: 0 };
    byClass[c].verified_30d += Number(b.v30 || 0);
    byClass[c].claimed_30d += Number(b.c30 || 0);
  }
  const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);
  return {
    about: "AI and search crawler visits to this hub, logged as they happen. verified = the visitor's IP is inside the ranges the vendor publishes, or it carried a valid Web Bot Auth signature; claimed = the name in the User-Agent only. No IP address is stored.",
    generated_at: new Date(now).toISOString(),
    classes: { search: "search and discovery crawlers", train: "model-training crawlers", user: "fetches a person asked an AI assistant for", other: "other" },
    by_class_30d: byClass,
    bots: bots.map((b) => ({ bot: b.bot, class: b.class || botClass(b.bot), verified_24h: Number(b.v1 || 0), claimed_24h: Number(b.c1 || 0),
      verified_30d: Number(b.v30 || 0), claimed_30d: Number(b.c30 || 0), last_seen: iso(b.last) })),
    doors: doors.map((d) => ({ door: Number(d.door), name: Number(d.door) ? names.get(Number(d.door)) || null : "hub pages",
      verified_30d: Number(d.v30 || 0), claimed_30d: Number(d.c30 || 0), bots: Number(d.bots || 0), last_seen: iso(d.last) })),
  };
}

/** Admin: the latest hits (optionally one door). */
export async function handleCrawlersAdmin(path, request, url, env) {
  if (path !== "/v1/crawlers") return null;
  await ensureCrawlerTables(env);
  const n = Number(url.searchParams.get("n") || -1);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));
  const rows = n >= 0
    ? await all(env, "SELECT door, bot, class, path, status, verified, signed, at FROM crawler_hits WHERE door = ? ORDER BY at DESC LIMIT ?", n, limit)
    : await all(env, "SELECT door, bot, class, path, status, verified, signed, at FROM crawler_hits ORDER BY at DESC LIMIT ?", limit);
  const ranges = await all(env, "SELECT bot, at, length(cidrs_json) AS size FROM bot_ranges ORDER BY bot");
  return json({ ok: true, hits: rows.map((r) => ({ ...r, verified: !!r.verified, at: new Date(Number(r.at)).toISOString() })),
    ranges: ranges.map((r) => ({ bot: r.bot, refreshed: new Date(Number(r.at)).toISOString() })) });
}
