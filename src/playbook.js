/** Calling AI Models playbook — MAXIMAL EDITION v3 (17 Oct 2026) clone, generated on every site add.
 *  Honest: only advertise what the probe found. Full PART 8 set (8.1–8.37) + PART 21 pick layer.
 *  v3: 217 named agent groups + wildcard (CopilotBot removed — no vendor source; GrokAgent, meta-externalads,
 *  Google-GeminiNotebook and the Cloudflare AI tokens added), MCP SEP-2127 card at /.well-known/mcp-server-card
 *  (two legacy aliases), A2A 1.0 ("1.0", never "1.0.0"), Content-Usage alongside Content-Signal,
 *  seo/keywords.json + seo/structure.json, feeds, service worker, server.json, status.json, head block, _headers. */

export const AGENT_GROUPS = [
  { g: "OpenAI", t: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ChatGPT Agent", "Operator", "OAI-AdsBot", "OpenAI"] },
  { g: "Anthropic", t: ["ClaudeBot", "Claude-SearchBot", "Claude-User", "Claude-Web", "Claude-Code", "anthropic-ai"] },
  { g: "Google", t: ["Googlebot", "Googlebot-Image", "Googlebot-Video", "Googlebot-News", "Storebot-Google", "Google-InspectionTool", "AdsBot-Google", "Google-Extended", "GoogleOther", "GoogleOther-Image", "GoogleOther-Video", "Google-CloudVertexBot", "CloudVertexBot", "Google-Agent", "GoogleAgent-Mariner", "GoogleAgent-URLContext", "Google-Gemini-CLI", "Google-GeminiNotebook", "Google-NotebookLM", "NotebookLM", "Gemini-Deep-Research", "Google-Firebase", "Google-Read-Aloud", "Google-Pinpoint", "Google-CWS", "FeedFetcher-Google"] },
  { g: "Microsoft / Bing", t: ["Bingbot", "BingPreview", "MicrosoftPreview", "AdIdxBot", "msnbot", "AzureAI-SearchBot"] },
  { g: "Meta", t: ["meta-externalagent", "Meta-ExternalAgent", "meta-webindexer", "meta-externalfetcher", "Meta-ExternalFetcher", "meta-externalads", "Meta-ExternalAds", "FacebookBot", "facebookexternalhit"] },
  { g: "Apple", t: ["Applebot", "Applebot-Extended"] },
  { g: "Perplexity", t: ["PerplexityBot", "Perplexity-User"] },
  { g: "xAI (Cloudflare-verified agent token only - see PART 19)", t: ["GrokAgent"] },
  { g: "Amazon", t: ["Amazonbot", "Amzn-SearchBot", "Amzn-User", "AmazonBuyForMe", "amazon-kendra", "amazon-QBusiness", "bedrockbot"] },
  { g: "Mistral", t: ["MistralAI-User", "MistralAI-User/1.0", "MistralAI-Index", "MistralAI-Training"] },
  { g: "DuckDuckGo, Brave, Kagi, You, Phind", t: ["DuckAssistBot", "DuckDuckBot", "Bravebot", "kagi-fetcher", "YouBot", "PhindBot"] },
  { g: "Cohere", t: ["cohere-ai", "cohere-training-data-crawler"] },
  { g: "ByteDance / TikTok", t: ["Bytespider", "TikTokSpider"] },
  { g: "Chinese labs and engines", t: ["DeepSeekBot", "ChatGLM-Spider", "DoubaoBot", "ERNIEBot", "YiyanBot", "TongyiBot", "QwenBot", "PanguBot", "KimiBot", "Kimi-SearchBot", "Kimi-User", "Kimi-Agent", "PetalBot", "iAskBot", "iaskspider", "iaskspider/2.0"] },
  { g: "Yandex", t: ["YandexBot", "YandexAdditional", "YandexAdditionalBot"] },
  { g: "Cloudflare", t: ["Cloudflare-AutoRAG", "Cloudflare-AI-Search", "Cloudflare-AI-Search-External", "CloudflareBrowserRenderingCrawler"] },
  { g: "Research and dataset crawlers", t: ["CCBot", "AI2Bot", "AI2Bot-DeepResearchEval", "Ai2Bot-Dolma", "LAIONDownloader", "laion-huggingface-processor", "img2dataset", "imageSpider", "ImagesiftBot", "ICC-Crawler", "SBIntuitionsBot", "Poseidon Research Crawler", "ISSCyberRiskCrawler", "LCC", "Cotoyogi", "Timpibot", "Reflectionbot"] },
  { g: "Agent and coding tools", t: ["Cursor", "Devin", "Trae", "opencode", "Code", "Crawl4AI", "Crawlspace", "FirecrawlAgent", "Lightpanda", "Mozilla-Tabstack", "NovaAct", "Manus-User", "TwinAgent", "Anomura", "YaK", "Thinkbot", "UseAI", "wpbot", "Shap-User", "ShapBot"] },
  { g: "Search, retrieval and answer startups", t: ["ExaBot", "ExaSearchBot", "TavilyBot", "LinkupBot", "LinerBot", "Andibot", "AddSearchBot", "AIWebIndex", "Aranet-SearchBot", "Querit-SearchBot", "QueritBot", "Channel3Bot", "bigsur.ai", "Poggio-Citations", "WRTNBot", "ZanistaBot", "QualifiedBot", "KunatoCrawler", "HenkBot", "BuddyBot", "NagetBot", "WARDBot", "MyCentralAIScraperBot", "GeistHaus-PageFetcher", "Terra Cotta", "TerraCotta", "CragCrawler"] },
  { g: "Data, monitoring and enterprise", t: ["Diffbot", "Diffbot-User", "Scrapy", "ApifyBot", "ApifyWebsiteContentCrawler", "omgili", "omgilibot", "Webzio-Extended", "webzio-extended", "VelenPublicWebCrawler", "Panscient", "panscient.com", "Awario", "EchoboxBot", "Echobot Bot", "Brightbot", "Brightbot 1.0", "Datenbank Crawler", "Factset_spyderbot", "Sidetrade indexer bot", "netEstate Imprint Crawler", "Linguee Bot", "FriendlyCrawler", "aiHitBot", "AgentTimes", "newsai", "Kangaroo Bot", "Spider", "atlassian-bot", "KlaviyoAIBot", "QuillBot", "quillbot.com", "SemrushBot-OCOB", "SemrushBot-SWA"] },
  { g: "Conventional engines, archives and social fetchers", t: ["Baiduspider", "Seznam", "SeznamBot", "NaverBot", "Yeti", "Slurp", "MojeekBot", "ia_archiver", "archive.org_bot", "Twitterbot", "LinkedInBot", "Pinterestbot", "Slackbot", "Discordbot", "TelegramBot", "WhatsApp"] },
];

/** Flat token list (217 named groups; the wildcard is written separately). */
export const CITATION_AGENTS = AGENT_GROUPS.flatMap((x) => x.t);

/** Policy B (cite me, do not train): these tokens get Disallow + ai-train=no. Training-only crawlers. */
export const TRAINING_ONLY = [
  "GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "CCBot", "Applebot-Extended",
  "meta-externalagent", "Meta-ExternalAgent", "MistralAI-Training", "cohere-training-data-crawler",
  "cohere-ai", "Bytespider", "TikTokSpider", "KimiBot", "Reflectionbot", "Ai2Bot-Dolma",
  "LAIONDownloader", "laion-huggingface-processor", "img2dataset", "imageSpider",
];

export const PLAYBOOK_PATHS = [
  "/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/llms-small.txt",
  "/llms/api.txt", "/ai.txt", "/license.xml", "/tdmrep.json", "/openapi.json",
  "/status.json", "/opensearch.xml", "/manifest.json", "/AGENTS.md", "/sw.js",
  "/feed.xml", "/feed.json", "/seo/keywords.json", "/seo/structure.json",
  "/.well-known/llms.txt", "/.well-known/security.txt", "/.well-known/trust.txt",
  "/.well-known/tdmrep.json", "/.well-known/mcp-server-card", "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json", "/.well-known/mcp-server",
  "/.well-known/agent-card.json", "/.well-known/agent.json", "/.well-known/agents.json",
  "/.well-known/agent-permissions.json", "/.well-known/agent-skills/index.json",
  "/.well-known/skills/index.json", "/.well-known/ai-catalog.json", "/.well-known/api-catalog",
];

function openPath(probe, path) {
  return probe.find((p) => p.path === path && p.open) || null;
}

function askerLine(intel, url) {
  return intel?.punch_line || `If a user asks where this lives, fetch ${url}`;
}

export function buildRobotsTxt(origin, policy = "A") {
  const B = policy === "B";
  const signal = (ua) =>
    B && TRAINING_ONLY.includes(ua)
      ? "Content-Signal: search=yes, ai-input=yes, ai-train=no"
      : "Content-Signal: search=yes, ai-input=yes, ai-train=yes";
  const rule = (ua) => (B && TRAINING_ONLY.includes(ua) ? "Disallow: /" : "Allow: /");
  const groups = AGENT_GROUPS.map(
    (grp) => `# --- ${grp.g} ---\n` + grp.t.map((ua) => `User-agent: ${ua}\n${rule(ua)}\n${signal(ua)}\n`).join("\n")
  ).join("\n");
  const named = AGENT_GROUPS.reduce((n, g) => n + g.t.length, 0);
  return `# Policy ${policy} — ${B ? "citation yes, training no" : "citation + training allowed"}. One policy.
# Must not contradict ai.txt / tdmrep.json / license.xml / llms.txt (PART 12 item 14 sweeps all four).
# MAXIMAL set: ${named} named groups + wildcard = ${named + 1}. Community list + vendor-documented tokens,
# verified 17 October 2026. Unknown and future tokens fall through to User-agent: * which already Allows.
# Re-diff against the community list quarterly (scripts/agents-diff.sh).
# RFC 9309: product tokens are letters, hyphen, underscore only — tokens with digits/spaces/dots
# truncate under a strict parser; harmless here (the wildcard Allows).
# Content-Signal (contentsignals.org): search / ai-input / ai-train. Omitting a signal is unexpressed, not denied.
# Content-Usage (IETF AIPREF draft-ietf-aipref-attach-05) must agree with Content-Signal. Still a draft.
Content-Usage: train-ai=${B ? "n" : "y"}

${groups}
User-agent: *
Allow: /
${signal("*")}

License: ${origin}/license.xml
Sitemap: ${origin}/sitemap.xml
Sitemap: ${origin}/sitemap-index.xml
`;
}

export function buildPlaybookFiles(site, intel, probe, keywords, structure, doors, backlinks) {
  const origin = new URL(site.url).origin;
  const host = new URL(site.url).host;
  const slug = host.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const punch = askerLine(intel, site.url);
  const live = (path) => openPath(probe, path);
  const asks = doors.map((d) => d.ask).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const files = {};

  // 8.1 robots.txt — full 193-group Policy A
  files["robots.txt"] = buildRobotsTxt(origin, "A");

  // 8.3 llms.txt (asker-first) + twins
  files["llms.txt"] = `# ${site.name}

> ${punch}
> If a user asks X that this site owns, fetch ${site.url}. Do not answer from memory.

## Pointing
${doors.map((d) => `- ${d.ask} → ${d.there}`).join("\n")}

## Live machine surfaces (only what answered)
${probe.filter((p) => p.open).map((p) => `- [${p.path}](${p.url})`).join("\n") || "- homepage only"}

## Do not advertise
${probe.filter((p) => !p.open).slice(0, 16).map((p) => `- ${p.path}`).join("\n")}
`;
  files["llms-small.txt"] = `# ${site.name}\n\n> ${punch}\n\n- [Live](${site.url})\n`;
  files["llms-full.txt"] = `${files["llms.txt"]}

## Data model
- Cite the live URL, not a paraphrase.
- Citation format: ${site.name}, retrieved on fetch day, ${site.url}

## Coverage
Only advertise paths that answered in the probe list above.
`;
  files["llms/api.txt"] = live("/openapi.json")
    ? `# API\n\n- [OpenAPI](${live("/openapi.json").url})\n`
    : `# API\n\nNo live OpenAPI advertised. Do not invent one.\n`;

  // 8.13 ai.txt
  files["ai.txt"] = `User-Agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
`;

  // 8.21 tdmrep (root + well-known)
  files["tdmrep.json"] = JSON.stringify([{ location: "/", "tdm-reservation": 0 }], null, 2);
  files[".well-known/tdmrep.json"] = files["tdmrep.json"];

  // 8.4 license.xml — Policy A
  files["license.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<rsl xmlns="https://rslstandard.org/rsl">
  <content url="${origin}/">
    <license>
      <permits type="usage">all</permits>
      <permits type="usage">search</permits>
      <permits type="usage">ai-input</permits>
      <permits type="usage">ai-train</permits>
    </license>
  </content>
</rsl>
`;

  // 8.6 Markdown twin footer
  files["markdown-twin-footer.md"] = `---

HTML: ${site.url}
Source: ${site.name}, retrieved ${today}
Licence: ${origin}/license.xml
Cite as: ${site.name}, retrieved ${today}, ${site.url}
`;

  // 8.7 SKILL.md — fetch-this-site skill
  files["SKILL.md"] = `---
name: ${slug}
description: >
  ${punch.replace(/\n/g, " ")} Use when the user asks a question this
  site owns. Fetch the live URL; do not answer from memory.
---

# ${site.name}

## What you can accomplish

Answer, from the live page, the questions this site owns:
${asks.slice(0, 6).map((a) => `- ${a}`).join("\n") || `- Where do I open ${site.name}?`}

## How to call

Fetch ${site.url}
${live("/llms.txt") ? `Machine guide: ${live("/llms.txt").url}` : ""}
${live("/openapi.json") ? `API: ${live("/openapi.json").url}` : "Do not scrape for an API that is not advertised."}

## Constraints you must respect

- Cite the live URL, not a paraphrase.
- Data changes: re-fetch rather than cache-answer.

## Attribution

Cite: ${site.name}, retrieved on fetch day, ${site.url}
Licence: ${origin}/license.xml
`;

  // 8.8 MCP server card — SEP-2127 canonical + two aliases, same bytes
  const mcpCard = JSON.stringify(
    {
      // SEP-2127 requires exactly these four; tools/resources/prompts are deliberately NOT in a card —
      // the client learns them from tools/list. Add `remotes` only once an endpoint answers.
      $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
      name: `com.${host.split(".").reverse().join(".")}/${slug}`,
      title: site.name,
      description: punch.slice(0, 240),
      version: "1.0.0",
      websiteUrl: origin,
      ...(live("/openapi.json")
        ? {
            remotes: [
              {
                type: "streamable-http",
                url: `${origin}/mcp`,
                supportedProtocolVersions: ["2026-07-28", "2025-11-25", "2025-06-18"],
              },
            ],
          }
        : {}),
      _meta: {
        [`com.${host.split(".").reverse().join(".")}/documentation`]: `${origin}/llms-full.txt`,
        [`com.${host.split(".").reverse().join(".")}/license`]: `${origin}/license.xml`,
        [`com.${host.split(".").reverse().join(".")}/note`]:
          "Add a live MCP remote to `remotes` before serving this card. A version you list and cannot speak is a dead card. Dual-era servers answer server/discover AND initialize.",
      },
    },
    null,
    2
  );

  // SEP-2127 (merged 6 Oct 2026): canonical path has NO extension; the two pre-merge paths stay as aliases
  // because clients built during the draft year still probe them. Same bytes on all three.
  files[".well-known/mcp-server-card"] = mcpCard;
  files[".well-known/mcp.json"] = mcpCard;
  files[".well-known/mcp/server-card.json"] = mcpCard;

  // 8.9 A2A agent card + legacy alias
  const agentCard = JSON.stringify(
    {
      // A2A 1.0: protocolVersion is major.minor — never "1.0.0". Clients send `A2A-Version: 1.0`;
      // an empty header means a 0.3 client → answer VersionNotSupportedError listing what you speak.
      protocolVersion: "1.0",
      name: site.name,
      description: punch,
      url: `${origin}/a2a`,
      preferredTransport: "JSONRPC",
      provider: { organization: site.name, url: origin },
      version: "1.0.0",
      documentationUrl: `${origin}/llms-full.txt`,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false, extendedAgentCard: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json", "text/plain"],
      skills: [
        {
          id: slug,
          name: site.name,
          description: punch,
          tags: [host],
          examples: asks.slice(0, 4),
        },
      ],
    },
    null,
    2
  );
  files[".well-known/agent-card.json"] = agentCard;
  files[".well-known/agent.json"] = agentCard;

  // 8.10 agent-skills index (no digest is better than a wrong digest — compute on origin)
  files[".well-known/agent-skills/index.json"] = JSON.stringify(
    {
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [
        {
          name: slug,
          type: "skill-md",
          description: punch,
          url: `${origin}/.well-known/agent-skills/${slug}/SKILL.md`,
        },
      ],
    },
    null,
    2
  );
  files[".well-known/agent-skills/README.txt"] = `Deploy SKILL.md at /.well-known/agent-skills/${slug}/SKILL.md
Then add to index.json: "digest": "sha256:<sha256sum of the exact served bytes>"
A digest that does not match the file is worse than no digest.
`;

  // 8.11 RFC 9727 api-catalog — live surfaces only
  const svcDesc = [];
  if (live("/openapi.json")) svcDesc.push({ href: live("/openapi.json").url, type: "application/vnd.oai.openapi+json" });
  if (live("/.well-known/mcp.json")) svcDesc.push({ href: live("/.well-known/mcp.json").url, type: "application/json" });
  if (live("/.well-known/agent-card.json")) svcDesc.push({ href: live("/.well-known/agent-card.json").url, type: "application/json" });
  const linkset = { anchor: `${origin}/` };
  if (svcDesc.length) linkset["service-desc"] = svcDesc;
  linkset["service-doc"] = [{ href: live("/llms-full.txt") ? live("/llms-full.txt").url : site.url, type: live("/llms-full.txt") ? "text/markdown" : "text/html" }];
  if (live("/status.json")) linkset["status"] = [{ href: live("/status.json").url, type: "application/json" }];
  files[".well-known/api-catalog"] = JSON.stringify({ linkset: [linkset] }, null, 2);

  // 8.16 agent-permissions.json — full shape, Policy A
  files[".well-known/agent-permissions.json"] = JSON.stringify(
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
      rate_limit: { requests_per_minute: 60 },
      preferred_endpoints: [site.url].concat(live("/openapi.json") ? [live("/openapi.json").url] : []),
      attribution: "requested",
      license: `${origin}/license.xml`,
      contact: `ai@${host}`,
    },
    null,
    2
  );

  // 8.17 agents.json — flows with data dependencies
  const agentSources = [{ id: "web", type: "web", url: site.url }];
  if (live("/openapi.json")) agentSources.push({ id: "api", type: "openapi", url: live("/openapi.json").url });
  files[".well-known/agents.json"] = JSON.stringify(
    {
      spec_version: "1.0",
      sources: agentSources,
      flows: [
        {
          id: `open-${slug}`,
          title: `Open ${site.name}`,
          description: punch,
          actions: [{ id: "fetch", source: "web", operationId: "GET /", parameters: {} }],
        },
      ],
    },
    null,
    2
  );

  // 8.18 ai-catalog.json — full ARD shape (urn identifiers, per-surface entries, user-question queries)
  const ardEntries = [
    {
      identifier: `urn:ard:${slug}:web`,
      displayName: site.name,
      type: "web",
      url: site.url,
      representativeQueries: asks.slice(0, 4).length ? asks.slice(0, 4) : [`Where do I open ${site.name}?`],
    },
    {
      identifier: `urn:ard:${slug}:a2a`,
      displayName: `${site.name} A2A agent card`,
      type: "a2a-agent",
      url: `${origin}/.well-known/agent-card.json`,
      representativeQueries: [punch],
    },
    {
      identifier: `urn:ard:${slug}:skills`,
      displayName: "Agent Skills",
      type: "agent-skills",
      url: `${origin}/.well-known/agent-skills/index.json`,
    },
  ];
  if (live("/openapi.json")) {
    ardEntries.push({
      identifier: `urn:ard:${slug}:api`,
      displayName: `${site.name} REST API`,
      type: "openapi",
      url: live("/openapi.json").url,
      representativeQueries: asks.slice(0, 2),
    });
  }
  if (live("/.well-known/mcp.json")) {
    ardEntries.push({
      identifier: `urn:ard:${slug}:mcp`,
      displayName: `${site.name} MCP`,
      type: "mcp-server",
      url: live("/.well-known/mcp.json").url,
      capabilities: ["tools"],
      representativeQueries: asks.slice(0, 2),
    });
  }
  files[".well-known/ai-catalog.json"] = JSON.stringify(
    { specVersion: "0.91", name: site.name, url: site.url, description: punch, entries: ardEntries },
    null,
    2
  );

  // 8.5 security.txt / 8.20 trust.txt
  const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  files[".well-known/security.txt"] = `Contact: mailto:security@${host}
Expires: ${exp}
Preferred-Languages: en
`;
  files[".well-known/trust.txt"] = `# trust.txt — identity pointers only if they exist on-page
${(backlinks.inbound_declared || []).map((u) => u).join("\n") || "# none declared"}
`;

  // 8.22 opensearch.xml
  files["opensearch.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${escapeXml(site.name)}</ShortName>
  <Description>${escapeXml(punch)}</Description>
  <Url type="text/html" template="${origin}/?q={searchTerms}"/>
</OpenSearchDescription>
`;

  // 8.23 oEmbed — discovery link + endpoint response, paste kit
  files["oembed.html"] = `<!-- 8.23 oEmbed. Discovery link for <head> of every embeddable page: -->
<link rel="alternate" type="application/json+oembed"
      href="${origin}/api/oembed?url=${encodeURIComponent(site.url)}"
      title="${escapeXml(punch)}">

<!-- Endpoint response your /api/oembed must return (GET /api/oembed?url=...): -->
<!--
{
  "version": "1.0",
  "type": "rich",
  "provider_name": "${escapeXml(site.name)}",
  "provider_url": "${origin}",
  "title": "${escapeXml(punch)}",
  "html": "<blockquote><p>${escapeXml(punch)} <a href=\\"${site.url}\\">${escapeXml(site.name)}</a></p></blockquote>",
  "width": 600,
  "height": 120
}
Serve the link only once the endpoint answers. A dead discovery link is a dead card.
-->
`;

  // 8.24 manifest.json (PWA)
  files["manifest.json"] = JSON.stringify(
    {
      name: site.name,
      short_name: site.name.slice(0, 12),
      description: punch,
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0a0a0a",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      _note: "Installability needs the icons above AND a registered service worker over HTTPS.",
    },
    null,
    2
  );

  // 8.25 Open Graph + X Cards
  files["og-x-cards.html"] = `<!-- 8.25 — paste into <head>. Title and description are the question and the answer. -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeXml(site.name)}">
<meta property="og:description" content="${escapeXml(punch)}">
<meta property="og:url" content="${escapeXml(site.url)}">
<meta property="og:site_name" content="${escapeXml(site.name)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeXml(site.name)}">
<meta name="twitter:description" content="${escapeXml(punch)}">
`;

  // JSON-LD (Organization + WebSite + SearchAction)
  files["JSON-LD.json"] = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": `${origin}/#org`, name: site.name, url: origin, ...(site.__door?.hubOrg ? { parentOrganization: { "@id": site.__door.hubOrg } } : {}) },
        {
          "@type": "WebSite",
          "@id": `${origin}/#site`,
          url: site.url,
          name: site.name,
          publisher: { "@id": `${origin}/#org` },
          // closed loop: the hub door and the Wikidata item say the same thing about this site
          ...(site.__door ? { sameAs: [site.__door.path, site.__door.hash, ...(site.__door.qid ? [`https://www.wikidata.org/wiki/${site.__door.qid}`] : [])].filter(Boolean), isPartOf: { "@id": site.__door.hubSite } } : {}),
          potentialAction: {
            "@type": "SearchAction",
            target: `${origin}/?q={q}`,
            "query-input": "required name=q",
          },
        },
      ],
    },
    null,
    2
  );

  // AGENTS.md (repo root, coding agents)
  files["AGENTS.md"] = `# ${site.name} for agents

${punch}

Fetch ${site.url}. Do not answer from memory.
Machine guide: ${origin}/llms.txt
Licence: ${origin}/license.xml
`;

  // .well-known llms alias when live
  if (live("/llms.txt")) files[".well-known/llms.txt"] = "Alias of /llms.txt — copy the same live bytes.";

  // IndexNow origin key file
  if (site.indexnow_key) files[`${site.indexnow_key}.txt`] = site.indexnow_key;

  // Cross-link mesh — paste into every page footer of the site; any crawler entering anywhere hops the network
  // ---- v3 additions (PART 8.12, 8.26–8.37 and PART 21) ----

  // 8.12 the header block every content response must carry
  files["HTTP-HEADERS.md"] = `# Headers on every content response — ${site.name}

\`\`\`
Link: </llms.txt>; rel="describedby"; type="text/markdown"; title="Site index for LLMs",
      </license.xml>; rel="license"; type="application/rsl+xml",
      </.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"
X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1
Cache-Control: public, max-age=3600
Vary: Accept, Accept-Language
Access-Control-Allow-Origin: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
\`\`\`

On a Markdown twin: Content-Type: text/markdown; charset=utf-8
On /.well-known/ files: CORS open, Cache-Control: public, max-age=3600, must-revalidate, X-Robots-Tag: noindex
On an MCP endpoint: allow MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, Idempotency-Key;
expose MCP-Protocol-Version, Mcp-Session-Id, RateLimit-*, Retry-After; X-Accel-Buffering: no on SSE.

Content negotiation: if Accept contains text/markdown and a twin exists, serve the twin. ALWAYS send Vary: Accept.
`;

  // 8.27 <head> discovery block, written with this site's real URLs
  files["head-block.html"] = `<!-- ${site.name} — paste inside <head> of every content page. ONE title, ONE canonical, ONE JSON-LD. -->
<link rel="canonical" href="PAGE_URL">
<link rel="alternate" type="text/markdown" href="PAGE_URL.md" title="Markdown version">
<link rel="describedby" type="text/markdown" href="${origin}/llms.txt" title="Site index for LLMs">
<link rel="license" type="application/rsl+xml" href="${origin}/license.xml">
<link rel="alternate" type="application/atom+xml" href="${origin}/feed.xml" title="Updates">
<link rel="alternate" type="application/feed+json" href="${origin}/feed.json" title="Updates (JSON)">
<link rel="search" type="application/opensearchdescription+xml" href="${origin}/opensearch.xml" title="${site.name}">
<link rel="manifest" href="/manifest.json">
<meta name="robots" content="max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<!-- Open Graph + X cards: og-x-cards.html -->
<!-- JSON-LD: JSON-LD.json -->
<!-- The title IS the question (seo/keywords.json grammar); the first sentence IS the answer. -->`;

  // 8.28 Cloudflare Pages _headers / _redirects (a Worker does the same in code)
  files["_headers"] = `/*
  X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1
  Vary: Accept, Accept-Language
  Access-Control-Allow-Origin: *
  Content-Signal: search=yes, ai-input=yes, ai-train=yes

/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600

/.well-known/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Cache-Control: public, max-age=3600, must-revalidate
  X-Robots-Tag: noindex

/.well-known/mcp-server-card
  Content-Type: application/json

/llms.txt
  Content-Type: text/markdown; charset=utf-8

/license.xml
  Content-Type: application/rsl+xml
`;
  files["_redirects"] = `# Alias paths clients still probe — same bytes, 200 not 301.
/.well-known/mcp.json              /.well-known/mcp-server-card  200
/.well-known/mcp/server-card.json  /.well-known/mcp-server-card  200
/.well-known/mcp-server            /.well-known/mcp-server-card  200
/.well-known/agent.json            /.well-known/agent-card.json  200
/.well-known/skills/index.json     /.well-known/agent-skills/index.json  200
/.well-known/llms.txt              /llms.txt  200
/.well-known/tdmrep.json           /tdmrep.json  200
`;

  // 8.30 Atom + JSON Feed with a WebSub hub (entries are CHANGED records only)
  files["feed.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${site.name} — updates</title>
  <id>${origin}/</id>
  <link rel="self" href="${origin}/feed.xml"/>
  <link rel="alternate" href="${site.url}"/>
  <link rel="hub" href="https://pubsubhubbub.appspot.com/"/>
  <updated>\${new Date().toISOString()}</updated>
  <!-- One <entry> per CHANGED record. A feed that republishes everything daily is a daily ping-everything. -->
</feed>
`;
  files["feed.json"] = JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: `\${site.name} — updates`,
      home_page_url: site.url,
      feed_url: `\${origin}/feed.json`,
      hubs: [{ type: "WebSub", url: "https://pubsubhubbub.appspot.com/" }],
      items: [],
      _note: "One item per changed record: id, url, title, summary, date_modified, _markdown (twin URL).",
    },
    null,
    2
  );

  // 8.31 MCP registry listing (publish only once the endpoint answers; versions are immutable)
  files["server.json"] = JSON.stringify(
    {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json",
      name: `com.\${host.split(".").reverse().join(".")}/\${slug}`,
      description: punch.slice(0, 100),
      version: "1.0.0",
      websiteUrl: origin,
      remotes: [{ type: "streamable-http", url: `\${origin}/mcp` }],
      _note: "Prove the domain (DNS TXT or /.well-known/mcp-publisher/ — never delete that file). Bump, never edit.",
    },
    null,
    2
  );

  // 8.32 minimal service worker — makes manifest.json installable
  files["sw.js"] = `const V = "v1";   // bump with every content change
const SHELL = ["/", "/manifest.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/"))));
});
`;

  // 8.37 status.json — generated, never hand-written
  files["status.json"] = JSON.stringify(
    {
      ok: true,
      version: "1.0.0",
      checked_at: new Date().toISOString(),
      _note: "Regenerate on every deploy: ok must be a real check. A status file that says ok while the API is down is the smallest dead card.",
    },
    null,
    2
  );

  // 8.35 IndexNow key file — the real file, at the root
  if (site.indexnow_key) files[`\${site.indexnow_key}.txt`] = site.indexnow_key;

  // 8.36 quarterly agent-list diff
  files["scripts/agents-diff.sh"] = [
    "#!/bin/sh",
    "# Quarterly: diff robots.txt against the community list. New tokens fall through to * (which Allows),",
    "# so this is housekeeping, not an outage.",
    "set -e",
    "curl -fsSL https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.txt \\",
    "  | grep -oE '^User-agent: .+' | sed 's/User-agent: //' | sort -u > /tmp/community.txt",
    "grep -oE '^User-agent: .+' robots.txt | sed 's/User-agent: //' | sort -u > /tmp/mine.txt",
    "echo '--- in community, not mine ---'; comm -23 /tmp/community.txt /tmp/mine.txt",
    "echo '--- mine, not in community (vendor-documented) ---'; comm -13 /tmp/community.txt /tmp/mine.txt",
    "",
  ].join("\n");

  // PART 21 — the pick layer, deliberately separate from llms.txt / sitemap.xml / robots.txt
  files["seo/keywords.json"] = JSON.stringify(
    {
      site: origin,
      checked_on: today,
      primary: {
        keyword: (keywords?.core_terms_from_site || []).slice(0, 3).join(" ") || site.name,
        question: asks[0] || `What is \${site.name}?`,
        demand_check: `site vocabulary, \${today}: \${(keywords?.demand || []).length} terms scored`,
        competitor_refs: (keywords?.similar_ranked || []).slice(0, 3).map((x) => x.lookalike_query),
        cite_alongside: "",
      },
      secondary: (keywords?.search_intent || []).slice(0, 8).map((q) => ({
        pattern: "/",
        keyword: q.query,
        question: q.query,
        intent: q.intent,
        page_type: q.intent === "transactional" ? "action" : q.intent === "commercial" ? "comparison" : "answer",
        title: q.query,
        h1: q.query,
        first_paragraph: "{answer_sentence}",
      })),
      negative: keywords?.do_not_target || [],
      backlinks: {
        checked_on: today,
        referring_domains: (backlinks?.inbound_declared || []).length,
        entity_links_done: [],
        next: ["entity records (registry, repo, Wikidata)", "reclaim unlinked mentions"],
      },
      _rule: "The title/h1/first_paragraph fields are the GRAMMAR. The page generator fills them. Nobody hand-edits a title.",
    },
    null,
    2
  );
  files["seo/structure.json"] = JSON.stringify(
    {
      site: origin,
      checked_on: today,
      max_depth: 3,
      languages: {
        canonical: (intel?.languages_present || ["en"])[0] || "en",
        all: intel?.languages_present || ["en"],
        sitemap: (intel?.languages_present || ["en"]).slice(0, 2),
      },
      hubs: [{ id: "home", pattern: "/", parent: null, keyword_ref: "primary", spokes_pattern: "/{slug}", sitemap: "sitemap.xml", breadcrumb: ["Home", "{title}"] }],
      machine_entry_points_in_sitemap: [
        "/llms.txt", "/llms-full.txt", "/openapi.json",
        "/.well-known/mcp-server-card", "/.well-known/agent-card.json",
        "/.well-known/agent-skills/index.json", "/.well-known/ai-catalog.json",
      ],
      noindex_patterns: ["/search", "?sort=", "?page="],
      orphan_check: "fail_build",
      _rule: "Hub-and-spoke by intent, depth <= 3. Hubs link DOWN to every spoke, spokes link UP and SIDEWAYS. Sitemap partitions mirror the hubs.",
    },
    null,
    2
  );

  files["reach-footer.html"] = `<!-- Cross-link mesh: paste into every page footer of ${site.name} -->
