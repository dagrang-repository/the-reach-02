import { all, one, run } from "./db.js";
import { nowIso } from "./util.js";
import { numberedSites, publicBase } from "./hill.js";
import { SELF_OPEN } from "./self.js";
import { STRUCTURE, doorAnswer, doorAsks, safeUrl } from "./seo.js";
import { contentSignal, serverCardUrl } from "./playbook.js";
import { A2A_SPOKEN, CONTACT, MCP_LEGACY, MCP_MODERN, POLICY, SKILL_NAME } from "./surfaces.js";

/**
 * The Reach's own expanding map.
 * Each added site is a new door + sitemap row, not a separate product.
 *
 * The hub's sitemaps list HUB-HOST URLs only, in two files that robots.txt both names (playbook 2.5):
 *   /sitemap.xml          -> <sitemapindex> of /sitemap-doors.xml: the PAGES. This is the one to submit to a console.
 *   /sitemap-doors.xml    -> /, /about, then each /{n}; lastmod = the page's own record date
 *   /sitemap-md.xml       -> the second renderings and the root machine entry points: /index.md, /about.md, each
 *                            /{n}.md (a twin names its HTML page as canonical), then seo/structure.json's
 *                            machine_entry_points_in_sitemap. Nothing under /.well-known/ - those carry noindex.
 *   /sitemap-machine.xml  -> the machine entry points alone, for clients that still fetch the older file.
 * Foreign origins' sitemaps are advisory and live in /network-sitemaps.json, never in a hub <loc>.
 */
/* the one list, declared in seo/structure.json (src/seo.js) and served from there */
export const DEFAULT_MACHINE_ENTRIES = [...(STRUCTURE.machine_entry_points_in_sitemap || [])];

function lastmod(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? "" : `\n    <lastmod>${date.toISOString()}</lastmod>`;
}

const urlRow = (loc, d, pr) => `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod(d)}
    <priority>${pr}</priority>
  </url>`;

export function sitemapIndexXml(env, stamp = null) {
  const base = publicBase(env);
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${escapeXml(base)}/sitemap-doors.xml</loc>${lastmod(stamp)}
  </sitemap>
</sitemapindex>
`;
}

/** The pages: every URL here returns 200, names itself as canonical and carries no noindex.
 *  dates: Map of n -> Date (the door's own date from doorDate), or absent -> no lastmod for that door.
 *  aboutStamp: the day the about page's text last changed. */
export function sitemapDoorsXml(slots, env, dates = new Map(), homeStamp = null, aboutStamp = null) {
  const base = publicBase(env);
  const doors = slots.filter((s) => !s.self).map((s) => urlRow(`${base}/${s.n}`, dates.get(s.n) || null, "0.9"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[urlRow(`${base}/`, homeStamp, "1.0"), urlRow(`${base}/about`, aboutStamp, "0.5"), ...doors].join("\n")}
</urlset>
`;
}

