import {
  SITE_NAME,
  SITE_ALT,
  TAGLINE,
  REPO,
  esc,
  jsonForScript,
  headMeta,
  homeQuestion,
  homeTitle,
  homeAnswer,
  metaDescription,
  homeDate,
  doorHeadline,
  hostOf,
  safeUrl,
  keywordsJson,
  structureJson,
} from "./seo.js";
import { jsonLdHill } from "./announce.js";
import { all as dbAll, one as dbOne, run as dbRun } from "./db.js";
import { ensureCaptureColumns } from "./capture.js";
import { confidenceOf, doorStatusMap, livenessFields } from "./liveness.js";
import { isSelfUrl } from "./self.js";
import { repairMojibake } from "./util.js";

const BASE = "https://reach2.aplusz.app";

export function publicBase(env) {
  return String(env?.REACH_PUBLIC_URL || BASE).replace(/\/+$/, "");
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text || "") ?? fallback;
  } catch {
    return fallback;
  }
}

function normLang(l) {
  const v = String(l || "").trim().toLowerCase();
  return v === "ce" ? "ceb" : v;
}

/* ---------- permanent door numbers (CONTRACT.md rank 4) ----------
   door_n is permanent and never reused. The first call backfills every row that has none: active rows first in
   created_at, rowid order (exactly the positional numbering the hub served before door_n existed), then inactive
   rows. Every row inserted later gets MAX(door_n)+1 over ALL rows. A deactivated door keeps its number, which then
   answers 410 Gone (doorNumberState 'gone'); its neighbours never move. */
let doorNumbersReady = false;

/** Idempotent; after the first call per isolate it costs one indexed query (rows still lacking a number). Called by
 *  numberedSites and right after every INSERT INTO sites (POST /v1/sites, paid.js addSite). */
export async function ensureDoorNumbers(env) {
  if (!doorNumbersReady) {
    await ensureCaptureColumns(env); // adds door_n (and the other capture columns) to an older sites table
    await dbRun(env, "CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_door_n ON sites(door_n)").catch(() => null);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const pending = await dbAll(env, "SELECT id FROM sites WHERE door_n IS NULL ORDER BY active DESC, created_at ASC, rowid ASC");
    if (!pending.length) break;
    const top = await dbOne(env, "SELECT COALESCE(MAX(door_n), 0) AS m FROM sites");
    let next = Number(top?.m || 0);
    /* `AND door_n IS NULL`: a row another isolate numbered meanwhile is left alone; a number another isolate took
       meanwhile trips the unique index and the whole batch is read again */
    const stmts = pending.map((r) => env.DB.prepare("UPDATE sites SET door_n = ? WHERE id = ? AND door_n IS NULL").bind(++next, r.id));
    try {
      await env.DB.batch(stmts);
      break;
    } catch {
      /* raced: read again */
    }
  }
  doorNumbersReady = true;
}

/** 'active' (a live door), 'gone' (the number belonged to a door that was deactivated: 410) or 'none' (never
 *  issued: 404). */
export async function doorNumberState(env, n) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1) return "none";
  try {
    if (!doorNumbersReady) await ensureDoorNumbers(env);
    const row = await dbOne(env, "SELECT active FROM sites WHERE door_n = ?", k);
    if (!row) return "none";
    return Number(row.active) === 1 ? "active" : "gone";
  } catch {
    return "none";
  }
}

/* ---------- slot helpers: each door fact is computed here once ---------- */

const LANG_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
const codesOf = (list) => [...new Set((Array.isArray(list) ? list : []).map(normLang).filter((c) => LANG_CODE.test(c)))];

/** The origin's localized pages as captured (i18n_json), only entries whose URL passes safeUrl. */
function localizedOf(i18n) {
  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) return [];
  const out = [];
  for (const [code, v] of Object.entries(i18n)) {
    if (!v || typeof v !== "object") continue;
    const lang = normLang(code);
    const url = safeUrl(v.url);
    if (!url || !LANG_CODE.test(lang)) continue;
    const title = repairMojibake(String(v.title || "")).replace(/\s+/g, " ").trim();
    const description = repairMojibake(String(v.description || "")).replace(/\s+/g, " ").trim();
    out.push({ lang, url, ...(title ? { title } : {}), ...(description ? { description } : {}) });
  }
  return out.sort((a, b) => a.lang.localeCompare(b.lang));
}

/** How many languages the site says it has: the atlas count (the origin's llms.txt), else the first "N languages" in
 *  the origin's own description. null when it says nothing. */