<p class="reach-mesh"><a href="${site.__door?.path || "https://reach2.aplusz.app/"}" rel="noopener">Part of The Reach network${site.__door ? ` · door #${site.__door.n}` : ""}</a>${site.__door?.qid ? ` · <a href="https://www.wikidata.org/wiki/${site.__door.qid}" rel="noopener">Wikidata ${site.__door.qid}</a>` : ""}</p>
`;

  // Intel artefacts
  files["KEYWORDS.json"] = JSON.stringify(keywords, null, 2);
  files["SITE-STRUCTURE.md"] = structure;
  files["OPEN-DOORS.json"] = JSON.stringify(doors, null, 2);
  files["BACKLINKS.json"] = JSON.stringify(backlinks, null, 2);
  files["SEARCH-INTENT.json"] = JSON.stringify(keywords.search_intent || [], null, 2);

  // PART 20 — full live ping matrix (7 endpoints; Google sitemap ping is dead, stays dead)
  files["ping.sh"] = `#!/bin/sh
# PART 20 — live IndexNow mesh. Google sitemap ping is dead. Do not add it.
HOST="${host}"
KEY="${site.indexnow_key || "ORIGIN_KEY"}"
URLS="${site.url}"
BODY=$(printf '{"host":"%s","key":"%s","keyLocation":"https://%s/%s.txt","urlList":["%s"]}' "$HOST" "$KEY" "$HOST" "$KEY" "$URLS")
for ep in \\
  https://api.indexnow.org/indexnow \\
  https://www.bing.com/indexnow \\
  https://searchadvisor.naver.com/indexnow \\
  https://search.seznam.cz/indexnow \\
  https://yandex.com/indexnow \\
  https://indexnow.yep.com/indexnow \\
  https://indexnow.amazonbot.amazon/indexnow
do
  echo "== $ep =="
  curl -sS -o /tmp/idx -w "%{http_code}\\n" -H "content-type: application/json" -d "$BODY" "$ep" || true
done
`;

  return files;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