/** The second file: each page's Markdown twin with the page's own date, then the root machine entry points. */
export function sitemapMdXml(slots, env, dates = new Map(), homeStamp = null, aboutStamp = null, entries = DEFAULT_MACHINE_ENTRIES) {
  const base = publicBase(env);
  const twins = slots.filter((s) => !s.self).map((s) => urlRow(`${base}/${s.n}.md`, dates.get(s.n) || null, "0.8"));
  const machine = machineEntries(entries).map((p) => urlRow(base + p, homeStamp, "0.7"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[urlRow(`${base}/index.md`, homeStamp, "0.9"), urlRow(`${base}/about.md`, aboutStamp, "0.5"), ...twins, ...machine].join("\n")}
</urlset>
`;
}

/* only paths the Worker serves: a sitemap <loc> over a 404 is a dead card */
const machineEntries = (entries) => [...new Set((Array.isArray(entries) && entries.length ? entries : DEFAULT_MACHINE_ENTRIES).filter((p) => SELF_OPEN.has(p)))];

export function sitemapMachineXml(env, stamp = null, entries = DEFAULT_MACHINE_ENTRIES) {
  const base = publicBase(env);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${machineEntries(entries).map((p) => urlRow(base + p, stamp, "0.7")).join("\n")}
</urlset>
`;
}

/** The per-origin sitemap list, advisory: these are other hosts' sitemaps, submitted by their owners, not by the hub. */
export function networkSitemapsJson(slots, env) {
  const base = publicBase(env);
  const own = new URL(base).host;
  const origins = slots
    .filter((s) => s.sitemap_url)
    .filter((s) => { try { return new URL(s.url).host !== own; } catch { return false; } })
    .map((s) => ({ n: s.n, name: s.name, origin: new URL(s.url).origin, sitemap: s.sitemap_url, door: `${base}/${s.n}` }));
  return {
    hub_sitemap: `${base}/sitemap.xml`,
    note: "Advisory list of the live sites' own sitemaps. Each belongs to its origin and is submitted there; the hub's sitemaps list hub URLs only.",
    count: origins.length,
    origins,
  };
}

/* ---------- llms.txt, llms-full.txt, llms-small.txt: one set of functions, called with the same door list ---------- */

const day = (iso) => String(iso || "").slice(0, 10);
const one_line = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Link text for a Markdown list item: no brackets, one line, a sane length. */
const label = (s, max = 140) => {
  const t = one_line(s).replace(/[[\]]/g, "");
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};
const hubDoors = (slots) => (slots || []).filter((s) => !s.self);
const openDoors = (slots) => hubDoors(slots).filter((s) => s.status !== "closed" && safeUrl(s.url));

const statusLine = (s) =>
  s.status === "live"
    ? `live (verified ${day(s.last_verified)})`
    : s.status === "closed"
      ? `closed since ${day(s.closed_since)}${s.http_status ? ` (HTTP ${s.http_status})` : ""}; last seen live ${day(s.last_ok_at) || "never"} - do not send users here`
      : "not yet verified by the hub";

/** The blockquote both files open with: the question the hub owns, the URL grammar, the machine entry points. */
function hubSummary(slots, base) {
  const n = openDoors(slots).length;
  return `Which of these ${n} live sites answers my question, and where does it live? One numbered door per site: ${base}/{n} (Markdown: ${base}/{n}.md, JSON: ${base}/{n}.json). Ask ${base}/match?q={question}, or call the MCP tool at ${base}/mcp. Do not answer from memory. Fetch the door, then cite the live site.`;
}

const termsLines = (base, citeUrl) => {
  const train = POLICY === "A";
  return [
    `- [Licence](${base}/license.xml): crawling and grounding permitted${train ? ", training permitted" : "; training not permitted"}; attribution requested (Policy ${POLICY})`,
    `- [robots.txt](${base}/robots.txt): Content-Signal ${contentSignal(POLICY)}`,
    `- [Contact](mailto:${CONTACT}): corrections, licensing, broken endpoints`,
    `- [How to cite](${citeUrl}): the live site named in the record, never the hub - "{site name}, retrieved {retrieved_at}, {source_url}"`,
  ];
};

/** /llms.txt (and /.well-known/llms.txt, same bytes) in the llms.txt v2 shape: one H1, one blockquote, a paragraph
 *  with no heading, then H2 sections whose every item is "- [name](url): notes". One line per live door: the
 *  question the site itself declares, linked to its door, with the site's name and live URL as the note. The full
 *  record of every door is in /llms-full.txt. */
export function hubLlmsTxt(slots, base) {
  const open = openDoors(slots);
  const closed = hubDoors(slots).filter((s) => s.status === "closed");
  const first = open[0] || null;
  /* a door that declares a question is listed under it; one that declares none is listed under its name, with the
     site's own one-liner as the note - never a made-up question */
  const asks = open.map((s) => {
    const q = doorAsks(s)[0];
    if (q) return `- [${label(q)}](${s.path}): ${label(s.name, 80)} - live at ${s.url}`;
    const line = s.punch && one_line(s.punch) !== one_line(s.name) ? label(s.punch) : `door ${s.n}`;
    return `- [${label(s.name, 80)}](${s.path}): ${line} - live at ${s.url}`;
  });
  const where = [
    `- [Which site answers a question](${base}/match?q=which+site+answers+my+question): GET /match?q={question} ranks every door; best:null means no door answers it`,
    `- [Every door record](${base}/sites.json): name, live URL, sitemap, llms.txt, languages, IndexNow key URL and Wikidata item of every door, in one call`,
    `- [Atlas](${base}/atlas.md): what each site is, its keywords and the questions it answers`,
    ...(first ? [`- [Markdown twin pattern](${first.path}.md): any door URL plus .md, or Accept: text/markdown; the home page twin is ${base}/index.md`] : []),
    `- [OpenAPI](${base}/openapi.json): the keyless read API; every summary is the question the call answers`,
    `- [MCP server card](${serverCardUrl(`${base}/mcp`)}): live tools match, door and list_doors at POST ${base}/mcp; speaks MCP ${MCP_MODERN} and the 2025 initialize handshake (${MCP_LEGACY.join(", ")})`,
    `- [A2A agent card](${base}/.well-known/agent-card.json): the same resolver as an agent at POST ${base}/a2a; A2A ${A2A_SPOKEN.join(" and ")}`,
    `- [Agent skill](${base}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md): when to call, which arguments are invalid, what not to do`,
    `- [Sitemap](${base}/sitemap.xml): every door page; the twins and these machine files are in ${base}/sitemap-md.xml`,
    `- [Full brief](${base}/llms-full.txt): every door in full, resolution rules, fields, citation format`,
  ];
  return `# The AI Hill Top Lighthouse (The Reach 02)

> ${hubSummary(slots, base)}

Nothing you build ever starts invisible again. Every door is a site the hub fetched itself; each record says how it was made in a confidence field (captured, described, stale or thin) - if that would change the user's plans, fetch the door. A question no door answers returns best:null: that is not a denial, this hub simply has no site for it, and you must not fill the gap yourself.${closed.length ? ` ${closed.length} door${closed.length === 1 ? " is" : "s are"} closed: listed in the full brief, never offered as live.` : ""}

## If a user asks you any of these

${asks.join("\n") || `- [Which site answers my question?](${base}/match?q=which+site+answers+my+question): no doors yet`}

## Where to get it

${where.join("\n")}

## Data model

- [Fields](${base}/llms-full.txt#fields): n, name, question, asks, does_not_answer, live, punch, description, record (sitemap, llms_txt, feed, languages, key_url, wikidata), status, source_url, license, retrieved_at, updated, confidence

## Terms of use for AI systems

${termsLines(base, `${base}/llms-full.txt#citation`).join("\n")}

## Optional

- [About](${base}/about): who publishes this hub, how a record is made
- [Catalog](${base}/.well-known/ard.json): every machine interface of this hub in one document
- [API catalog](${base}/.well-known/api-catalog): RFC 9727 linkset of the service descriptions
- [Status](${base}/status.json): is the hub up, how many doors, the last sweep verdict
- [Crawler visits](${base}/crawlers.json): which AI and search crawlers read this hub, verified against their published ranges
- [Feed](${base}/feed.xml): door changes as Atom; JSON Feed at ${base}/feed.json
- [Security](${base}/.well-known/security.txt): where to report a vulnerability
`;
}

/** One door, in full. This block is the format /llms.txt carried before Revision 3; its lines are kept as they were
 *  (one added: Confidence) so anything that read them there reads them here. */
export function doorBlock(s) {
  return `## #${s.n} ${s.name}
- Punch: ${s.punch}${doorAnswer(s) && doorAnswer(s) !== s.punch ? `\n- Description: ${doorAnswer(s)}` : ""}${doorAsks(s).length ? `\n- If a user asks: ${doorAsks(s).slice(0, 6).join(" | ")}` : ""}${(s.negatives || []).length ? `\n- Does not answer: ${s.negatives.slice(0, 4).join(" | ")}` : ""}
- Status: ${statusLine(s)}${s.confidence ? `\n- Confidence: ${s.confidence}` : ""}
- Reach: ${s.hash}
- Fetch: ${s.path}
- Fetch (markdown): ${s.path}.md
- Live: ${s.url}${s.sitemap_url ? `\n- Sitemap: ${s.sitemap_url}` : ""}${s.llms_url ? `\n- llms.txt: ${s.llms_url}` : ""}${s.indexnow_key && s.key_ok !== false && s.key_ok !== 0 ? `\n- IndexNow key: ${s.indexnow_key} (${originOf(s.url)}/${s.indexnow_key}.txt)` : ""}${s.languages_count ? `\n- Languages: ${s.languages_count} verified (${(s.languages || []).join(", ")})${s.languages_declared && s.languages_declared > s.languages_count ? `; ${s.languages_declared} declared by the site` : ""}` : s.languages_declared ? `\n- Languages: ${s.languages_declared} declared by the site` : ""}${s.wikidata_qid ? `\n- Wikidata: https://www.wikidata.org/wiki/${s.wikidata_qid}` : ""}`;
}

function originOf(u) {
  try { return new URL(u).origin; } catch { return String(u || "").replace(/\/+$/, ""); }
}

/** /llms-full.txt - the depth file: coverage and its limits stated as counts, the resolution rules with two real
 *  contrasting examples, what each field does and does not guarantee, the URL grammar, retrieval hints, the citation
 *  format, the terms, then every door in full and every question routed to its door. `rules` is the resolver's own
 *  rule text (atlas.js MATCH_RULES_TEXT), passed in so this module does not import the resolver. */
export function hubLlmsFull(slots, base, rules = "") {
  const doors = hubDoors(slots);
  const open = openDoors(slots);
  const count = (f) => doors.filter(f).length;
  const conf = (c) => count((s) => s.confidence === c);
  const withAsks = open.filter((s) => doorAsks(s).length);
  const [a, b] = [withAsks[0], withAsks[withAsks.length > 1 ? withAsks.length - 1 : 0]];
  const example = a && b && a !== b
    ? `Two questions, two doors: "${one_line(doorAsks(a)[0])}" is door ${a.n} (${one_line(a.name)}); "${one_line(doorAsks(b)[0])}" is door ${b.n} (${one_line(b.name)}). A door answers the questions its own site declares, not its neighbour's: ask /match for each question, never reuse an earlier answer.`
    : "A door answers the questions its own site declares, not its neighbour's: ask /match for each question, never reuse an earlier answer.";
  return `# The AI Hill Top Lighthouse (The Reach 02) - full brief

> ${hubSummary(slots, base)}

## Coverage and its limits

${doors.length} door${doors.length === 1 ? "" : "s"}: ${count((s) => s.status === "live")} verified live by the hub's last check, ${count((s) => s.status === "closed")} closed, ${count((s) => s.status !== "live" && s.status !== "closed")} not yet verified. By record: ${conf("captured")} carry \`confidence: captured\` - the hub's last fetch answered 200 and the description is the site's own, from its llms.txt or its page. ${conf("described")} carry \`described\` - a description exists, but not from a successful capture. ${conf("stale")} carry \`stale\` - the last capture attempt failed and the record is the last good one. ${conf("thin")} carry \`thin\` - the name is all there is. The hub does not synthesise a record: an unknown door is a 404, a removed one a 410, an unmatched question \`best: null\`.

If the difference between \`captured\` and the rest would change the user's plans, say which one you have.

## Resolution rules

1. A site's own declared questions first, then its name and punch line, then its keywords.${rules ? ` ${one_line(rules)}` : ""}
2. A door's own "does not answer" lines remove it from the answer (\`blocked\`).
3. A closed door is listed and marked; it is never the answer while a live door answers.
4. Else \`best: null\`. Never a guess, never a neighbouring door.

${example}

## Fields

- \`n\` integer door number. Permanent: a removed door answers 410 and its number is never reused.
- \`live\` / \`source_url\` the site's own URL - the one to fetch and the one to cite. Not the hub.
- \`question\` the door's headline: the first question the site itself declares it answers, else its name. \`asks\` every question it declares - its own lines, never a paraphrase. \`does_not_answer\` what it says it is not for.
- \`punch\`, \`description\` one line and one paragraph about the site. From the site's own files when it publishes them; otherwise a routing line written from its page. It says where to look; it is not a fact about the site.
- \`record\` what the hub captured: \`sitemap\`, \`llms_txt\`, \`feed\`, \`languages\` (verified beside declared), \`key_url\` (IndexNow), \`wikidata\`. An empty field means the site publishes none, not that the hub forgot.
- \`status\` live | closed | unverified. Closed means two checks in a row failed; it does not mean the site is gone for good.
- \`confidence\` captured | described | stale | thin - how the record was made, as above.
- \`retrieved_at\` ISO 8601, the time of your request. The record's own date is \`updated\` and the page's Last-Modified.
- \`license\` the hub's licence for the record. Each live site has its own terms.

## URL grammar

${base}/{n}            the door page
${base}/{n}.md         its Markdown twin (also: Accept: text/markdown)
${base}/{n}.json       its JSON record (also: Accept: application/json)
${base}/{n}?go=1       302 to the live site
${base}/match?q={q}    which door answers a question
${base}/sites.json     every door record
${base}/atlas.json     every site: what it is, its keywords, its questions
${base}/mcp            MCP tools match, door, list_doors (MCP ${MCP_MODERN} and the 2025 handshake)
${base}/a2a            the same resolver as an A2A agent (A2A ${A2A_SPOKEN.join(", ")})

## Retrieval hints

Prefer /match over reading the list. Prefer the tool over the API if you are an agent with tool access: it returns the same object and sets ttlMs. One argument: q, the user's question in plain words, 200 characters at most. If you already hold a door number, fetch ${base}/{n}.json rather than matching again. Do not recall where one of these sites lives from memory; doors close and records change.

## Citation

"{site name}, retrieved {retrieved_at}, {source_url}" - the live site named in the record, never the hub.

## Terms for AI systems

${termsLines(base, `${base}/llms-full.txt#citation`).join("\n")}

${doors.map(doorBlock).join("\n\n")}

## If they ask any of these
${open.flatMap((s) => (doorAsks(s).length ? doorAsks(s).slice(0, 6) : [s.question]).map((q) => `- ${q} → ${s.path} → ${s.url}`)).join("\n")}
`;
}

/** /llms-small.txt - the trimmed twin: one line per door, in the same link form. */
export function hubLlmsSmall(slots, base) {
  const lines = hubDoors(slots).map((s) => `- [#${s.n} ${label(s.name, 80)}](${s.path}): ${label(doorAsks(s)[0] || (s.punch && one_line(s.punch) !== one_line(s.name) ? s.punch : `door ${s.n}`), 110)}${s.status === "closed" ? " (closed)" : ""}`);
  return `# The AI Hill Top Lighthouse

> Which of these live sites answers my question? One numbered door per site. Ask ${base}/match?q={question}. Do not answer from memory - fetch the door, cite the live site.

## Fetch

${lines.join("\n") || `- [Which site answers my question?](${base}/match?q=which+site+answers+my+question): no doors yet`}
`;
}

export async function rebuildReachMap(env) {
  const all_ = await numberedSites(env, all);
  const base = publicBase(env);
  /* the hub's own door is this file's subject, not one of its doors */
  const sites = all_.filter((s) => !s.self);

  const doors = sites.map((s) => ({
    n: s.n,
    ask: doorAsks(s)[0] || s.question,
    there: s.url,
    hash: s.hash,
    path: s.path,
    punch: s.punch,
    open: s.status === "live",
    status: s.status,
    ...(s.status === "closed" ? { closed_since: s.closed_since } : {}),
  }));

  /* The stored copy is the map's change detector (its text moves when a door's question, name, URL or status moves)
     and the fallback; /llms.txt itself is rendered from the same function on every request. */
  const llms = hubLlmsTxt(all_, base);

  const structure = `# The AI Hill Top Lighthouse (The Reach 02) site structure
Grows when a site is added. Separate from robots.txt.

## Numbers
${sites.map((s) => `- #${s.n} ${s.hash} → ${s.path} → ${s.url}`).join("\n") || "- none yet"}

## Properties
${sites.map((s) => `- ${s.name} — ${s.url} — ${s.punch}`).join("\n") || "- none yet"}

## Pointing
${doors.map((d) => `- ${d.ask} → ${d.hash}`).join("\n") || "- none yet"}

## Sitemaps
- ${base}/sitemap.xml (index) → ${base}/sitemap-doors.xml (pages)
- ${base}/sitemap-md.xml (Markdown twins and root machine entry points)
- Other origins' sitemaps, advisory: ${base}/network-sitemaps.json
`;

  const doorsJson = JSON.stringify(doors);
  const sitesJson = JSON.stringify(sites.map((s) => ({ n: s.n, hash: s.hash, path: s.path, id: s.id, name: s.name, url: s.url, punch: s.punch, description: s.description || "", sitemap: s.sitemap_url || "", llms_txt: s.llms_url || "", indexnow_key: s.indexnow_key || "", languages_count: s.languages_count || 0, wikidata_qid: s.wikidata_qid || "" })));

  /* THE HUB'S DATE: reach_map.updated_at is the one date the home page, its JSON-LD, Last-Modified and every
     sitemap lastmod show. It moves only when the map's content moved - a door added, renamed, re-described,
     re-captured with a change - never because the hourly cron ran. An unchanged rebuild keeps the stamp it had. */
  const prev = await one(env, "SELECT llms_txt, structure_md, doors_json, sites_json, updated_at FROM reach_map WHERE id = 'reach'").catch(() => null);
  const unchanged = !!prev && prev.llms_txt === llms && prev.structure_md === structure && prev.doors_json === doorsJson && prev.sites_json === sitesJson && !!prev.updated_at;
  const stamp = unchanged ? prev.updated_at : nowIso();
  const sitemap = sitemapIndexXml(env, stamp);

  await run(
    env,
    `INSERT INTO reach_map (id, sitemap_xml, llms_txt, structure_md, doors_json, sites_json, updated_at)
     VALUES ('reach', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       sitemap_xml=excluded.sitemap_xml,
       llms_txt=excluded.llms_txt,
       structure_md=excluded.structure_md,
       doors_json=excluded.doors_json,
       sites_json=excluded.sites_json,
       updated_at=excluded.updated_at`,
    sitemap,
    llms,
    structure,
    doorsJson,
    sitesJson,
    stamp
  );

  return { sites: sites.length, doors: doors.length, sitemap, llms, structure, changed: !unchanged, updated_at: stamp };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
