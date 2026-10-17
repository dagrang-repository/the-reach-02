/** Wikidata layer — one Wikidata item per door, created with the "Verge Heights Hub" bot password.
 *  Survival shape: ≤ 1 new item per day (WD_DAILY_LIMIT), strongest doors first (WD_ORDER), every statement referenced
 *  (P854 origin page + P813 retrieved), idempotent (D1 row, then SPARQL P856 lookup) — never a duplicate, never a burst.
 *  Public: /wikidata.json   Admin: GET /v1/wikidata · POST /v1/wikidata[?n=N&force=1] · POST /v1/wikidata/login-test
 *  Secrets: WD_USER ("Name@botname"), WD_BOTPASS. Vars (optional): WD_API, WD_UA, WD_ORDER, WD_DAILY_LIMIT.
 */
import { all, one, run } from "./db.js";
import { nowIso } from "./util.js";
import { recordChange } from "./outreach.js";
import { numberedSites, publicBase } from "./hill.js";
import { captureView } from "./capture.js";
import { announceReachFeed } from "./announce.js";

const Q_WEBSITE = 35127;
const LANG_Q = { en: 1860, fr: 150, es: 1321, de: 188, it: 652, pt: 5146, nl: 7411, ru: 7737, zh: 7850, ja: 5287, ko: 9176, ar: 13955, hi: 1568, bn: 9610, ur: 1617, fa: 9168, tr: 256, pl: 809, uk: 8798, vi: 9199, th: 9217, id: 9240, ms: 9237, tl: 34057, fil: 33298, ceb: 33239, sw: 7838, he: 9288, el: 9129, sv: 9027, da: 9035, no: 9043, fi: 1412, cs: 9056, hu: 9067, ro: 7913, bg: 7918, hr: 6654, sr: 9299, sk: 9058, sl: 9063, lt: 9083, lv: 9078, et: 9072, ta: 5885, te: 8097, mr: 1571, gu: 5137, kn: 33673, ml: 36236, pa: 58635, ne: 33823, si: 13267, my: 9228, km: 9205, lo: 9211, mn: 9246, kk: 9252, uz: 9264, az: 9292, ka: 8108, hy: 8785, am: 28244, ha: 56475, yo: 34311, ig: 33578, zu: 10179, af: 14196, ca: 7026, eu: 8752, gl: 9307, cy: 9309, ga: 9142, is: 294, mt: 9166, sq: 8748, mk: 9296, bs: 9303, be: 9091, jv: 33549, su: 34002 };

const nowDay = () => new Date().toISOString().slice(0, 10);

export function wdConfig(env) {
  return {
    user: String(env.WD_USER || "").trim(),
    pass: String(env.WD_BOTPASS || "").trim(),
    api: String(env.WD_API || "https://www.wikidata.org/w/api.php").trim(),
    ua: String(env.WD_UA || "VergeHeightsHub/1.0 (dagrang@gmail.com)").trim(),
    order: String(env.WD_ORDER || "3,1,2").split(",").map((x) => Number(x.trim())).filter(Boolean),
    dailyLimit: Math.max(1, Number(env.WD_DAILY_LIMIT || 1)),
    sparql: "https://query.wikidata.org/sparql",
    // "courier": a scheduled task on a non-blocked IP (Sang's PC) performs the write — Wikimedia hard-blocks Workers egress.
    // "direct": the Worker writes itself (needs IP-block exemption on the account).
    mode: String(env.WD_MODE || "courier").trim() === "direct" ? "direct" : "courier",
  };
}

let tableReady = false;
export async function ensureWikidataTable(env) {
  if (tableReady) return;
  await run(env, `CREATE TABLE IF NOT EXISTS wikidata (site_id TEXT PRIMARY KEY, qid TEXT, label TEXT, status TEXT, detail TEXT, attempts INTEGER DEFAULT 0, hash TEXT, created_at TEXT, synced_at TEXT, updated_at TEXT)`);
  tableReady = true;
}

