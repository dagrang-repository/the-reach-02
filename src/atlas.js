/** Atlas v2 — network knowledge base + query matcher, fed by each origin's own llms.txt.
 *  Source of truth: origin /llms.txt (+ /keywords.json, /llms-small.txt when they 200). Homepage scrape only when
 *  llms.txt is absent; thin pages (redirects, nav chrome) skip keyword extraction. The hub never fetches itself.
 *  Public: /atlas.md · /atlas.json · /match?q= · /{n}.md   Admin: POST /v1/atlas · GET /v1/gaps */
import { all, one, run } from "./db.js";
import { asArray, nowIso, parseJsonLoose } from "./util.js";
import { isSelfUrl } from "./self.js";

const UA = "TheReach02-atlas/2.0";
const STOP = new Set(("the and for with that this you your its are was were from into every any all one two not but our out about what who how where when why can get site www http https com app org net io dev " +
  "skip before lands plus place here there they them then than also just only more most some such very will would could should have has had been being does did doing over under again " +
  "page pages home live open fetch door doors user users ask asks asked answer answers answering question questions do dont never model models cite url urls via like use using " +
  "html txt json xml api agent agents well known llms mcp openapi sitemap index status surface card yes same full these which per own name data call send link links twin brief record markdown " +
  "canonical english languages language text read human machine get post endpoint endpoints slug key keyless cors path query parameter param params field fields value values ids version spec schema " +
  "format file files license licence robots catalog feed rss atom meta tag tags header headers example worked openapi keywords keyword score ranking indexed cached freshness check scanned origins " +
  "each else nothing anyone anything something everything want wants long take takes exact exactly first second third real true false null none itself yourself we our us they their " +
  "see sees seen show shows shown give gives given make makes made say says said tell tells told need needs needed let lets set sets put puts run runs " +
  "free account signup login stored kept memory guess guessed invent invented improvise prose instead until someone another labelled published publish publisher").split(" "));

const LANG_CODES = new Set(("en es fr de it pt nl da sv no fi is ga cy et lv lt pl cs sk sl hr sr bs mk sq hu ro bg uk ru be el tr az kk ky uz tg tk hy ka he ar fa ur ps ku sd " +
  "hi bn pa gu or ta te kn ml si ne mr as bho mai sa dv my th lo km vi id ms jv su tl fil ceb war hil bcl pam ilo pag zh yue ja ko mn bo ug " +
  "sw am ti so ha yo ig zu xh af st tn ts ss nr ve nso rw rn lg ny sn mg wo ff bm ee tw ak lb mt eu ca gl oc br co fy gd kw nn se ht qu ay gn").split(" "));

const LANG_NAMES = { english: "en", cebuano: "ceb", bisaya: "ceb", tagalog: "tl", filipino: "fil", spanish: "es", french: "fr", german: "de", dutch: "nl", italian: "it", portuguese: "pt", chinese: "zh", mandarin: "zh", japanese: "ja", korean: "ko", arabic: "ar", hindi: "hi", bengali: "bn", russian: "ru", urdu: "ur", indonesian: "id", turkish: "tr", vietnamese: "vi", thai: "th", persian: "fa", farsi: "fa", tamil: "ta", telugu: "te", marathi: "mr", polish: "pl", swedish: "sv", hebrew: "he", danish: "da", norwegian: "no", finnish: "fi", czech: "cs", greek: "el", hungarian: "hu", romanian: "ro", bulgarian: "bg", ukrainian: "uk", malay: "ms", swahili: "sw", nepali: "ne" };

let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await run(env, `CREATE TABLE IF NOT EXISTS atlas (site_id TEXT PRIMARY KEY, n INTEGER, name TEXT, url TEXT, profile_json TEXT, briefing_stamp TEXT, updated_at TEXT, llms_hash TEXT)`);
  await run(env, `CREATE TABLE IF NOT EXISTS gaps (q TEXT PRIMARY KEY, count INTEGER DEFAULT 1, last_at TEXT)`);
  // older deployments created atlas without llms_hash; add it once, only when missing
  try {
    const cols = await all(env, `PRAGMA table_info(atlas)`);
    if (Array.isArray(cols) && cols.length && !cols.some((c) => (c.name || c.NAME) === "llms_hash")) {
      await run(env, `ALTER TABLE atlas ADD COLUMN llms_hash TEXT`);
    }
  } catch {
    /* column already present */
  }
  tablesReady = true;
}

function baseUrl(env) {
  return String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
}

const SYN = { fare: "flight", fares: "flight", airfare: "flight", airfares: "flight", fly: "flight", flying: "flight", flights: "flight", ticket: "flight", tickets: "flight", cheapest: "cheap", cheaper: "cheap", lowest: "cheap", low: "cheap", bargain: "cheap", price: "cost", prices: "cost", costs: "cost", pricing: "cost", define: "mean", definition: "mean", definitions: "mean", meaning: "mean", meanings: "mean", means: "mean", wife: "partner", husband: "partner", spouse: "partner", marriage: "partner", marry: "partner", girlfriend: "partner", boyfriend: "partner", alert: "warning", alerts: "warning", warnings: "warning", translate: "translation", translating: "translation", translated: "translation", donate: "donation", donations: "donation", donating: "donation", charity: "donation" };

