/** The hub's own machine surface, served by the Worker itself, plus the header layer every hub response wears.
 *  Every URL written into a file here is absolute and built from publicBase(env). Nothing here is a template:
 *  a path answered by this module is a path the Worker serves; a path this module does not serve is a real 404.
 *  One policy (A: search=yes, ai-input=yes, ai-train=yes) in robots.txt, ai.txt, license.xml, tdmrep.json,
 *  agent-permissions.json and the Content-Signal header - change all of them in one change or none. */
import { publicBase } from "./hill.js";
import { buildRobotsTxt } from "./playbook.js";
import { captureTableMd, captureView, sitesJson } from "./capture.js";
import { nowIso } from "./util.js";
import { MATCH_RULES_TEXT } from "./atlas.js";

export const SIGNAL = "search=yes, ai-input=yes, ai-train=yes";
export const PREVIEW = "max-snippet:-1, max-image-preview:large, max-video-preview:-1";
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, Idempotency-Key, A2A-Version",
  "access-control-expose-headers":
    "MCP-Protocol-Version, Mcp-Session-Id, ETag, Last-Modified, Link, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After",
};

export const MCP_NAME = "app.aplusz.reach2/hub";
export const MCP_VERSION = "1.1.0";
export const MCP_MODERN = "2026-07-28";
export const MCP_LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const A2A_SPOKEN = ["1.0", "0.3"];
const CONTACT = "dagrang@gmail.com";
const REPO = "https://github.com/dagrang-repository/the-reach-02";

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function escapeXml(s) {
  return escapeHtml(s);
}

/** A stable tag over the bytes actually served (FNV-1a), so If-None-Match can answer 304. */
export function etagOf(body) {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `"${h.toString(16)}-${body.length.toString(16)}"`;
}

/* ---------- the bridge to the door renderer (src/door-page.js, src/hill.js homeMarkdown, src/seo.js) ----------
   Loaded once. When a module is absent the fallbacks below render the same record honestly, from the same slot. */
import * as DoorPage from "./door-page.js";
import { homeMarkdown as hillHomeMarkdown, seoKeywordsJson as hillSeoKeywordsJson, seoStructureJson as hillSeoStructureJson } from "./hill.js";
import { KEYWORDS as SEO_KEYWORDS, STRUCTURE as SEO_STRUCTURE } from "./seo.js";
const A_MODULES = { ...DoorPage, homeMarkdown: hillHomeMarkdown, seoKeywordsJson: hillSeoKeywordsJson, seoStructureJson: hillSeoStructureJson, KEYWORDS: SEO_KEYWORDS, STRUCTURE: SEO_STRUCTURE };
/* the modules are bundled statically (wrangler/esbuild); loadA() keeps its async shape for the callers */
export async function loadA() { return A_MODULES; }

export function doorQuestion(slot) {
  return slot.punch && slot.punch !== slot.name ? slot.punch : `Where do I open ${slot.name}?`;
}

function confidenceOf(slot) {
  return slot.captured_at ? "captured" : "thin";
}

