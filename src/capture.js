/** Capture layer — every door carries its full machine record, not just the origin key:
 *  name, URL, sitemap, IndexNow key + key URL, llms.txt, description, languages, feed, JSON-LD types, OG image.
 *  Discovered from the origin on add, refreshed on the hourly rotation; manual overrides win and survive refreshes.
 *  Public: /sites.json · /sites.md · record block on /{n}   Admin: POST /v1/capture[?n=N]
 */
import { all, one, run } from "./db.js";
import { nowIso, stripHtml } from "./util.js";
import { isSelfUrl, selfBase } from "./self.js";
import { recordChange } from "./outreach.js";

const UA = "TheReach02-capture/1.2";
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
};

let ensured = false;
export async function ensureCaptureColumns(env) {
  if (ensured) return;
  let have = [];
  try {
    have = (await all(env, "PRAGMA table_info(sites)")).map((r) => r.name);
  } catch {
    have = [];
  }
  for (const [col, type] of Object.entries(COLS)) {
    if (have.includes(col)) continue;
    await run(env, `ALTER TABLE sites ADD COLUMN ${col} ${type}`).catch(() => null);
  }
  ensured = true;
}

async function get(url, accept = "*/*") {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept },
      signal: AbortSignal.timeout(9000),
    });
    const text = res.ok ? (await res.text()).slice(0, 400000) : "";
    return { ok: res.ok, status: res.status, text, url: res.url || url };
  } catch (err) {
    return { ok: false, status: 0, text: "", url, error: String((err && err.message) || err).slice(0, 120) };
  }
}

const looksHtml = (t) => /^\s*<!doctype html|^\s*<html|<head[\s>]/i.test(String(t || "").slice(0, 600));
const looksXml = (t) => /<(urlset|sitemapindex)\b/i.test(String(t || "").slice(0, 2000));
const clean = (s) => stripHtml(String(s || "")).replace(/\s+/g, " ").trim();

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
  return clean(p.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).slice(0, 600);
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

async function discover(site, env) {
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
      source: { description: "self", sitemap: "self", llms: "self" },
    };
  }
  const home = await get(site.url, "text/html");
  const html = home.ok ? home.text : "";
  const title = meta(html, /<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200);
  const metaDesc = metaContent(html, "name", "description");
  const ogDesc = metaContent(html, "property", "og:description");
  const ogImage = normalizeUrlMaybe(metaContent(html, "property", "og:image"), origin);
  const canonical = normalizeUrlMaybe(meta(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i), origin);
  const langs = hreflangs(html);
  const htmlLang = (html.match(/<html[^>]*\slang=["']([^"']+)["']/i) || ["", ""])[1].toLowerCase().split("-")[0];
  if (htmlLang && !langs.includes(htmlLang)) langs.unshift(htmlLang);

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

  const description = llmsDesc || metaDesc || ogDesc || "";
  const feed = feedLink(html, origin);
  return {
    title,
    description: description.slice(0, 600),
    sitemap,
    llms: llmsOk ? llms.url || `${origin}/llms.txt` : "",
    feed,
    og_image: ogImage,
    canonical,
    jsonld_types: jsonLdTypes(html),
    languages: langs.slice(0, 64),
    languages_count: Math.max(langs.length, llmsCount, 0),
    robots_ok: robots.ok && !looksHtml(robots.text),
    homepage_status: home.status,
    source: {
      description: llmsDesc ? "llms.txt" : metaDesc ? "meta description" : ogDesc ? "og:description" : "none",
      sitemap: sitemap ? (robotsSitemaps.includes(sitemap) ? "robots.txt" : "probe") : "none",
      llms: llmsOk ? "origin" : "none",
    },
  };
}

