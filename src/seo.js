/** seo.js — the INPUT grammar for every title, H1, first paragraph, meta description and OG/X block the hub
 *  renders (home, door pages, twins). PART 21.1-21.2 of the playbook: own one question per page, say it in the
 *  title, generate the rest from it. Nobody hand-edits a title; change the grammar here instead.
 *
 *  This module is a leaf: it imports nothing from the hub, so hill.js, announce.js and door-page.js can all
 *  depend on it without a cycle. Absolute URLs are built by the callers from publicBase(env); the constants
 *  below carry only URL *patterns* (the playbook's own "/en/{doc}.html" form).
 *
 *  Served by index.js (owner B): GET /seo/keywords.json → keywordsJson(env, slots), GET /seo/structure.json →
 *  structureJson(env, slots). Both are the constants with the live door count and the hub origin filled in.
 */

export const SITE_NAME = "The AI Hill Top Lighthouse";
export const SITE_ALT = "The Reach 02";
export const TAGLINE = "Nothing you build ever starts invisible again.";
export const REPO = "https://github.com/dagrang-repository/the-reach-02";
export const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/";

export const TITLE_MAX = 60;
export const META_MAX = 155;

export const KEYWORDS = {
  note:
    "The INPUT file. The <title>, H1, first paragraph, meta description and og:title of the home page and of every door page are generated from this grammar (src/seo.js). Nobody hand-edits a title.",
  primary: {
    keyword: "which site answers my question",
    question: "Which of these {count} live sites answers my question?",
    answer:
      "{count} live sites, one numbered door each. Fetch /match?q=your+question to find the door that answers it, then open the door and cite the live site.",
    demand_check:
      "NOT RUN. No Search Console, Trends or autocomplete access from the build environment, and no number is invented here. The question is the one the hub itself exists to answer (every door's atlas entry is scored against it by /match).",
    competitor_refs: [],
    competitor_refs_note:
      "EMPTY ON PURPOSE. PART 21.1 step 3 needs a live SERP read. No URL is guessed here: three invented competitors would be worse than none.",
    cite_alongside: REPO,
    negatives: [
      "not a search engine: the hub does not answer the question itself, it names the door that does",
      "not a directory of every site on the web: only the live sites that were added, one door each",
      "no prices, no plans, no rankings bought or sold",
      "no synthesised record: an unknown door or an unmatched question is a 404 / found:false, never a guess",
    ],
  },
  secondary: [
    {
      pattern: "/",
      keyword: "which site answers my question",
      question: "Which of these {count} live sites answers my question?",
      intent: "navigational",
      page_type: "hub",
      title: "Which of these {count} live sites answers my question?",
      h1: "Which of these {count} live sites answers my question?",
      first_paragraph:
        "{count} live sites, one numbered door each. Fetch /match?q=your+question to find the door that answers it, then open the door and cite the live site.",
    },
    {
      pattern: "/{n}",
      keyword: "{site name}",
      question: "{the door's own question: the first question its origin publishes in llms.txt; else '{name} - door {n}'}",
      intent: "navigational",
      page_type: "record",
      title: "{question, at most 60 characters}",
      h1: "{question}",
      first_paragraph: "{the site's own first sentence (its llms.txt description, else its punch line)} Live: <a href='{live url}'>{question}</a>",
    },
    {
      pattern: "/{n}.md",
      keyword: "{site name}",
      question: "{same question as /{n}}",
      intent: "navigational",
      page_type: "twin",
      title: "{same as /{n}}",
      h1: "{same as /{n}}",
      first_paragraph: "{same facts as /{n}, same date, 'Cite as: {name}, retrieved {date}, {live url}'}",
    },
    {
      pattern: "/match?q={q}",
      keyword: "which site answers X",
      question: "Which site answers X?",
      intent: "transactional",
      page_type: "api",
      title: "n/a (JSON)",
      h1: "n/a (JSON)",
      first_paragraph: "n/a: best, matches[], blocked[], hub",
    },
  ],
};