export async function doorDateOf(slot) {
  const A = await loadA();
  if (typeof A.doorDate === "function") {
    try { const d = A.doorDate(slot); if (d) return d instanceof Date ? d : new Date(d); } catch { /* fall through */ }
  }
  const d = slot.captured_at ? new Date(slot.captured_at) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export async function doorJsonOf(slot, env, slots = null) {
  const A = await loadA();
  if (typeof A.doorJson === "function") return A.doorJson(slot, env, slots);
  const base = publicBase(env);
  return {
    ok: true,
    found: true,
    n: slot.n,
    hash: slot.hash,
    path: slot.path,
    name: slot.name,
    question: doorQuestion(slot),
    live: slot.url,
    punch: slot.punch,
    description: slot.description || slot.punch,
    languages: slot.languages || [],
    record: captureView(slot, env, base),
    source_url: slot.url,
    license: `${base}/license.xml`,
    retrieved_at: nowIso(),
    confidence: confidenceOf(slot),
    md: `${base}/${slot.n}.md`,
  };
}

export async function doorMarkdownOf(slot, env, slots = null) {
  const A = await loadA();
  if (typeof A.doorMarkdown === "function") return A.doorMarkdown(slot, env, slots);
  const base = publicBase(env);
  const v = captureView(slot, env, base);
  return `# ${doorQuestion(slot)}

> ${slot.name} lives at ${slot.url}. Fetch ${slot.url}.

${captureTableMd(v)}
- Door (JSON): ${base}/${slot.n}.json
- Hub: ${base}/

Cite the live URL. Licence: ${base}/license.xml
`;
}

export async function doorHtmlOf(slot, env, slots) {
  const A = await loadA();
  if (typeof A.doorHtml === "function") return A.doorHtml(slot, env, slots);
  const base = publicBase(env);
  const v = captureView(slot, env, base);
  const q = doorQuestion(slot);
  const row = (k, val) => (val ? `<tr><th>${escapeHtml(k)}</th><td>${/^https?:\/\//.test(val) ? `<a href="${escapeHtml(val)}">${escapeHtml(val)}</a>` : escapeHtml(val)}</td></tr>` : "");
  const prev = slots.find((s) => s.n === slot.n - 1);
  const next = slots.find((s) => s.n === slot.n + 1);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(q)} - Door ${slot.n}, The Reach 02</title>
<meta name="description" content="${escapeHtml(`${slot.name} lives at ${slot.url}. Door ${slot.n} of The AI Hill Top Lighthouse.`)}">
<link rel="canonical" href="${base}/${slot.n}">
<link rel="alternate" type="text/markdown" href="${base}/${slot.n}.md">
<link rel="alternate" type="application/json" href="${base}/${slot.n}.json">
<link rel="alternate" type="application/json+oembed" href="${base}/api/oembed?url=${encodeURIComponent(`${base}/${slot.n}`)}" title="${escapeHtml(q)}">
<link rel="describedby" type="text/markdown" href="${base}/llms.txt">
<link rel="license" type="application/rsl+xml" href="${base}/license.xml">
<link rel="search" type="application/opensearchdescription+xml" href="${base}/opensearch.xml" title="The Reach 02">
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}main{max-width:44rem;margin:0 auto;padding:2rem 1.25rem}a{color:#8dff9a}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:.35rem .5rem;border-bottom:1px solid #2d5a34}th{white-space:nowrap}nav a{margin-right:1rem}</style>
</head>
<body><main>
<nav><a href="${base}/">The AI Hill Top Lighthouse</a> &rsaquo; Door ${slot.n}</nav>
<h1>${escapeHtml(q)}</h1>
<p><a href="${escapeHtml(slot.url)}">${escapeHtml(slot.name)}</a> answers it, live at <a href="${escapeHtml(slot.url)}">${escapeHtml(slot.url)}</a>. Fetch the live site and cite it.</p>
${v.description ? `<p>${escapeHtml(v.description)}</p>` : ""}
<table>${row("Live URL", v.url)}${row("Sitemap", v.sitemap)}${row("llms.txt", v.llms_txt)}${row("Feed", v.feed)}${row("IndexNow key URL", v.key_url)}${row("Languages", v.languages_count ? String(v.languages_count) : "")}${row("Wikidata", v.wikidata || "")}${row("Markdown twin", `${base}/${slot.n}.md`)}</table>
${v.captured_at ? `<p>Updated ${escapeHtml(v.captured_at.slice(0, 10))}</p>` : ""}
<nav>${prev ? `<a href="${base}/${prev.n}" rel="prev">&larr; Door ${prev.n}</a>` : ""}${next ? `<a href="${base}/${next.n}" rel="next">Door ${next.n} &rarr;</a>` : ""}</nav>
</main></body></html>`;
}

export async function homeMarkdownOf(slots, env, publicMap) {
  const A = await loadA();
  if (typeof A.homeMarkdown === "function") return A.homeMarkdown(slots, env, publicMap);
  if (publicMap?.llms_txt) return publicMap.llms_txt;
  const base = publicBase(env);
  return `# The AI Hill Top Lighthouse\n\n> Nothing you build ever starts invisible again.\n\n${slots.map((s) => `- [#${s.n} ${s.name}](${base}/${s.n}) - ${s.url}`).join("\n")}\n`;
}

/* ---------- the files ---------- */