/** Capture one site and persist it. `overrides` (description/sitemap/llms) are stored and always win. */
export async function captureSite(env, site, overrides = null) {
  await ensureCaptureColumns(env);
  const prev = parseOverrides(site);
  const ov = { ...prev };
  if (overrides && typeof overrides === "object") {
    for (const k of ["description", "sitemap", "llms"]) {
      const v = String(overrides[k] || "").trim();
      if (v) ov[k] = k === "description" ? v.slice(0, 600) : v;
    }
  }
  const d = await discover(site, env);
  const origin = new URL(site.url).origin;
  const description = ov.description || d.description || "";
  const sitemap = normalizeUrlMaybe(ov.sitemap, origin) || d.sitemap || "";
  const llmsUrl = normalizeUrlMaybe(ov.llms, origin) || d.llms || "";
  const stamp = nowIso();
  const captureJson = JSON.stringify({
    title: d.title,
    canonical: d.canonical,
    languages: d.languages,
    robots_ok: !!d.robots_ok,
    homepage_status: d.homepage_status ?? 200,
    source: d.source,
    overrides: Object.keys(ov),
  });
  const before = `${site.description || ""}|${site.sitemap_url || ""}|${site.llms_url || ""}|${site.languages_count || 0}`;
  await run(
    env,
    `UPDATE sites SET description = ?, sitemap_url = ?, llms_url = ?, og_image = ?, jsonld_types = ?, languages_count = ?,
       feed_url = ?, capture_json = ?, overrides_json = ?, captured_at = ? WHERE id = ?`,
    description,
    sitemap,
    llmsUrl,
    d.og_image || "",
    JSON.stringify(d.jsonld_types || []),
    Number(d.languages_count || 0),
    d.feed || "",
    captureJson,
    JSON.stringify(ov),
    stamp,
    site.id
  );
  const after = `${description}|${sitemap}|${llmsUrl}|${d.languages_count || 0}`;
  if (before !== after) {
    await recordChange(env, { kind: "capture", siteId: site.id, url: site.url, detail: `desc:${d.source?.description || "override"} sitemap:${sitemap ? "yes" : "no"} llms:${llmsUrl ? "yes" : "no"} langs:${d.languages_count || 0}` }).catch(() => null);
  }
  return one(env, "SELECT * FROM sites WHERE id = ?", site.id);
}

/** Capture the stalest/uncaptured sites, `limit` at a time. Returns how many remain uncaptured-or-stale (> maxAgeHours). */
export async function captureBatch(env, limit = 6, maxAgeHours = 24, onlyIds = null) {
  await ensureCaptureColumns(env);
  const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000).toISOString();
  const rows = onlyIds
    ? await all(env, `SELECT * FROM sites WHERE active = 1 AND id IN (${onlyIds.map(() => "?").join(",")})`, ...onlyIds)
    : await all(env, `SELECT * FROM sites WHERE active = 1 AND (captured_at IS NULL OR captured_at < ?) ORDER BY captured_at IS NULL DESC, captured_at ASC LIMIT ?`, cutoff, limit);
  const done = [];
  for (const site of rows) {
    try {
      const out = await captureSite(env, site);
      done.push({ name: site.name, ok: true, description: !!out.description, sitemap: !!out.sitemap_url, llms: !!out.llms_url });
    } catch (err) {
      done.push({ name: site.name, ok: false, error: String((err && err.message) || err).slice(0, 120) });
    }
  }
  const left = await one(env, "SELECT COUNT(*) AS c FROM sites WHERE active = 1 AND (captured_at IS NULL OR captured_at < ?)", cutoff).catch(() => ({ c: 0 }));
  return { captured: done.length, done, remaining: Number(left?.c || 0) };
}

/** The Field/Value record for a door — the full "example" shape. */
export function captureView(slot, env, base) {
  const key = slot.indexnow_key || "";
  let capture = {};
  try { capture = JSON.parse(slot.capture_json || "{}") || {}; } catch { capture = {}; }
  let jsonld = [];
  try { jsonld = JSON.parse(slot.jsonld_types || "[]") || []; } catch { jsonld = []; }
  const keyUrl = key ? keyUrlOf({ url: slot.url, indexnow_key: key }, env) : "";
  return {
    n: slot.n,
    name: slot.name,
    url: slot.url,
    sitemap: slot.sitemap_url || "",
    indexnow_key: key,
    key_url: keyUrl,
    llms_txt: slot.llms_url || "",
    description: slot.description || slot.punch || "",
    languages: slot.languages || [],
    languages_count: Number(slot.languages_count || 0) || (slot.languages || []).length,
    feed: slot.feed_url || "",
    og_image: slot.og_image || "",
    jsonld_types: jsonld,
    title: capture.title || "",
    canonical: capture.canonical || "",
    door: `${base}/${slot.n}`,
    door_md: `${base}/${slot.n}.md`,
    hash: `${base}/#${slot.n}`,
    ...(slot.wikidata_qid ? { wikidata: `https://www.wikidata.org/wiki/${slot.wikidata_qid}` } : {}),
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

export function sitesJson(slots, env, base) {
  const sites = slots.map((s) => captureView(s, env, base));
  return {
    name: "The AI Hill Top Lighthouse",
    tagline: "Nothing you build ever starts invisible again.",
    generated: nowIso(),
    count: sites.length,
    record_fields: ["name", "url", "sitemap", "indexnow_key", "key_url", "llms_txt", "description", "languages", "feed", "jsonld_types", "door", "wikidata"],
    sites,
  };
}

export function sitesMd(slots, env, base) {
  return `# The AI Hill Top Lighthouse — site records\n\n> Nothing you build ever starts invisible again.\n> ${slots.length} doors. Machine twin: ${base}/sites.json\n\n${slots.map((s) => captureTableMd(captureView(s, env, base))).join("\n")}`;
}