export const STRUCTURE = {
  note:
    "The INPUT file. The home list, the breadcrumb nodes in the JSON-LD graph, the prev/next links on door pages and the twin form are generated from this (src/seo.js, src/hill.js, src/door-page.js).",
  max_depth: 1,
  languages: { canonical: "en", all: ["en"], sitemap: ["en"] },
  doors: [
    { from: "/", to: "/", status: 200, note: "the hub is the home page; no redirect" },
    { from: "/{n}?go=1", to: "{live url of door n}", status: 302 },
  ],
  hubs: [
    {
      id: "home",
      pattern: "/",
      parent: null,
      keyword_ref: "secondary[0]",
      spokes_pattern: "/{n}",
      sibling_links: "every door links to its prev/next neighbour and up to home",
      sitemap: "sitemap.xml",
      breadcrumb: ["Home"],
    },
    {
      id: "door",
      pattern: "/{n}",
      parent: "home",
      keyword_ref: "secondary[1]",
      spokes_pattern: null,
      sitemap: "sitemap.xml",
      breadcrumb: ["Home", "Door {n}"],
    },
  ],
  twins: {
    form: ".md appended to the content URL; /index.md is the home twin; /{n}.json is the JSON record of the same door",
    pages: ["/index.md", "/{n}.md"],
  },
  /* THE machine partition of the sitemap: map.js serves /sitemap-machine.xml from this array (and nothing else), so
     the file and the sitemap are one list. Every path here is served by the Worker and is not noindex. */
  machine_entry_points_in_sitemap: [
    "/llms.txt",
    "/llms-full.txt",
    "/openapi.json",
    "/.well-known/ai-catalog.json",
    "/.well-known/mcp-server-card",
    "/catalog.json",
    "/sites.json",
    "/sites.md",
    "/atlas.md",
    "/atlas.json",
    "/feed.xml",
    "/feed.json",
    "/wikidata.json",
    "/wayback.json",
  ],
  /* THE noindex list. surfaces.js builds X-Robots-Tag from this array and the sitemap filter reads the same array,
     so what this file declares is what the headers do: a trailing slash is a prefix, anything else an exact path.
     Nothing listed here is ever a sitemap <loc>; the /.well-known cards are indexable on purpose (they are listed). */
  noindex_patterns: ["/v1/", "/api/", "/mcp", "/a2a", "/match", "/add", "/admin", "/pings", "/crawler-check", "/paid/", "/paypal/", "/__scheduled", "/cdn-cgi/"],
  orphan_check: "every door path must appear as a real <a href> in the server-rendered home HTML (hillHtml) and in /index.md",
};

/* ---------- text helpers (one escape, one clipper, used by every renderer) ---------- */

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe inside a <script> block: no "</script>" or "<!--" can be formed from the data. */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Cut at a word boundary, never mid-word; adds an ellipsis only when something was cut. */
export function clip(text, max) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

