/** Public, no-token hub endpoints. Rule: a path named in llms.txt / robots / sitemap / catalogs never 401s. */
import { crawlersJson } from "./crawlers.js";
import { sitesJson, sitesMd } from "./capture.js";
import { loadSweep } from "./doors.js";
import { publicBase } from "./hill.js";
import { A2A_SPOKEN, CONTACT, MCP_DESCRIPTION, MCP_LEGACY, MCP_MODERN, MCP_TOOL_NAMES, MCP_VERSION, PUBLISHER, SKILL_NAME, tagged } from "./surfaces.js";
import { statusJson } from "./health.js";
import { doorAnswer, doorAsks, safeUrl } from "./seo.js";
import { recordStamp } from "./announce.js";
import { CATALOG_SPEC_VERSION, MEDIA, clipTo, queries2to5, serverCardUrl, urnAir } from "./playbook.js";
import { hubLlmsFull, hubLlmsSmall, hubLlmsTxt } from "./map.js";
import { MATCH_RULES_TEXT } from "./atlas.js";

const JSON_T = "application/json; charset=utf-8";
const MD = "text/markdown; charset=utf-8";
const CATALOG_T = `${MEDIA.catalog}; charset=utf-8`;

function json(body, extra = {}, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": JSON_T, ...extra },
  });
}

/** The catalog: ONE document, served with the same bytes at /.well-known/ard.json (ARD v0.91: rel="ard", the
 *  Agentmap: line in robots.txt) and /.well-known/ai-catalog.json (AI Catalog v0.9: rel="ai-catalog"; the file an MCP
 *  client reads to find the server card). Every entry: a urn:air: identifier on the hub's own domain, a display
 *  name, a media type as its type, one url, and 2 to 5 questions a user would ask - never a feature name.
 *  It lists what answers: the MCP server (at its card's own address), the REST API, the A2A agent, the skill - and
 *  each live door's JSON record under the questions that door's own site declares, so a registry that indexes this
 *  file routes those questions to the site that answers them. A closed door is not advertised. */
export function hubCatalog(env, slots) {
  const base = publicBase(env);
  const host = new URL(base).host;
  const open = slots.filter((s) => !s.self && s.status !== "closed" && safeUrl(s.url));
  /* the hub's own questions, then two real ones its doors answer: what a user types, not what the hub is */
  const doorQs = open.flatMap((s) => doorAsks(s).slice(0, 1)).slice(0, 2);
  const hubQs = queries2to5(["Which of these live sites answers my question?", "Where does the site that answers this question live?", ...doorQs], ["Which sites does this hub list?"]);
  const entries = [
    {
      identifier: urnAir(host, "server", "hub"),
      displayName: "The Reach 02 MCP",
      type: MEDIA.serverCard,
      url: serverCardUrl(`${base}/mcp`),
      description: MCP_DESCRIPTION,
      capabilities: [...MCP_TOOL_NAMES],
      version: MCP_VERSION,
      representativeQueries: hubQs,
    },
    {
      identifier: urnAir(host, "api", "hub"),
      displayName: "The Reach 02 REST API",
      type: MEDIA.openapi,
      url: `${base}/openapi.json`,
      description: "Keyless read API: which door answers a question (GET /match?q=), one door's record (GET /{n}.json), every record (GET /sites.json).",
      version: MCP_VERSION,
      representativeQueries: hubQs,
    },
    {
      identifier: urnAir(host, "agent", "hub"),
      displayName: "The Reach 02 A2A agent",
      type: MEDIA.agentCard,
      url: `${base}/.well-known/agent-card.json`,
      description: "The same resolver as an agent: send the question as text, get the door that answers it and the live URL to cite.",
      version: MCP_VERSION,
      representativeQueries: queries2to5(["Tell me which of these live sites answers my question, and its URL.", "List every site in this network with its live URL.", ...doorQs]),
    },
    {
      identifier: urnAir(host, "skill", SKILL_NAME),
      displayName: "The Reach 02 skill",
      type: MEDIA.skillMd,
      url: `${base}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`,
      description: "When to ask this hub, which arguments are invalid, and what not to do with the answer.",
      representativeQueries: queries2to5(["Which site should I fetch for this question?", "Where does one of these sites live, and how do I cite it?", ...doorQs]),
    },
    ...open.map((s) => ({
      identifier: urnAir(host, "door", s.n),
      displayName: String(s.name || `Door ${s.n}`),
      type: "application/json",
      url: `${s.path}.json`,
      ...(doorAnswer(s) ? { description: clipTo(doorAnswer(s), 300) } : {}),
      updatedAt: recordStamp(s),
      /* the site's own declared questions; a door that declares fewer than two is topped up with the two questions
         a user asks about any site by name - never with a headline that is not a question */
      representativeQueries: queries2to5(doorAsks(s), [`What is ${s.name}?`, `Where does ${s.name} live?`]),
    })),
  ];
  return {
    specVersion: CATALOG_SPEC_VERSION,
    host: { displayName: `The AI Hill Top Lighthouse (${PUBLISHER})`, identifier: host, documentationUrl: `${base}/llms-full.txt` },
    entries,
  };
}

