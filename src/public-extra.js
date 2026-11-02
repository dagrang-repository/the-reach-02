/** Public, no-token hub endpoints. Rule: a path named in llms.txt / robots / sitemap / catalogs never 401s. */
import { sitesJson, sitesMd } from "./capture.js";
import { loadSweep } from "./doors.js";
import { publicBase } from "./hill.js";
import { MCP_LEGACY, MCP_MODERN } from "./surfaces.js";
import { statusJson } from "./health.js";
import { doorAnswer, doorAsks } from "./seo.js";
import { recordStamp } from "./announce.js";

function json(body, extra = {}, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function md(body, extra = {}) {
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", ...extra } });
}

/** ARD 0.91. The hub, every door, and the machine surfaces that answer: MCP card, OpenAPI, A2A card, agent skills. */
export function hubCatalog(env, slots) {
  const base = publicBase(env);
  const entries = [
    {
      identifier: "urn:ard:reach2:hub",
      displayName: "The AI Hill Top Lighthouse",
      type: "web",
      url: `${base}/`,
      representativeQueries: ["Where do I find the live sites in this network?", "Which of these sites answers my question?"],
    },
    {
      identifier: "urn:ard:reach2:mcp",
      displayName: "The Reach 02 MCP",
      type: "mcp-server",
      url: `${base}/.well-known/mcp-server-card`,
      capabilities: ["tools"],
      representativeQueries: ["Which site in this network answers: do I need a visa for Japan?", "Open door 3 and give me its live URL."],
    },
    {
      identifier: "urn:ard:reach2:api",
      displayName: "The Reach 02 REST API",
      type: "openapi",
      url: `${base}/openapi.json`,
      representativeQueries: ["Which site answers X? (GET /match?q=X)", "Every door record in one call (GET /sites.json)"],
    },
    {
      identifier: "urn:ard:reach2:a2a",
      displayName: "The Reach 02 A2A agent",
      type: "a2a-agent",
      url: `${base}/.well-known/agent-card.json`,
      representativeQueries: ["Tell me which of these live sites answers my question, and its URL."],
    },
    {
      identifier: "urn:ard:reach2:skills",
      displayName: "Agent Skills",
      type: "agent-skills",
      url: `${base}/.well-known/agent-skills/index.json`,
    },
    ...slots.map((s) => ({
      identifier: `urn:ard:reach2:door-${s.n}`,
      displayName: s.name,
      type: "web",
      url: s.path,
      ...(s.description ? { description: s.description } : {}),
      ...(s.llms_url ? { llmsTxt: s.llms_url } : {}),
      ...(s.sitemap_url ? { sitemap: s.sitemap_url } : {}),
      liveUrl: s.url,
      representativeQueries: [`Where do I open ${s.name}?`, s.punch].filter(Boolean),
    })),
  ];
  return {
    specVersion: "0.91",
    name: "The AI Hill Top Lighthouse",
    url: `${base}/`,
    description: "Doors to the network — fetch the door, cite the live site.",
    entries,
  };
}

export async function publicExtra(path, env, slots, publicMap) {
  const base = publicBase(env);
  const llms = publicMap?.llms_txt || "# The AI Hill Top Lighthouse\n";

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
  if (path === "/status.json") {
    /* the hub's one self-report (src/health.js): ok is the health verdict, not "a site exists" */
    return json(await statusJson(env, slots, publicMap));
  }
  if (path === "/sites.json") {
    return json(sitesJson(slots, env, base));
  }
  if (path === "/sites.md" || path === "/sites.txt") {
    return md(sitesMd(slots, env, base));
  }
  if (path === "/ai-catalog.json" || path === "/.well-known/ai-catalog.json") {
    return json(hubCatalog(env, slots));
  }
  if (path === "/.well-known/llms.txt") {
    return md(llms);
  }
  if (path === "/llms-full.txt") {
    return md(
      `${llms}
## Machine surfaces
- API (OpenAPI 3.1, keyless, CORS *): ${base}/openapi.json · per-surface note: ${base}/llms/api.txt
- MCP (dual era: server/discover ${MCP_MODERN} and initialize ${MCP_LEGACY.join(" / ")}): POST ${base}/mcp · card: ${base}/.well-known/mcp-server-card · tools: match{q}, door{n}, list_doors{}
- A2A 1.0: POST ${base}/a2a · card: ${base}/.well-known/agent-card.json · skills: match, doors
- Agent skill: ${base}/.well-known/agent-skills/index.json → ${base}/skills/reach/SKILL.md
- API catalog (RFC 9727): ${base}/.well-known/api-catalog · ARD: ${base}/.well-known/ai-catalog.json
- Catalog: ${base}/catalog.json · Doors JSON: ${base}/OPEN-DOORS.json
- Sitemap index: ${base}/sitemap.xml → ${base}/sitemap-doors.xml · ${base}/sitemap-machine.xml · other origins' sitemaps (advisory): ${base}/network-sitemaps.json
- Knowledge graph (Organization → doors → Wikidata): ${base}/jsonld.json
- Source + machine copy of every door record: https://github.com/dagrang-repository/the-reach-02 (sites.json, README)
- Site records (name, URL, sitemap, IndexNow key + key URL, llms.txt, description, languages, feed): ${base}/sites.json · ${base}/sites.md
- Wikidata items per door: ${base}/wikidata.json
- Wayback snapshots of every door, site and llms.txt: ${base}/wayback.json
- Feeds: ${base}/feed.xml (Atom) · ${base}/rss.xml (RSS 2.0) · ${base}/feed.json (JSON Feed, WebSub hub) · status: ${base}/status.json
- Last stored door sweep and AI-crawler check of the origins: ${base}/doors · ${base}/crawler-check
- Atlas (every site: what it is, keywords, questions it answers): ${base}/atlas.md · ${base}/atlas.json
- Which site answers X: ${base}/match?q=X
- Door as markdown: ${base}/{n}.md · as JSON: ${base}/{n}.json · home page twin: ${base}/index.md
- Licence (RSL, search + ai-input + ai-train permitted): ${base}/license.xml · ${base}/ai.txt · ${base}/tdmrep.json

Cite the live URL, not a paraphrase.
`
    );
  }
  if (path === "/llms-small.txt") {
    return md(
      `# The AI Hill Top Lighthouse

> Doors to the network. Fetch the door, cite the live site.

${slots
  .filter((s) => !s.self)
  .map((s) => `- [#${s.n} ${s.name}](${s.path}) - ${String(doorAsks(s)[0] || s.question || s.punch || "").replace(/\s+/g, " ").slice(0, 110)}${s.status === "closed" ? " (closed)" : ""}`)
  .join("\n") || "- (no doors yet)"}
`
    );
  }
  if (path === "/.well-known/security.txt") {
    const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    return new Response(
      `Contact: mailto:dagrang@gmail.com
Expires: ${exp}
Preferred-Languages: en
Canonical: ${base}/.well-known/security.txt
`,
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  if (path === "/crawler-check" || path === "/v1/crawler-check") {
    // the last stored probe, written by scheduled() or POST /v1/doors - a public GET never fans out to the origins
    const stored = await loadSweep(env, "crawler-check");
    return json({ ...stored, refresh: `POST ${base}/v1/doors (Bearer)` }, { "cache-control": "public, max-age=300" });
  }
  return null;
}