export function firstSentence(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.*?[.!?]["'”’)\]]?(?=\s|$)/);
  const s = m ? m[0] : t;
  return s.length <= 240 ? s : clip(s, 240);
}

export function capitalize(s) {
  const t = String(s ?? "").trim().replace(/\bi\b/g, "I");
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/* ---------- dates: the one visible date equals WebPage.dateModified, and both come from the record ---------- */

export function dateOnly(iso) {
  const s = String(iso ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return "";
  return Number.isNaN(Date.parse(m[1])) ? "" : m[1];
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' record date of a door: captured_at, else updated_at, else created_at, else today. Never request time
 *  when the record carries a date. */
export function doorDate(slot) {
  return dateOnly(slot?.captured_at) || dateOnly(slot?.updated_at) || dateOnly(slot?.created_at) || today();
}

/** The add date of a door, only when it does not contradict the record date (a record is never modified before it
 *  exists); otherwise omitted rather than invented. */
export function doorPublished(slot) {
  const d = dateOnly(slot?.created_at);
  return d && d <= doorDate(slot) ? d : "";
}

/** The hub's own date: reach_map.updated_at when the map row is to hand, else the newest door record date. */
export function homeDate(slots = [], publicMap = null) {
  const fromMap = dateOnly(publicMap?.updated_at);
  if (fromMap) return fromMap;
  let best = "";
  for (const s of slots || []) {
    const d = doorDate(s);
    if (d > best) best = d;
  }
  return best || today();
}

export function homePublished(slots = [], publicMap = null) {
  let first = "";
  for (const s of slots || []) {
    const d = dateOnly(s?.created_at);
    if (d && (!first || d < first)) first = d;
  }
  return first && first <= homeDate(slots, publicMap) ? first : "";
}

/* ---------- the questions ---------- */

function fill(text, count) {
  return String(text).replace(/\{count\}/g, String(count));
}

export function homeQuestion(count) {
  return fill(KEYWORDS.primary.question, count);
}

export function homeTitle(count) {
  return clip(homeQuestion(count), TITLE_MAX);
}

/** The home page's first paragraph. `extras.closed`: doors whose origin failed two checks in a row (they stay
 *  listed, marked closed); `extras.live`: doors verified live by the last probe. Both come from door_status. */
export function homeAnswer(count, base, extras = {}) {
  const head = fill(KEYWORDS.primary.answer, count).replace("/match?q=", `${base}/match?q=`);
  const closed = Number(extras.closed || 0);
  const live = Number(extras.live || 0);
  const parts = [];
  if (live) parts.push(`${live} verified live by the last check`);
  if (closed) parts.push(`${closed} closed (listed and marked, never matched while a live door answers)`);
  return parts.length ? `${head} ${parts.join("; ")}.` : head;
}

/** The questions the origin itself declares it answers (slot.asks: its own llms.txt lines, never a paraphrase). */
export function doorAsks(slot) {
  return Array.isArray(slot?.asks) ? slot.asks.filter((q) => typeof q === "string" && q.trim()) : [];
}

/** The <title> of a door: its headline clipped at a word boundary to TITLE_MAX. */
export function doorTitle(slot) {
  return clip(doorHeadline(slot), TITLE_MAX);
}

export function metaDescription(text) {
  return clip(text, META_MAX);
}

/** The door's own question, in the origin's words: the first question its atlas entry publishes (intents are the
 *  origin's "If a user asks" lines), else a question sentence inside its punch line. Returns "" when the record has
 *  none — the caller then falls back to '{name} - door {n}', never to an invented question. */
/* a sentence ends at . ! or ? followed by a space and a capital (or the end): "€1.99 per month)?"
   is one sentence, not two; a question with a hole where a placeholder fell out ("in ,",
   "from to") is never a headline - the name is */
const HOLE = /\b(?:in|from|to|for|of|at|with|on|between|cost)\s*[,?.;:]|\bfrom to\b|\s,\s|\(\s*\)/i;
function sentences(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["'(«“]?[A-Z0-9])/);
}
export const QUESTION_MAX = 160;
export function doorQuestion(slot) {
  const seen = [...doorAsks(slot)];
  for (const i of slot?.intents || []) if (typeof i === "string") seen.push(i);
  for (const src of [slot?.punch, slot?.what_it_is, slot?.description]) {
    for (const sen of sentences(src)) {
      const q = sen.replace(/^[\s"'(«“]+/, "").replace(/[\s"')»”]+$/, "");
      if (q.endsWith("?")) seen.push(q);
    }
  }
  for (const raw of seen) {
    const q = capitalize(String(raw).replace(/\s+/g, " ").trim().replace(/^[\s"'(«“]+/, "").replace(/[\s"')»”]+$/, ""));
    if (!q.endsWith("?") || q.length < 12 || q.length > QUESTION_MAX) continue;
    if (!/^[A-Za-z\u00C0-\u024F]/.test(q) || q.split(" ").length < 3 || HOLE.test(q) || /\/[\w-]+\//.test(q)) continue;
    return q;
  }
  return "";
}

export function doorFallbackTitle(slot) {
  return clip(`${slot?.name || "Door"} - door ${slot?.n}`, TITLE_MAX);
}

/** What the title, the H1 and the anchor text of a door all say. */
export function doorHeadline(slot) {
  return doorQuestion(slot) || doorFallbackTitle(slot);
}

/** A sentence fit to stand as the door's answer: not the bare name or host, not a rule addressed to the model,
 *  not a sentence with a placeholder hole. Returns the sentence or "". */
export function usableAnswer(text, slot) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 12) return "";
  const bare = t.replace(/[.!?\s]+$/, "").toLowerCase();
  if (bare === String(slot?.name || "").trim().toLowerCase()) return "";
  if (/^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+\/?$/i.test(bare)) return "";
  if (/^(?:if the question|if a user asks|fetch this site)/i.test(t)) return "";
  if (HOLE.test(t)) return "";
  return t;
}

/** The answer sentence, origin-sourced only: the first usable of description, what_it_is, serves, punch, then
 *  '{name} answers: {first ask}', then '{name} is live at {url}'. */
export function doorAnswer(slot) {
  for (const src of [slot?.description, slot?.what_it_is, slot?.serves, slot?.punch]) {
    const ok = usableAnswer(firstSentence(src || ""), slot);
    if (ok) return ok;
  }
  const ask = doorAsks(slot)[0];
  if (ask) return `${slot?.name || "This site"} answers: ${ask}`;
  return `${slot?.name || "This site"} is live at ${slot?.url || ""}.`.trim();
}

export { confidenceOf } from "./liveness.js";

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "");
  }
}

/** The one image the Worker really serves (src/pwa.js). If an /og/{n}.png route ever answers, change it here only. */
export function ogImage(base) {
  return { url: `${base}/icon-512.png`, width: 512, height: 512, alt: `${SITE_NAME} icon` };
}

/** A door's own image: the og:image its origin declares, as captured. Shown small on the hub (a thumbnail is
 *  decoration), carried full-size where its purpose lives - the door page's og:image / twitter:image, the JSON-LD
 *  and the record. Nothing is invented: a door whose origin declares no image has none here. */
export function doorImage(slot) {
  const url = safeUrl(slot?.og_image);
  return url ? { url, alt: `${slot?.name || "The site"} - ${doorHeadline(slot)}` } : null;
}

/** The <head> block every HTML page shares: canonical, description, alternates, OG and X cards. `image` overrides
 *  the hub icon (a door's own image); its width/height are written only when known. */
export function headMeta({ title, description, canonical, base, type = "website", mdUrl = "", jsonUrl = "", published = "", modified = "", image = null }) {
  const img = image && image.url ? image : ogImage(base);
  const t = esc(title);
  const d = esc(description);
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<link rel="describedby" href="${esc(base)}/llms.txt" type="text/markdown">`,
    mdUrl ? `<link rel="alternate" type="text/markdown" href="${esc(mdUrl)}">` : "",
    jsonUrl ? `<link rel="alternate" type="application/json" href="${esc(jsonUrl)}">` : "",
    `<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)} doors" href="${esc(base)}/feed.xml">`,
    `<link rel="search" type="application/opensearchdescription+xml" title="${esc(SITE_NAME)}" href="${esc(base)}/opensearch.xml">`,
    `<link rel="alternate" type="application/json+oembed" href="${esc(base)}/api/oembed?url=${encodeURIComponent(canonical)}" title="${t}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(img.url)}">`,
    img.width && img.height ? `<meta property="og:image:width" content="${img.width}">` : "",
    img.width && img.height ? `<meta property="og:image:height" content="${img.height}">` : "",
    `<meta property="og:image:alt" content="${esc(img.alt || "")}">`,
    `<meta property="og:locale" content="en">`,
    type === "article" && published ? `<meta property="article:published_time" content="${esc(published)}">` : "",
    type === "article" && modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : "",
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${esc(img.url)}">`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

/* ---------- the served files (/seo/keywords.json, /seo/structure.json) ---------- */

function absolutize(obj, base) {
  if (Array.isArray(obj)) return obj.map((v) => absolutize(v, base));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = absolutize(v, base);
    return out;
  }
  if (typeof obj === "string" && obj.startsWith("/")) return `${base}${obj}`;
  return obj;
}

/** Only http(s) URLs are ever linked; anything else a stored record carries is printed as text, never as an href. */
export function safeUrl(u) {
  const s = String(u ?? "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

/** `base` is publicBase(env) — hill.js wraps these two as seoKeywordsJson(env, slots) / seoStructureJson(env, slots). */
export function keywordsJson(slots = [], base = "") {
  const count = (slots || []).length;
  const origin = String(base || "").replace(/\/+$/, "");
  return {
    site: `${origin}/`,
    checked_on: homeDate(slots),
    door_count: count,
    ...KEYWORDS,
    primary: {
      ...KEYWORDS.primary,
      question: homeQuestion(count),
      answer: homeAnswer(count, origin),
      title: homeTitle(count),
      h1: homeQuestion(count),
      meta_description: metaDescription(homeAnswer(count, origin)),
    },
    secondary: KEYWORDS.secondary.map((s) => ({
      ...s,
      ...(s.pattern === "/"
        ? { question: homeQuestion(count), title: homeTitle(count), h1: homeQuestion(count), first_paragraph: homeAnswer(count, origin) }
        : {}),
    })),
  };
}

export function structureJson(slots = [], base = "") {
  const origin = String(base || "").replace(/\/+$/, "");
  return {
    site: `${origin}/`,
    checked_on: homeDate(slots),
    door_count: (slots || []).length,
    ...STRUCTURE,
    twins: { ...STRUCTURE.twins, pages: [`${origin}/index.md`, ...(slots || []).map((s) => `${s.path}.md`)] },
    machine_entry_points_in_sitemap: absolutize(STRUCTURE.machine_entry_points_in_sitemap, origin),
  };
}