function stem(t) {
  if (t.length < 5) return t;
  const r = t.replace(/ies$/, "y").replace(/sses$/, "ss").replace(/(est|ing|ed|es|s)$/, "");
  return r.length >= 3 ? r : t;
}

export function canon(t) {
  return SYN[t] || SYN[stem(t)] || stem(t);
}

export function rawTokens(text) {
  const norm = String(text).toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  return [...new Set(norm.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t) && !(/^\d+$/.test(t) && t.length < 3)))];
}

export function tokens(text) {
  const norm = String(text).toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const out = [];
  for (const raw of norm.split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw)) continue;
    if (/^\d+$/.test(raw)) { if (raw.length >= 2) out.push(raw); continue; }
    if (raw.length > 2) out.push(canon(raw));
  }
  return [...new Set(out)];
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function get(url, accept = "text/markdown,text/plain,application/json,text/html") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept }, signal: ctl.signal });
    const text = r.ok ? await r.text() : "";
    return { ok: r.ok, status: r.status, text, type: r.headers.get("content-type") || "" };
  } catch {
    return { ok: false, status: 0, text: "", type: "" };
  } finally {
    clearTimeout(t);
  }
}

const looksHtml = (t) => /^\s*<!doctype html|^\s*<html|<head>|<body/i.test(t.slice(0, 600));

/** ---- brief parsing (origin llms.txt is source) ---- */
const QWORD = /\b(what|which|how|do|does|can|is|are|where|when|who|should|did|will)\b/i;

