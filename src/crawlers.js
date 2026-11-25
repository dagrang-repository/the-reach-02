/* Reach 02 - proof that AI crawlers really read the hub (ported from "We push your site to the World", adapted to D1).
 * Every request from a known AI/search crawler is logged AFTER the response is sent (ctx.waitUntil): the door it
 * read (/N, /N.md, /N.json; 0 = a hub page), the bot, what the visit is for, and whether it is VERIFIED:
 *   - the IP sits inside the ranges the vendor publishes (OpenAI, Anthropic, Perplexity, Mistral, Amazon, Google,
 *     Bing, Apple - the files of playbook 3.15, fetched from the vendor, never copied by hand), or
 *   - the request carries a valid Web Bot Auth signature (RFC 9421 profile, draft-ietf-webbotauth-httpsig-protocol-01;
 *     a signer still on draft -00 verifies too).
 * A visit that only claims a name is kept as "claimed". No IP address is ever stored - only verified yes/no.
 * A user-agent string proves nothing: anyone can send "GPTBot". Report both; act only on verified.
 * Public: /crawlers.json (totals per bot, per job and per door, 24 h and 30 days). Admin: GET /v1/crawlers.
 * Ranges refresh daily in small batches, hits are kept 90 days (crawlerTick, hourly cron). */
import { all, one, run } from "./db.js";
import { json } from "./util.js";

const GOOGLE = "https://developers.google.com/static/crawling/ipranges";
const ANTHROPIC = "https://claude.com/crawling/bots.json";

/* [name, user-agent pattern, job, range files]. First match wins, so the specific tokens come before the general
   ones. Jobs are the playbook's four: train (1), search (2), user (3: a person asked for this URL now), agent (4: an
   agent completing a task); "other" is ads and previews. Control tokens that never fetch (Google-Extended,
   Applebot-Extended) are not here: they cannot appear in a request. */
