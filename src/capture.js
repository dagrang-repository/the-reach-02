/** Capture layer — every door carries its full machine record, not just the origin key:
 *  name, URL, sitemap, IndexNow key + key URL, llms.txt, description, languages, feed, JSON-LD types, OG image.
 *  Discovered from the origin on add; the hourly cron re-captures the 3 stalest doors (each at most once a day);
 *  manual overrides win and survive refreshes.
 *  Public: /sites.json · /sites.md · record block on /{n}   Admin: POST /v1/capture[?n=N]
 */
import { all, one, run } from "./db.js";
import { decodeBody, discardBody, nowIso, readResponseCapped, repairMojibake, sha256, stripHtml } from "./util.js";
import { isSelfUrl, selfBase } from "./self.js";
import { recordChange } from "./outreach.js";
import { MIN_HOME_BYTES, homeOk, isChallengePage, recordDoorStatus } from "./liveness.js";

const UA = "TheReach02-capture/1.3";
const HUB_DESC = "The AI Hill Top Lighthouse: a shared directory AI models fetch to find the live sites in this network — name, real URL, numbered door, atlas and a which-site-answers-X matcher. Nothing you build ever starts invisible again.";

const COLS = {
  sitemap_url: "TEXT",
  llms_url: "TEXT",
  description: "TEXT",
  og_image: "TEXT",
  jsonld_types: "TEXT",
  languages_count: "INTEGER",
  feed_url: "TEXT",
  capture_json: "TEXT",
  overrides_json: "TEXT",
  captured_at: "TEXT",
  i18n_json: "TEXT",
  // CONTRACT.md data layer: the permanent door number, the honest-capture attempt fields, the record fingerprint,
  // the origin's own verified sameAs links and whether its homepage links back to the hub
  door_n: "INTEGER",
  checked_at: "TEXT",
  attempt_status: "INTEGER",
  failed_attempts: "INTEGER",
  stale_since: "TEXT",
  record_hash: "TEXT",
  same_as_json: "TEXT",
  links_to_hub_json: "TEXT",
};

let ensured = false;
/** Add every COLS column a deployed sites table lacks (ALTER TABLE, once per isolate). A failed ALTER (another
 *  isolate added the column first) is retried on the next call instead of being taken as done. */
export async function ensureCaptureColumns(env) {
  if (ensured) return;
  let have = [];
  try {
    have = (await all(env, "PRAGMA table_info(sites)")).map((r) => r.name);
  } catch {
    have = [];
  }
  let complete = true;
  for (const [col, type] of Object.entries(COLS)) {
    if (have.includes(col)) continue;
    const ok = await run(env, `ALTER TABLE sites ADD COLUMN ${col} ${type}`).then(() => true, () => false);
    if (!ok) complete = false;
  }
  ensured = complete;
}

async function get(url, accept = "*/*") {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept },
      signal: AbortSignal.timeout(9000),
    });
    const type = res.headers.get("content-type") || "";
    // read to the cap (400 KB) and not one byte more, whatever the origin streams; decode with the charset the
    // origin declared (header, then <meta charset>), never a blind UTF-8 read; a body already double-encoded at
    // the origin (â€” for —) is repaired in the same pass
    if (!res.ok) await discardBody(res);
    const raw = res.ok ? await readResponseCapped(res, 400000) : new Uint8Array(0);
    const text = res.ok ? decodeBody(raw, type) : "";
    return { ok: res.ok, status: res.status, text, bytes: raw.byteLength, url: res.url || url, type };
  } catch (err) {
    return { ok: false, status: 0, text: "", bytes: 0, url, error: String((err && err.message) || err).slice(0, 120) };
  }
}

const looksHtml = (t) => /^\s*<!doctype html|^\s*<html|<head[\s>]/i.test(String(t || "").slice(0, 600));
const looksXml = (t) => /<(urlset|sitemapindex)\b/i.test(String(t || "").slice(0, 2000));
/** HTML sources: tags go. */
const clean = (s) => stripHtml(String(s || "")).replace(/\s+/g, " ").trim();
/** Markdown sources (llms.txt): a `<nationality>` token is the playbook's own placeholder grammar, not a tag.
 *  Keep it as `{nationality}` (JSON- and HTML-safe), drop only Markdown link syntax, collapse whitespace. */