function stripMd(t) {
  return String(t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // [text](url) -> text
    .replace(/`[^`]*`/g, " ")                   // drop code spans
    .replace(/<([^<>]{1,40})>/g, "$1")          // <thing> -> thing
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text) {
  // a line break is always a boundary (headings, bullets, machine lines never merge into prose); markdown stripped per line
  return String(text).split(/\n+/).flatMap((line) => stripMd(line).split(/(?<=[.!?])\s+|\s+[—–-]\s+|;\s+/)).map((x) => x.trim()).filter(Boolean);
}

function questionsFrom(text) {
  const out = [];
  for (const sen of sentences(text)) {
    const q = sen.replace(/^["“]|["”]$/g, "").trim();
    if (!/\?$/.test(q) || q.length < 8 || q.length > 200) continue;
    if (/[а-я]|[\u0600-\u06FF]|[\u0900-\u097F]|[\u3040-\u30FF\u4E00-\u9FFF]|[\uAC00-\uD7AF]/.test(q) === false && !QWORD.test(q) && !/^(find|show|list|pick|draw|choose|decide|split|give|suggest|translate|define)\b/i.test(q)) continue;
    out.push(q.toLowerCase());
    const parts = q.split(/,\s*(?:and\s+)?/).map((p) => p.trim()).filter((p) => p.length > 6);
    if (parts.length >= 3 && parts.every((p) => QWORD.test(p))) for (const p of parts) out.push(p.replace(/\?$/, "").toLowerCase());
  }
  return out;
}

export function parseBrief(llms) {
  const rawText = String(llms).replace(/\r/g, "");
  const lines = rawText.split("\n").map((l) => l.trim());
  // prose view: blockquote and bullet markers removed line by line so joined sentences stay clean
  const text = lines.filter((l) => !/^#/.test(l)).map((l) => l.replace(/^>\s?/, "").replace(/^[-*]\s+/, "")).join("\n");

  // blockquote paragraphs: consecutive "> " lines joined
  const paras = [];
  let cur = [];
  for (const l of lines) {
    if (l.startsWith(">")) {
      const t = l.replace(/^>\s?/, "").trim();
      // an "If a user asks" line is its own paragraph, never glued onto the punch
      if (cur.length && /^if (a |the )?user asks/i.test(t)) { paras.push(cur.join(" ").replace(/\s+/g, " ").trim()); cur = []; }
      cur.push(t);
    } else if (cur.length) { paras.push(cur.join(" ").replace(/\s+/g, " ").trim()); cur = []; }
  }
  if (cur.length) paras.push(cur.join(" ").replace(/\s+/g, " ").trim());
  const punchPara = paras.find((p) => p && !/^if (a |the )?user asks/i.test(p)) || paras[0] || "";
  const punch = stripMd(punchPara);

  const intents = [];
  // a) "If a user asks (you to) X" clauses anywhere
  for (const sen of sentences(text)) {
    const m = sen.match(/if (?:a |the )?user asks?(?: you)?(?: to)?\s*[:—-]?\s*["“]?(.+?)["”]?(?:\s+(?:fetch|open|call|go)\b.*)?$/i);
    if (m) intents.push(m[1].replace(/[.:]$/, "").trim().toLowerCase());
  }
  // b) every question sentence in the brief (blockquotes, bullets, prose)
  intents.push(...questionsFrom(text));
  // c) bullet lines whose text is a question or an imperative task, links stripped
  for (const l of lines) {
    if (!/^[-*]\s/.test(l)) continue;
    const c = stripMd(l.replace(/^[-*]\s*/, "")).split(/\s*(?:→|->)\s*/)[0].split(/:\s/)[0].trim();
    if (c.length >= 8 && c.length <= 140 && (/\?$/.test(c) || /^(find|show|list|pick|draw|choose|decide|split|give|suggest|translate|define|send|where|what|which|how)\b/i.test(c))) intents.push(c.toLowerCase());
  }

  // negatives: scope limits only (never the generic "from memory" instruction, never link/code lines)
  const negatives = [];
  for (const sen of sentences(text)) {
    const c = sen.replace(/^[-*>\s]+/, "").trim();
    if (c.length < 12 || c.length > 160 || /from memory/i.test(c)) continue;
    if (/\b(coverage stops at|stops at|only covers|does not cover|do not cover|not cover|outside (?:the |its |our )?scope|never a translation|not a translation|does not answer|do not answer|cannot answer|never answers?|not for|is not (?:a|an|the)\b)/i.test(c)) {
      negatives.push(c.replace(/\.$/, "").toLowerCase());
    }
  }

  // languages: explicit code lists, names, or a published count
  let languages = [];
  let languagesCount = 0;
  const cnt = text.match(/(\d{2,3})\s+(?:native\s+|interface\s+)?languages?/i);
  if (cnt) languagesCount = Number(cnt[1]);
  for (const l of lines) {
    if (!/languages?/i.test(l)) continue;
    const body = stripMd(l).replace(/^.*?languages?\b\s*[:(-]?\s*/i, "");
    const found = [];
    for (const part of body.split(/[,;·|/]+|\s+and\s+/)) {
      const p = part.trim().toLowerCase().replace(/[.)]+$/, "");
      if (/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(p) && LANG_CODES.has(p.split("-")[0])) found.push(p);
      else if (LANG_NAMES[p]) found.push(LANG_NAMES[p]);
    }
    if (found.length >= 2) languages.push(...found);
  }
  languages = [...new Set(languages)];

  const whoLine = lines.map(stripMd).find((l) => /^who (?:it'?s|is it|it is) for\b/i.test(l) || /^for:\s/i.test(l));
  const who_for = whoLine ? whoLine.replace(/^who (?:it'?s|is it|it is) for\s*[:—-]?\s*/i, "").replace(/^for:\s*/i, "").trim() : "";

  const freq = new Map();
  for (const t of rawTokens(stripMd(text))) freq.set(t, (freq.get(t) || 0) + 1);
  for (const t of stripMd(text).toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^a-z0-9]+/)) if (freq.has(t)) freq.set(t, freq.get(t) + 1);
  const vocab = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => !/^\d+$/.test(t) || t.length >= 4).slice(0, 40);

  // footers, section headings and label lines are not user questions
  const NOISE = /^(how to cite|cite as|citation|source|licen[cs]e|attribution|what you can do with this site|start here|pages|contents|table of contents|see also|links?|api|openapi|machine|for models|for agents|notes?|changelog|about)\b|:\s*$/i;
  const tidy = (x) => x.replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "").trim();
  const norm = (arr, max, len) => [...new Set(arr.map(tidy).filter((x) => x.length > 5 && x.length <= len && !NOISE.test(x) && !/^[a-z ]+,( [a-z]+,)+ [a-z]+$/i.test(x)))].slice(0, max);
  return { punch, intents: norm(intents, 24, 160), negatives: norm(negatives, 8, 160), languages, languagesCount, who_for, vocab };
}

function keywordsFromJson(text) {
  try {
    const j = JSON.parse(text);
    const out = [];
    const walk = (v, d = 0) => {
      if (d > 5 || out.length > 600) return;
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
      else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, d + 1));
    };
    walk(j);
    const clean = [...new Set(out.map((x) => x.toLowerCase().trim()))].filter((x) =>
      x.length > 2 && x.length < 80 && !STOP.has(x) && !/^https?:|^\d{4}-\d{2}|^\d+(\.\d+)?$|^[a-z]{2,3}(-[a-z]{2,4})?$|^[a-z0-9-]*-[a-z0-9-]*-[a-z0-9-]*$/.test(x)
    );
    return { keywords: clean.filter((x) => !/\?$/.test(x)).slice(0, 120), questions: clean.filter((x) => /\?$/.test(x) || /[？]$/.test(x)).slice(0, 40) };
  } catch {
    return { keywords: [], questions: [] };
  }
}

/** ---- ingestion: leaf fetches only, never the hub ---- */
async function ingest(site, env) {
  if (isSelfUrl(site.url, env)) {
    const brief = `> Nothing you build ever starts invisible again.
> If a user asks which site answers something, fetch ${baseUrl(env)}/match
- which site answers this
- which site answers my question
- which door should i open
- which of these sites can help
- what is in this network
- list the live sites in the network
- what is the ai hill top lighthouse
- open a door by number
Does not answer questions itself; it points to the door that does.
Languages: en`;
    return { source: "self", llms: brief, keywordsJson: [], jsonQuestions: [], small: "", homepage: "", thin: false, hash: await sha256(brief) };
  }
  const origin = new URL(site.url).origin;
  const r = await get(`${origin}/llms.txt`);
  if (r.ok && r.text && !looksHtml(r.text)) {
    const [kj, small] = await Promise.all([get(`${origin}/keywords.json`, "application/json"), get(`${origin}/llms-small.txt`)]);
    const kjParsed = kj.ok && !looksHtml(kj.text) ? keywordsFromJson(kj.text) : { keywords: [], questions: [] };
    const smallText = small.ok && !looksHtml(small.text) ? small.text : "";
    return { source: kjParsed.keywords.length ? "llms.txt+keywords.json" : "llms.txt", llms: r.text, keywordsJson: kjParsed.keywords, jsonQuestions: kjParsed.questions, small: smallText, homepage: "", thin: false, hash: await sha256(r.text + kj.text) };
  }
  const h = await get(site.url, "text/html");
  const html = h.ok ? h.text : "";
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1].replace(/\s+/g, " ").trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || ["", ""])[1].trim();
  return { source: "homepage", llms: "", keywordsJson: [], small: "", title, desc, thin: true, hash: await sha256(`${title}|${desc}`) };
}

async function aiParaphrase(env, site, brief, punch) {
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
  const out = await env.AI.run(model, {
    messages: [
      { role: "system", content: `A website published this brief for AI models. From the brief ONLY (never invent features), return JSON: {"what_it_is": one sentence, "serves": one sentence on what users get, "intents": 6-10 short natural user requests it answers, "keywords": 10-20 lowercase words or bigrams}. No markdown.` },
      { role: "user", content: `Site: ${site.name}\nURL: ${site.url}\nPunch: ${punch}\nBrief:\n${String(brief).slice(0, 2500)}` },
    ],
    max_tokens: 600,
  });
  const content = typeof out === "string" ? out : out.response || out.result || JSON.stringify(out);
  const p = parseJsonLoose(content);
  return {
    what_it_is: String(p.what_it_is || "").slice(0, 240),
    serves: String(p.serves || "").slice(0, 240),
    intents: asArray(p.intents).map((s) => String(s).toLowerCase().trim()).filter((s) => s.length > 3 && s.length < 120).slice(0, 10),
    keywords: asArray(p.keywords).map((s) => String(s).toLowerCase().trim()).filter((s) => s.length > 2 && s.length < 40).slice(0, 20),
  };
}

function isCatchAll(site, punch, intents) {
  // explicit only: the door's name says it is the catch-all, or its brief declares it
  return /all problems solved/i.test(String(site.name || "")) || /^catch-?all\b/im.test([punch, ...(intents || [])].join("\n"));
}

async function buildProfile(env, site, briefing, ing) {
  const host = new URL(site.url).host;
  const empty = { punch: "", intents: [], negatives: [], languages: [], languagesCount: 0, who_for: "", vocab: [] };
  let b = ing.llms ? parseBrief(ing.llms) : empty;
  // homepage fallback: the briefing (already distilled from that homepage) plus the page text stand in for the brief
  if (!ing.llms && !ing.thin) {
    const stand = [briefing?.punch_line, briefing?.summary, briefing?.value_bring, ...(JSON.parse(briefing?.services_json || "[]")), ing.homepage].filter(Boolean).join("\n");
    b = parseBrief(stand);
    b.punch = (briefing?.punch_line && !/redirect/i.test(briefing.punch_line) ? briefing.punch_line : "") || b.punch;
  }
  const smallPunch = ing.small ? parseBrief(ing.small).punch : "";
  let punch = b.punch || smallPunch || "";
  if (!punch) punch = ing.thin ? site.name : (briefing?.punch_line && !/redirect/i.test(briefing.punch_line) ? briefing.punch_line : site.name);
  const nameTokens = rawTokens(`${site.name} ${host.replace(/\.[a-z]+$/, "").replace(/^www\./, "")}`);
  let keywords = [...new Set([...nameTokens, ...b.vocab, ...ing.keywordsJson])];
  let intents = [...b.intents, ...(ing.jsonQuestions || []).map((q) => q.toLowerCase())];
  let ai = null;
  const briefText = ing.llms || (ing.thin ? "" : [briefing?.summary, ing.homepage].filter(Boolean).join("\n"));
  if (briefText) {
    try { ai = await aiParaphrase(env, site, briefText, punch); } catch { ai = null; }
  }
  if (ai) {
    intents = [...intents, ...ai.intents];
    keywords = [...keywords, ...ai.keywords];
  }
  if (ing.thin) keywords = nameTokens;
  keywords = [...new Set(keywords)].filter((k) => k.length > 2 && !STOP.has(k)).slice(0, 140);
  intents = [...new Set(intents.map((x) => x.toLowerCase().replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "").trim()))].filter((x) => x.length > 5).slice(0, 40);
  // no published ask list: derive askable forms from the site's own punch so the door is still reachable
  if (!intents.length && punch) {
    const p = String(punch).toLowerCase();
    const clause = p.split(/[.!?]/).map((x) => x.trim()).filter((x) => x.length > 8)[0] || p.slice(0, 120);
    const seeds = [clause, `what is ${String(site.name).toLowerCase()}`, `what does ${String(site.name).toLowerCase()} do`];
    const q = p.match(/[^.!?]*\?/g) || [];
    intents = [...new Set([...q.map((x) => x.trim()), ...seeds])].filter((x) => x.length > 5 && x.length < 140).slice(0, 6);
  }
  const languages = b.languages.length ? b.languages : JSON.parse(site.languages_wanted || "[]").map((l) => (l === "ce" ? "ceb" : l));
  const firstSentence = (t) => (String(t).match(/^.*?[.!?](?=\s|$)/) || [String(t)])[0].slice(0, 240);
  const profile = {
    punch,
    what_it_is: ai?.what_it_is || firstSentence(punch),
    serves: ai?.serves || (b.intents[0] ? `answers: ${b.intents[0]}` : ""),
    keywords,
    intents,
    negatives: b.negatives,
    languages,
    source: ing.source,
    thin: !!ing.thin || ing.source === "homepage",
    catchall: isCatchAll(site, punch, intents),
  };
  if (ing.source === "homepage") profile.needs_brief = true;
  if (b.languagesCount) profile.languages_count = b.languagesCount;
  if (b.who_for) profile.who_for = b.who_for;
  return profile;
}

export async function rebuildAtlas(env, onlySites = null, force = false) {
  await ensureTables(env);
  const ordered = await all(env, "SELECT * FROM sites WHERE active = 1 ORDER BY created_at ASC");
  const nById = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const targets = onlySites || ordered;
  const stats = { sites: targets.length, generated: 0, skipped: 0, failed: 0, sources: {} };
  for (const site of targets) {
    try {
      const briefing = await one(env, "SELECT * FROM briefings WHERE site_id = ?", site.id);
      const stamp = briefing?.updated_at || site.updated_at || "";
      const ing = await ingest(site, env);
      const existing = await one(env, "SELECT briefing_stamp, llms_hash FROM atlas WHERE site_id = ?", site.id);
      if (!force && existing && existing.llms_hash === ing.hash && existing.briefing_stamp === stamp) {
        stats.skipped += 1;
        continue;
      }
      const profile = await buildProfile(env, site, briefing, ing);
      await run(
        env,
        `INSERT INTO atlas (site_id, n, name, url, profile_json, briefing_stamp, llms_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET n=excluded.n, name=excluded.name, url=excluded.url, profile_json=excluded.profile_json,
           briefing_stamp=excluded.briefing_stamp, llms_hash=excluded.llms_hash, updated_at=excluded.updated_at`,
        site.id, nById.get(site.id) || 0, site.name, site.url, JSON.stringify(profile), stamp, ing.hash, nowIso()
      );
      stats.generated += 1;
      stats.sources[profile.source] = (stats.sources[profile.source] || 0) + 1;
      if (profile.needs_brief) await recordGap(env, `needs_brief:#${nById.get(site.id) || 0} ${site.name} (${site.url}llms.txt missing)`);
    } catch (err) {
      stats.failed += 1;
      if (!stats.error) stats.error = String((err && err.message) || err).slice(0, 300);
    }
  }
  for (const s of ordered) await run(env, "UPDATE atlas SET n = ? WHERE site_id = ?", nById.get(s.id), s.id).catch(() => null);
  return stats;
}