const BOTS = [
  ["OAI-SearchBot", /OAI-SearchBot/i, "search", ["https://openai.com/searchbot.json"]],
  ["ChatGPT-User", /ChatGPT-User/i, "user", ["https://openai.com/chatgpt-user.json"]],
  ["ChatGPT Agent", /ChatGPT[ -]Agent/i, "agent", []],
  ["OAI-AdsBot", /OAI-AdsBot/i, "other", ["https://openai.com/adsbot.json"]],
  ["GPTBot", /GPTBot/i, "train", ["https://openai.com/gptbot.json"]],
  ["Claude-SearchBot", /Claude-SearchBot/i, "search", [ANTHROPIC]],
  ["Claude-User", /Claude-User/i, "user", [ANTHROPIC]],
  ["Claude-Agent", /Claude-Agent/i, "agent", ["https://claude.com/.well-known/sail"]],
  ["ClaudeBot", /ClaudeBot|anthropic-ai/i, "train", [ANTHROPIC]],
  ["Perplexity-User", /Perplexity-User/i, "user", ["https://www.perplexity.com/perplexity-user.json"]],
  ["PerplexityBot", /PerplexityBot/i, "search", ["https://www.perplexity.com/perplexitybot.json"]],
  ["Google-Agent", /Google-Agent|GoogleAgent-/i, "agent", [`${GOOGLE}/user-triggered-agents.json`]],
  ["Google-GeminiNotebook", /Google-GeminiNotebook|Google-NotebookLM|Google-Read-Aloud|Google-Pinpoint/i, "user", [`${GOOGLE}/user-triggered-fetchers.json`, `${GOOGLE}/user-triggered-fetchers-google.json`]],
  ["Googlebot", /Googlebot|GoogleOther|Google-CloudVertexBot|Google-InspectionTool|Storebot-Google/i, "search", [`${GOOGLE}/common-crawlers.json`, `${GOOGLE}/special-crawlers.json`]],
  ["Bingbot", /bingbot|BingPreview|MicrosoftPreview/i, "search", ["https://www.bing.com/toolbox/bingbot.json"]],
  ["Applebot", /Applebot/i, "search", ["https://search.developer.apple.com/applebot.json"]],
  ["meta-webindexer", /meta-webindexer/i, "search", []],
  ["meta-externalfetcher", /meta-externalfetcher/i, "user", []],
  ["meta-externalads", /meta-externalads/i, "other", []],
  ["meta-externalagent", /meta-externalagent|FacebookBot/i, "train", []],
  ["Amzn-SearchBot", /Amzn-SearchBot/i, "search", ["https://developer.amazon.com/amazonbot/searchbot-ip-addresses/"]],
  ["Amzn-User", /Amzn-User/i, "user", ["https://developer.amazon.com/amazonbot/live-ip-addresses/"]],
  ["AmazonBuyForMe", /AmazonBuyForMe/i, "agent", []],
  ["Amazonbot", /Amazonbot/i, "search", ["https://developer.amazon.com/amazonbot/ip-addresses/"]],
  ["MistralAI-User", /MistralAI-User/i, "user", ["https://mistral.ai/mistralai-user-ips.json"]],
  ["MistralAI-Index", /MistralAI-Index/i, "search", ["https://mistral.ai/mistralai-index-ips.json"]],
  ["MistralAI-Training", /MistralAI-Training/i, "train", []],
  ["GrokAgent", /GrokAgent|Grok ?Bot|xAI-Grok|xAI-Bot/i, "agent", []],
  ["Kimi-SearchBot", /Kimi-SearchBot/i, "search", []],
  ["Kimi-User", /Kimi-User/i, "user", []],
  ["Kimi-Agent", /Kimi-Agent/i, "agent", []],
  ["KimiBot", /KimiBot/i, "train", []],
  ["QwenBot", /QwenBot/i, "train", []],
  ["DuckAssistBot", /DuckAssistBot/i, "search", []],
  ["Bravebot", /Bravebot/i, "search", []],
  ["YouBot", /YouBot/i, "search", []],
  ["YandexBot", /YandexBot|YandexAdditional/i, "search", []],
  ["Cloudflare-AI-Search", /Cloudflare-AI-Search|Cloudflare-AutoRAG/i, "search", []],
  ["FirecrawlAgent", /FirecrawlAgent/i, "agent", []],
  ["CCBot", /CCBot/i, "train", []],
  ["Bytespider", /Bytespider/i, "train", []],
  ["cohere-ai", /cohere-ai|cohere-training/i, "train", []],
  ["Reflectionbot", /Reflectionbot/i, "train", []],
];
const CLASS = Object.fromEntries(BOTS.map(([name, , job]) => [name, job]));
/* rows logged under the names this module used before Revision 3 keep their job until they age out (90 days) */
Object.assign(CLASS, { Meta: "train", MistralAI: "user", GrokBot: "agent" });
/** A signed request with no known name is an agent identifying itself (Job 4). */
export const botClass = (name) => CLASS[name] || (String(name).startsWith("signed:") ? "agent" : "other");
export function whichBot(ua) { for (const [name, re] of BOTS) if (re.test(ua || "")) return name; return null; }
export const BOT_NAMES = BOTS.map(([name]) => name);