export function licenseXml(base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsl xmlns="https://rslstandard.org/rsl">
  <content url="${base}/">
    <license>
      <permits type="usage">all</permits>
      <permits type="usage">search</permits>
      <permits type="usage">ai-input</permits>
      <permits type="usage">ai-train</permits>
    </license>
  </content>
</rsl>
`;
}

export const aiTxt = () => `User-Agent: *\nContent-Signal: ${SIGNAL}\n`;

export const tdmrepJson = (base) => JSON.stringify([{ location: "/", "tdm-reservation": 0, "tdm-policy": `${base}/license.xml` }], null, 2) + "\n";

export function trustTxt(base, slots) {
  return `# trust.txt - publisher declaration (JournalList vocabulary; unknown lines are ignored).
contact=${CONTACT}
belongto=${base}/
disclosure=${base}/llms.txt
${slots.filter((s) => !s.self && s.status !== "closed").map((s) => `member=${s.url}`).join("\n")}
# Machine surface:
# ${base}/llms.txt
# ${base}/openapi.json
# ${base}/.well-known/mcp-server-card
# ${base}/.well-known/agent-card.json
`;
}

export function apiCatalog(base) {
  return JSON.stringify(
    {
      linkset: [
        {
          anchor: `${base}/`,
          "service-desc": [
            { href: `${base}/openapi.json`, type: "application/vnd.oai.openapi+json" },
            { href: `${base}/.well-known/mcp-server-card`, type: "application/json" },
            { href: `${base}/.well-known/agent-card.json`, type: "application/json" },
          ],
          "service-doc": [{ href: `${base}/llms-full.txt`, type: "text/markdown" }],
          status: [{ href: `${base}/status.json`, type: "application/json" }],
        },
      ],
    },
    null,
    2
  ) + "\n";
}

export function opensearchXml(base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>The Reach 02</ShortName>
  <Description>Which of these live sites answers my question?</Description>
  <Url type="application/json" template="${base}/match?q={searchTerms}"/>
  <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>
`;
}

export const llmsApiTxt = (base) => `# API

- [OpenAPI 3.1](${base}/openapi.json) - keyless, CORS *, same resolver as the pages.
- Which site answers X: ${base}/match?q=X
- One door: ${base}/{n} (JSON with Accept: application/json, or ${base}/{n}.json; Markdown at ${base}/{n}.md)
- Every door record: ${base}/sites.json
- MCP (dual era): POST ${base}/mcp - card at ${base}/.well-known/mcp-server-card
- A2A 1.0: POST ${base}/a2a - card at ${base}/.well-known/agent-card.json
`;

export function agentsMd(base) {
  return `# AGENTS.md

Crawlers read llms.txt. You, a coding agent in this repository, read this.

## What this project is

The Reach 02 (The AI Hill Top Lighthouse): a Cloudflare Worker + D1 hub at ${base} that lists
live sites as numbered doors so AI models and search engines find and cite them. One atlas
resolver (src/atlas.js) answers "which site answers X?"; the pages, the Markdown twins,
/match, /openapi.json, /mcp and /a2a all call it.

## File layout

| Path                  | Role                                                     |
|-----------------------|----------------------------------------------------------|
| src/index.js          | the router: one origin, preflight, the header layer      |
| src/surfaces.js       | every hub discovery file, absolute URLs from publicBase  |
| src/mcp.js            | the MCP tool server, dual era                            |
| src/a2a.js            | the A2A 1.0 endpoint                                     |
| src/atlas.js          | THE resolver: /match, atlas.json, atlas.md               |
| src/door-page.js      | /{n} as HTML, Markdown and JSON                          |
| src/map.js            | llms.txt and the sitemap partitions                      |
| src/playbook.js       | the per-site pack and buildRobotsTxt                     |
| wrangler.jsonc        | one custom domain, workers_dev off                       |

## Non-negotiable rules

1. Never add a second resolution path.
2. Never advertise an endpoint before it answers.
3. Absolute HTTPS URLs built from publicBase(env) in every discovery file.
4. robots.txt, ai.txt, license.xml, tdmrep.json, agent-permissions.json and Content-Signal say the same training answer.
5. An unknown door or a missing twin is a real 404, never a soft 200.
6. The MCP route answers BOTH server/discover (2026-07-28) AND initialize (legacy).

## Deploy

    npx wrangler deploy
`;
}

export const humansTxt = (base) => `/* TEAM */
Site: The AI Hill Top Lighthouse (The Reach 02)
Contact: ${CONTACT}
Location: ${base}/

/* SITE */
Standards: HTML5, llms.txt, OpenAPI 3.1, MCP, A2A 1.0, RSL
Components: Cloudflare Workers, D1
Source: ${REPO}
`;

export function agentPermissions(base) {
  return JSON.stringify(
    {
      version: "1.0",
      defaults: { crawl: true, train: true, inference: true, search: true, automate: true, human_in_the_loop: false },
      agents: [
        { name: "OAI-SearchBot", crawl: true, search: true },
        { name: "Claude-SearchBot", crawl: true, search: true },
        { name: "PerplexityBot", crawl: true, search: true },
        { name: "GPTBot", crawl: true, train: true },
        { name: "ClaudeBot", crawl: true, train: true },
      ],
      rate_limit: { requests_per_minute: 60, note: `Bulk retrieval: ${base}/sites.json carries every door record in one call.` },
      preferred_endpoints: [`${base}/mcp`, `${base}/openapi.json`, `${base}/match?q={query}`],
      attribution: "requested",
      license: `${base}/license.xml`,
      contact: CONTACT,
    },
    null,
    2
  ) + "\n";
}