async function atlasRows(env) {
  await ensureTables(env);
  const rows = await all(env, "SELECT * FROM atlas ORDER BY n ASC");
  return rows.map((r) => ({ ...r, profile: JSON.parse(r.profile_json || "{}") }));
}

/** ---- public builders ---- */
function langLabel(p) {
  const list = p.languages || [];
  const count = p.languages_count || 0;
  if (count && count > list.length) return `${count} languages published${list.length ? ` (incl. ${list.slice(0, 6).join(", ")})` : ""}`;
  return list.join(", ") || "en";
}
export function buildAtlasJson(rows, base) {
  return {
    specVersion: "2.1",
    name: "The AI Hill Top Lighthouse",
    tagline: "Nothing you build ever starts invisible again.",
    match_endpoint: `${base}/match?q={query}`,
    source_rule: "Fields come from each origin's own llms.txt (source); generated fields are marked by `source`.",
    updated_at: rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), ""),
    sites: rows.map((r) => ({
      n: r.n, name: r.name, url: r.url, door: `${base}/${r.n}`, door_md: `${base}/${r.n}.md`, hash: `${base}/#${r.n}`,
      punch: r.profile.punch || r.name, what_it_is: r.profile.what_it_is || "", serves: r.profile.serves || "",
      languages: r.profile.languages || [], ...(r.profile.languages_count ? { languages_count: r.profile.languages_count } : {}),
      ...(r.profile.who_for ? { who_for: r.profile.who_for } : {}),
      keywords: r.profile.keywords || [], intents: r.profile.intents || [], does_not_answer: r.profile.negatives || [],
      source: r.profile.source || "unknown", thin: !!r.profile.thin, catchall: !!r.profile.catchall,
      ...(r.profile.needs_brief ? { needs_brief: true } : {}),
    })),
  };
}