/* per database, not per isolate: the tables belong to the DB the request was given */
const readyDbs = new WeakSet();
export async function ensureCrawlerTables(env) {
  if (readyDbs.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS crawler_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, door INTEGER NOT NULL DEFAULT 0, bot TEXT NOT NULL, class TEXT, path TEXT,
    status INTEGER, verified INTEGER NOT NULL DEFAULT 0, signed TEXT, at INTEGER NOT NULL)`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS crawler_hits_at ON crawler_hits (at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS crawler_hits_door ON crawler_hits (door, at)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS bot_ranges (bot TEXT PRIMARY KEY, cidrs_json TEXT NOT NULL, at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS wba_directory (url TEXT PRIMARY KEY, keys_json TEXT, at INTEGER NOT NULL)").run();
  /* tried = the last attempt, successful or not (a failed refresh must not look fresh, and must not be retried every hour) */
  await env.DB.prepare("ALTER TABLE bot_ranges ADD COLUMN tried INTEGER").run().catch(() => null);
  readyDbs.add(env.DB);
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

const squash = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
const b64json = (part) => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(part).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))); } catch { return undefined; } };
/** "1.2.3.0/24", "2001:db8::/32", or a bare address (one host) - else "". */
function asCidr(v) {
  const t = String(v).trim();
  if (t.length > 49 || !/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(t)) return "";
  const [addr, bits] = t.split("/");
  if (ip4(addr) !== null) return bits === undefined ? `${addr}/32` : Number(bits) <= 32 ? t : "";
  if (ip6(addr)) return bits === undefined ? `${addr}/128` : Number(bits) <= 128 ? t : "";
  return "";
}

/** Every CIDR a vendor's range document carries, whatever its shape: the {prefixes:[{ipv4Prefix|ipv6Prefix}]} files,
 *  a file with one list per bot (then only the list labelled with `token` - by key, or by a sibling string naming
 *  it), a signed list (a JWS whose payload is the JSON), or a page that prints the ranges. Tolerant on purpose: a
 *  vendor that changes its layout must not silently empty a list. */
export function extractCidrs(text, token = "") {
  const want = squash(token);
  const every = new Set();
  const labelled = new Set();
  const walk = (node, under, depth) => {
    if (depth > 12 || node == null) return;
    if (typeof node === "string") {
      const c = asCidr(node);
      if (c) { every.add(c); if (under) labelled.add(c); }
      return;
    }
    if (Array.isArray(node)) { for (const x of node.slice(0, 20000)) walk(x, under, depth + 1); return; }
    if (typeof node !== "object") return;
    const named = want && Object.values(node).some((v) => typeof v === "string" && squash(v) === want);
    for (const [k, v] of Object.entries(node)) {
      if (k === "payload" && typeof v === "string") { const inner = b64json(v); if (inner !== undefined) { walk(inner, under || named, depth + 1); continue; } }
      walk(v, under || named || (want && squash(k) === want), depth + 1);
    }
  };
  const raw = String(text || "").slice(0, 4000000);
  let doc;
  try { doc = JSON.parse(raw); } catch { doc = undefined; }
  if (doc === undefined && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\s*$/.test(raw)) doc = b64json(raw.split(".")[1]);
  if (doc !== undefined) walk(doc, false, 0);
  else for (const m of raw.matchAll(/(?<![0-9A-Fa-f:.])(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9A-Fa-f:]{3,39})\/\d{1,3}(?![0-9])/g)) { const c = asCidr(m[0]); if (c) every.add(c); }
  return [...(labelled.size ? labelled : every)];
}

async function fetchRangeText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json, text/plain;q=0.8, */*;q=0.5" } });
    return r.ok ? await r.text() : "";
  } catch { return ""; }
}

/** Refresh the published ranges of the bots whose list is a day old, oldest first, at most `max` vendor files per
 *  call (the hourly cron shares its budget with the door checks, so a day's refresh is spread over a few ticks).
 *  An empty, malformed or failed answer NEVER replaces the last good list: only the attempt time moves. */
export async function refreshRanges(env, { max = 8, force = false } = {}) {
  await ensureCrawlerTables(env);
  const rows = await all(env, "SELECT bot, at, tried FROM bot_ranges").catch(() => []);
  const seen = new Map(rows.map((r) => [r.bot, Math.max(Number(r.at) || 0, Number(r.tried) || 0)]));
  const now = Date.now();
  const due = BOTS.filter(([name, , , urls]) => urls.length && (force || now - (seen.get(name) || 0) > 23 * 3600000)).sort((a, b) => (seen.get(a[0]) || 0) - (seen.get(b[0]) || 0));
  const docs = new Map();
  let n = 0;
  for (const [name, , , urls] of due) {
    const need = urls.filter((u) => !docs.has(u));
    if (docs.size + need.length > max) continue;
    for (const u of need) docs.set(u, await fetchRangeText(u));
    const cidrs = [...new Set(urls.flatMap((u) => extractCidrs(docs.get(u), name)))].slice(0, 8000);
    if (cidrs.length) {
      await run(env, "INSERT OR REPLACE INTO bot_ranges (bot, cidrs_json, at, tried) VALUES (?, ?, ?, ?)", name, JSON.stringify(cidrs), now, now);
      n++;
    } else {
      await run(env, "INSERT INTO bot_ranges (bot, cidrs_json, at, tried) VALUES (?, '[]', 0, ?) ON CONFLICT(bot) DO UPDATE SET tried = excluded.tried", name, now).catch(() => null);
    }
  }
  if (n) rangeCaches.delete(env.DB);
  return n;
}

/* the parsed ranges, kept for an hour per database (a refresh drops them at once) */
const rangeCaches = new WeakMap();
async function rangesOf(env, bot) {
  let cache = rangeCaches.get(env.DB);
  if (!cache || Date.now() - cache.at > 3600000) {
    const rows = await all(env, "SELECT bot, cidrs_json FROM bot_ranges").catch(() => []);
    const map = {};
    for (const r of rows) { try { map[r.bot] = JSON.parse(r.cidrs_json); } catch { /* skip */ } }
    cache = { at: Date.now(), map };
    rangeCaches.set(env.DB, cache);
  }
  return cache.map[bot] || [];
}
export async function verifyBotIp(env, bot, ip) {
  if (!ip) return false;
  const list = await rangesOf(env, bot);
  return list.some((c) => (c.includes(":") ? in6(ip, c) : in4(ip, c)));
}

/* ---------- verification by Web Bot Auth (signed agents) ----------
   draft-ietf-webbotauth-httpsig-protocol-01 (29 October 2026), an RFC 9421 profile:
   - Signature-Agent is a Dictionary keyed by the signature label; each value is the direct https URL of a JWK Set.
     (Draft -00 sent one bare string naming an origin, with the keys at the well-known directory path. That path is
     still registered and still where operators publish, so an origin-only value is looked up there.)
   - the covered components MUST include @authority or @target-uri, and "signature-agent" (with ;key="<label>" in -01);
     created, expires, keyid and tag="web-bot-auth" are required; expires at most 24 h after created.
   - keyid is the base64url JWK SHA-256 thumbprint of an Ed25519 key in that JWK Set. The cache is per URL, so the
     same key under another URL is another agent: the agent IS the URL it publishes its keys at.
   - the key URL must answer 200; redirects are not followed; time, size and key count are capped; no IP literals or
     local names. A FAILED fetch never evicts a key already held; a directory that RESOLVES replaces the held set.
     A negative result is remembered for five minutes.
   - the RFC 9421 example key is never an agent. A signature over plain HTTP is refused.
   "unverified" means the signature could not be checked (no key, an unsupported component) - one signal, not hostile. */

const RFC_EXAMPLE_X = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs";   // the RFC's example key - never a real agent
const WBA_DIRECTORY = "/.well-known/http-message-signatures-directory";
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function thumb(jwk) {
  return b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`)));
}
/** The URL keys are fetched from, or null: https only, a public name, no credentials. An origin-only value is the
 *  draft -00 form and resolves to the well-known directory; anything with a path is the JWK Set itself. */