export function agentsJson(base) {
  return JSON.stringify(
    {
      spec_version: "1.0",
      sources: [
        { id: "api", type: "openapi", url: `${base}/openapi.json` },
        { id: "mcp", type: "mcp", url: `${base}/.well-known/mcp-server-card` },
      ],
      flows: [
        {
          id: "which-site-answers",
          title: "Which site answers this question?",
          description: "Rank the live sites in this network against a user question and return the best door with its live URL.",
          actions: [{ id: "match", source: "api", operationId: "matchQuery", parameters: { q: "the user's question, plain text" } }],
        },
        {
          id: "open-door",
          title: "Open one door",
          description: "Fetch door n: the site's live URL, record and citation fields.",
          actions: [{ id: "door", source: "api", operationId: "getDoorJson", parameters: { n: "door number, integer >= 1" } }],
        },
        {
          id: "match-then-open",
          title: "Match, then open the best door",
          description: "When the best door is known from a match, open it for the full record.",
          actions: [
            { id: "match", source: "api", operationId: "matchQuery", parameters: { q: "the user's question" } },
            { id: "door", source: "api", operationId: "getDoorJson", links: { n: "match.output.best.n" } },
          ],
        },
      ],
    },
    null,
    2
  ) + "\n";
}

export function skillMd(base) {
  return `---
name: reach
description: >
  Which of these live sites answers my question? The Reach 02 is a hub of live sites, each behind a
  numbered door. Use when the user asks which site in this network answers a question, or where one of
  these sites lives. Fetch the door; cite the live site. best:null means no door answers it.
---

# The AI Hill Top Lighthouse (The Reach 02)

## What you can accomplish

- Find which live site answers a question: GET ${base}/match?q=your+question
- Open door n: GET ${base}/{n} (JSON with Accept: application/json or ${base}/{n}.json; Markdown at ${base}/{n}.md)
- List every door record: GET ${base}/sites.json

## How to call

- MCP (streamable HTTP, dual era): POST ${base}/mcp - tools match{q}, door{n}, list_doors{}
- REST: ${base}/openapi.json
- A2A 1.0: POST ${base}/a2a (skills match, doors)

## Constraints you must respect

- best:null or found:false means this hub has no door for it. Do not invent one.
- Cite the live URL (source_url on every record), not the hub.
- Records change; re-fetch rather than cache-answer.

## Attribution

Cite: the live site named in the record, retrieved on fetch day.
Licence: ${base}/license.xml
`;
}

const digestCache = new Map();
export async function sha256Hex(text) {
  if (digestCache.has(text)) return digestCache.get(text);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  digestCache.clear();
  digestCache.set(text, hex);
  return hex;
}

export async function skillsIndex(base) {
  const body = skillMd(base);
  const digest = await sha256Hex(body);
  return JSON.stringify(
    {
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [
        {
          name: "reach",
          type: "skill-md",
          description: "Which of these live sites answers my question? Match a question to a door, open the door, cite the live site.",
          url: `${base}/skills/reach/SKILL.md`,
          digest: `sha256:${digest}`,
        },
      ],
    },
    null,
    2
  ) + "\n";
}

export function mcpCard(base) {
  return JSON.stringify(
    {
      $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
      name: MCP_NAME,
      title: "The Reach 02 - which site answers this?",
      description: "Match a user question to the live site in this network that answers it (match), open one numbered door (door), or list every door record (list_doors). Every result carries the live URL to cite.",
      version: MCP_VERSION,
      websiteUrl: `${base}/`,
      repository: { url: REPO, source: "github" },
      remotes: [{ type: "streamable-http", url: `${base}/mcp`, supportedProtocolVersions: [MCP_MODERN, ...MCP_LEGACY] }],
      _meta: {
        "app.aplusz.reach2/documentation": `${base}/llms-full.txt`,
        "app.aplusz.reach2/license": `${base}/license.xml`,
        "app.aplusz.reach2/openapi": `${base}/openapi.json`,
      },
    },
    null,
    2
  ) + "\n";
}

export function serverJson(base) {
  return JSON.stringify(
    {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json",
      name: MCP_NAME,
      description: "Which of these live sites answers my question? Match, open a door, cite the live site.",
      version: MCP_VERSION,
      websiteUrl: `${base}/`,
      repository: { url: REPO, source: "github" },
      remotes: [{ type: "streamable-http", url: `${base}/mcp` }],
    },
    null,
    2
  ) + "\n";
}