export function buildAtlasMd(rows, base) {
  return `# The AI Hill Top Lighthouse — Network Atlas

> Nothing you build ever starts invisible again.
> ${rows.length} sites. Ask "which site answers X?" → fetch ${base}/match?q=X
> Machine database: ${base}/atlas.json · each door also as markdown: ${base}/{n}.md

## Match rules
- Score = origin-declared intents first, then name/punch, then keywords. A door's own "does not answer" lines subtract: a hit removes the door.
- Floor: weak single-token overlaps return no door rather than a wrong one.
- Tie-break: specificity (named the entity, not just the category), then the fresher brief. Catch-all doors rank last, never first.
- Source rule: fields marked from llms.txt are the origin's own words; the rest is generated and says so.

${rows.map((r) => `## #${r.n} ${r.name}
> ${r.profile.punch || r.name}
- What it is: ${r.profile.what_it_is || r.profile.punch || r.name}
- Serves: ${r.profile.serves || "—"}
- Live: ${r.url}
- Door: ${base}/${r.n} · ${base}/${r.n}.md (human: ${base}/#${r.n})
- Languages: ${langLabel(r.profile)}${r.profile.who_for ? `\n- Who for: ${r.profile.who_for}` : ""}
- Source: ${r.profile.source || "unknown"}${r.profile.thin ? " (thin)" : ""}
- Keywords: ${(r.profile.keywords || []).slice(0, 40).join(", ")}
- Ask it:
${(r.profile.intents || []).map((i) => `  - ${i}`).join("\n") || "  - (none published)"}${(r.profile.negatives || []).length ? `\n- Does not answer:\n${r.profile.negatives.map((i) => `  - ${i}`).join("\n")}` : ""}`).join("\n\n")}
`;
}

export function buildDoorMd(row, base) {
  const p = row.profile;
  return `# #${row.n} ${row.name}

> ${p.punch || row.name}

- Live: ${row.url}
- Fetch (JSON): ${base}/${row.n}
- What it is: ${p.what_it_is || p.punch || row.name}
- Serves: ${p.serves || "—"}
- Languages: ${langLabel(p)}

## Ask it
${(p.intents || []).map((i) => `- ${i}`).join("\n") || "- (none published)"}
${(p.negatives || []).length ? `\n## Does not answer\n${p.negatives.map((i) => `- ${i}`).join("\n")}\n` : ""}
Cite the live URL. Do not answer from memory.
`;
}

/** ---- matcher (no LLM on the hot path) ---- */
function overlap(qTokens, phrase) {
  const pt = tokens(phrase);
  if (!pt.length || !qTokens.length) return { cov: 0, matched: 0, len: pt.length };
  const matched = pt.filter((t) => qTokens.includes(t)).length;
  return { cov: matched / Math.min(qTokens.length, pt.length), matched, len: pt.length };
}

export function scoreQuery(q, entry, knownTokens = null, df = null) {
  const qn = String(q).toLowerCase().replace(/\s+/g, " ").trim();
  const qTokens = knownTokens && knownTokens.length ? knownTokens : tokens(qn);
  const p = entry.profile || entry;
  const qAll = tokens(qn).length;
  const why = [];
  let score = 0;
  let specificity = 0;

  // negatives: a door's own "does not answer" lines. A negative that names something foreign to the site
  // (an entity outside its own vocabulary) blocks on a single hit; otherwise it needs a real phrase overlap.
  const siteVocab = new Set(tokens(`${entry.name || ""} ${p.punch || ""} ${(p.keywords || []).join(" ")} ${(p.intents || []).join(" ")}`));
  const ownName = new Set(tokens(entry.name || ""));
  // "do not answer X from memory" is a fetch instruction, not a scope limit; links and tool paths are neither
  const usableNeg = (p.negatives || []).filter(
    (n) => !/\b(list|file|feed|index|keywords|column|field|header|row)\b/i.test(n) &&
      !/from memory|https?:\/\/|\.(md|json|txt|xml)\b|skill|openapi|\/v\d\//i.test(n) &&
      // only true scope limits route; "do not invent/guess/improvise" is a how-to-answer rule
      !/\b(invent|guess|improvise|paraphrase|summari[sz]e|fabricate|make up)\b/i.test(n) &&
      /^(do not|don'?t|does not|never|coverage stops|stops at|only covers|not a |not an )/i.test(n.trim())
  );
  for (const neg of usableNeg) {
    const core = neg.toLowerCase().replace(/^(do not|don't|never|not|it does not|does not)\s+/i, "");
    const nt = tokens(core);
    const foreignHit = nt.some((t) => !siteVocab.has(t) && qTokens.includes(t));
    // the concept an origin explicitly rules out ("never a translation", "does not cover X") blocks on its own
    const ex = neg.toLowerCase().match(/(?:never|not|nor)\s+(?:a|an|the)?\s*([a-z][a-z -]{2,40}?)(?:$|[.,;:)]|\s+(?:in|for|of|from)\b)/) || neg.toLowerCase().match(/(?:does not cover|do not cover|not cover|outside (?:the |its |our )?scope of)\s+([a-z][a-z -]{2,40}?)(?:$|[.,;:)])/);
    const excluded = ex ? tokens(ex[1]).filter((t) => !ownName.has(t)) : [];
    const explicitHit = excluded.some((t) => qTokens.includes(t));
    const no = overlap(qTokens, core);
    if ((core.length > 8 && qn.includes(core)) || foreignHit || explicitHit || (no.matched >= 2 && no.cov >= 0.6)) {
      return { score: 0, specificity: 0, why: [`blocked:${neg.slice(0, 50)}`], blocked: true };
    }
  }
  const nameL = String(entry.name || "").toLowerCase();
  const nameToks = tokens(nameL).filter((t) => t.length >= 4);
  if (nameL && (qn.includes(nameL) || (nameL.length > 3 && nameL.includes(qn)))) { score += 8; specificity += 2; why.push("name"); }
  else if (nameToks.some((t) => qTokens.includes(t))) { score += 6; specificity += 2; why.push("name~"); }
  const punchL = String(p.punch || "").toLowerCase();
  if (punchL && (punchL.includes(qn) || qn.includes(punchL))) { score += 5; specificity += 1; why.push("punch"); }
  else if (punchL) { const po = overlap(qTokens, punchL); if (po.matched >= 2 && po.cov >= 0.5) { score += 3; specificity += 1; why.push("punch~"); } }

  let bestIntent = 0;
  for (const intent of p.intents || []) {
    if (intent.length > 3 && (intent.includes(qn) || qn.includes(intent))) { bestIntent = Math.max(bestIntent, 9); why.push(`intent:${intent.slice(0, 40)}`); break; }
    const o = overlap(qTokens, intent);
    // a lone matched token only counts as an intent hit when the query really is that one word
    const hit = (o.matched >= 2 && o.cov >= 0.6) || (qAll === 1 && o.matched === 1 && o.len <= 3);
    if (hit && o.cov * 6 > bestIntent) { bestIntent = o.cov * 6; why.push(`intent~:${intent.slice(0, 40)}`); }
  }
  if (bestIntent) { score += bestIntent; specificity += 1; }

  const kws = p.keywords || [];
  const kwCanon = new Set(kws.flatMap((k) => tokens(k)));
  let kwHits = 0;
  let distinct = 0;
  for (const t of qTokens) if (kwCanon.has(t)) { kwHits += 1; if (t.length >= 4 && df && (df.get(t) || 0) <= 2) distinct += 1; }
  for (const k of kws) if (k.includes(" ") && qn.includes(k)) kwHits += 2;
  if (kwHits) { score += Math.min(kwHits * 2, 8); why.push(`keywords:${kwHits}`); }
  if (distinct) { score += distinct; why.push(`distinct:${distinct}`); }

  const desc = `${p.what_it_is || ""} ${p.serves || ""}`.toLowerCase();
  const dHits = qTokens.filter((t) => t.length > 3 && desc.includes(t)).length;
  if (dHits) { score += Math.min(dHits, 2); why.push(`desc:${dHits}`); }

  return { score: Math.round(score * 10) / 10, specificity, why, blocked: false };
}

// subject tokens: the concrete thing asked about, minus shared value words that many doors carry
const VALUE_WORDS = new Set(["cheap", "cost", "best", "good", "new", "find", "buy", "near", "top", "free", "fast", "online", "today", "now"]);

export function rankQuery(q, rows, base) {
  // tokens no site knows (proper nouns, arbitrary words) are slot fillers: they never count against a match
  const vocab = new Set(rows.flatMap((r) => tokens(`${r.name} ${r.profile.punch || ""} ${(r.profile.keywords || []).join(" ")} ${(r.profile.intents || []).join(" ")}`)));
  const allTokens = tokens(q);
  const known = tokens(q).filter((t) => vocab.has(t));
  const df = new Map();
  for (const r of rows) for (const t of new Set(tokens(`${r.name} ${r.profile.punch || ""} ${(r.profile.keywords || []).join(" ")}`))) df.set(t, (df.get(t) || 0) + 1);
  const scored = rows.map((r) => {
    const s = scoreQuery(q, r, known, df);
    return { n: r.n, name: r.name, live: r.url, fetch: `${base}/${r.n}`, fetch_md: `${base}/${r.n}.md`, punch: r.profile.punch, score: s.score, specificity: s.specificity, why: s.why, blocked: s.blocked, catchall: !!r.profile.catchall, updated_at: r.updated_at || "" };
  });
  // subject test: if the query carries a concrete subject some door owns, doors that own none of it
  // lose their value-word advantage (so "cheapest iphone" cannot be won on "cheapest" alone)
  const subject = known.filter((t) => !VALUE_WORDS.has(t));
  if (subject.length) {
    // ownership counts distinct subject tokens a door knows; a door that knows more of the subject wins
    const owns = (r) => {
      const v = new Set(tokens(`${r.name} ${r.profile.punch || ""} ${(r.profile.keywords || []).join(" ")} ${(r.profile.intents || []).join(" ")}`));
      return subject.filter((t) => v.has(t)).length;
    };
    const ownership = new Map(rows.map((r) => [r.n, owns(r)]));
    const best = Math.max(...ownership.values());
    if (best > 0) {
      for (const m of scored) {
        const mine = ownership.get(m.n) || 0;
        if (mine < best) { m.score = Math.round((m.score - 3 * (best - mine)) * 10) / 10; m.why.push(`subject:${mine}/${best}`); }
        else { m.score = Math.round((m.score + 2 * mine) * 10) / 10; m.specificity += 1; m.why.push(`subject:${mine}/${best}`); }
      }
    }
  }
  const blocked = scored.filter((m) => m.blocked).map((m) => m.name);
  // strong evidence: a full name/punch/intent hit, or several keyword hits.
  // a single leftover token (name fragment or one keyword) never wins on its own.
  const strong = (m) => {
    const w = m.why;
    const solid = w.some((x) => x === "name" || x === "punch" || x.startsWith("intent"));
    if (solid) return true;
    const kw = Number((w.find((x) => x.startsWith("keywords:")) || "keywords:0").split(":")[1]);
    const dist = Number((w.find((x) => x.startsWith("distinct:")) || "distinct:0").split(":")[1]);
    const nameFrag = w.includes("name~") || w.includes("punch~");
    if (kw >= 3) return true;
    // a one-word query IS its subject: a distinctive keyword hit is enough ("earthquake")
    if (dist >= 1 && allTokens.length === 1) return true;
    // otherwise two independent signals are needed when nothing solid matched
    return (nameFrag && kw >= 2) || (dist >= 1 && kw >= 2) || (nameFrag && dist >= 1 && known.length >= 2);
  };
  let pool = scored.filter((m) => !m.blocked && m.score >= 3 && m.why.length && strong(m));
  const nonCatch = pool.filter((m) => !m.catchall);
  if (nonCatch.length) {
    const cap = Math.max(...nonCatch.map((m) => m.score)) - 1;
    pool = pool.map((m) => (m.catchall ? { ...m, score: Math.min(m.score, cap) } : m));
  }
  pool.sort((a, b) => b.score - a.score || b.specificity - a.specificity || (a.catchall === b.catchall ? 0 : a.catchall ? 1 : -1) || (b.updated_at > a.updated_at ? 1 : -1));
  return { ranked: pool.slice(0, 5).map(({ blocked: _b, catchall: _c, updated_at: _u, ...m }) => m), blocked };
}

async function recordGap(env, q) {
  const key = q.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  await run(env, `INSERT INTO gaps (q, count, last_at) VALUES (?, 1, ?) ON CONFLICT(q) DO UPDATE SET count = count + 1, last_at = excluded.last_at`, key, nowIso()).catch(() => null);
}

export async function listGaps(env, limit = 100) {
  await ensureTables(env);
  return all(env, "SELECT * FROM gaps ORDER BY count DESC, last_at DESC LIMIT ?", limit);
}

export async function handleAtlas(path, url, env) {
  const base = baseUrl(env);
  const md = (body) => new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" } });
  const js = (body, extra = {}) => new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", ...extra } });

  if (path === "/atlas.json") return js(buildAtlasJson(await atlasRows(env), base), { "cache-control": "public, max-age=300" });
  if (path === "/atlas.md" || path === "/atlas.txt") return md(buildAtlasMd(await atlasRows(env), base));
  const doorMd = path.match(/^\/(\d+)\.md$/);
  if (doorMd) {
    const rows = await atlasRows(env);
    const row = rows.find((r) => r.n === Number(doorMd[1]));
    if (!row) return js({ ok: false, error: "no door at that number" }, {});
    return md(buildDoorMd(row, base));
  }
  if (path === "/match") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return js({ ok: true, usage: `${base}/match?q=your search term`, atlas: `${base}/atlas.json`, rules: `${base}/atlas.md#match-rules` });
    const rows = await atlasRows(env);
    const { ranked, blocked } = rankQuery(q, rows, base);
    if (!ranked.length) await recordGap(env, q);
    return js(
      { ok: true, q, best: ranked[0] || null, matches: ranked, blocked, note: ranked.length ? "Fetch the live URL. Cite the live site." : "No door answers this; fetch the hub and browse doors.", hub: `${base}/` },
      { "cache-control": "public, max-age=60" }
    );
  }
  return null;
}