export function safeAgentUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname;
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(h) || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".")) return null;
  if (u.pathname === "/" || u.pathname === "") u = new URL(WBA_DIRECTORY, u.origin);
  u.hash = "";
  return u;
}
/** The name a signed agent is logged under: its key URL, without the scheme (and without the well-known path). */
const agentName = (u) => (u.pathname === WBA_DIRECTORY ? u.host : `${u.host}${u.pathname}`).slice(0, 120);

async function fetchJwks(url) {
  try {
    const r = await fetch(url.href, { redirect: "manual", signal: AbortSignal.timeout(3000),
      headers: { Accept: "application/http-message-signatures-directory+json, application/jwk-set+json, application/json" } });
    if (r.status !== 200) return { ok: false };
    const j = JSON.parse((await r.text()).slice(0, 65536));
    if (!j || !Array.isArray(j.keys)) return { ok: false };
    return { ok: true, keys: j.keys.filter((x) => x && x.kty === "OKP" && x.crv === "Ed25519" && typeof x.x === "string" && x.x).slice(0, 20).map((x) => ({ kty: "OKP", crv: "Ed25519", x: x.x })) };
  } catch { return { ok: false }; }
}
async function directory(env, url) {
  const now = Date.now();
  const row = await one(env, "SELECT keys_json, at FROM wba_directory WHERE url = ?", url.href).catch(() => null);
  let held = null;
  if (row?.keys_json) { try { held = JSON.parse(row.keys_json); } catch { held = null; } }
  if (row && now - Number(row.at) < (held ? 3600000 : 300000)) return held;
  const neg = await one(env, "SELECT at FROM wba_directory WHERE url = ?", `neg:${url.href}`).catch(() => null);
  if (neg && now - Number(neg.at) < 300000) return held;
  const got = await fetchJwks(url);
  if (!got.ok) {
    /* a failed fetch never evicts a key already held: only the attempt is remembered, for five minutes */
    await run(env, "INSERT OR REPLACE INTO wba_directory (url, keys_json, at) VALUES (?, NULL, ?)", `neg:${url.href}`, now).catch(() => null);
    return held;
  }
  await run(env, "INSERT OR REPLACE INTO wba_directory (url, keys_json, at) VALUES (?, ?, ?)", url.href, got.keys.length ? JSON.stringify(got.keys) : null, now).catch(() => null);
  return got.keys.length ? got.keys : null;
}