function languagesDeclaredOf(atlas, description) {
  const c = Number(atlas?.languages_count);
  if (Number.isFinite(c) && c > 0) return Math.trunc(c);
  const m = String(description || "").match(/(\d+)\s+languages/i);
  const k = m ? Number(m[1]) : 0;
  return k > 0 ? k : null;
}

/** Whether the atlas profile was built from the site as it stands now. rebuildAtlas (atlas.js) stamps every profile
 *  with the site's `briefing.updated_at || site.updated_at` (atlas.briefing_stamp) and rebuilds it once that stamp
 *  moves (the six-hourly cron). The wish list never changes without moving it: briefing.js refreshBriefing writes
 *  languages_wanted together with briefings.updated_at and sites.updated_at (one timestamp), and the only other
 *  writers are the INSERTs of a new site, which has no profile yet. A profile whose stamp differs was built before
 *  the wish list last changed. rebuildAtlas has always written the stamp; a row without one (not written by it)
 *  carries no evidence either way and is judged by the other tests alone. */
function atlasIsCurrent(row) {
  const stamp = row?.atlas_briefing_stamp;
  if (stamp === null || stamp === undefined) return true;
  return String(stamp) === String(row.briefing_updated_at || row.updated_at || "");
}

/** The atlas codes that can have come from the origin. atlas.js (buildProfile) stores the site's wish list
 *  (languages_wanted, as it stood when the profile was built) under profile.languages whenever the origin's llms.txt
 *  names no codes, so an atlas list counts as verified only when it is none of the shapes that fallback produces: a
 *  profile not read from the origin's own brief (source "homepage" or "self", or a thin profile) holds nothing but
 *  the fallback; a profile built before the wish list last changed (`current` false, atlasIsCurrent) may hold the
 *  PREVIOUS wish list, which no comparison with today's list can recognise, so its list waits for the rebuild; and a
 *  list that is exactly today's wish list again (as a set) cannot be told apart from it. An atlas that keeps the wish
 *  list apart (profile.languages_wanted) no longer mixes it into profile.languages: its list is then the origin's own
 *  and is taken as it stands, however old the profile. */
function atlasLanguagesOf(atlas, wanted, current) {
  const codes = codesOf(atlas?.languages);
  if (!codes.length) return [];
  const source = typeof atlas?.source === "string" ? atlas.source : "";
  if (atlas?.thin === true || source === "homepage" || source === "self") return [];
  if (Array.isArray(atlas?.languages_wanted)) return codes;
  if (current !== true) return [];
  const wish = codesOf(wanted);
  if (wish.length === codes.length && wish.every((c) => codes.includes(c))) return [];
  return codes;
}

/** VERIFIED language codes only: the atlas codes the origin published (atlasLanguagesOf), the captured hreflang /
 *  <html lang> codes and the localized pages that answered. The wish list (languages_wanted) only when it is the sole
 *  source and the site declares no larger count; otherwise the list stays as verified as it is (possibly empty) and
 *  languages_declared carries the claim. */
function languagesOf(atlas, capture, localized, wanted, declared, atlasCurrent) {
  const verified = codesOf([
    ...atlasLanguagesOf(atlas, wanted, atlasCurrent),
    ...(Array.isArray(capture?.languages) ? capture.languages : []),
    ...localized.map((l) => l.lang),
  ]);
  if (verified.length) return verified;
  const wish = codesOf(wanted);
  if (wish.length && (declared === null || declared <= wish.length)) return wish;
  return [];
}