export function agentCard(base) {
  return JSON.stringify(
    {
      protocolVersion: "1.0",
      name: "The Reach 02",
      description: "Which of these live sites answers my question? Returns the best door with the live URL to cite, or best:null when none does.",
      url: `${base}/a2a`,
      preferredTransport: "JSONRPC",
      provider: { organization: "Verge Heights", url: `${base}/` },
      version: MCP_VERSION,
      documentationUrl: `${base}/llms-full.txt`,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false, extendedAgentCard: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json", "text/plain"],
      skills: [
        {
          id: "match",
          name: "Which site answers this?",
          description: "Send the user's question as text; the reply carries the same object as GET /match?q= (best, matches[], blocked[]).",
          tags: ["directory", "routing", "citation"],
          examples: ["Which site here answers: do I need a visa for Japan?", "Where do I open the cheapest-flight site?"],
        },
        {
          id: "doors",
          name: "List every door",
          description: "Every door record (name, live URL, sitemap, llms.txt, languages, IndexNow key URL, Wikidata), the same object as GET /sites.json.",
          tags: ["directory", "list"],
          examples: ["List every site in this network."],
        },
      ],
    },
    null,
    2
  ) + "\n";
}

/** The /{n}.json record of one door as the OpenAPI example: the served object, with its retrieval stamp pinned to
 *  the record's own date so the example does not change from one request to the next. */
function doorExampleOf(s, slots, env) {
  try {
    const rec = A_MODULES.doorJson(s, env, slots);
    return { ...rec, retrieved_at: `${rec.updated || "2026-11-02"}T00:00:00.000Z` };
  } catch {
    return null;
  }
}