/** A stable expiry for security.txt: the first day of the month, eleven months ahead. Always under the one year
 *  RFC 9116 asks for, and the same bytes all month - so the file's ETag means something. Renewed by the calendar. */
export function securityExpiry(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 11, 1)).toISOString();
}

export async function publicExtra(path, env, slots, publicMap, request = null) {
  const base = publicBase(env);
  const md = (body) => tagged(body, MD, request);

  if (path === "/feed.json") {
    return json(
      {
        version: "https://jsonfeed.org/version/1.1",
        title: "The AI Hill Top Lighthouse — doors",
        home_page_url: `${base}/`,
        feed_url: `${base}/feed.json`,
        hubs: [{ type: "WebSub", url: "https://pubsubhubbub.appspot.com/" }],
        items: [...slots].filter((s) => !s.self).reverse().map((s) => ({
          id: s.path,
          url: s.path,
          title: `Door #${s.n}: ${s.name}${s.status === "closed" ? ` (closed since ${String(s.closed_since || "").slice(0, 10)})` : ""}`,
          summary: s.status === "closed"
            ? `${doorAnswer(s)} Closed since ${String(s.closed_since || "").slice(0, 10)}; do not cite it as live.`
            : `${doorAnswer(s)} Lives at ${s.url}. Fetch ${s.url}.`,
          ...(/^https?:\/\/[^\s"'<>]+$/i.test(String(s.url || "")) ? { external_url: s.url } : {}),
          date_modified: recordStamp(s),
          _markdown: `${s.path}.md`,
          ...(s.wikidata_qid ? { _wikidata: `https://www.wikidata.org/wiki/${s.wikidata_qid}` } : {}),
        })),
      },
      { "content-type": "application/feed+json; charset=utf-8" }
    );
  }
  if (path === "/crawlers.json") {
    /* proof that AI crawlers read this hub: verified visits per bot, class and door (src/crawlers.js) */
    return json(await crawlersJson(env, slots));
  }
  if (path === "/status.json") {
    /* the hub's one self-report (src/health.js): ok is the health verdict, not "a site exists". The versions are the
       constants the endpoints themselves answer with, so a client can tell "down" from "does not speak that". */
    const s = await statusJson(env, slots, publicMap);
    const { ok, service, ...rest } = s;
    return json({ ok, service, version: MCP_VERSION, mcp_protocol_versions: [MCP_MODERN, ...MCP_LEGACY], a2a_versions: [...A2A_SPOKEN], ...rest });
  }
  if (path === "/sites.json") {
    return json(sitesJson(slots, env, base));
  }
  if (path === "/sites.md" || path === "/sites.txt") {
    return md(sitesMd(slots, env, base));
  }
  if (path === "/.well-known/ard.json" || path === "/.well-known/ai-catalog.json" || path === "/ai-catalog.json") {
    return tagged(JSON.stringify(hubCatalog(env, slots), null, 2) + "\n", CATALOG_T, request);
  }
  if (path === "/.well-known/llms.txt") {
    /* the mirror: the same bytes as /llms.txt, from the same function */
    return md(hubLlmsTxt(slots, base));
  }
  if (path === "/llms-full.txt") {
    return md(
      `${hubLlmsFull(slots, base, MATCH_RULES_TEXT)}
## Machine surfaces
- API (OpenAPI 3.1, keyless, CORS *): ${base}/openapi.json · per-surface note: ${base}/llms/api.txt
- MCP (dual era: server/discover ${MCP_MODERN} and initialize ${MCP_LEGACY.join(" / ")}): POST ${base}/mcp · card: ${serverCardUrl(`${base}/mcp`)} (same bytes at ${base}/.well-known/mcp-server-card) · tools: match{q}, door{n}, list_doors{} · resources: this file, ${base}/atlas.md
- A2A: POST ${base}/a2a · SendMessage with A2A-Version: 1.0, message/send for 0.3 clients · card: ${base}/.well-known/agent-card.json · skills: match, doors
- Agent skill: ${base}/.well-known/agent-skills/index.json → ${base}/.well-known/agent-skills/${SKILL_NAME}/SKILL.md
- Catalog (one document, two names): ${base}/.well-known/ard.json · ${base}/.well-known/ai-catalog.json · API catalog (RFC 9727): ${base}/.well-known/api-catalog
- Catalog of doors: ${base}/catalog.json · Doors JSON: ${base}/OPEN-DOORS.json
- Sitemaps: ${base}/sitemap.xml (pages) → ${base}/sitemap-doors.xml · ${base}/sitemap-md.xml (Markdown twins and machine entry points) · other origins' sitemaps (advisory): ${base}/network-sitemaps.json
- Knowledge graph (Organization → doors → Wikidata): ${base}/jsonld.json
- Source + machine copy of every door record: https://github.com/dagrang-repository/the-reach-02 (sites.json, README)
- Site records (name, URL, sitemap, IndexNow key + key URL, llms.txt, description, languages, feed): ${base}/sites.json · ${base}/sites.md
- Wikidata items per door: ${base}/wikidata.json
- Wayback snapshots of every door, site and llms.txt: ${base}/wayback.json
- Feeds: ${base}/feed.xml (Atom) · ${base}/rss.xml (RSS 2.0) · ${base}/feed.json (JSON Feed, WebSub hub) · status: ${base}/status.json · AI-crawler proof: ${base}/crawlers.json
- Last stored door sweep and AI-crawler check of the origins: ${base}/doors · ${base}/crawler-check
- Atlas (every site: what it is, keywords, questions it answers): ${base}/atlas.md · ${base}/atlas.json
- Which site answers X: ${base}/match?q=X
- Door as markdown: ${base}/{n}.md · as JSON: ${base}/{n}.json · home page twin: ${base}/index.md
- Who publishes this hub, how a record is made: ${base}/about · ${base}/about.md
- Licence (RSL 1.0): ${base}/license.xml · ${base}/ai.txt · ${base}/tdmrep.json

Cite the live URL, not a paraphrase.
`
    );
  }
  if (path === "/llms-small.txt") {
    return md(hubLlmsSmall(slots, base));
  }
  if (path === "/.well-known/security.txt") {
    return tagged(
      `Contact: mailto:${CONTACT}
Expires: ${securityExpiry()}
Preferred-Languages: en
Canonical: ${base}/.well-known/security.txt
`,
      "text/plain; charset=utf-8",
      request
    );
  }
  if (path === "/crawler-check" || path === "/v1/crawler-check") {
    // the last stored probe, written by scheduled() or POST /v1/doors - a public GET never fans out to the origins
    const stored = await loadSweep(env, "crawler-check");
    return json({ ...stored, refresh: `POST ${base}/v1/doors (Bearer)` }, { "cache-control": "public, max-age=300" });
  }
  return null;
}
