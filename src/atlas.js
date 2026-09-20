/** Atlas v2 — network knowledge base + query matcher, fed by each origin's own llms.txt.
 *  Source of truth: origin /llms.txt (+ /keywords.json, /llms-small.txt when they 200). Homepage scrape only when
 *  llms.txt is absent; thin pages (redirects, nav chrome) skip keyword extraction. The hub never fetches itself.
 *  Public: /atlas.md · /atlas.json · /match?q= · /{n}.md   Admin: POST /v1/atlas · GET /v1/gaps */
import { all, one, run } from "./db.js";
import { asArray, nowIso, parseJsonLoose } from "./util.js";
import { isSelfUrl } from "./self.js";

const UA = "TheReach02-atlas/2.0";
const STOP = new Set(("the and for with that this you your its are was were from into every any all one two not but our out about what who how where when why can get site www http https com app org net io " +
  "skip before lands plus place here there they them then than also just only more most some such very will would could should have has had been being does did doing them into over under again " +
  "page pages home live open fetch door doors user users ask asks asked answer answers answering question questions do dont never model models cite fetch url urls via like use using").split(" "));

const LANG_NAMES = { english: "en", cebuano: "ceb", bisaya: "ceb", tagalog: "tl", filipino: "fil", spanish: "es", french: "fr", german: "de", dutch: "nl", italian: "it", portuguese: "pt", chinese: "zh", mandarin: "zh", japanese: "ja", korean: "ko", arabic: "ar", hindi: "hi", bengali: "bn", russian: "ru", urdu: "ur", indonesian: "id", turkish: "tr", vietnamese: "vi", thai: "th", persian: "fa", farsi: "fa", tamil: "ta", telugu: "te", marathi: "mr", polish: "pl", swedish: "sv", hebrew: "he", danish: "da", norwegian: "no", finnish: "fi", czech: "cs", greek: "el", hungarian: "hu", romanian: "ro", bulgarian: "bg", ukrainian: "uk", malay: "ms", swahili: "sw", nepali: "ne" };