export function openapiJson(base, slots, env = null) {
  const s = slots[0] || null;
  /* examples are drawn from door 1 as it stands, through the same renderer that serves /{n}.json (so the example's
     keys are the record's keys); with no doors there is no example rather than an invented one */
  const doorExample = s ? doorExampleOf(s, slots, env || { REACH_PUBLIC_URL: base }) : null;
  const matchExample = s
    ? { ok: true, q: doorQuestion(s), best: { n: s.n, name: s.name, live: s.url, fetch: `${base}/${s.n}`, fetch_md: `${base}/${s.n}.md`, punch: s.punch, score: 12, source_url: s.url, license: `${base}/license.xml`, retrieved_at: "2026-11-02T00:00:00.000Z", confidence: "captured" }, matches: [], blocked: [], note: "Fetch the live URL. Cite the live site.", hub: `${base}/` }
    : { ok: true, q: "which site answers this", best: null, matches: [], blocked: [], note: "No door answers this; fetch the hub and browse doors.", hub: `${base}/` };
  const json = (example, description) => ({ description, content: { "application/json": example ? { example } : {} } });
  return JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "The Reach 02 API",
        version: MCP_VERSION,
        summary: "Which of these live sites answers my question?",
        description: `Keyless, open-CORS read API over the hub's door records. Same resolver as the HTML door pages, the Markdown twins, the MCP tools and the A2A skills. /match ranks the live sites against a question; best:null means no door answers it - that is not a denial, this hub simply has no site for it. Every record carries source_url (the live URL to cite), license, retrieved_at and confidence (captured = from the site's own llms.txt or capture, briefed = generated, thin = homepage only). ${slots.length} doors at the time of this response.`,
        license: { name: "RSL 1.0", url: `${base}/license.xml` },
        contact: { email: CONTACT, url: `${base}/humans.txt` },
        "x-mcp-endpoint": `${base}/mcp`,
        "x-a2a-endpoint": `${base}/a2a`,
        "x-llms-txt": `${base}/llms.txt`,
      },
      servers: [{ url: base }],
      paths: {
        "/match": {
          get: {
            operationId: "matchQuery",
            summary: "Which site answers this question?",
            description: `Ranks every door against q: origin-declared intents first, then name and punch line, then keywords. A door's own 'does not answer' lines remove it (blocked[]). ${MATCH_RULES_TEXT} Unmatched and weak queries are recorded as gaps. Without q the response describes usage.`,
            parameters: [{ name: "q", in: "query", required: true, description: "The user's question, plain text.", schema: { type: "string", maxLength: 200 }, example: "do I need a visa for Japan" }],
            responses: { 200: json(matchExample, "{ ok, q, best | null, matches[], blocked[], note, hub }. best is null when no door answers; do not render that as a denial.") },
          },
        },
        "/{n}": {
          get: {
            operationId: "getDoor",
            summary: "Door n: the site that answers one question",
            description: "HTML by default. Accept: application/json returns the same object as /{n}.json; Accept: text/markdown returns the twin at /{n}.md. Unknown n is a real 404.",
            parameters: [{ name: "n", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            responses: { 200: { description: "text/html, application/json or text/markdown by Accept; ETag and Last-Modified set; Vary: Accept." }, 404: { description: "No door at that number." } },
          },
        },
        "/{n}.json": {
          get: {
            operationId: "getDoorJson",
            summary: "Door n as JSON",
            parameters: [{ name: "n", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            responses: { 200: json(doorExample, "The door record: live URL, record (sitemap, llms.txt, languages, IndexNow key URL, Wikidata), source_url, license, retrieved_at, confidence."), 404: json({ ok: false, found: false, error: "no door at that number" }, "{ found: false }. Never a synthesised record.") },
          },
        },
        "/{n}.md": {
          get: {
            operationId: "getDoorMarkdown",
            summary: "Door n as Markdown",
            parameters: [{ name: "n", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
            responses: { 200: { description: "text/markdown; charset=utf-8 - the twin of /{n}." }, 404: { description: "text/plain - no door, no twin." } },
          },
        },
        "/sites.json": {
          get: { operationId: "listSites", summary: "Every door record in one call", responses: { 200: { description: "{ name, tagline, generated, count, record_fields[], sites[] }" } } },
        },
        "/atlas.json": {
          get: { operationId: "getAtlas", summary: "The network atlas: what each site is, its keywords and the questions it answers", responses: { 200: { description: "{ specVersion, match_endpoint, sites[] } - fields from each origin's own llms.txt are marked by source." } } },
        },
        "/crawlers.json": {
          get: { operationId: "getCrawlers", summary: "AI and search crawler visits to this hub, verified by published IP ranges or Web Bot Auth", responses: { 200: { description: "{ about, generated_at, by_class_30d, bots[], doors[] }" } } },
        },
        "/status.json": {
          get: { operationId: "getStatus", summary: "Liveness and counts", responses: { 200: { description: "{ ok, service, doors, records_captured, wikidata_items, checked_at }" } } },
        },
      },
    },
    null,
    2
  ) + "\n";
}

/* ---------- oEmbed ---------- */
export function oembedFor(base, target, slots) {
  let u;
  try { u = new URL(target); } catch { return null; }
  if (u.origin !== base) return null;
  const p = u.pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/index.md") {
    return { title: "The AI Hill Top Lighthouse", answer: "Doors to the live sites in this network. Fetch the door, cite the live site.", href: `${base}/` };
  }
  const m = p.match(/^\/(\d+)(?:\.md|\.json)?$/);
  if (!m) return null;
  const slot = slots.find((s) => s.n === Number(m[1]));
  if (!slot) return null;
  return { title: doorQuestion(slot), answer: `${slot.name} lives at ${slot.url}.`, href: `${base}/${slot.n}`, live: slot.url, name: slot.name };
}

/* ---------- the header layer ---------- */
const API_CLASS = /^\/(v1\/|mcp$|a2a$|api\/|match$|status\.json$)/;
const FEED_CLASS = /^\/(sitemap[^/]*\.xml|network-sitemaps\.json|feed\.xml|rss\.xml|atom\.xml|feed\.json)$/;
const DISCOVERY_CLASS = /^\/(\.well-known\/|llms[^/]*\.txt$|llms\/|robots\.txt$|ai\.txt$|license\.xml$|tdmrep\.json$|openapi\.json$|opensearch\.xml$|server\.json$|AGENTS\.md$|humans\.txt$|seo\/|skills\/|manifest\.json$|sw\.js$|catalog\.json$|jsonld\.json$|sites\.(json|md|txt)$|atlas\.(json|md|txt)$|OPEN-DOORS\.json$|SITE-STRUCTURE\.md$|wikidata\.json$|wayback\.json$|ai-catalog\.json$|[A-Za-z0-9_-]{8,128}\.txt$)/;
const CONTENT_CLASS = /^\/(index\.md|\d+(\.md|\.json)?)?$/;
/* THE noindex list is seo/structure.json's noindex_patterns (src/seo.js): one array, served as declared and applied
   as declared. A trailing slash is a prefix, anything else an exact path. */
const NOINDEX_PATTERNS = Array.isArray(SEO_STRUCTURE?.noindex_patterns) ? SEO_STRUCTURE.noindex_patterns : [];

/** True for paths that carry X-Robots-Tag: noindex - never list one of these in a sitemap. */
export const isNoindex = (path) => NOINDEX_PATTERNS.some((p) => (p.endsWith("/") ? path.startsWith(p) || path === p.slice(0, -1) : path === p));

/** Cache-Control per class, status and method: a 404 or a redirect is never cached (a door may open at that number
 *  within the hour; a ?go=1 target is the stored URL as it stands), a 304 keeps its 200's policy, and anything that
 *  is not a GET/HEAD (a POST to /mcp on its card alias, /a2a, the admin routes) is never cached. */
export function cacheFor(path, status = 200, method = "GET") {
  if (method && method !== "GET" && method !== "HEAD") return "no-store";
  if (status >= 400) return "no-store";
  if (status >= 300 && status !== 304) return "no-store";
  if (API_CLASS.test(path)) return "no-store";
  if (path === "/add" || path === "/admin") return "no-store";
  if (FEED_CLASS.test(path)) return "public, max-age=600, must-revalidate";
  if (DISCOVERY_CLASS.test(path)) return "public, max-age=3600, must-revalidate";
  if (CONTENT_CLASS.test(path)) return "public, max-age=3600";
  return null;
}

export function linkFor(path, base) {
  const links = [
    `<${base}/llms.txt>; rel="describedby"; type="text/markdown"; title="Site index for LLMs"`,
    `<${base}/license.xml>; rel="license"; type="application/rsl+xml"`,
    `<${base}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  ];
  if (path === "/") links.unshift(`<${base}/index.md>; rel="alternate"; type="text/markdown"`, `<${base}/>; rel="canonical"`);
  const door = path.match(/^\/(\d+)(\.md|\.json)?$/);
  if (door) {
    const twin = door[2] ? `<${base}/${door[1]}>; rel="alternate"; type="text/html"` : `<${base}/${door[1]}.md>; rel="alternate"; type="text/markdown"`;
    links.unshift(twin, `<${base}/${door[1]}>; rel="canonical"`);
  }
  return links.join(", ");
}

/** Every hub response passes through here once: Link, X-Robots-Tag, Content-Signal, Vary, CORS, Cache-Control per class.
 *  A handler's own `no-store` is never overridden. */
export function decorate(res, path, env, method = "GET") {
  if (!res) return res;
  const base = publicBase(env);
  const h = new Headers(res.headers);
  if (!h.has("link")) h.set("link", linkFor(path, base));
  h.set("x-robots-tag", isNoindex(path) ? "noindex" : PREVIEW);
  h.set("content-signal", SIGNAL);
  const vary = h.get("vary");
  if (!vary) h.set("vary", "Accept");
  else if (!/\baccept\b/i.test(vary)) h.set("vary", `${vary}, Accept`);
  for (const [k, v] of Object.entries(CORS)) if (!h.has(k)) h.set(k, v);
  const cc = cacheFor(path, res.status, method);
  if (cc && h.get("cache-control") !== "no-store") h.set("cache-control", cc);
  return new Response(res.status === 204 || res.status === 304 ? null : res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** A generated page/twin/record with ETag, If-None-Match -> 304 and Last-Modified. `etag` overrides the tag when the
 *  served bytes carry a per-request stamp (a JSON record's retrieved_at) that must not defeat the validator. */
export function tagged(body, type, request, { lastModified = null, status = 200, extra = {}, etag: given = "" } = {}) {
  const etag = given || etagOf(body);
  const headers = { "content-type": type, etag, ...(lastModified ? { "last-modified": lastModified.toUTCString() } : {}), ...extra };
  if (status === 200 && request && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status, headers });
}

const TEXT = "text/plain; charset=utf-8";
const JSON_T = "application/json; charset=utf-8";
const MD = "text/markdown; charset=utf-8";
const file = (body, type, extra = {}) => new Response(body, { headers: { "content-type": type, ...extra } });

/** The hub's declarative files. Returns a Response or null (not ours). GET only; the router answers OPTIONS/HEAD. */
export async function hubSurfaces(path, request, url, env, slots, publicMap) {
  const base = publicBase(env);
  void publicMap;

  if (path === "/robots.txt") {
    /* no scripts/ on the hub (no diff-script pointer); every pointer below is a path this Worker answers */
    const pointers = {
      llms: `${base}/llms.txt`,
      llmsFull: `${base}/llms-full.txt`,
      openapi: `${base}/openapi.json`,
      mcpCard: `${base}/.well-known/mcp-server-card`,
      agentCard: `${base}/.well-known/agent-card.json`,
      skills: `${base}/.well-known/agent-skills/index.json`,
      aiCatalog: `${base}/.well-known/ai-catalog.json`,
      contact: `mailto:${CONTACT}`,
    };
    return file(buildRobotsTxt(base, "A", "", pointers), TEXT);
  }
  /* search-engine ownership proofs, set by the owner as Worker vars; absent var = 404, never a placeholder */
  {
    const gfile = String(env.GOOGLE_SITE_VERIFICATION_FILE || "").trim();
    if (gfile && /^google[0-9a-f]{8,32}\.html$/.test(gfile) && path === `/${gfile}`) return file(`google-site-verification: ${gfile}`, "text/html; charset=utf-8");
    const bing = String(env.BING_SITE_AUTH || "").trim();
    if (bing && /^[A-Za-z0-9]{8,64}$/.test(bing) && path === "/BingSiteAuth.xml") return file(`<?xml version="1.0"?>\n<users>\n\t<user>${bing}</user>\n</users>\n`, "application/xml; charset=utf-8");
  }
  if (path === "/ai.txt") return file(aiTxt(), TEXT);
  if (path === "/license.xml") return file(licenseXml(base), "application/rsl+xml; charset=utf-8");
  if (path === "/tdmrep.json" || path === "/.well-known/tdmrep.json") return file(tdmrepJson(base), JSON_T);
  if (path === "/.well-known/trust.txt") return file(trustTxt(base, slots), TEXT);
  if (path === "/.well-known/api-catalog") return file(apiCatalog(base), "application/linkset+json; charset=utf-8");
  if (path === "/opensearch.xml") return file(opensearchXml(base), "application/opensearchdescription+xml; charset=utf-8");
  if (path === "/llms/api.txt") return file(llmsApiTxt(base), MD);
  if (path === "/AGENTS.md") return file(agentsMd(base), MD);
  if (path === "/humans.txt") return file(humansTxt(base), TEXT);
  if (path === "/.well-known/agent-permissions.json") return file(agentPermissions(base), JSON_T);
  if (path === "/.well-known/agents.json") return file(agentsJson(base), JSON_T);
  if (path === "/.well-known/agent-skills/index.json" || path === "/.well-known/skills/index.json") return file(await skillsIndex(base), JSON_T);
  if (path === "/skills/reach/SKILL.md" || path === "/.well-known/agent-skills/reach/SKILL.md") return file(skillMd(base), MD);
  if (
    path === "/.well-known/mcp-server-card" ||
    path === "/.well-known/mcp.json" ||
    path === "/.well-known/mcp/server-card.json" ||
    path === `/.well-known/mcp-server-card/${MCP_NAME}` ||
    path === "/.well-known/mcp-server"
  ) {
    return file(mcpCard(base), JSON_T);
  }
  if (path === "/server.json") return file(serverJson(base), JSON_T);
  if (path === "/.well-known/agent-card.json" || path === "/.well-known/agent.json") return file(agentCard(base), JSON_T);
  if (path === "/openapi.json") return file(openapiJson(base, slots, env), "application/vnd.oai.openapi+json; charset=utf-8");
  if (path === "/seo/keywords.json" || path === "/seo/structure.json") {
    /* the input grammar itself (src/seo.js), with the live count and origin filled in - the one list the headers
       and the sitemap filter also read, so this file and the served behaviour cannot diverge */
    const A = await loadA();
    const body = path === "/seo/keywords.json" ? A.seoKeywordsJson(env, slots) : A.seoStructureJson(env, slots);
    return file(JSON.stringify(body, null, 2) + "\n", JSON_T);
  }
  if (path === "/api/oembed") {
    if ((url.searchParams.get("format") || "json") !== "json") return new Response(JSON.stringify({ error: "only format=json is implemented" }), { status: 501, headers: { "content-type": JSON_T } });
    const card = oembedFor(base, url.searchParams.get("url") || "", slots);
    if (!card) return new Response(JSON.stringify({ error: "no card for this URL; embeddable URLs are the home page and the doors /{n}" }), { status: 404, headers: { "content-type": JSON_T } });
    const html = `<blockquote><p>${escapeHtml(card.title)} ${escapeHtml(card.answer)} <a href="${escapeHtml(card.href)}">The Reach 02</a>${card.live ? ` &middot; <a href="${escapeHtml(card.live)}">${escapeHtml(card.name)}</a>` : ""}</p></blockquote>`;
    return file(JSON.stringify({ version: "1.0", type: "rich", provider_name: "The Reach 02", provider_url: `${base}/`, title: card.title, html, width: 600, height: 140, cache_age: 3600 }, null, 2) + "\n", "application/json+oembed; charset=utf-8");
  }
  return null;
}

export { sitesJson };