/** The covered components of a Signature-Input member: [{ id, name, params }] where id is the identifier exactly as
 *  the signer wrote it (it is a line of the signature base), or null when the list is not one we can read. */
export function parseComponents(inner) {
  const out = [];
  const re = /"([^"\\]+)"((?:;[a-z*][a-z0-9_.*-]*(?:=(?:"[^"\\]*"|[A-Za-z0-9_.:%*/-]+))?)*)/g;
  let rest = String(inner);
  let m;
  while ((m = re.exec(inner))) {
    const params = {};
    for (const pm of m[2].matchAll(/;([a-z*][a-z0-9_.*-]*)(?:=(?:"([^"\\]*)"|([A-Za-z0-9_.:%*/-]+)))?/g)) params[pm[1]] = pm[2] ?? pm[3] ?? true;
    out.push({ id: m[0], name: m[1].toLowerCase(), params });
    rest = rest.replace(m[0], "");
  }
  return rest.trim() === "" ? out : null;
}
/** One member of a Dictionary structured field, serialized as sent (`"https://..."` for a string), or null. */
export function dictMember(header, key) {
  const k = String(key).replace(/[^A-Za-z0-9_.*-]/g, "");
  if (!k || header == null) return null;
  const m = new RegExp(`(?:^|,)\\s*${k.replace(/[.*]/g, "\\$&")}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"(?:;[^,]*)?|[^,\\s]+)`).exec(String(header));
  return m ? m[1].trim() : null;
}
/** The key URL(s) Signature-Agent names for this signature label: the -01 dictionary member, else the -00 bare string. */
function agentOf(header, label) {
  if (header == null) return null;
  const member = dictMember(header, label);
  const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(member || "") || /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(header);
  if (quoted) return quoted[1];
  const bare = String(header).trim();
  return /^https:\/\/\S+$/.test(bare) ? bare : null;
}

/** { state: none | invalid | unverified | verified, agent? } */
export async function webBotAuth(env, req) {
  const si = req.headers.get("Signature-Input"), sg = req.headers.get("Signature"), sa = req.headers.get("Signature-Agent");
  if (!si || !sg) return { state: "none" };
  try {
    await ensureCrawlerTables(env);
    const u = new URL(req.url);
    /* the first member whose tag is web-bot-auth; signatures with any other tag are not ours to judge */
    let found = null;
    for (const part of si.split(/,(?=\s*[A-Za-z0-9_-]+=\()/)) {
      const m = /^\s*([A-Za-z0-9_-]+)=(\(([^)]*)\)(.*))$/.exec(part);
      if (!m) continue;
      const prm = (n) => { const r = new RegExp(`;${n}=("([^"]*)"|(\\d+))`).exec(m[4]); return r ? (r[2] ?? r[3]) : null; };
      if (prm("tag") === "web-bot-auth") { found = { label: m[1], params: m[2], inner: m[3], prm }; break; }
    }
    if (!found) return { state: /^\s*[A-Za-z0-9_-]+=\(/.test(si) ? "none" : "invalid" };
    const { label, params, inner, prm } = found;
    if (u.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return { state: "invalid" };
    const created = Number(prm("created")), expires = Number(prm("expires")), now = Math.floor(Date.now() / 1000), keyid = prm("keyid");
    if (!created || !expires || !keyid || created > now + 60 || expires < now || expires <= created || expires - created > 86400) return { state: "invalid" };
    const alg = prm("alg");
    if (alg && alg !== "ed25519") return { state: "unverified" };
    const sm = new RegExp(`(?:^|,)\\s*${label}=:([A-Za-z0-9+/=_-]+):`).exec(sg);
    if (!sm) return { state: "invalid" };
    const comps = parseComponents(inner);
    if (!comps) return { state: "invalid" };
    /* what the profile requires to be covered: the target, and the agent header when one is sent */
    if (!comps.some((c) => c.name === "@authority" || c.name === "@target-uri")) return { state: "invalid" };
    if (!sa) return { state: "unverified" };                               // no key location: nothing to check it against
    if (!comps.some((c) => c.name === "signature-agent")) return { state: "invalid" };
    const agentRaw = agentOf(sa, label);
    const url = agentRaw ? safeAgentUrl(agentRaw) : null;
    if (!url) return { state: "unverified" };
    const agent = agentName(url);
    const keys = await directory(env, url);
    if (!keys) return { state: "unverified", agent };
    let jwk = null;
    for (const k of keys) { if (k.x !== RFC_EXAMPLE_X && (await thumb(k)) === keyid) { jwk = k; break; } }
    if (!jwk) return { state: "unverified", agent };
    const lines = [];
    for (const c of comps) {
      const keys2 = Object.keys(c.params);
      let v;
      if (c.name.startsWith("@")) {
        if (keys2.length) return { state: "unverified", agent };          // ;req and friends: not a request we can rebuild
        if (c.name === "@authority") v = u.host.toLowerCase();
        else if (c.name === "@target-uri") v = u.href;
        else if (c.name === "@method") v = req.method.toUpperCase();
        else if (c.name === "@path") v = u.pathname;
        else if (c.name === "@query") v = u.search || "?";
        else if (c.name === "@scheme") v = u.protocol.replace(":", "");
        else return { state: "unverified", agent };
      } else if (keys2.length === 0) {
        v = req.headers.get(c.name);
        if (v === null) return { state: "invalid" };
        v = v.trim();
      } else if (keys2.length === 1 && typeof c.params.key === "string") {
        v = dictMember(req.headers.get(c.name), c.params.key);
        if (v === null) return { state: "invalid" };
      } else return { state: "unverified", agent };                        // ;sf ;bs ;tr: a serialization we do not rebuild
      lines.push(`${c.id}: ${v}`);
    }
    lines.push(`"@signature-params": ${params}`);
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, unb64(sm[1]), new TextEncoder().encode(lines.join("\n")));
    return { state: ok ? "verified" : "invalid", agent };
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

/** Hourly: refresh the vendor ranges that are a day old (a few files per tick), keep 90 days of hits. */
export async function crawlerTick(env) {
  await ensureCrawlerTables(env);
  const refreshed = await refreshRanges(env).catch(() => 0);
  await run(env, "DELETE FROM crawler_hits WHERE at < ?", Date.now() - 90 * 86400000).catch(() => null);
  await run(env, "DELETE FROM wba_directory WHERE at < ?", Date.now() - 30 * 86400000).catch(() => null);
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
  /* how the doors are read: the share fetched as the Markdown twin or the JSON record is the machine surface in use */
  const shapes = await one(env,
    `SELECT SUM(CASE WHEN path LIKE '%.md' THEN 1 ELSE 0 END) AS md, SUM(CASE WHEN path LIKE '%.json' THEN 1 ELSE 0 END) AS js, COUNT(*) AS total
       FROM crawler_hits WHERE at > ? AND door > 0`, d30).catch(() => null);
  /* signed agents: the share of visits that identified themselves with a key rather than a name */
  const signed = await all(env, "SELECT signed, COUNT(*) AS c FROM crawler_hits WHERE at > ? AND signed IS NOT NULL GROUP BY signed", d30).catch(() => []);
  const sig = Object.fromEntries(signed.map((r) => [r.signed, Number(r.c || 0)]));
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
    about: "AI and search crawler visits to this hub, logged as they happen. verified = the visitor's IP is inside the ranges the vendor publishes, or it carried a valid Web Bot Auth signature; claimed = every visit that carried the name in its User-Agent, verified or not - a name alone proves nothing. No IP address is stored.",
    generated_at: new Date(now).toISOString(),
    classes: { search: "search and answer-engine indexing: the citation surface", train: "model-training crawlers", user: "fetches a person asked an AI assistant for", agent: "agents completing a task (signed agents included)", other: "ads, previews and the rest" },
    by_class_30d: byClass,
    door_renderings_30d: { html: Math.max(0, Number(shapes?.total || 0) - Number(shapes?.md || 0) - Number(shapes?.js || 0)), markdown: Number(shapes?.md || 0), json: Number(shapes?.js || 0) },
    web_bot_auth_30d: { verified: sig.verified || 0, unverified: sig.unverified || 0, invalid: sig.invalid || 0 },
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