async function ensureTables(env) {
  await run(env, `CREATE TABLE IF NOT EXISTS atlas (site_id TEXT PRIMARY KEY, n INTEGER, name TEXT, url TEXT, profile_json TEXT, briefing_stamp TEXT, updated_at TEXT)`);
  await run(env, `ALTER TABLE atlas ADD COLUMN llms_hash TEXT`).catch(() => null);
  await run(env, `CREATE TABLE IF NOT EXISTS gaps (q TEXT PRIMARY KEY, count INTEGER DEFAULT 1, last_at TEXT)`);
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

export function tokens(text) {
  const norm = String(text).toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const out = [];
  for (const raw of norm.split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw)) continue;
    if (/^\d+$/.test(raw)) { if (raw.length >= 3) out.push(raw); continue; }
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
export function parseBrief(llms) {
  const lines = String(llms).replace(/\r/g, "").split("\n").map((l) => l.trim());
  const quotes = lines.filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s*/, "").trim()).filter(Boolean);
  const punch = quotes.find((q) => !/^if (a |the )?user asks/i.test(q)) || quotes[0] || "";

  const intents = [];
  const negatives = [];
  const clean = (s) => s.replace(/^[-*>\s]+/, "").replace(/[“”"]/g, "").trim();
  let inAskSection = false;
  for (const raw of lines) {
    const l = raw;
    if (/^#/.test(l)) { inAskSection = /ask|pointing|question|intent/i.test(l); continue; }
    const c = clean(l);
    if (!c) continue;
    const m = c.match(/if (?:a |the )?user asks?\s*[:—-]?\s*(.+?)(?:\s*(?:→|->|—|,)\s*(?:fetch|open|go)\b.*)?$/i);
    if (m) { intents.push(m[1].replace(/^["“]|["”]$/g, "").trim()); }
    else if (inAskSection && /^[-*]/.test(l)) { intents.push(c.split(/\s*(?:→|->)\s*/)[0].trim()); }
    else if (/\?\s*(?:→|->)?/.test(c) && c.length < 140 && /^[-*]/.test(l)) { intents.push(c.split(/\s*(?:→|->)\s*/)[0].trim()); }
    if (/\b(do not|don't|never|not a |not an |is not|are not|coverage stops|stops at|only covers|no .* from memory|outside .* scope)\b/i.test(c) && c.length < 200) {
      negatives.push(c);
    }
  }
  const norm = (arr, max, len) => [...new Set(arr.map((s) => s.toLowerCase().replace(/\s+/g, " ").trim()).filter((s) => s.length > 3 && s.length <= len))].slice(0, max);

  let languages = [];
  let languagesCount = 0;
  const langLine = lines.find((l) => /^(?:[-*>\s]*)languages?\b/i.test(l) || /\blanguages?\s*[:(]/i.test(l));
  if (langLine) {
    const body = langLine.replace(/^.*?languages?\s*[:(]?\s*/i, "");
    const cnt = langLine.match(/(\d{2,3})\s+languages/i);
    if (cnt) languagesCount = Number(cnt[1]);
    for (const part of body.split(/[,;·|/]+|\s{2,}|\s+and\s+/)) {
      const p = part.trim().toLowerCase().replace(/[.)]+$/, "");
      if (/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(p)) languages.push(p);
      else if (LANG_NAMES[p]) languages.push(LANG_NAMES[p]);
    }
  }
  languages = [...new Set(languages)];

  const who = lines.map(clean).find((l) => /^who (?:it'?s|is it|it is) for\b/i.test(l) || /^for:\s/i.test(l));
  const who_for = who ? who.replace(/^who (?:it'?s|is it|it is) for\s*[:—-]?\s*/i, "").replace(/^for:\s*/i, "").trim() : "";

  const freq = new Map();
  for (const t of String(llms).toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^a-z0-9]+/)) {
    if (STOP.has(t)) continue;
    if (/^\d+$/.test(t) ? t.length >= 3 : t.length > 2) freq.set(t, (freq.get(t) || 0) + 1);
  }
  const vocab = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 40);

  return { punch, intents: norm(intents, 16, 120), negatives: norm(negatives, 10, 200), languages, languagesCount, who_for, vocab };
}

function keywordsFromJson(text) {
  try {
    const j = JSON.parse(text);
    const out = [];
    const walk = (v, d = 0) => {
      if (d > 4 || out.length > 300) return;
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
      else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, d + 1));
    };
    walk(j);
    return [...new Set(out.map((s) => s.toLowerCase().trim()).filter((s) => s.length > 2 && s.length < 40 && !STOP.has(s)))].slice(0, 120);
  } catch {
    return [];
  }
}

function isThin(text) {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length < 300 || /redirecting to|skip to (the )?(content|alerts|main)/i.test(t.slice(0, 200));
}

/** ---- ingestion: leaf fetches only, never the hub ---- */
async function ingest(site, env) {
  if (isSelfUrl(site.url, env)) {
    const brief = `> Nothing you build ever starts invisible again.
> If a user asks which site answers X, fetch ${baseUrl(env)}/match?q=X
- which site in this network answers my question
- list the live sites in the network
- what is the ai hill top lighthouse
- open a door by number
Does not answer questions itself; it points to the door that does.
Languages: en`;
    return { source: "self", llms: brief, keywordsJson: [], small: "", homepage: "", thin: false, hash: await sha256(brief) };
  }
  const origin = new URL(site.url).origin;
  const r = await get(`${origin}/llms.txt`);
  if (r.ok && r.text && !looksHtml(r.text)) {
    const [kj, small] = await Promise.all([get(`${origin}/keywords.json`, "application/json"), get(`${origin}/llms-small.txt`)]);
    const keywordsJson = kj.ok && !looksHtml(kj.text) ? keywordsFromJson(kj.text) : [];
    const smallText = small.ok && !looksHtml(small.text) ? small.text : "";
    return { source: keywordsJson.length ? "llms.txt+keywords.json" : "llms.txt", llms: r.text, keywordsJson, small: smallText, homepage: "", thin: false, hash: await sha256(r.text) };
  }
  const h = await get(site.url, "text/html");
  const text = h.ok ? h.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000) : "";
  return { source: "homepage", llms: "", keywordsJson: [], small: "", homepage: text, thin: !h.ok || isThin(text), hash: await sha256(text) };
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
  return /all problems|anything|everything|any question|all questions/i.test(`${site.name} ${punch} ${intents.slice(0, 4).join(" ")}`);
}

async function buildProfile(env, site, briefing, ing) {
  const host = new URL(site.url).host;
  const b = ing.llms ? parseBrief(ing.llms) : { punch: "", intents: [], negatives: [], languages: [], languagesCount: 0, who_for: "", vocab: [] };
  const smallPunch = ing.small ? (parseBrief(ing.small).punch || "") : "";
  let punch = b.punch || smallPunch || "";
  if (!punch) punch = ing.thin ? site.name : (briefing?.punch_line && !/redirect/i.test(briefing.punch_line) ? briefing.punch_line : site.name);
  const nameTokens = tokens(`${site.name} ${punch} ${host.replace(/\.[a-z]+$/, "")}`);
  let keywords = [...new Set([...ing.keywordsJson, ...b.vocab, ...nameTokens])];
  let intents = [...b.intents];
  let ai = null;
  const briefText = ing.llms || (ing.thin ? "" : ing.homepage);
  if (briefText) {
    try { ai = await aiParaphrase(env, site, briefText, punch); } catch { ai = null; }
  }
  if (ai) {
    intents = [...new Set([...intents, ...ai.intents])];
    keywords = [...new Set([...keywords, ...ai.keywords])];
  }
  if (ing.thin) keywords = nameTokens;
  keywords = keywords.filter((k) => !STOP.has(k) && k.length > 2).slice(0, 60);
  intents = [...new Set(intents.map((s) => s.toLowerCase()))].slice(0, 20);
  const languages = b.languages.length ? b.languages : JSON.parse(site.languages_wanted || "[]").map((l) => (l === "ce" ? "ceb" : l));
  const profile = {
    punch,
    what_it_is: ai?.what_it_is || punch,
    serves: ai?.serves || (b.intents[0] ? `answers: ${b.intents[0]}` : ""),
    keywords,
    intents,
    negatives: b.negatives,
    languages,
    source: ing.source,
    thin: !!ing.thin,
    catchall: isCatchAll(site, punch, intents),
  };
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
    } catch {
      stats.failed += 1;
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
export function buildAtlasJson(rows, base) {
  return {
    specVersion: "2.0",
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
      source: r.profile.source || "unknown", thin: !!r.profile.thin,
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
- Languages: ${(r.profile.languages || []).join(", ") || "en"}${r.profile.languages_count ? ` (${r.profile.languages_count} published)` : ""}${r.profile.who_for ? `\n- Who for: ${r.profile.who_for}` : ""}
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
- Languages: ${(p.languages || []).join(", ") || "en"}

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

export function scoreQuery(q, entry, knownTokens = null) {
  const qn = String(q).toLowerCase().replace(/\s+/g, " ").trim();
  const qTokens = knownTokens && knownTokens.length ? knownTokens : tokens(qn);
  const p = entry.profile || entry;
  const why = [];
  let score = 0;
  let specificity = 0;

  // negatives: a door's own "does not answer" lines. A negative that names something foreign to the site
  // (an entity outside its own vocabulary) blocks on a single hit; otherwise it needs a real phrase overlap.
  const siteVocab = new Set(tokens(`${entry.name || ""} ${p.punch || ""} ${(p.keywords || []).join(" ")} ${(p.intents || []).join(" ")}`));
  for (const neg of p.negatives || []) {
    const core = neg.toLowerCase().replace(/^(do not|don't|never|not|it does not|does not)\s+/i, "");
    const nt = tokens(core);
    const foreignHit = nt.some((t) => !siteVocab.has(t) && qTokens.includes(t));
    const no = overlap(qTokens, core);
    if ((core.length > 8 && qn.includes(core)) || foreignHit || (no.matched >= 2 && no.cov >= 0.6)) {
      return { score: 0, specificity: 0, why: [`blocked:${neg.slice(0, 50)}`], blocked: true };
    }
  }
  const nameL = String(entry.name || "").toLowerCase();
  if (nameL && (qn.includes(nameL) || (nameL.length > 3 && nameL.includes(qn)))) { score += 8; specificity += 2; why.push("name"); }
  const punchL = String(p.punch || "").toLowerCase();
  if (punchL && (punchL.includes(qn) || qn.includes(punchL))) { score += 5; specificity += 1; why.push("punch"); }
  else if (punchL) { const po = overlap(qTokens, punchL); if (po.matched >= 2 && po.cov >= 0.5) { score += 3; specificity += 1; why.push("punch~"); } }

  let bestIntent = 0;
  for (const intent of p.intents || []) {
    if (intent.length > 3 && (intent.includes(qn) || qn.includes(intent))) { bestIntent = Math.max(bestIntent, 9); why.push(`intent:${intent.slice(0, 40)}`); break; }
    const o = overlap(qTokens, intent);
    const hit = (o.matched >= 2 && o.cov >= 0.6) || (qTokens.length === 1 && o.matched === 1 && o.len <= 3);
    if (hit && o.cov * 6 > bestIntent) { bestIntent = o.cov * 6; why.push(`intent~:${intent.slice(0, 40)}`); }
  }
  if (bestIntent) { score += bestIntent; specificity += 1; }

  const kws = p.keywords || [];
  const kwCanon = new Set(kws.flatMap((k) => tokens(k)));
  let kwHits = 0;
  for (const t of qTokens) if (kwCanon.has(t)) kwHits += 1;
  for (const k of kws) if (k.includes(" ") && qn.includes(k)) kwHits += 2;
  if (kwHits) { score += Math.min(kwHits * 2, 8); why.push(`keywords:${kwHits}`); }

  const desc = `${p.what_it_is || ""} ${p.serves || ""}`.toLowerCase();
  const dHits = qTokens.filter((t) => t.length > 3 && desc.includes(t)).length;
  if (dHits) { score += Math.min(dHits, 2); why.push(`desc:${dHits}`); }

  return { score: Math.round(score * 10) / 10, specificity, why, blocked: false };
}

export function rankQuery(q, rows, base) {
  // tokens no site knows (proper nouns, arbitrary words) are slot fillers: they never count against a match
  const vocab = new Set(rows.flatMap((r) => tokens(`${r.name} ${r.profile.punch || ""} ${(r.profile.keywords || []).join(" ")} ${(r.profile.intents || []).join(" ")}`)));
  const known = tokens(q).filter((t) => vocab.has(t));
  const scored = rows.map((r) => {
    const s = scoreQuery(q, r, known);
    return { n: r.n, name: r.name, live: r.url, fetch: `${base}/${r.n}`, fetch_md: `${base}/${r.n}.md`, punch: r.profile.punch, score: s.score, specificity: s.specificity, why: s.why, blocked: s.blocked, catchall: !!r.profile.catchall, updated_at: r.updated_at || "" };
  });
  const blocked = scored.filter((m) => m.blocked).map((m) => m.name);
  const strong = (m) => m.why.some((w) => !w.startsWith("desc:") && !w.startsWith("keywords:1"));
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