/* ---------------- MediaWiki client (cookie jar + tokens) ---------------- */
class Wiki {
  constructor(cfg) {
    this.cfg = cfg;
    this.cookies = new Map();
    this.csrf = "";
  }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    let list = [];
    try { list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []; } catch { list = []; }
    if (!list.length) {
      const raw = res.headers.get("set-cookie") || "";
      list = raw ? [raw] : [];
    }
    list = list.flatMap((c) => String(c).split(/,(?=\s*[A-Za-z0-9_-]+=)/));
    for (const c of list) {
      const first = c.split(";")[0];
      const eq = first.indexOf("=");
      if (eq > 0) this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }
  async call(params, method = "GET") {
    // maxlag: Wikidata answers "wait and retry" when replication/WDQS lag is high — retry up to 3 x 5 s
    for (let i = 0; ; i++) {
      try {
        return await this.callOnce(params, method);
      } catch (err) {
        if (err?.code === "maxlag" && i < 3) { await new Promise((r) => setTimeout(r, 5000)); continue; }
        throw err;
      }
    }
  }
  async callOnce(params, method = "GET") {
    const p = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "8", ...params });
    const headers = { "user-agent": this.cfg.ua, "api-user-agent": this.cfg.ua, accept: "application/json" };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;
    let res;
    if (method === "POST") {
      headers["content-type"] = "application/x-www-form-urlencoded";
      res = await fetch(this.cfg.api, { method: "POST", headers, body: p.toString(), signal: AbortSignal.timeout(25000) });
    } else {
      res = await fetch(`${this.cfg.api}?${p.toString()}`, { headers, signal: AbortSignal.timeout(25000) });
    }
    this.absorb(res);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`wikidata: non-JSON ${res.status} ${text.slice(0, 120)}`); }
    if (data.error) {
      const names = (data.error.messages || []).map((m) => m.name).filter(Boolean);
      const filt = (data.error.messages || []).map((m) => m?.parameters?.[0]?.abusefilter || m?.data?.abusefilter).filter(Boolean)[0];
      const err = new Error(`wikidata: ${data.error.code}${names.length ? ` [${names.join(",")}]` : ""} — ${String(data.error.info || "").slice(0, 160)}${filt ? ` (filter ${filt.id}: ${filt.description})` : ""}`);
      err.code = data.error.code;
      err.names = names;
      throw err;
    }
    return data;
  }
  async login() {
    if (!this.cfg.user || !this.cfg.pass) throw new Error("wikidata: WD_USER / WD_BOTPASS not set");
    const t = await this.call({ action: "query", meta: "tokens", type: "login" });
    const lgtoken = t.query?.tokens?.logintoken;
    if (!lgtoken) throw new Error("wikidata: no login token");
    const l = await this.call({ action: "login", lgname: this.cfg.user, lgpassword: this.cfg.pass, lgtoken }, "POST");
    if (l.login?.result !== "Success") throw new Error(`wikidata: login ${l.login?.result || "?"} ${String(l.login?.reason || "").slice(0, 160)}`);
    const c = await this.call({ action: "query", meta: "tokens", type: "csrf", assert: "user" });
    this.csrf = c.query?.tokens?.csrftoken || "";
    if (!this.csrf || this.csrf === "+\\") throw new Error("wikidata: no csrf token after login");
    return l.login.lgusername;
  }
  async userinfo() {
    const u = await this.call({ action: "query", meta: "userinfo", uiprop: "groups|rights|editcount" });
    return u.query?.userinfo || {};
  }
  /** AbuseFilter "warn" actions (e.g. global-210, too many external links) refuse the first submission only:
   *  resubmitting the identical edit once is the designed confirmation path. */
  async edit(params) {
    const body = { ...params, token: this.csrf, assert: "user", bot: "1" };
    try {
      return await this.call(body, "POST");
    } catch (err) {
      const warned = err?.code === "abusefilter-warning" || (err?.names || []).includes("abusefilter-warning");
      if (!warned) throw err;
      return this.call(body, "POST");
    }
  }
}