const MD_HTML_TAGS = /<\/?(?:br|p|b|i|em|strong|a|span|u|s|code|div|hr|small|sup|sub)\b[^>]*>/gi;
export function cleanMarkdown(s) {
  return String(s || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<([^>]+)>\(([^)]*)\)/g, "$1")
    .replace(MD_HTML_TAGS, " ")
    .replace(/<([A-Za-z][\w .'’/-]{0,60})>/g, "{$1}")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[`*_]{1,3}(?=\S)|(?<=\S)[`*_]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* The seo.js doorQuestion HOLE pattern - a question with a hole where a placeholder fell out ("in ,", "from to").
   seo.js keeps it private, so it is repeated here verbatim; keep the two identical. A short question sentence (a
   headline candidate, <= 60 characters, ending in "?") is held to the whole pattern exactly as doorQuestion holds it.
   In running prose the preposition branch needs whitespace before the punctuation - the whitespace a dropped
   {placeholder} leaves behind - so "what does it cost, is it free" stays prose while "cost in , and where" is a hole. */
const HOLE = /\b(?:in|from|to|for|of|at|with|on|between|cost)\s*[,?.;:]|\bfrom to\b|\s,\s|\(\s*\)/i;
const PROSE_HOLE = /\b(?:in|from|to|for|of|at|with|on|between|cost)\s+[,?.;:]|\bfrom to\b|\s,\s|\(\s*\)/i;
const HEADLINE_MAX = 60;
function sentencesOf(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["'(«“]?[A-Z0-9])/);
}
/** true when the text carries a placeholder hole (see HOLE above). */
export function hasHole(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (PROSE_HOLE.test(t)) return true;
  for (const sen of sentencesOf(t)) {
    const q = sen.replace(/^[\s"'(«“]+/, "").replace(/[\s"')»”]+$/, "");
    if (q.endsWith("?") && q.length <= HEADLINE_MAX && HOLE.test(q)) return true;
  }
  return false;
}
/** A routing rule, not a description: what the origin tells a model to do instead of saying what the site is. */
const RULE_START = /^(?:if the question|if a user asks|fetch this site)\b/i;
/** A bare host ("LetsMeet-Here.app", "https://www.example.org/") names a place, not what the site answers. */
const BARE_HOST = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i;

/** A description a model can route on completes "if a user asks X, fetch Y". The failures, as stable issue codes
 *  (/v1/briefs and the capture record list them):
 *   - "empty" / "shorter than 60 characters (N)": too short to carry a question
 *   - "domain-only": a bare host, or the site's own name echoed back
 *   - "rule": a routing rule ("If the question is …", "If a user asks …", "Fetch this site …"), not a statement
 *   - "hole": a placeholder fell out of the text (the seo.js HOLE pattern)
 *  Returns { grade: "F", issues } or { grade: "ok", issues: [] }. */
export function gradeDescription(description, name) {
  const d = String(description || "").trim();
  const n = String(name || "").trim();
  const issues = [];
  if (d.length < 60) issues.push(d ? `shorter than 60 characters (${d.length})` : "empty");
  if (d && (BARE_HOST.test(d) || (n && d.toLowerCase() === n.toLowerCase()))) issues.push("domain-only");
  if (RULE_START.test(d)) issues.push("rule");
  if (hasHole(d)) issues.push("hole");
  return { grade: issues.length ? "F" : "ok", issues };
}

/** A <title> that is a bare domain (door 11 read "dictionary.com") names a third party, not this site. */
function isBareDomainTitle(title, siteHost) {
  const t = String(title || "").trim().toLowerCase();
  if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(t)) return false;
  const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
  return bare(t) !== bare(siteHost);
}

function llmsH1(text) {
  const m = String(text || "").match(/^\s*#\s+(.+?)\s*$/m);
  return m ? cleanMarkdown(m[1]).slice(0, 200) : "";
}

/** The x-default alternate, else the English one, from <link rel="alternate" hreflang=…>. */
function preferredAlternate(html, origin) {
  const found = { xdefault: "", en: "" };
  for (const m of String(html || "").matchAll(/<link\b[^>]*hreflang=["']([^"']+)["'][^>]*>/gi)) {
    const code = m[1].toLowerCase();
    const href = (m[0].match(/href=["']([^"']+)["']/i) || ["", ""])[1];
    if (!href) continue;
    let abs = "";
    try { abs = new URL(href, origin).toString(); } catch { continue; }
    if (code === "x-default" && !found.xdefault) found.xdefault = abs;
    else if (code.split("-")[0] === "en" && !found.en) found.en = abs;
  }
  if (found.xdefault) return { code: "x-default", url: found.xdefault };
  if (found.en) return { code: "en", url: found.en };
  return null;
}

function meta(html, re) {
  const m = String(html || "").match(re);
  return m ? clean(m[1]) : "";
}

function metaContent(html, attr, value) {
  const doc = String(html || "");
  const a = doc.match(new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value}["'][^>]*\\bcontent=["']([^"']*)["']`, "i"));
  if (a) return clean(a[1]);
  const b = doc.match(new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${value}["']`, "i"));
  return b ? clean(b[1]) : "";
}

function jsonLdTypes(html) {
  const types = new Set();
  for (const m of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node["@type"]) (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).forEach((t) => types.add(String(t)));
        if (node["@graph"]) walk(node["@graph"]);
      };
      walk(data);
    } catch {
      /* malformed block */
    }
  }
  return [...types].slice(0, 12);
}

function hreflangs(html) {
  const set = new Set();
  for (const m of String(html || "").matchAll(/hreflang=["']([^"']+)["']/gi)) {
    const v = m[1].toLowerCase();
    if (v && v !== "x-default") set.add(v.split("-")[0]);
  }
  return [...set];
}

/** code → absolute href of each language variant, from <link rel="alternate" hreflang=…>. */
function hreflangMap(html, origin) {
  const map = {};
  for (const m of String(html || "").matchAll(/<link\b[^>]*hreflang=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    const code = m[1].toLowerCase().split("-")[0];
    const href = (tag.match(/href=["']([^"']+)["']/i) || ["", ""])[1];
    if (!code || code === "x" || !href) continue;
    try { map[code] = map[code] || new URL(href, origin).toString(); } catch { /* skip */ }
  }
  return map;
}

/** Localized title + description per language, from the site's own hreflang pages. Incremental: at most `budget`
 *  fetches per call, missing languages first, so the full set fills over a few daily captures. */
export async function captureI18n(site, html, origin, budget = 12) {
  let prev = {};
  try { prev = JSON.parse(site.i18n_json || "{}") || {}; } catch { prev = {}; }
  const map = hreflangMap(html, origin);
  const codes = Object.keys(map).filter((c) => c !== "en");
  if (!codes.length) return { i18n: prev, fetched: 0, total: 0 };
  const order = [...codes.filter((c) => !prev[c]), ...codes.filter((c) => prev[c])].slice(0, budget);
  const out = { ...prev };
  let fetched = 0;
  for (const code of order) {
    const r = await get(map[code], "text/html");
    fetched++;
    if (!r.ok || looksXml(r.text)) continue;
    const title = meta(r.text, /<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
    const desc = (metaContent(r.text, "name", "description") || metaContent(r.text, "property", "og:description")).slice(0, 600);
    if (title || desc) out[code] = { title, description: desc, url: map[code] };
  }
  for (const c of Object.keys(out)) if (!codes.includes(c)) delete out[c];
  return { i18n: out, fetched, total: codes.length };
}

function feedLink(html, origin) {
  const m = String(html || "").match(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i)
    || String(html || "").match(/<link\b[^>]*href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i);
  if (!m) return "";
  try { return new URL(m[1], origin).toString(); } catch { return ""; }
}

/** First blockquote paragraph of an llms.txt = the site's own one-paragraph description. */
function llmsDescription(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const paras = [];
  let cur = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith(">")) {
      const t = l.replace(/^>\s?/, "").trim();
      // an "If a user asks" line is its own paragraph, never glued onto the description
      if (cur.length && /^if (a |the )?user asks/i.test(t)) { paras.push(cur.join(" ")); cur = []; }
      cur.push(t);
    } else if (cur.length) { paras.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) paras.push(cur.join(" "));
  const p = paras.find((x) => x.length >= 40 && !/^if (a |the )?user asks/i.test(x)) || "";
  // Markdown source: `<destination>` placeholders survive as `{destination}`; only link syntax is stripped
  return cleanMarkdown(p).slice(0, 600);
}

function llmsLanguageCount(text) {
  const m = String(text || "").match(/(\d{1,3})\s+languages/i);
  return m ? Number(m[1]) : 0;
}

function parseOverrides(site) {
  try { return JSON.parse(site.overrides_json || "{}") || {}; } catch { return {}; }
}

function normalizeUrlMaybe(v, origin) {
  const s = String(v || "").trim();
  if (!s) return "";
  try { return new URL(s, origin).toString(); } catch { return ""; }
}

export function keyUrlOf(site, env) {
  if (!site?.indexnow_key) return "";
  try {
    const origin = isSelfUrl(site.url, env) ? selfBase(env) : new URL(site.url).origin;
    return `${origin}/${site.indexnow_key}.txt`;
  } catch {
    return "";
  }
}

async function discover(site, env, home) {
  const origin = new URL(site.url).origin;
  if (isSelfUrl(site.url, env)) {
    const base = selfBase(env);
    return {
      title: "The AI Hill Top Lighthouse",
      description: HUB_DESC,
      sitemap: `${base}/sitemap.xml`,
      llms: `${base}/llms.txt`,
      feed: `${base}/feed.xml`,
      og_image: `${base}/icon-512.png`,
      canonical: `${base}/`,
      jsonld_types: ["WebSite", "ItemList"],
      languages: ["en"],
      languages_count: 1,
      robots_ok: true,
      homepage_status: 200,
      source: { description: "self", sitemap: "self", llms: "self" },
    };
  }
  // the home page was fetched (and judged a usable capture) by captureSite; never fetched twice
  const html = home.text || "";
  const langs = hreflangs(html);
  const htmlLang = (html.match(/<html[^>]*\slang=["']([^"']+)["']/i) || ["", ""])[1].toLowerCase().split("-")[0];
  if (htmlLang && !langs.includes(htmlLang)) langs.unshift(htmlLang);

  // The record is English. When the door URL lands on another locale (door 16 lives on /fil/), take the
  // title, description and canonical from the x-default or `en` alternate the page itself declares.
  let doc = html;
  let docUrl = home.url || site.url;
  const homeUrl = docUrl;
  const locale = { fetched: htmlLang || "", used: htmlLang || "", url: docUrl };
  const alt = preferredAlternate(html, origin);
  if (alt && htmlLang && htmlLang !== "en" && alt.url !== docUrl) {
    const altRes = await get(alt.url, "text/html");
    if (altRes.ok && altRes.text && !looksXml(altRes.text)) {
      doc = altRes.text;
      docUrl = altRes.url || alt.url;
      locale.used = alt.code === "x-default" ? ((doc.match(/<html[^>]*\slang=["']([^"']+)["']/i) || ["", "x-default"])[1].toLowerCase().split("-")[0] || "x-default") : "en";
      locale.url = docUrl;
      locale.via = alt.code;
    }
  }

  const rawTitle = meta(doc, /<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
  const ogSiteName = metaContent(doc, "property", "og:site_name").slice(0, 200);
  const metaDesc = metaContent(doc, "name", "description");
  const ogDesc = metaContent(doc, "property", "og:description");
  const ogImage = normalizeUrlMaybe(metaContent(doc, "property", "og:image"), origin);
  const canonical = normalizeUrlMaybe(meta(doc, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i), origin);

  const robots = await get(`${origin}/robots.txt`, "text/plain");
  const robotsSitemaps = robots.ok && !looksHtml(robots.text)
    ? [...robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => normalizeUrlMaybe(m[1], origin)).filter(Boolean)
    : [];
  let sitemap = "";
  for (const cand of [...new Set([...robotsSitemaps, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])].slice(0, 3)) {
    const r = await get(cand, "application/xml,text/xml");
    if (r.ok && looksXml(r.text)) { sitemap = r.url || cand; break; }
  }

  const llms = await get(`${origin}/llms.txt`, "text/plain,text/markdown");
  const llmsOk = llms.ok && !!llms.text.trim() && !looksHtml(llms.text);
  const llmsDesc = llmsOk ? llmsDescription(llms.text) : "";
  const llmsCount = llmsOk ? llmsLanguageCount(llms.text) : 0;

  // a bare third-party domain is not this site's title: fall back to og:site_name, then the llms.txt H1
  const siteHost = new URL(site.url).host;
  const title = isBareDomainTitle(rawTitle, siteHost) ? (ogSiteName || (llmsOk ? llmsH1(llms.text) : "") || "") : rawTitle;

  // first candidate that a model can route on; else the first non-empty one, graded so the briefing can say so
  const candidates = [
    { text: llmsDesc, source: "llms.txt" },
    { text: metaDesc, source: "meta description" },
    { text: ogDesc, source: "og:description" },
  ].filter((c) => c.text);
  const pick = candidates.find((c) => gradeDescription(c.text, site.name).grade === "ok") || candidates[0] || { text: "", source: "none" };
  const description = pick.text;
  const feed = feedLink(doc, origin) || feedLink(html, origin);
  const languages = langs.slice(0, 64);
  return {
    html: doc,
    doc_url: docUrl,
    home_html: html,
    home_url: homeUrl,
    title,
    title_source: isBareDomainTitle(rawTitle, siteHost) ? (ogSiteName ? "og:site_name" : "llms.txt H1") : "title",
    description: description.slice(0, 600),
    description_grade: gradeDescription(description, site.name),
    sitemap,
    llms: llmsOk ? llms.url || `${origin}/llms.txt` : "",
    feed,
    og_image: ogImage,
    canonical,
    locale,
    jsonld_types: jsonLdTypes(doc),
    languages,
    // the array is the truth when it is populated; the "N languages" claim in llms.txt only fills an empty array
    languages_count: languages.length ? languages.length : Math.max(llmsCount, 0),
    robots_ok: robots.ok && !looksHtml(robots.text),
    homepage_status: home.status,
    source: {
      description: pick.source,
      sitemap: sitemap ? (robotsSitemaps.includes(sitemap) ? "robots.txt" : "probe") : "none",
      llms: llmsOk ? "origin" : "none",
    },
  };
}

/* ---- the origin's own entity links (rank 16) and its link back to the hub (rank 19) ---------------------------- */

/** Schema.org types whose sameAs is the origin speaking about itself: Organization (and its common subtypes) and
 *  WebSite. A Product's or a Person's sameAs is not the site's identity. */
const SAMEAS_TYPES = new Set([
  "Organization", "Corporation", "LocalBusiness", "NGO", "OnlineBusiness", "OnlineStore", "Store",
  "EducationalOrganization", "GovernmentOrganization", "NewsMediaOrganization", "WebSite",
]);
/** At most this many declared sameAs links are probed per capture, each with a 9 s budget and an unread body. */
export const SAMEAS_MAX = 8;

const attrOf = (tag, name) => {
  const m = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
};
const bareHost = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/** The sameAs links the ORIGIN declares about itself, in page order: Organization/WebSite JSON-LD `sameAs` and
 *  rel="me" links. https only; never the origin's own host or the hub's (a door is not its own identity proof).
 *  Declared is not verified: captureSite keeps only the ones that answer 2xx. */
export function declaredSameAs(html, pageUrl, hubBase) {
  const doc = String(html || "");
  let own = "";
  let hub = "";
  try { own = bareHost(new URL(pageUrl).host); } catch { own = ""; }
  try { hub = bareHost(new URL(hubBase).host); } catch { hub = ""; }
  const out = [];
  const add = (raw) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    let u;
    try { u = new URL(raw.trim().replace(/&amp;/g, "&"), pageUrl); } catch { return; }
    if (u.protocol !== "https:") return;
    const h = bareHost(u.host);
    if (!h || h === own || h === hub) return;
    u.hash = "";
    const s = u.toString();
    if (!out.includes(s)) out.push(s);
  };
  for (const m of doc.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 6) return;
      if (Array.isArray(node)) { node.forEach((x) => walk(x, depth + 1)); return; }
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      if (types.some((t) => SAMEAS_TYPES.has(String(t || "")))) (Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]).forEach(add);
      if (node["@graph"]) walk(node["@graph"], depth + 1);
      // the Organization behind a WebSite node (publisher/author/...) speaks for the same origin
      for (const k of ["publisher", "author", "creator", "provider", "brand", "parentOrganization", "isPartOf"]) if (node[k]) walk(node[k], depth + 1);
    };
    walk(data, 0);
  }
  for (const m of doc.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
    if (!attrOf(m[0], "rel").toLowerCase().split(/\s+/).includes("me")) continue;
    add(attrOf(m[0], "href"));
  }
  return out;
}

/** Keep the declared links that answer 2xx over https right now (at most SAMEAS_MAX probed, bounded: 9 s each,
 *  body never read). A profile that is down, gated or gone is not emitted as the origin's identity. */
export async function verifySameAs(urls) {
  const list = (Array.isArray(urls) ? urls : []).slice(0, SAMEAS_MAX);
  const results = await Promise.all(
    list.map(async (u) => {
      try {
        const res = await fetch(u, {
          redirect: "follow",
          headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
          signal: AbortSignal.timeout(9000),
        });
        await discardBody(res);
        let finalHttps = true;
        try { finalHttps = new URL(res.url || u).protocol === "https:"; } catch { finalHttps = true; }
        return res.status >= 200 && res.status < 300 && finalHttps ? u : "";
      } catch {
        return "";
      }
    })
  );
  return results.filter(Boolean);
}

/** Does this HTML carry an <a href> to the hub's origin? Returns { present, url } (url "" when absent). */
export function linksToHub(html, pageUrl, hubBase) {
  let hub = "";
  try { hub = new URL(hubBase).host.toLowerCase(); } catch { return { present: false, url: "" }; }
  for (const m of String(html || "").matchAll(/<a\b[^>]*>/gi)) {
    const raw = attrOf(m[0], "href").replace(/&amp;/g, "&");
    if (!/^(?:https?:)?\/\//i.test(raw)) continue; // a relative link stays on the origin
    let u;
    try { u = new URL(raw, pageUrl); } catch { continue; }
    if (/^https?:$/.test(u.protocol) && u.host.toLowerCase() === hub) return { present: true, url: u.toString() };
  }
  return { present: false, url: "" };
}

/* ---- honest capture (rank 3) ------------------------------------------------------------------------------------- */

/** A door whose last capture attempt failed is retried after this many hours, never sooner. */
export const CAPTURE_RETRY_HOURS = 6;

function parseJsonSafe(text, fallback) {
  try { return JSON.parse(text || "") ?? fallback; } catch { return fallback; }
}

/** Why a home fetch cannot be a capture ("" when it can): it must be a 2xx HTML body of >= 500 bytes that is not a
 *  challenge page. Anything else touches nothing of the stored record. */
function homeProblem(home) {
  if (!home) return "no fetch";
  if (!home.ok || home.status < 200 || home.status > 299) return home.status ? `HTTP ${home.status}` : `network error${home.error ? ` (${home.error})` : ""}`;
  if (!(/html/i.test(home.type || "") || looksHtml(home.text))) return `HTTP ${home.status} but not HTML (${String(home.type || "").split(";")[0].replace(/[^A-Za-z0-9/+.-]/g, "").slice(0, 60) || "no content-type"})`;
  if (Number(home.bytes || 0) < MIN_HOME_BYTES) return `HTTP ${home.status} with ${Number(home.bytes || 0)} bytes (under ${MIN_HOME_BYTES})`;
  if (isChallengePage(home.text)) return `HTTP ${home.status} challenge page`;
  return "";
}

/** The record fingerprint: what a reader of the door sees. captured_at moves only when it changes. */
async function recordHashOf(r) {
  const langs = [...new Set((Array.isArray(r.languages) ? r.languages : []).map((x) => String(x).toLowerCase()))].sort();
  return sha256(JSON.stringify([r.description || "", r.sitemap || "", r.llms || "", r.og_image || "", langs, r.feed || "", r.title || "", r.canonical || ""]));
}

/** The stored record's fingerprint: record_hash when a capture wrote one, else computed from the stored fields (so
 *  the first capture after this column arrived does not move an unchanged record's date). */
async function storedHashOf(site) {
  if (site.record_hash) return site.record_hash;
  const cap = parseJsonSafe(site.capture_json, {}) || {};
  return recordHashOf({
    description: site.description, sitemap: site.sitemap_url, llms: site.llms_url, og_image: site.og_image,
    languages: cap.languages, feed: site.feed_url, title: cap.title, canonical: cap.canonical,
  });
}

/** A failed home fetch: only checked_at, attempt_status, failed_attempts and stale_since move (+ door_status and a
 *  capture-failed change row). New admin overrides passed with this call are still applied - they are the owner's
 *  words, not the origin's - and nothing captured from the origin is touched. */
async function captureFailed(env, site, home, problem, stamp, ov) {
  const status = home ? Number(home.status || 0) : 0;
  await run(
    env,
    `UPDATE sites SET checked_at = ?, attempt_status = ?, failed_attempts = COALESCE(failed_attempts, 0) + 1,
       stale_since = CASE WHEN stale_since IS NULL OR stale_since = '' THEN ? ELSE stale_since END WHERE id = ?`,
    stamp,
    status,
    stamp,
    site.id
  );
  await recordDoorStatus(env, site.id, { http_status: status, ok: false, source: "capture", at: stamp }).catch(() => null);
  await recordChange(env, { kind: "capture-failed", siteId: site.id, url: site.url, detail: `home ${problem}; record kept (captured ${site.captured_at || "never"})` }).catch(() => null);
  if (ov) await applyOverrides(env, site, ov, stamp);
  return one(env, "SELECT * FROM sites WHERE id = ?", site.id);
}

/** Owner overrides without a fresh capture: description/sitemap/llms from the overrides, everything else as stored. */
async function applyOverrides(env, site, ov, stamp) {
  const origin = new URL(site.url).origin;
  const cap = parseJsonSafe(site.capture_json, {}) || {};
  const description = ov.description || site.description || "";
  const sitemap = normalizeUrlMaybe(ov.sitemap, origin) || site.sitemap_url || "";
  const llmsUrl = normalizeUrlMaybe(ov.llms, origin) || site.llms_url || "";
  const newHash = await recordHashOf({ description, sitemap, llms: llmsUrl, og_image: site.og_image, languages: cap.languages, feed: site.feed_url, title: cap.title, canonical: cap.canonical });
  const prevHash = await storedHashOf(site);
  const grade = gradeDescription(description, site.name);
  const next = {
    ...cap,
    overrides: Object.keys(ov),
    source: { ...(cap.source || {}), ...(ov.description ? { description: "override" } : {}), ...(ov.sitemap ? { sitemap: "override" } : {}), ...(ov.llms ? { llms: "override" } : {}) },
    description_grade: grade.grade,
  };
  if (grade.issues.length) next.description_issues = grade.issues;
  else delete next.description_issues;
  await run(
    env,
    `UPDATE sites SET description = ?, sitemap_url = ?, llms_url = ?, overrides_json = ?, capture_json = ?, record_hash = ?, captured_at = ? WHERE id = ?`,
    description,
    sitemap,
    llmsUrl,
    JSON.stringify(ov),
    JSON.stringify(next),
    newHash,
    newHash !== prevHash || !site.captured_at ? stamp : site.captured_at,
    site.id
  );
}

/** Capture one site and persist it. `overrides` (description/sitemap/llms) are stored and always win.
 *  Honest capture (CONTRACT.md): a home fetch that is not a 2xx HTML body of >= 500 bytes, or is a challenge page,
 *  touches nothing of the record (captureFailed). A previously present sitemap/llms/feed is dropped only after two
 *  consecutive successful captures that both lack it. captured_at moves only when record_hash changes. */
export async function captureSite(env, site, overrides = null) {
  await ensureCaptureColumns(env);
  const prev = parseOverrides(site);
  const ov = { ...prev };
  let freshOverride = false;
  if (overrides && typeof overrides === "object") {
    for (const k of ["description", "sitemap", "llms"]) {
      const v = String(overrides[k] || "").trim();
      if (!v) continue;
      ov[k] = k === "description" ? v.slice(0, 600) : v;
      if (ov[k] !== prev[k]) freshOverride = true;
    }
  }
  const stamp = nowIso();
  const self = isSelfUrl(site.url, env);
  const home = self ? null : await get(site.url, "text/html");
  const problem = self ? "" : homeProblem(home);
  if (problem) return captureFailed(env, site, home, problem, stamp, freshOverride ? ov : null);

  const d = await discover(site, env, home);
  const origin = new URL(site.url).origin;
  const prevCapture = parseJsonSafe(site.capture_json, {}) || {};
  const misses = { ...(prevCapture.misses && typeof prevCapture.misses === "object" ? prevCapture.misses : {}) };
  /* a value the last record carried and this capture did not find survives one miss; the second consecutive miss
     (two successful captures that both lack it) drops it */
  const keep = (field, found, previous) => {
    if (found || !previous) { delete misses[field]; return found || ""; }
    const m = Number(misses[field] || 0) + 1;
    if (m >= 2) { delete misses[field]; return ""; }
    misses[field] = m;
    return previous;
  };
  const sitemap = normalizeUrlMaybe(ov.sitemap, origin) || keep("sitemap", d.sitemap, site.sitemap_url || "");
  const llmsUrl = normalizeUrlMaybe(ov.llms, origin) || keep("llms", d.llms, site.llms_url || "");
  const feed = keep("feed", d.feed, site.feed_url || "");
  let description = ov.description || d.description || "";
  let descSource = ov.description ? "override" : d.source?.description || "none";
  // llms.txt missed once and is kept: so is the description that was read from it, until the second miss
  if (!ov.description && !ov.llms && !d.llms && llmsUrl && misses.llms && prevCapture?.source?.description === "llms.txt" && site.description) {
    description = site.description;
    descSource = "llms.txt";
  }
  let i18n = null;
  if (d.html) {
    try { i18n = await captureI18n(site, d.html, origin); } catch { i18n = null; }
  }

  // the origin's own identity links (verified 2xx https only) and whether its homepage links back to the hub
  let sameAs = null;
  let linksHub = null;
  if (!self) {
    const hubBase = selfBase(env);
    const declared = declaredSameAs(d.home_html, d.home_url || site.url, hubBase);
    if (d.html && d.html !== d.home_html) for (const u of declaredSameAs(d.html, d.doc_url || site.url, hubBase)) if (!declared.includes(u)) declared.push(u);
    sameAs = await verifySameAs(declared);
    let link = linksToHub(d.home_html, d.home_url || site.url, hubBase);
    if (!link.present && d.html && d.html !== d.home_html) link = linksToHub(d.html, d.doc_url || site.url, hubBase);
    linksHub = { present: !!link.present, url: link.url || "", checked_at: stamp };
  }

  const languages = Array.isArray(d.languages) ? d.languages : [];
  const recordHash = await recordHashOf({ description, sitemap, llms: llmsUrl, og_image: d.og_image, languages, feed, title: d.title, canonical: d.canonical });
  const changed = recordHash !== (await storedHashOf(site)) || !site.captured_at;
  const capturedAt = changed ? stamp : site.captured_at;
  const grade = gradeDescription(description, site.name);
  const captureJson = JSON.stringify({
    title: d.title,
    canonical: d.canonical,
    languages: d.languages,
    robots_ok: !!d.robots_ok,
    homepage_status: d.homepage_status ?? 200,
    source: {
      ...(d.source || {}),
      description: descSource,
      sitemap: ov.sitemap ? "override" : d.sitemap ? d.source?.sitemap || "probe" : sitemap ? "kept" : "none",
      llms: ov.llms ? "override" : d.llms ? d.source?.llms || "origin" : llmsUrl ? "kept" : "none",
    },
    overrides: Object.keys(ov),
    ...(d.locale ? { locale: d.locale } : {}),
    ...(d.title_source && d.title_source !== "title" ? { title_source: d.title_source } : {}),
    description_grade: grade.grade,
    ...(grade.issues.length ? { description_issues: grade.issues } : {}),
    ...(i18n ? { i18n_total: i18n.total, i18n_have: Object.keys(i18n.i18n).length } : {}),
    ...(Object.keys(misses).length ? { misses } : {}),
  });
  const before = `${site.description || ""}|${site.sitemap_url || ""}|${site.llms_url || ""}|${site.languages_count || 0}`;
  await run(
    env,
    `UPDATE sites SET description = ?, sitemap_url = ?, llms_url = ?, og_image = ?, jsonld_types = ?, languages_count = ?,
       feed_url = ?, capture_json = ?, overrides_json = ?, captured_at = ?, record_hash = ?, checked_at = ?,
       attempt_status = ?, failed_attempts = 0, stale_since = '', same_as_json = ?, links_to_hub_json = ? WHERE id = ?`,
    description,
    sitemap,
    llmsUrl,
    d.og_image || "",
    JSON.stringify(d.jsonld_types || []),
    Number(d.languages_count || 0),
    feed,
    captureJson,
    JSON.stringify(ov),
    capturedAt,
    recordHash,
    stamp,
    self ? 200 : Number(home.status || 0),
    sameAs ? JSON.stringify(sameAs) : null,
    linksHub ? JSON.stringify(linksHub) : null,
    site.id
  );
  if (i18n) await run(env, "UPDATE sites SET i18n_json = ? WHERE id = ?", JSON.stringify(i18n.i18n), site.id).catch(() => null);
  if (!self) await recordDoorStatus(env, site.id, { http_status: home.status, ok: homeOk(home.status, home.bytes, home.text), source: "capture", at: stamp }).catch(() => null);
  const after = `${description}|${sitemap}|${llmsUrl}|${d.languages_count || 0}`;
  if (before !== after) {
    await recordChange(env, { kind: "capture", siteId: site.id, url: site.url, detail: `desc:${descSource}${grade.grade === "F" ? ` (grade F: ${grade.issues.join("; ")})` : ""} sitemap:${sitemap ? "yes" : "no"} llms:${llmsUrl ? "yes" : "no"} langs:${d.languages_count || 0}` }).catch(() => null);
  }
  return one(env, "SELECT * FROM sites WHERE id = ?", site.id);
}

/** Capture the doors whose last attempt is oldest, `limit` at a time: never attempted first, then by checked_at.
 *  A healthy door is due after `maxAgeHours`; a door whose last attempt failed is retried after CAPTURE_RETRY_HOURS
 *  and never sooner. Returns how many are still due. */
export async function captureBatch(env, limit = 6, maxAgeHours = 24, onlyIds = null) {
  await ensureCaptureColumns(env);
  const now = Date.now();
  const cutoff = new Date(now - maxAgeHours * 3600 * 1000).toISOString();
  const retry = new Date(now - CAPTURE_RETRY_HOURS * 3600 * 1000).toISOString();
  const DUE = `active = 1 AND (checked_at IS NULL OR checked_at = ''
      OR (COALESCE(failed_attempts, 0) > 0 AND checked_at < ?)
      OR (COALESCE(failed_attempts, 0) = 0 AND checked_at < ?))`;
  const rows = onlyIds
    ? await all(env, `SELECT * FROM sites WHERE active = 1 AND id IN (${onlyIds.map(() => "?").join(",")})`, ...onlyIds)
    : await all(env, `SELECT * FROM sites WHERE ${DUE} ORDER BY COALESCE(checked_at, '') ASC, COALESCE(captured_at, '') ASC LIMIT ?`, retry, cutoff, limit);
  const done = [];
  for (const site of rows) {
    try {
      const out = await captureSite(env, site);
      if (Number(out?.failed_attempts || 0) > 0) {
        done.push({ name: site.name, ok: false, attempt_status: Number(out.attempt_status || 0), failed_attempts: Number(out.failed_attempts), error: "home fetch failed; the stored record was kept" });
      } else {
        done.push({ name: site.name, ok: true, description: !!out.description, description_grade: gradeDescription(out.description, site.name).grade, sitemap: !!out.sitemap_url, llms: !!out.llms_url });
      }
    } catch (err) {
      done.push({ name: site.name, ok: false, error: String((err && err.message) || err).slice(0, 120) });
    }
  }
  const left = await one(env, `SELECT COUNT(*) AS c FROM sites WHERE ${DUE}`, retry, cutoff).catch(() => ({ c: 0 }));
  return { captured: done.length, failed: done.filter((x) => !x.ok).length, done, remaining: Number(left?.c || 0) };
}

/** The Field/Value record for a door — the full "example" shape. */
export function captureView(slot, env, base) {
  const key = slot.indexnow_key || "";
  let capture = {};
  try { capture = JSON.parse(slot.capture_json || "{}") || {}; } catch { capture = {}; }
  let jsonld = [];
  try { jsonld = JSON.parse(slot.jsonld_types || "[]") || []; } catch { jsonld = []; }
  const keyUrl = key ? keyUrlOf({ url: slot.url, indexnow_key: key }, env) : "";
  const languages = Array.isArray(slot.languages) ? slot.languages : [];
  return {
    n: slot.n,
    name: slot.name,
    url: slot.url,
    sitemap: slot.sitemap_url || "",
    indexnow_key: key,
    key_url: keyUrl,
    llms_txt: slot.llms_url || "",
    // a record captured before the charset fix may still hold "â€”": repair it on the way out, idempotently
    description: repairMojibake(slot.description || slot.punch || ""),
    languages,
    // a populated array IS the count; a free number is only used when the array is empty
    languages_count: languages.length ? languages.length : Number(slot.languages_count || 0),
    feed: slot.feed_url || "",
    og_image: slot.og_image || "",
    jsonld_types: jsonld,
    title: repairMojibake(capture.title || ""),
    canonical: capture.canonical || "",
    door: `${base}/${slot.n}`,
    door_md: `${base}/${slot.n}.md`,
    hash: `${base}/#${slot.n}`,
    ...(slot.wikidata_qid ? { wikidata: `https://www.wikidata.org/wiki/${slot.wikidata_qid}` } : {}),
    localized: (() => { try { return Object.keys(JSON.parse(slot.i18n_json || "{}") || {}).length; } catch { return 0; } })(),
    captured_at: slot.captured_at || "",
  };
}

export function captureTableMd(v) {
  const rows = [
    ["Name", v.name],
    ["URL", v.url],
    ["Sitemap", v.sitemap || "—"],
    ["IndexNow key", v.indexnow_key || "—"],
    ["Key URL", v.key_url || "—"],
    ["llms.txt", v.llms_txt || "—"],
    ["Description", v.description || "—"],
    ["Languages", v.languages_count ? `${v.languages_count}${v.languages.length ? ` (${v.languages.slice(0, 8).join(", ")}${v.languages.length > 8 ? ", …" : ""})` : ""}` : (v.languages.join(", ") || "—")],
    ["Feed", v.feed || "—"],
    ["JSON-LD", v.jsonld_types.join(", ") || "—"],
    ["Door", v.door],
    ...(v.wikidata ? [["Wikidata", v.wikidata]] : []),
    ["Captured", v.captured_at || "pending"],
  ];
  return `## #${v.n} ${v.name}\n\n| Field | Value |\n|---|---|\n${rows.map(([k, val]) => `| ${k} | ${String(val).replace(/\|/g, "\\|")} |`).join("\n")}\n`;
}

/** The declared schema is generated from the served records, so it can never disagree with them. */
export function recordFields(sites, env, base) {
  const keys = [];
  const seen = new Set();
  const take = (rec) => Object.keys(rec).forEach((k) => { if (!seen.has(k)) { seen.add(k); keys.push(k); } });
  if (sites.length) sites.forEach(take);
  else take(captureView({ n: 1, name: "", url: "https://example.invalid/", languages: [], wikidata_qid: "Q0" }, env, base));
  const always = new Set(keys);
  for (const rec of sites) for (const k of keys) if (!(k in rec)) always.delete(k);
  return { fields: keys, optional: keys.filter((k) => !always.has(k)) };
}

export function sitesJson(slots, env, base) {
  const sites = slots.map((s) => captureView(s, env, base));
  const schema = recordFields(sites, env, base);
  return {
    name: "The AI Hill Top Lighthouse",
    tagline: "Nothing you build ever starts invisible again.",
    generated: nowIso(),
    count: sites.length,
    record_fields: schema.fields,
    ...(schema.optional.length ? { optional_fields: schema.optional } : {}),
    sites,
  };
}

export function sitesMd(slots, env, base) {
  return `# The AI Hill Top Lighthouse — site records\n\n> Nothing you build ever starts invisible again.\n> ${slots.length} doors. Machine twin: ${base}/sites.json\n\n${slots.map((s) => captureTableMd(captureView(s, env, base))).join("\n")}`;
}