function sameAsOf(text) {
  const list = parseJson(text, []);
  return Array.isArray(list) ? [...new Set(list.map((u) => safeUrl(u)).filter((u) => /^https:\/\//i.test(u)))] : [];
}

function linksToHubOf(text) {
  const o = parseJson(text, null);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const present = o.present === true;
  return { present, url: present ? safeUrl(o.url) : "", checked_at: typeof o.checked_at === "string" ? o.checked_at : null };
}

/** THE resolver: every surface (HTML page, Markdown twin, JSON record, /sites.json, llms.txt, feeds, /match, MCP, A2A)
 *  reads these slot fields and nothing else (CONTRACT.md "The slot").
 *  Active doors only, ordered by their permanent number; slot.n = door_n. Carries the full capture record, the atlas
 *  facts (the origin's own question lines, negatives, keywords), liveness from door_status (src/liveness.js), the
 *  honest-capture attempt fields, the confidence (confidenceOf), the verified languages beside the declared count,
 *  the origin's verified sameAs, its link back to the hub and its localized pages. */
export async function numberedSites(env, allFn) {
  const query = allFn || dbAll;
  if (!doorNumbersReady) await ensureDoorNumbers(env).catch(() => null);
  const where = `WHERE s.active = 1 ORDER BY s.door_n ASC`;
  const tries = [
    `SELECT s.*, b.punch_line, b.summary, b.who_for, b.updated_at AS briefing_updated_at, a.profile_json, a.briefing_stamp AS atlas_briefing_stamp, w.qid AS wikidata_qid
     FROM sites s LEFT JOIN briefings b ON b.site_id = s.id LEFT JOIN atlas a ON a.site_id = s.id LEFT JOIN wikidata w ON w.site_id = s.id ${where}`,
    `SELECT s.*, b.punch_line, b.summary, b.who_for, w.qid AS wikidata_qid
     FROM sites s LEFT JOIN briefings b ON b.site_id = s.id LEFT JOIN wikidata w ON w.site_id = s.id ${where}`,
    `SELECT s.*, b.punch_line, b.summary, b.who_for, b.updated_at AS briefing_updated_at, a.profile_json, a.briefing_stamp AS atlas_briefing_stamp
     FROM sites s LEFT JOIN briefings b ON b.site_id = s.id LEFT JOIN atlas a ON a.site_id = s.id ${where}`,
    `SELECT s.*, b.punch_line, b.summary, b.who_for
     FROM sites s LEFT JOIN briefings b ON b.site_id = s.id ${where}`,
  ];
  const load = async () => {
    for (const sql of tries) {
      try { return await query(env, sql); } catch { /* next shape */ }
    }
    return [];
  };
  let rows = await load();
  // a row inserted since this isolate last numbered (another isolate, a raw insert): number it, then read again
  if (rows.some((r) => r.door_n === null || r.door_n === undefined)) {
    await ensureDoorNumbers(env).catch(() => null);
    rows = await load();
  }
  const status = await doorStatusMap(env);
  const base = publicBase(env);
  return rows
    .filter((s) => Number.isInteger(Number(s.door_n)) && Number(s.door_n) > 0) // never a door without its number
    .map((s) => {
      const n = Number(s.door_n);
      const atlas = parseJson(s.profile_json, {}) || {};
      const wanted = parseJson(s.languages_wanted, []);
      const capture = parseJson(s.capture_json, {}) || {};
      const localized = localizedOf(parseJson(s.i18n_json, {}));
      const description = repairMojibake(s.description || "");
      const declared = languagesDeclaredOf(atlas, description);
      const langs = languagesOf(atlas, capture, localized, wanted, declared, atlasIsCurrent(s));
      const self = isSelfUrl(s.url, env);
      const slot = {
        n,
        hash: `${base}/#${n}`,
        path: `${base}/${n}`,
        id: s.id,
        name: s.name,
        url: s.url,
        self,
        punch: atlas.punch || s.punch_line || s.name,
        summary: s.summary || "",
        who_for: atlas.who_for || s.who_for || "",
        what_it_is: atlas.what_it_is || "",
        intents: Array.isArray(atlas.intents) ? atlas.intents.filter((x) => typeof x === "string") : [],
        // the origin's OWN question lines (never paraphrases, never seeds); [] until the atlas publishes them
        asks: strings(atlas.declared_questions),
        negatives: strings(atlas.negatives),
        serves: typeof atlas.serves === "string" ? atlas.serves : "",
        keywords: strings(atlas.keywords).slice(0, 30),
        languages: langs,
        languages_count: langs.length,
        languages_declared: declared,
        indexnow_key: s.indexnow_key || "",
        description,
        sitemap_url: s.sitemap_url || "",
        llms_url: s.llms_url || "",
        og_image: s.og_image || "",
        jsonld_types: s.jsonld_types || "[]",
        feed_url: s.feed_url || "",
        capture_json: s.capture_json || "{}",
        i18n_json: s.i18n_json || "{}",
        localized,
        same_as: sameAsOf(s.same_as_json),
        links_to_hub: linksToHubOf(s.links_to_hub_json),
        captured_at: s.captured_at || "",
        created_at: s.created_at || "",
        updated_at: s.updated_at || "",
        checked_at: s.checked_at || "",
        stale_since: s.stale_since || "",
        attempt_status: s.attempt_status === null || s.attempt_status === undefined || s.attempt_status === "" ? null : Number(s.attempt_status),
        wikidata_qid: s.wikidata_qid || "",
        // status, http_status, last_verified, last_ok_at, closed_since, degraded, key_ok (+ status_source)
        ...livenessFields(status.get(s.id), self),
      };
      slot.confidence = confidenceOf(slot);
      slot.question = doorHeadline(slot);
      return slot;
    });
}

/** /seo/keywords.json and /seo/structure.json (served by index.js): the grammar with the live count and origin filled in. */
export function seoKeywordsJson(env, slots = []) {
  return keywordsJson(slots, publicBase(env));
}
export function seoStructureJson(env, slots = []) {
  return structureJson(slots, publicBase(env));
}

function graphDate(graph) {
  const nodes = graph && Array.isArray(graph["@graph"]) ? graph["@graph"] : [];
  const page = nodes.find((x) => x && x["@type"] === "WebPage");
  return page && typeof page.dateModified === "string" ? page.dateModified : "";
}

/** The first paragraph, with the one URL in it as a real link. */
function answerHtml(answer, base) {
  const match = `${base}/match?q=your+question`;
  const i = answer.indexOf(match);
  if (i < 0) return esc(answer);
  return `${esc(answer.slice(0, i))}<a href="${esc(match)}">${esc(match)}</a>${esc(answer.slice(i + match.length))}`;
}

/** Search-engine ownership metas from the owner's Worker vars (Google Search Console, Bing Webmaster Tools); an
 *  unset or malformed var prints nothing. */
function verifyMetas(env) {
  const g = String(env?.GOOGLE_SITE_VERIFICATION || "").trim();
  const b = String(env?.BING_SITE_AUTH || "").trim();
  return (/^[A-Za-z0-9_-]{8,128}$/.test(g) ? `\n  <meta name="google-site-verification" content="${g}">` : "") + (/^[A-Za-z0-9]{8,64}$/.test(b) ? `\n  <meta name="msvalidate.01" content="${b}">` : "");
}

/** The hub home page, server-rendered: every door is a real <a href="/{n}"> in <main> before any script runs.
 *  The list is the page, with or without JS: each door's question is the visible anchor text of its link. `graph` (jsonLdHill) and `publicMap` (the reach_map
 *  row) are optional; the visible date is read back from the graph so it always equals WebPage.dateModified. */
export function hillHtml(slots, graph = null, env = undefined, publicMap = null) {
  const base = publicBase(env);
  /* the hub's own door is the page itself: it is not one of "these sites" */
  const doors = slots.filter((s) => !s.self);
  const closed = doors.filter((s) => s.status === "closed");
  const count = doors.length - closed.length;
  const question = homeQuestion(count);
  const answer = homeAnswer(count, base, { closed: closed.length, live: doors.filter((s) => s.status === "live").length });
  const g = graph || jsonLdHill(slots, env, publicMap);
  const date = graphDate(g) || homeDate(slots, publicMap);
  const items = doors
    .map((s) => {
      const live = safeUrl(s.url);
      const host = esc(hostOf(s.url));
      /* the site's own image as a 24 px thumbnail (decoration); doors whose origin declares none get nothing */
      const image = safeUrl(s.og_image);
      const th = image ? `<img class="th" src="${esc(image)}" alt="" width="24" height="24" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
      const shut = s.status === "closed" ? ` <span class="closed">(closed since ${esc(String(s.closed_since || "").slice(0, 10))})</span>` : "";
      return `      <li id="door-${s.n}">${th}<a href="/${s.n}">${esc(s.question || doorHeadline(s))}</a> - ${live ? `<a href="${esc(live)}">${host}</a>` : host}${shut}</li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headMeta({
    title: homeTitle(count),
    description: metaDescription(answer),
    canonical: `${base}/`,
    base,
    type: "website",
    mdUrl: `${base}/index.md`,
    jsonUrl: `${base}/sites.json`,
  })}
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0f1a12">${verifyMetas(env)}
  <link rel="icon" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/icon-192.png">
  <link rel="alternate" type="text/markdown" href="/llms.txt">
  <link rel="alternate" type="text/markdown" href="/atlas.md">
  <link rel="alternate" type="application/json" href="/atlas.json">
  <link rel="alternate" type="application/json" href="/catalog.json">
  <link rel="alternate" type="application/feed+json" href="/feed.json">
  <script type="application/ld+json">${jsonForScript(g)}</script>
  <style>
    body{margin:0;font:16px/1.45 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem}
    a{color:#8dff9a}
    h1{margin:0 0 .6rem;font-size:1.5rem;text-align:center}
    .lead{margin:.2rem 0 .6rem}
    .meta{color:#9bb89a;font-size:.9rem;margin:0 0 1.2rem;text-align:center}
    .tag{color:#9bb89a;margin:.2rem 0 1rem;text-align:center}
    .doors{padding-left:1.4rem;line-height:1.7}
    .doors li{overflow-wrap:anywhere}
    img.th{width:24px;height:24px;object-fit:cover;border-radius:5px;vertical-align:-6px;margin-right:.45rem;border:1px solid #2d5a34;background:#15241a}
    .closed{color:#d9a35c;font-size:.85rem}
    .n{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#8dff9a}
    .btn{display:inline-block;padding:.7rem 1.1rem;border-radius:12px;background:#8dff9a;color:#0f1a12;font-weight:700;text-decoration:none;border:0;font-size:1rem;cursor:pointer}
    .foot{margin-top:2.5rem;padding:1.2rem 0;display:flex;justify-content:center;align-items:center;gap:1rem;flex-wrap:wrap}
    .foot a{font-weight:700}
    .foot .btn{padding:.45rem .9rem;font-size:.95rem}
  </style>
</head>
<body>
<main>
  <h1>${esc(question)}</h1>
  <p class="tag">${esc(SITE_NAME)} (${esc(SITE_ALT)}). ${esc(TAGLINE)}</p>
  <p class="lead">${answerHtml(answer, base)}</p>
  <p class="meta">Updated <time datetime="${esc(date)}">${esc(date)}</time> &middot; ${doors.length} door${doors.length === 1 ? "" : "s"} &middot; <a href="/index.md">Markdown</a> &middot; <a href="/llms.txt">llms.txt</a> &middot; <a href="/sites.json">sites.json</a> &middot; <a href="/atlas.md">atlas</a></p>
  <nav aria-label="Doors">
    <ol id="doors" class="doors">
${items || "      <li>No doors yet.</li>"}
    </ol>
  </nav>
  <footer class="foot"><a href="/add" class="btn">Add site</a><a href="/">${esc(SITE_ALT)}</a><a href="${esc(REPO)}">Source</a><button id="pwaGo" class="btn">Install App</button></footer>
</main>
<script>
function openHash() {
  const n = Number((location.hash || "").replace("#", ""));
  if (!Number.isInteger(n) || n < 1) return;
  const el = document.getElementById("door-" + n);
  if (el) el.scrollIntoView({ block: "center" });
}
openHash();
addEventListener("hashchange", openHash);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
let deferred = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
document.getElementById("pwaGo").addEventListener("click", async () => {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
});
</script>
</body>
</html>`;
}

/** /index.md — the Markdown twin of the home page: same question, same answer, same date, every door as an absolute link. */
export function homeMarkdown(slots, env, publicMap = null) {
  const base = publicBase(env);
  const list = slots.filter((s) => !s.self);
  const closedN = list.filter((s) => s.status === "closed").length;
  const count = list.length - closedN;
  const date = homeDate(slots, publicMap);
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/([\\`*_[\]<>])/g, "\\$1").trim();
  const doors = list
    .map((s) => {
      const live = safeUrl(s.url);
      const q = md(s.question || doorHeadline(s));
      const shut = s.status === "closed" ? ` (closed since ${md(String(s.closed_since || "").slice(0, 10))})` : "";
      return `${s.n}. [${q}](${s.path}) - ${live ? `[${md(hostOf(live))}](${live})` : md(hostOf(s.url))}${shut}`;
    })
    .join("\n");
  return `# ${md(homeQuestion(count))}

> ${md(TAGLINE)}
> ${md(homeAnswer(count, base, { closed: closedN, live: list.filter((s) => s.status === "live").length }))}

Updated ${date}. ${list.length} door${list.length === 1 ? "" : "s"}. HTML: ${base}/ · llms.txt: ${base}/llms.txt · records: ${base}/sites.json

## Doors

${doors || "- (no doors yet)"}

## Machine surfaces

- Which site answers X: ${base}/match?q=X
- Every door as HTML / Markdown / JSON: ${base}/{n} · ${base}/{n}.md · ${base}/{n}.json
- Atlas (what each site answers): ${base}/atlas.md · ${base}/atlas.json
- Site records (sitemap, llms.txt, IndexNow key URL, languages, Wikidata): ${base}/sites.md · ${base}/sites.json
- Knowledge graph: ${base}/jsonld.json · feeds: ${base}/feed.xml (Atom) · ${base}/rss.xml (RSS) · ${base}/feed.json
- Sitemap: ${base}/sitemap.xml · whole network: ${base}/sitemap-index.xml

Cite the live URL, not a paraphrase. Cite as: ${md(SITE_NAME)}, retrieved ${date}, ${base}/
`;
}