/* ---------------- lookups ---------------- */
async function sparqlFindByUrl(cfg, url) {
  const variants = [...new Set([url, url.endsWith("/") ? url.slice(0, -1) : `${url}/`])];
  const values = variants.map((u) => `<${u}>`).join(" ");
  const q = `SELECT ?item WHERE { VALUES ?u { ${values} } ?item wdt:P856 ?u . } LIMIT 1`;
  try {
    const res = await fetch(`${cfg.sparql}?format=json&query=${encodeURIComponent(q)}`, { headers: { "user-agent": cfg.ua, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return "";
    const data = await res.json();
    const uri = data?.results?.bindings?.[0]?.item?.value || "";
    const m = uri.match(/\/(Q\d+)$/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/* ---------------- entity shape ---------------- */
const snakItem = (prop, numericId) => ({ snaktype: "value", property: prop, datavalue: { value: { "entity-type": "item", "numeric-id": numericId }, type: "wikibase-entityid" } });
const snakString = (prop, value) => ({ snaktype: "value", property: prop, datavalue: { value, type: "string" } });
const snakMono = (prop, text, language = "en") => ({ snaktype: "value", property: prop, datavalue: { value: { text, language }, type: "monolingualtext" } });
const snakTime = (prop, day) => ({ snaktype: "value", property: prop, datavalue: { value: { time: `+${day}T00:00:00Z`, timezone: 0, before: 0, after: 0, precision: 11, calendarmodel: "http://www.wikidata.org/entity/Q1985727" }, type: "time" } });

function reference(url) {
  return { snaks: { P854: [snakString("P854", url)], P813: [snakTime("P813", nowDay())] }, "snaks-order": ["P854", "P813"] };
}
function claim(mainsnak, refUrl) {
  return { mainsnak, type: "statement", rank: "normal", ...(refUrl ? { references: [reference(refUrl)] } : {}) };
}

function firstSentence(t) {
  const m = String(t || "").match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : String(t || "")).trim();
}
function wdDescription(view) {
  let d = firstSentence(view.description || "").replace(/\s+/g, " ").trim();
  if (!d) d = `website ${view.name}`;
  d = d.replace(/[.。]$/, "");
  if (!/^website/i.test(d)) d = `website: ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
  return d.slice(0, 240);
}

/** Full entity (links inline) — used when links=true. Default is the link-free base: Wikidata's global filter 210
 *  ("too many external links") warns on first-time editors adding several URLs in one edit, so URLs go in afterwards
 *  one per edit (see linkPlan). */
export function entityFor(view, base, hub = false, { links = false } = {}) {
  const site = view.url;
  const refUrl = view.llms_txt || site;
  const host = (() => { try { return new URL(site).host.replace(/^www\./, ""); } catch { return ""; } })();
  const langs = [...new Set((view.languages || []).map((l) => String(l).toLowerCase()))].filter((l) => LANG_Q[l]).slice(0, 40);
  const claims = links
    ? [
        claim(snakItem("P31", Q_WEBSITE), refUrl),
        claim(snakString("P856", site), view.door),
        claim(snakMono("P1448", view.name, "en"), site),
        ...langs.map((l) => claim(snakItem("P407", LANG_Q[l]), refUrl)),
        claim(snakString("P973", view.door), site),
        ...(hub ? [claim(snakString("P1324", "https://github.com/dagrang-repository/the-reach-02"), base)] : []),
      ]
    : [
        claim(snakItem("P31", Q_WEBSITE)),
        claim(snakMono("P1448", view.name, "en")),
        ...langs.map((l) => claim(snakItem("P407", LANG_Q[l]))),
      ];
  return {
    labels: { en: { language: "en", value: view.name.slice(0, 250) } },
    descriptions: { en: { language: "en", value: wdDescription(view) } },
    aliases: host ? { en: [{ language: "en", value: host }] } : {},
    claims,
  };
}

/** URL steps after the link-free create — one external link per edit, in this order, each resumable. */
export function linkPlan(view, base, hub = false) {
  const refUrl = view.llms_txt || view.url;
  const steps = [
    { id: "p856", kind: "claim", property: "P856", value: view.url, note: "official website" },
    { id: "p973", kind: "claim", property: "P973", value: view.door, note: "described at URL (hub door)" },
    { id: "ref856", kind: "ref", property: "P856", url: view.door, note: "reference on official website" },
    { id: "ref31", kind: "ref", property: "P31", url: refUrl, note: "reference on instance-of" },
  ];
  if (hub) steps.push({ id: "p1324", kind: "claim", property: "P1324", value: "https://github.com/dagrang-repository/the-reach-02", note: "source code repository" });
  return steps;
}

export function refSnaks(url) {
  return reference(url);
}

/** Wikidata language codes we feed from hreflang codes (base code; a few differ). */
const WD_LANG = { tl: "tl", fil: "tl", zh: "zh", pt: "pt", no: "nb", iw: "he", jw: "jv" };
function wdLang(code) {
  const c = String(code || "").toLowerCase().split("-")[0];
  if (!c || c === "en") return "";
  if (WD_LANG[c]) return WD_LANG[c];
  return /^[a-z]{2,3}$/.test(c) ? c : "";
}

/** Labels + descriptions in every language the site publishes, from its own localized pages (text only, one edit). */
export function i18nEntity(view, i18n) {
  const labels = {};
  const descriptions = {};
  for (const [code, rec] of Object.entries(i18n || {})) {
    const lang = wdLang(code);
    if (!lang || !rec) continue;
    const desc = firstSentence(rec.description || "").replace(/[.。]$/, "").trim();
    labels[lang] = { language: lang, value: view.name.slice(0, 250) };
    if (desc.length >= 12) descriptions[lang] = { language: lang, value: desc.slice(0, 240) };
  }
  return { labels, descriptions, languages: Object.keys(labels) };
}

function entityHash(view) {
  return `${view.name}|${wdDescription(view)}|${(view.languages || []).join(",")}|${view.sitemap || ""}`;
}

/* ---------------- state ---------------- */
async function stateRows(env) {
  await ensureWikidataTable(env);
  return all(env, "SELECT * FROM wikidata");
}

function orderedSlots(slots, cfg) {
  const byN = new Map(slots.map((s) => [s.n, s]));
  const head = cfg.order.map((n) => byN.get(n)).filter(Boolean);
  const rest = slots.filter((s) => !cfg.order.includes(s.n));
  return [...head, ...rest];
}

async function nextCandidate(env, slots, cfg) {
  const rows = await stateRows(env);
  const byId = new Map(rows.map((r) => [r.site_id, r]));
  for (const s of orderedSlots(slots, cfg)) {
    const r = byId.get(s.id);
    if (!r) return s;
    if (!r.qid && r.status === "error" && Number(r.attempts || 0) < 6) return s;
  }
  return null;
}

async function createdToday(env) {
  const row = await one(env, "SELECT COUNT(*) AS c FROM wikidata WHERE qid IS NOT NULL AND status != 'existing' AND created_at >= ?", `${nowDay()}T00:00:00.000Z`).catch(() => ({ c: 0 }));
  return Number(row?.c || 0);
}

async function saveState(env, siteId, patch) {
  const prev = await one(env, "SELECT * FROM wikidata WHERE site_id = ?", siteId);
  const ts = nowIso();
  const row = {
    qid: patch.qid ?? prev?.qid ?? null,
    label: patch.label ?? prev?.label ?? null,
    status: patch.status ?? prev?.status ?? null,
    detail: String(patch.detail ?? prev?.detail ?? "").slice(0, 400),
    attempts: patch.attempts ?? prev?.attempts ?? 0,
    hash: patch.hash ?? prev?.hash ?? null,
    created_at: patch.created_at ?? prev?.created_at ?? null,
    synced_at: patch.synced_at ?? prev?.synced_at ?? null,
  };
  await run(
    env,
    `INSERT INTO wikidata (site_id, qid, label, status, detail, attempts, hash, created_at, synced_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET qid=excluded.qid, label=excluded.label, status=excluded.status, detail=excluded.detail, attempts=excluded.attempts, hash=excluded.hash, created_at=excluded.created_at, synced_at=excluded.synced_at, updated_at=excluded.updated_at`,
    siteId, row.qid, row.label, row.status, row.detail, row.attempts, row.hash, row.created_at, row.synced_at, ts
  );
}

/* ---------------- push one door ---------------- */
export async function pushDoor(env, slot, { force = false } = {}) {
  const cfg = wdConfig(env);
  await ensureWikidataTable(env);
  const base = publicBase(env);
  const view = captureView(slot, env, base);
  const prev = await one(env, "SELECT * FROM wikidata WHERE site_id = ?", slot.id);
  if (prev?.qid) return { ok: true, n: slot.n, qid: prev.qid, action: "exists" };
  if (!force && (await createdToday(env)) >= cfg.dailyLimit) return { ok: false, n: slot.n, action: "gated", detail: `daily limit ${cfg.dailyLimit} reached` };
  const attempts = Number(prev?.attempts || 0) + 1;
  try {
    const found = await sparqlFindByUrl(cfg, view.url);
    if (found) {
      await saveState(env, slot.id, { qid: found, label: view.name, status: "existing", detail: "matched by P856 on Wikidata", attempts, hash: entityHash(view), synced_at: nowIso() });
      await recordChange(env, { kind: "wikidata", siteId: slot.id, url: `https://www.wikidata.org/wiki/${found}`, detail: `#${slot.n} ${view.name} already on Wikidata as ${found}` });
      return { ok: true, n: slot.n, qid: found, action: "existing" };
    }
    const wiki = new Wiki(cfg);
    await wiki.login();
    const hub = slot.url && new URL(slot.url).host === new URL(base).host;
    const entity = entityFor(view, base, hub);
    const res = await wiki.edit({ action: "wbeditentity", new: "item", data: JSON.stringify(entity), summary: `Create item for website ${view.name} (${view.url})` });
    const qid = res.entity?.id || "";
    if (!qid) throw new Error("wikidata: create returned no id");
    await saveState(env, slot.id, { qid, label: view.name, status: "created", detail: `created link-free with ${entity.claims.length} statements`, attempts, hash: entityHash(view), created_at: nowIso(), synced_at: nowIso() });
    await recordChange(env, { kind: "wikidata", siteId: slot.id, url: `https://www.wikidata.org/wiki/${qid}`, detail: `#${slot.n} ${view.name} → ${qid}` });
    const links = await applyLinkSteps(wiki, qid, linkPlan(view, base, hub)).catch((err) => ({ done: 0, error: String(err.message || err) }));
    const total = linkPlan(view, base, hub).length;
    await saveState(env, slot.id, { status: links.done >= total ? "complete" : "partial", detail: links.error ? `links ${links.done}/${total}: ${links.error.slice(0, 200)}` : `links ${links.done}/${total}` });
    if (links.done >= total) {
      let i18n = {};
      try { i18n = JSON.parse(slot.i18n_json || "{}") || {}; } catch { i18n = {}; }
      const ent = i18nEntity(view, i18n);
      if (ent.languages.length) {
        await wiki.edit({ action: "wbeditentity", id: qid, data: JSON.stringify({ labels: ent.labels, descriptions: ent.descriptions }), summary: `Add labels/descriptions in ${ent.languages.length} languages from ${view.url}` }).catch(() => null);
        await saveState(env, slot.id, { status: "i18n_done", detail: `localized in ${ent.languages.length} languages` });
      }
    }
    return { ok: true, n: slot.n, qid, action: "created", statements: entity.claims.length, links: `${links.done}/${total}` };
  } catch (err) {
    const detail = String((err && err.message) || err).slice(0, 300);
    await saveState(env, slot.id, { label: view.name, status: "error", detail, attempts });
    await recordChange(env, { kind: "wikidata-error", siteId: slot.id, url: view.url, detail }).catch(() => null);
    return { ok: false, n: slot.n, action: "error", detail };
  }
}

/** Apply the URL steps to an existing item, skipping what is already there (resumable). Direct mode only. */
export async function applyLinkSteps(wiki, qid, steps) {
  const ent = await wiki.call({ action: "wbgetentities", ids: qid, props: "claims" });
  const claims = ent.entities?.[qid]?.claims || {};
  const has = (prop, value) => (claims[prop] || []).some((c) => !value || c.mainsnak?.datavalue?.value === value);
  const firstId = (prop) => (claims[prop] || [])[0]?.id || "";
  const hasRef = (prop) => ((claims[prop] || [])[0]?.references || []).length > 0;
  let done = 0;
  for (const st of steps) {
    if (st.kind === "claim") {
      if (has(st.property, st.value)) { done++; continue; }
      const out = await wiki.edit({ action: "wbcreateclaim", entity: qid, property: st.property, snaktype: "value", value: JSON.stringify(st.value), summary: `Add ${st.note}` });
      claims[st.property] = [...(claims[st.property] || []), out.claim];
      done++;
    } else if (st.kind === "ref") {
      if (hasRef(st.property)) { done++; continue; }
      const id = firstId(st.property);
      if (!id) throw new Error(`wikidata: no ${st.property} claim to reference`);
      await wiki.edit({ action: "wbsetreference", statement: id, snaks: JSON.stringify(refSnaks(st.url).snaks), summary: `Add ${st.note}` });
      claims[st.property][0].references = [{}];
      done++;
    }
  }
  return { done };
}

/** Re-sync labels/descriptions of an existing item when the captured record changed (weekly at most). */
export async function syncDoor(env, slot) {
  const cfg = wdConfig(env);
  const base = publicBase(env);
  const view = captureView(slot, env, base);
  const row = await one(env, "SELECT * FROM wikidata WHERE site_id = ?", slot.id);
  if (!row?.qid) return { ok: false, action: "no-item" };
  const h = entityHash(view);
  if (row.hash === h) return { ok: true, action: "unchanged", qid: row.qid };
  if (row.synced_at && Date.now() - new Date(row.synced_at).getTime() < 7 * 24 * 3600 * 1000) return { ok: true, action: "cooldown", qid: row.qid };
  try {
    const wiki = new Wiki(cfg);
    await wiki.login();
    const data = { labels: { en: { language: "en", value: view.name.slice(0, 250) } }, descriptions: { en: { language: "en", value: wdDescription(view) } } };
    await wiki.edit({ action: "wbeditentity", id: row.qid, data: JSON.stringify(data), summary: `Refresh label/description from ${view.llms_txt || view.url}` });
    await saveState(env, slot.id, { hash: h, synced_at: nowIso(), status: row.status, detail: "label/description refreshed" });
    return { ok: true, action: "synced", qid: row.qid };
  } catch (err) {
    return { ok: false, action: "error", qid: row.qid, detail: String((err && err.message) || err).slice(0, 200) };
  }
}

/** Hourly tick: at most one new item per day, strongest door first; then one cheap re-sync check. */
export async function wikidataTick(env) {
  const cfg = wdConfig(env);
  if (cfg.mode === "courier") return { skipped: "courier mode — writes happen from the scheduled task" };
  if (!cfg.user || !cfg.pass) return { skipped: "no credentials" };
  await ensureWikidataTable(env);
  const slots = await numberedSites(env, all);
  const out = { created: null, synced: null };
  if ((await createdToday(env)) < cfg.dailyLimit) {
    const cand = await nextCandidate(env, slots, cfg);
    if (cand) out.created = await pushDoor(env, cand);
  }
  const withItems = slots.filter((s) => s.wikidata_qid);
  if (withItems.length) {
    const pick = withItems[Math.floor(Date.now() / 3600000) % withItems.length];
    out.synced = await syncDoor(env, pick);
  }
  return out;
}

/* ---------------- courier queue (write happens elsewhere) ---------------- */
export async function queueFor(env, limit = 1) {
  const cfg = wdConfig(env);
  await ensureWikidataTable(env);
  const base = publicBase(env);
  const slots = await numberedSites(env, all);
  const rows = await stateRows(env);
  const byId = new Map(rows.map((r) => [r.site_id, r]));
  const items = [];
  const isHub = (s) => { try { return new URL(s.url).host === new URL(base).host; } catch { return false; } };
  const pack = (s, r, phase, existing = "") => {
    const view = captureView(s, env, base);
    const hub = isHub(s);
    const entity = entityFor(view, base, hub);
    return {
      n: s.n, name: s.name, url: s.url, phase, qid: r?.qid || "", existing_qid: existing || "",
      statements: entity.claims.length,
      summary: `Create item for website ${view.name} (${view.url})`,
      entity_json: JSON.stringify(entity),
      steps: linkPlan(view, base, hub),
    };
  };
  // 1) items of ours that still miss URL steps — finishing them never counts against the daily create limit
  for (const s of orderedSlots(slots, cfg)) {
    if (items.length >= limit) break;
    const r = byId.get(s.id);
    if (r?.qid && (r.status === "created" || r.status === "partial")) items.push(pack(s, r, "links"));
  }
  // 2) items with all links done but no localized labels/descriptions yet (text-only edit, never counts as a create)
  for (const s of orderedSlots(slots, cfg)) {
    if (items.length >= limit) break;
    const r = byId.get(s.id);
    if (!(r?.qid && r.status === "complete")) continue;
    let i18n = {};
    try { i18n = JSON.parse(s.i18n_json || "{}") || {}; } catch { i18n = {}; }
    const view = captureView(s, env, base);
    const ent = i18nEntity(view, i18n);
    if (!ent.languages.length) { continue; }
    items.push({ n: s.n, name: s.name, url: s.url, phase: "i18n", qid: r.qid, existing_qid: "", languages: ent.languages, summary: `Add labels/descriptions in ${ent.languages.length} languages from ${view.url}`, i18n_json: JSON.stringify({ labels: ent.labels, descriptions: ent.descriptions }), steps: [], statements: 0, entity_json: "" });
  }
  // 3) next link-free create, strongest door first
  const createdNow = await createdToday(env);
  for (const s of orderedSlots(slots, cfg)) {
    if (items.length >= limit || createdNow >= cfg.dailyLimit) break;
    const r = byId.get(s.id);
    if (r?.qid) continue;
    if (r && r.status === "error" && Number(r.attempts || 0) >= 6) continue;
    const existing = await sparqlFindByUrl(cfg, captureView(s, env, base).url);
    items.push(pack(s, r, "create", existing));
  }
  return { mode: cfg.mode, created_today: createdNow, daily_limit: cfg.dailyLimit, items };
}

export async function recordResult(env, slot, { qid, action, statements, detail }) {
  await ensureWikidataTable(env);
  const base = publicBase(env);
  const view = captureView(slot, env, base);
  const prev = await one(env, "SELECT * FROM wikidata WHERE site_id = ?", slot.id);
  const attempts = Number(prev?.attempts || 0) + 1;
  if (action === "error") {
    await saveState(env, slot.id, { label: view.name, status: "error", detail: detail || "courier error", attempts });
    await recordChange(env, { kind: "wikidata-error", siteId: slot.id, url: view.url, detail: `courier: ${detail || "error"}` }).catch(() => null);
    return { ok: false, n: slot.n, action: "error", detail };
  }
  if (action === "reset") {
    await saveState(env, slot.id, { status: prev?.qid ? (prev.status || "created") : "pending", attempts: 0, detail: "attempts reset" });
    return { ok: true, n: slot.n, action: "reset" };
  }
  if (!/^Q\d+$/.test(String(qid || ""))) return { ok: false, n: slot.n, action: "bad-qid" };
  if (action === "i18n") {
    await saveState(env, slot.id, { qid, label: view.name, status: "i18n_done", attempts: prev?.attempts || 0, detail: detail || "localized", synced_at: nowIso(), created_at: prev?.created_at || nowIso() });
    await recordChange(env, { kind: "wikidata", siteId: slot.id, url: `https://www.wikidata.org/wiki/${qid}`, detail: `#${slot.n} ${view.name} ${qid} ${detail || "localized"}` }).catch(() => null);
    await announceReachFeed(env).catch(() => null);
    return { ok: true, n: slot.n, qid, action: "i18n", wikidata: `https://www.wikidata.org/wiki/${qid}` };
  }
  if (action === "partial" || action === "complete") {
    await saveState(env, slot.id, { qid, label: view.name, status: action, attempts: prev?.attempts || 0, detail: detail || `links ${action}`, synced_at: nowIso(), created_at: prev?.created_at || nowIso() });
    if (action === "complete") await recordChange(env, { kind: "wikidata", siteId: slot.id, url: `https://www.wikidata.org/wiki/${qid}`, detail: `#${slot.n} ${view.name} ${qid} links complete` }).catch(() => null);
    return { ok: true, n: slot.n, qid, action, wikidata: `https://www.wikidata.org/wiki/${qid}` };
  }
  const status = action === "existing" ? "existing" : "created";
  await saveState(env, slot.id, {
    qid, label: view.name, status, attempts, hash: entityHash(view),
    detail: status === "created" ? `created link-free by courier with ${Number(statements || 0) || "?"} statements` : "matched by P856 on Wikidata (left as is)",
    created_at: status === "created" ? nowIso() : (prev?.created_at || null),
    synced_at: nowIso(),
  });
  await recordChange(env, { kind: "wikidata", siteId: slot.id, url: `https://www.wikidata.org/wiki/${qid}`, detail: `#${slot.n} ${view.name} → ${qid} (${status})` });
  await announceReachFeed(env).catch(() => null);
  return { ok: true, n: slot.n, qid, action: status, wikidata: `https://www.wikidata.org/wiki/${qid}` };
}

/* ---------------- surfaces ---------------- */
export function wikidataJson(slots, base) {
  const linked = slots.filter((s) => s.wikidata_qid);
  return {
    name: "The AI Hill Top Lighthouse — Wikidata items",
    generated: nowIso(),
    count: linked.length,
    total_doors: slots.length,
    items: linked.map((s) => ({ n: s.n, name: s.name, url: s.url, door: `${base}/${s.n}`, qid: s.wikidata_qid, wikidata: `https://www.wikidata.org/wiki/${s.wikidata_qid}`, entity: `https://www.wikidata.org/wiki/Special:EntityData/${s.wikidata_qid}.json`, localized: (() => { try { return Object.keys(JSON.parse(s.i18n_json || "{}") || {}).length; } catch { return 0; } })() })),
  };
}

export async function handleWikidata(path, request, url, env) {
  const base = publicBase(env);
  const cfg = wdConfig(env);
  if (path === "/v1/wikidata" && request.method === "GET") {
    await ensureWikidataTable(env);
    const slots = await numberedSites(env, all);
    const rows = await stateRows(env);
    const byId = new Map(rows.map((r) => [r.site_id, r]));
    const cand = cfg.user && cfg.pass ? await nextCandidate(env, slots, cfg) : null;
    return Response.json({
      ok: true,
      mode: cfg.mode,
      credentials: !!(cfg.user && cfg.pass),
      api: cfg.api,
      order: cfg.order,
      daily_limit: cfg.dailyLimit,
      created_today: await createdToday(env),
      next: cand ? { n: cand.n, name: cand.name } : null,
      doors: orderedSlots(slots, cfg).map((s) => {
        const r = byId.get(s.id);
        return { n: s.n, name: s.name, qid: r?.qid || "", status: r?.status || "pending", detail: r?.detail || "", attempts: r?.attempts || 0, created_at: r?.created_at || "", synced_at: r?.synced_at || "" };
      }),
    });
  }
  if (path === "/v1/wikidata/queue" && request.method === "GET") {
    const limit = Math.max(1, Math.min(5, Number(url.searchParams.get("limit") || 1)));
    return Response.json({ ok: true, ...(await queueFor(env, limit)) });
  }
  if (path === "/v1/wikidata/record" && request.method === "POST") {
    const slots = await numberedSites(env, all);
    const n = Number(url.searchParams.get("n") || 0);
    const slot = slots.find((s) => s.n === n);
    if (!slot) return Response.json({ ok: false, error: "no door at that number" }, { status: 404 });
    const out = await recordResult(env, slot, {
      qid: String(url.searchParams.get("qid") || "").trim(),
      action: String(url.searchParams.get("action") || "created").trim(),
      statements: Number(url.searchParams.get("statements") || 0),
      detail: String(url.searchParams.get("detail") || "").slice(0, 300),
    });
    return Response.json(out, { status: out.ok ? 200 : 400 });
  }
  if (path === "/v1/wikidata/login-test" && request.method === "POST") {
    try {
      const wiki = new Wiki(cfg);
      const name = await wiki.login();
      const info = await wiki.userinfo();
      return Response.json({ ok: true, user: name, id: info.id, groups: info.groups || [], editcount: info.editcount ?? null, csrf: !!wiki.csrf });
    } catch (err) {
      return Response.json({ ok: false, error: String((err && err.message) || err).slice(0, 300) }, { status: 502 });
    }
  }
  if (path === "/v1/wikidata" && request.method === "POST") {
    const slots = await numberedSites(env, all);
    const n = Number(url.searchParams.get("n") || 0);
    const force = url.searchParams.get("force") === "1";
    let slot = n ? slots.find((s) => s.n === n) : await nextCandidate(env, slots, cfg);
    if (n && !slot) return Response.json({ ok: false, error: "no door at that number" }, { status: 404 });
    if (!slot) return Response.json({ ok: true, action: "nothing-pending" });
    const out = await pushDoor(env, slot, { force });
    return Response.json(out, { status: out.ok || out.action === "gated" ? 200 : 502 });
  }
  if (path === "/v1/wikidata/sync" && request.method === "POST") {
    const slots = await numberedSites(env, all);
    const n = Number(url.searchParams.get("n") || 0);
    const slot = slots.find((s) => s.n === n);
    if (!slot) return Response.json({ ok: false, error: "n required" }, { status: 400 });
    return Response.json(await syncDoor(env, slot));
  }
  return null;
}
