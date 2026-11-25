/** Calling AI Models - the site-agnostic playbook, durable edition, REVISION 3 (25 November 2026).
 *  One module, three jobs:
 *   1. the dated agent list and the policy builders (robots.txt, license.xml, ai.txt, tdmrep.json) - shared by the
 *      hub's own surface (src/surfaces.js) and by every pack, so the places that must agree are written from ONE
 *      policy value and cannot disagree;
 *   2. the card and catalog builders (MCP server card, A2A agent card, the ARD / AI Catalog document);
 *   3. buildPlaybookFiles: the per-site pack. Honest by construction (rule 1.4): a card, a catalog entry, a search
 *      description, a manifest or a contact line ships only for something the hub's own probe saw answer; everything
 *      withheld is listed, with its reason, in _reach-pack/NOT-SHIPPED.md.
 *
 *  What Revision 3 changed here (Appendix E of the playbook):
 *   - 248 named agent groups + wildcard (31 added: Claude-Agent and the 25 Nov 2026 community re-diff);
 *   - robots.txt order: comment for models, wildcard group, named groups, the shared training-preference group
 *     `User-agent: __usage_ai-training` (written under BOTH policies: a missing group states no preference at all),
 *     License:, Sitemap:, then Agentmap: once the catalog answers;
 *   - license.xml in the RSL 1.0 shape (path in <content url>, <copyright>/<terms> beside <license>, ai-index kept);
 *   - the MCP server card lives at the MCP endpoint URL + /server-card, served as application/mcp-server-card+json;
 *     the three /.well-known/ paths stay as same-bytes aliases;
 *   - the A2A card is the 1.0 shape: supportedInterfaces, no top-level url / protocolVersion / preferredTransport;
 *   - the catalog is ONE document at /.well-known/ard.json (ARD v0.91) and /.well-known/ai-catalog.json (AI Catalog
 *     v0.9): specVersion "0.9", urn:air: identifiers, media types as entry types, 2 to 5 representativeQueries;
 *   - the work-order kit for a model that installs the pack (playbook 4.3.6 / A.47). */

export const PLAYBOOK_REVISION = "Revision 3 (25 November 2026)";
export const AGENTS_VERIFIED = "Verified 17 October 2026; re-diffed 25 November 2026";

/** The shared AI-training preference token (draft-kelley-aipref-training-preference-signal-00). A usage preference,
 *  not a crawl rule: it gets a group of its own, never one shared with a crawler token. */
export const TRAINING_TOKEN = "__usage_ai-training";

/** B.3 of the playbook, group by group, token by token (generated from the playbook text, never retyped). */
export const AGENT_GROUPS = [
  { g: "OpenAI", t: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ChatGPT Agent", "Operator", "OAI-AdsBot", "OpenAI"] },
  { g: "Anthropic", t: ["ClaudeBot", "Claude-SearchBot", "Claude-User", "Claude-Agent", "Claude-Web", "Claude-Code", "anthropic-ai"] },
  { g: "Google", t: ["Googlebot", "Googlebot-Image", "Googlebot-Video", "Googlebot-News", "Storebot-Google", "Google-InspectionTool", "AdsBot-Google", "Google-Extended", "GoogleOther", "GoogleOther-Image", "GoogleOther-Video", "Google-CloudVertexBot", "CloudVertexBot", "Google-Agent", "GoogleAgent-Mariner", "GoogleAgent-URLContext", "Google-Gemini-CLI", "Google-GeminiNotebook", "Google-NotebookLM", "NotebookLM", "Gemini-Deep-Research", "Google-Firebase", "Google-Read-Aloud", "Google-Pinpoint", "Google-CWS", "FeedFetcher-Google"] },
  { g: "Microsoft / Bing", t: ["Bingbot", "BingPreview", "MicrosoftPreview", "AdIdxBot", "msnbot", "AzureAI-SearchBot"] },
  { g: "Meta", t: ["meta-externalagent", "Meta-ExternalAgent", "meta-webindexer", "meta-externalfetcher", "Meta-ExternalFetcher", "meta-externalads", "Meta-ExternalAds", "FacebookBot", "facebookexternalhit"] },
  { g: "Apple", t: ["Applebot", "Applebot-Extended"] },
  { g: "Perplexity", t: ["PerplexityBot", "Perplexity-User"] },
  { g: "xAI (Cloudflare-verified agent token only - see 3.16)", t: ["GrokAgent"] },
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
  { g: "Added 25 November 2026 (community list re-diff)", t: ["AgentDataBot", "AGI Agent", "BixelBot", "CartAI Agentic Commerce", "CledaraBot", "Codex", "Dot", "ElevenlabsBot", "ElevenlabsCrawler", "ExaUser", "GeneralRetrievalBot", "Grok Bot", "GrokAppAndroid", "GrokBot", "Haiku-SearchBot", "HarkBot", "HatchFeed", "Hunyuan", "Instinct", "KeenableBot", "Liner-User", "MiniMaxAgent", "MoonshotBot", "Muse", "nbot", "Payhawk Invoice Fetching Agent", "qodercli", "ScryBot", "xAI-Grok", "YiBot"] },
];

/** Flat token list (248 named groups; the wildcard is written separately). */
export const CITATION_AGENTS = AGENT_GROUPS.flatMap((x) => x.t);

/** Policy B (cite me, do not train): the Job 1 set of the playbook's B.4, written out. These get Disallow: /.
 *  Google-Extended is in it deliberately and is the one to reconsider alone (it also governs Gemini grounding);
 *  Amazonbot, QwenBot and Applebot are mixed-purpose and deliberately NOT in it. */
export const TRAINING_ONLY = [
  "GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "CCBot", "Applebot-Extended",
  "meta-externalagent", "Meta-ExternalAgent", "MistralAI-Training", "cohere-training-data-crawler",
  "cohere-ai", "Bytespider", "TikTokSpider", "KimiBot", "Reflectionbot", "Ai2Bot-Dolma",
  "LAIONDownloader", "laion-huggingface-processor", "img2dataset", "imageSpider",
  "Webzio-Extended", "webzio-extended", "Timpibot", "Cotoyogi", "Kangaroo Bot",
  "Poseidon Research Crawler", "ICC-Crawler", "omgili", "omgilibot",
];

/* ---------- media types, schema addresses, identifiers (playbook 3.5, 3.7, 3.8, 3.9, C.1) ---------- */

export const MEDIA = {
  serverCard: "application/mcp-server-card+json",
  agentCard: "application/a2a-agent-card+json",
  skillMd: "application/agent-skills+md",
  skillsIndex: "application/agent-skills+json",
  catalog: "application/ai-catalog+json",
  openapi: "application/vnd.oai.openapi+json",
  linkset: "application/linkset+json",
  rsl: "application/rsl+xml",
};
/** AI Catalog v0.9 is the release candidate for 1.0: change this to "1.0" on the day 1.0 is final. ARD ignores it. */
export const CATALOG_SPEC_VERSION = "0.9";
export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_JSON_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
export const SKILLS_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
export const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/";

/** The paths a pack build probes with GET on the origin. A path that answers is "live"; nothing else is advertised. */
export const PLAYBOOK_PATHS = [
  "/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/llms-small.txt",
  "/llms/api.txt", "/ai.txt", "/license.xml", "/tdmrep.json", "/openapi.json",
  "/status.json", "/opensearch.xml", "/manifest.json", "/sw.js",
  "/feed.xml", "/feed.json", "/icons/icon-192.png", "/icons/icon-512.png",
  "/.well-known/llms.txt", "/.well-known/security.txt", "/.well-known/trust.txt",
  "/.well-known/tdmrep.json", "/mcp/server-card", "/.well-known/mcp-server-card", "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json", "/.well-known/mcp-server",
  "/.well-known/agent-card.json", "/.well-known/agent.json", "/.well-known/agents.json",
  "/.well-known/agent-permissions.json", "/.well-known/agent-skills/index.json",
  "/.well-known/skills/index.json", "/.well-known/ard.json", "/.well-known/ai-catalog.json",
  "/.well-known/api-catalog",
];

/** The two POST endpoints a card may point at. Probed by stack.js probeOrigin with real handshakes (MCP: legacy
 *  `initialize` and modern `server/discover` with the three headers; A2A: `SendMessage` with `A2A-Version: 1.0`, and
 *  the 0.3 `message/send`). A card is written only when the probe row says open, listing the versions it heard. */
export const ENDPOINT_PROBES = ["/mcp", "/a2a"];

/** A served file must never carry a template string or a placeholder domain: a 200 with one is a lie (check 8). */
export const PLACEHOLDER_RE = /\$\{|YOUR\.DOMAIN|example\.com|REPLACE_WITH|TODO|https:\/\/\//;

/** Every pack file whose body matches PLACEHOLDER_RE. Empty means the pack may be written. */
export function packSelfTest(files) {
  const hits = [];
  for (const [path, body] of Object.entries(files || {})) {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const m = text.match(PLACEHOLDER_RE);
    if (m) hits.push({ path, hit: m[0], at: m.index });
  }
  return hits;
}

/* ---------- small text helpers ---------- */

const flat = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Cut at a word boundary to at most `max` characters, no ellipsis: the limits here are schema limits. */
export function clipTo(text, max) {
  const t = flat(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, "");
}

/** An Agent Skills name: 1-64 characters of [a-z0-9-], no leading, trailing or double hyphen. It is also the
 *  directory the SKILL.md is served from, and validators reject a mismatch. */
export function skillNameOf(host) {
  const s = String(host || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
  return s || "site";
}

/** Reverse-DNS of a host: reach2.aplusz.app -> app.aplusz.reach2. The MCP registry namespace of that domain. */
export const reverseDns = (host) => String(host || "").toLowerCase().split(".").filter(Boolean).reverse().join(".");

/** urn:air:<publisher>:<namespace>:<name> - an opaque, stable catalog identifier anchored on the publisher's domain. */
export function urnAir(host, ...segments) {
  const clean = (x) => String(x).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  return `urn:air:${String(host).toLowerCase()}:${segments.map(clean).join(":")}`;
}

/** 2 to 5 distinct user questions for a catalog entry (rule 1.1 applied to a catalog; registries index them). */
export function queries2to5(list, fallbacks = []) {
  const seen = new Set();
  const out = [];
  for (const q of [...(list || []), ...fallbacks]) {
    const t = flat(q);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t.slice(0, 200));
    if (out.length === 5) break;
  }
  return out;
}

/** The MCP server card's own address: the endpoint URL + /server-card (playbook 3.5). */
export const serverCardUrl = (mcpUrl) => `${String(mcpUrl).replace(/\/+$/, "")}/server-card`;

export function escapeXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- the policy, written once (playbook 2.4 "the places that must agree") ---------- */

const isB = (policy) => policy === "B";
/** The Content-Signal value of a policy: A = cite me, train on me; B = cite me, do not train on me. */
export const contentSignal = (policy = "A") => `search=yes, ai-input=yes, ai-train=${isB(policy) ? "no" : "yes"}`;

/** robots.txt, in the playbook's file order.
 *  opts.pointers  - { llms, llmsFull, openapi, mcpCard, agentCard, skills, catalog }: absolute URLs of machine entry
 *                   points that ANSWER; an omitted key prints nothing.
 *  opts.twins     - true when the origin serves Markdown twins (.md / Accept: text/markdown).
 *  opts.contact   - a real address ("mailto:..." or a URL); omitted when none is known.
 *  opts.sitemaps  - absolute sitemap URLs that answer; none means no Sitemap: line (a pointer at a 404 is worse).
 *  opts.agentmap  - the absolute URL of /.well-known/ard.json, once it answers.
 *  opts.license   - false when no license.xml is served (default true). */
export function buildRobotsTxt(origin, opts = {}) {
  const policy = isB(opts.policy) ? "B" : "A";
  const B = policy === "B";
  const p = opts.pointers || {};
  const sig = `Content-Signal: ${contentSignal(policy)}`;
  /* IETF AIPREF form. Written from the same policy value as Content-Signal, so the two vocabularies cannot disagree.
     Under A it sits in the wildcard group (no preference and "yes" read the same for a named crawler); under B it is
     in every group, because a crawler reads the group that names it and nothing else. */
  const usage = `Content-Usage: train-ai=${B ? "n" : "y"}`;
  const rule = (ua) => (B && TRAINING_ONLY.includes(ua) ? "Disallow: /" : "Allow: /");
  const named = CITATION_AGENTS.length;
  const entry = [p.llms, p.llmsFull, p.openapi, p.mcpCard, p.agentCard, p.skills, p.catalog].filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
  const head = [
    "# To AI systems fetching this site:",
    "# Do not waste context on HTML chrome.",
    ...(entry.length ? ["# Machine entry points:", ...entry.map((u) => `#   ${u}`)] : []),
    ...(opts.twins ? ["# Markdown twins: add .md to any content URL, or request", "#   Accept: text/markdown."] : []),
    ...(opts.license === false ? [] : [`# Licence: ${origin}/license.xml`]),
    ...(opts.contact ? [`# Contact: ${String(opts.contact).replace(/^mailto:/, "")}`] : []),
    "#",
    "# Content Signals Policy (https://contentsignals.org/)",
    "# search:   building a search index and providing search results",
    "#           (hyperlinks and short excerpts). Does not include",
    "#           AI-generated search summaries.",
    "# ai-input: inputting content into AI models (RAG, grounding,",
    "#           real-time answers).",
    "# ai-train: training or fine-tuning AI models.",
    "# Omitting a signal means it is unexpressed, not denied.",
    "#",
    `# Policy ${policy}: ${B ? "cite me, do not train on me" : "cite me, train on me"}. The same answer is in ai.txt, license.xml, tdmrep.json,`,
    "# the llms.txt terms and the shared training group at the end of this file.",
    `# This file names every documented agent (${named} named groups + wildcard).`,
    "# Unknown and future tokens fall through to User-agent: * which",
    "# already Allows. Re-diff against the community list quarterly" + (opts.diffScript ? ` (${opts.diffScript}).` : "."),
    `# Calling AI Models, ${PLAYBOOK_REVISION}. ${AGENTS_VERIFIED}.`,
    ...(B ? ["# A Disallow on a token with a digit or a space does not bind a strict RFC 9309 parser: the edge is the lever there."] : []),
  ].join("\n");

  const groups = AGENT_GROUPS.map(
    (grp) => `# --- ${grp.g} ---\n\n` + grp.t.map((ua) => `User-agent: ${ua}\n${rule(ua)}\n${sig}\n${B ? `${usage}\n` : ""}`).join("\n")
  ).join("\n");

  const tail = [
    ...(opts.license === false ? [] : [`License: ${origin}/license.xml`]),
    ...[...new Set((opts.sitemaps || []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))].map((u) => `Sitemap: ${u}`),
    ...(typeof opts.agentmap === "string" && /^https?:\/\//.test(opts.agentmap) ? [`Agentmap: ${opts.agentmap}`] : []),
  ].join("\n");

  return `${head}

User-agent: *
Allow: /
${sig}
${usage}

${groups}
# --- Shared training preference token (IETF AIPREF draft) ---
# ${B ? "Disallow = a preference against training." : "Allow = training permitted."} Without this group no preference
# would be stated at all: the wildcard group does not stand in for it.

User-agent: ${TRAINING_TOKEN}
${B ? "Disallow" : "Allow"}: /
${tail ? `\n${tail}\n` : ""}`;
}

/** license.xml - RSL 1.0. url is a PATH; <copyright> and <terms> sit beside <license>; a <permits> list is an
 *  allow-list, so ai-index (the retrieval index grounding runs on) is always in it; free = no credit owed, which is
 *  what "attribution requested" means in ai.txt and agent-permissions.json. */
export function buildLicenseXml({ policy = "A", holder = "", holderType = "organization", contactEmail = "", contactUrl = "", terms = "" } = {}) {
  const usage = isB(policy)
    ? `      <prohibits type="usage">ai-train</prohibits>\n      <permits type="usage">search ai-input ai-index</permits>`
    : `      <permits type="usage">search ai-input ai-index ai-train</permits>`;
  const contact = contactEmail ? ` contactEmail="${escapeXml(contactEmail)}"` : contactUrl ? ` contactUrl="${escapeXml(contactUrl)}"` : "";
  const type = holderType === "person" ? "person" : "organization";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsl xmlns="https://rslstandard.org/rsl">
  <content url="/">
    <license>
${usage}
      <permits type="user">commercial non-commercial education government personal</permits>
      <payment type="free"/>
    </license>${holder ? `\n    <copyright type="${type}"${contact}>${escapeXml(holder)}</copyright>` : ""}${terms ? `\n    <terms>${escapeXml(terms)}</terms>` : ""}
  </content>
</rsl>
`;
}

/** ai.txt - short AI-specific rules. Every line is written from the same policy as robots.txt. */
export function buildAiTxt({ policy = "A", name = "", origin = "", contact = "", mcp = "", openapi = "", llms = "" } = {}) {
  const train = isB(policy) ? "disallowed" : "allowed";
  return [
    "# ai.txt - AI-specific crawl and use rules.",
    "# Says the same as robots.txt, license.xml, tdmrep.json and the llms.txt terms.",
    "User-agent: *",
    "Allow: /",
    `Content-Signal: ${contentSignal(policy)}`,
    "Crawling: allowed",
    `Training: ${train}`,
    "Inference: allowed",
    "Search: allowed",
    `Attribution: requested - cite "${flat(name)}, retrieved {date}, {url}"`,
    `License: ${origin}/license.xml`,
    ...(contact ? [`Contact: ${String(contact).replace(/^mailto:/, "")}`] : []),
    ...(mcp ? [`Preferred-Interface: ${mcp}`] : []),
    ...(openapi ? [`Preferred-Data: ${openapi}`] : []),
    ...(llms ? [`Summary: ${llms}`] : []),
    "",
  ].join("\n");
}

/** tdmrep.json - EU / FR text-and-data-mining reservation: 0 = none (Policy A), 1 = reserved (Policy B). */
export const buildTdmrep = (origin, policy = "A") =>
  JSON.stringify([{ location: "/", "tdm-reservation": isB(policy) ? 1 : 0, "tdm-policy": `${origin}/license.xml` }], null, 2) + "\n";

/** agent-permissions.json - the interaction policy, same training answer as everything above. */
export function buildAgentPermissions({ policy = "A", origin = "", contact = "", preferred = [], note = "" } = {}) {
  const train = !isB(policy);
  return JSON.stringify(
    {
      version: "1.0",
      defaults: { crawl: true, train, inference: true, search: true, automate: true, human_in_the_loop: false },
      agents: [
        { name: "OAI-SearchBot", crawl: true, search: true },
        { name: "Claude-SearchBot", crawl: true, search: true },
        { name: "PerplexityBot", crawl: true, search: true },
        ...(train ? [{ name: "GPTBot", crawl: true, train: true }, { name: "ClaudeBot", crawl: true, train: true }] : []),
      ],
      rate_limit: { requests_per_minute: 60, ...(note ? { note } : {}) },
      ...(preferred.length ? { preferred_endpoints: preferred } : {}),
      attribution: "requested",
      license: `${origin}/license.xml`,
      ...(contact ? { contact: String(contact).replace(/^mailto:/, "") } : {}),
    },
    null,
    2
  ) + "\n";
}

/* ---------- cards and the catalog ---------- */

/** MCP server card (SEP-2127 extension). $schema, name, version, description are required; description is 1 to 100
 *  characters; no tools, resources or prompts - the client learns them from the live connection. The card is advisory:
 *  it must say what server/discover says, and `versions` lists ONLY what the endpoint answered. */
export function buildServerCard({ name, title = "", description, version, websiteUrl = "", repository = null, remoteUrl, versions = [], meta = null, icons = null }) {
  return JSON.stringify(
    {
      $schema: SERVER_CARD_SCHEMA,
      name,
      ...(title ? { title: clipTo(title, 100) } : {}),
      description: clipTo(description, 100),
      version,
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(repository ? { repository } : {}),
      ...(icons ? { icons } : {}),
      remotes: [{ type: "streamable-http", url: remoteUrl, ...(versions.length ? { supportedProtocolVersions: versions } : {}) }],
      ...(meta ? { _meta: meta } : {}),
    },
    null,
    2
  ) + "\n";
}

/** A2A agent card, 1.0 shape: the endpoint URL and the protocol version live in supportedInterfaces (preferred
 *  first), never at the top level; protocolVersion is major.minor. `interfaces` lists only what answered. */
export function buildAgentCard({ name, description, interfaces, provider = null, version, documentationUrl = "", iconUrl = "", skills = [] }) {
  return JSON.stringify(
    {
      name,
      description,
      supportedInterfaces: interfaces.map((i) => ({ url: i.url, protocolBinding: i.protocolBinding || "JSONRPC", protocolVersion: i.protocolVersion })),
      ...(provider ? { provider } : {}),
      version,
      ...(documentationUrl ? { documentationUrl } : {}),
      ...(iconUrl ? { iconUrl } : {}),
      capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json", "text/plain"],
      skills,
    },
    null,
    2
  ) + "\n";
}

/** The catalog: ONE document that satisfies both live specifications and is served, same bytes, at
 *  /.well-known/ard.json (ARD v0.91) and /.well-known/ai-catalog.json (AI Catalog v0.9). Every entry: a urn:air:
 *  identifier, a displayName, a media type as its type, exactly one of url / data, 2 to 5 representativeQueries. */
export function buildCatalog({ host = null, entries = [] } = {}) {
  return JSON.stringify({ specVersion: CATALOG_SPEC_VERSION, ...(host ? { host } : {}), entries }, null, 2) + "\n";
}

/* ---------- the pack ---------- */

/** How an installer treats each pack file (tools/pack-install.ps1 reads the same lists from _reach-pack/MANIFEST.json):
 *   reference - paste-by-hand or repository material; never served from the origin;
 *   soft      - written only when the origin has no file of its own at that path (its own file is never clobbered);
 *   deploy    - everything else: served from the origin at exactly the pack path. */
export const PACK_REFERENCE = new Set([
  "markdown-twin-footer.md", "oembed.html", "og-x-cards.html", "JSON-LD.json", "AGENTS.md", "HTTP-HEADERS.md",
  "head-block.html", "images.html", "server.json", "scripts/agents-diff.sh", "ping.sh", "reach-footer.html",
  "KEYWORDS.json", "OPEN-DOORS.json", "BACKLINKS.json", "SEARCH-INTENT.json", "seo/keywords.json", "seo/structure.json",
]);
export const PACK_SOFT = new Set(["llms.txt", "llms-small.txt", "llms-full.txt", "llms/api.txt", "manifest.json", "sw.js"]);

/** Files an earlier revision of this pack wrote into a site's web root and this revision withdraws.
 *  `pattern` describes the generator's own output and nothing else - the whole file for the short ones, the exact
 *  opening for the two long ones - so a site's own file at the same path never matches and is never touched.
 *  Two readers apply it: the hub's probe against the live file (stack.js) and the installer against the local one
 *  (tools/pack-install.ps1, which receives the list in MANIFEST.json). The syntax is the part JavaScript and .NET
 *  regular expressions share. A path this pack ships again is replaced, not withdrawn. */
const JSTR = String.raw`"(?:[^"\\]|\\.)*"`;
export const PACK_LEFTOVERS = [
  {
    path: "status.json",
    pattern: String.raw`^\{\s*"ok": true,\s*"version": "1\.0\.0",\s*"checked_at": "[^"]*",\s*"_note": "Regenerate on every deploy: ok must be a real check\.[^"]*"\s*\}\s*$`,
    because: "it is a static file that says ok forever: it would still say ok with the site down.",
  },
  {
    path: "opensearch.xml",
    pattern: String.raw`^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<OpenSearchDescription xmlns="http://a9\.com/-/spec/opensearch/1\.1/">\s*<ShortName>[^<]*</ShortName>\s*<Description>[^<]*</Description>\s*<Url type="text/html" template="https?://[^"/]+/\?q=\{searchTerms\}"/>\s*</OpenSearchDescription>\s*$`,
    because: "it names /?q={searchTerms} as a search endpoint, which the hub guessed and never saw answer.",
  },
  {
    path: ".well-known/agents.json",
    pattern: String.raw`^\{\s*"spec_version": "1\.0",\s*"sources": \[[\s\S]*?\],\s*"flows": \[\s*\{\s*"id": "open-[^"]*",\s*"title": ${JSTR},\s*"description": ${JSTR},\s*"actions": \[\s*\{\s*"id": "fetch",\s*"source": "web",\s*"operationId": "GET /",\s*"parameters": \{\}\s*\}\s*\]\s*\}\s*\]\s*\}\s*$`,
    because: "its one flow (open the home page) was written by the hub, not taken from this site's own API.",
  },
  {
    path: ".well-known/security.txt",
    pattern: String.raw`^Contact: mailto:security@[A-Za-z0-9.-]+\s+Expires: [0-9TZ:.-]+\s+Preferred-Languages: en\s*$`,
    because: "its contact is security@ this domain, a mailbox the hub made up.",
  },
  {
    path: ".well-known/api-catalog",
    pattern: String.raw`^\{\s*"linkset": \[\s*\{\s*"anchor": "[^"]*",\s*"service-doc": \[\s*\{\s*"href": "[^"]*",\s*"type": "text/(?:html|markdown)"\s*\}\s*\](?:,\s*"status": \[\s*\{\s*"href": "[^"]*",\s*"type": "application/json"\s*\}\s*\])?\s*\}\s*\]\s*\}\s*$`,
    because: "it describes no API: a catalog with no service description in it.",
  },
  {
    path: "seo/keywords.json",
    pattern: String.raw`^\{\s*"site": "[^"]*",\s*"checked_on": "[^"]*",\s*"primary": \{\s*"keyword": ${JSTR},\s*"question": ${JSTR},\s*"demand_check": "site vocabulary, `,
    because: "it is a repository file (playbook 2.11): the input that generates titles, never a served file.",
  },
  {
    path: "seo/structure.json",
    pattern: String.raw`^\{\s*"site": "[^"]*",\s*"checked_on": "[^"]*",\s*"max_depth": 3,\s*"languages": \{[\s\S]*?\},\s*"hubs": \[\s*\{\s*"id": "home",\s*"pattern": "/",\s*"parent": null,\s*"keyword_ref": "primary",\s*"spokes_pattern": "/\{slug\}"`,
    because: "it is a repository file (playbook 2.11): the input that generates sitemap partitions, never a served file.",
  },
];
/** The line every pack robots.txt carries (this revision's wording, or the one earlier revisions wrote): the sign
 *  that a web root carries a pack. Where a site's robots.txt does not carry it, the site has a machine surface of
 *  its own, and every file already in place there is the site's: the pack adds what is missing and replaces nothing. */
export const PACK_ROBOTS_MARKER = String.raw`names every documented agent \(\d+ named groups|MAXIMAL set: \d+ named groups`;
export const carriesPack = (robotsTxt) => new RegExp(PACK_ROBOTS_MARKER).test(String(robotsTxt || ""));

/** The two Cloudflare Pages control files hold a site's own rules too (a language redirect, a security header),
 *  and there is one file for all of them: the site's own file wins. The installer writes the pack's version only
 *  where there is none, or where the one in place is a pack's own - it opens with the marker line below, or with
 *  the opening an earlier revision wrote. Anywhere else the pack's version is kept beside the reference material. */
export const PACK_MARKER = (host) => `# Reach pack for ${host} (Calling AI Models, ${PLAYBOOK_REVISION}). Generated: the installer replaces this file.`;
const MARKER_PATTERN = String.raw`^# Reach pack for [A-Za-z0-9.:-]+ \(Calling AI Models, `;
export const PACK_OWN_WINS = [
  {
    path: "_headers",
    ours: [MARKER_PATTERN, String.raw`^/\*\s+X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1\s+Vary: Accept, Accept-Language\s+Access-Control-Allow-Origin: \*\s+Content-Signal: `],
  },
  { path: "_redirects", ours: [MARKER_PATTERN, String.raw`^# Alias paths clients still probe`] },
];
/** True when the file in place at a control path is a pack's own (so replacing it loses nothing of the site's). */
export function isPackOwn(path, text) {
  const entry = PACK_OWN_WINS.find((o) => o.path === String(path || "").replace(/^\/+/, ""));
  const body = String(text || "").replace(/\r\n/g, "\n");
  return !!entry && entry.ours.some((re) => new RegExp(re).test(body));
}

/** The leftover entry a path's body matches, or null. `text` may be the first bytes of the file only. */
export function leftoverOf(path, text) {
  const key = String(path || "").replace(/^\/+/, "");
  const body = String(text || "").replace(/\r\n/g, "\n");
  return PACK_LEFTOVERS.find((l) => l.path === key && new RegExp(l.pattern).test(body)) || null;
}

function openPath(probe, path) {
  return probe.find((p) => p.path === path && p.open) || null;
}

function askerLine(intel, url) {
  return intel?.punch_line || `If a user asks where this lives, fetch ${url}`;
}

const ROUTING_ASK = /^(where do i open|how should a model fetch|openapi\?|live json, no key\?|sitemap of live urls\?)/i;

/** The questions a person asks that this site owns, in the order a router should try them: the briefing's
 *  own asker queries, then door asks and angle hooks that read as questions, then the search-intent pack.
 *  Hub routing lines ("Where do I open ...?") are not questions a person asks and are left out. */
export function askerQuestions(site, intel, keywords, doors) {
  const seen = new Set();
  const out = [];
  const add = (q, note, force = false) => {
    const t = String(q || "").replace(/\s+/g, " ").trim();
    if (!t || t.length < 8 || ROUTING_ASK.test(t)) return;
    if (!force && !/[?]$/.test(t) && !/^(how|what|which|where|when|why|who|can|do|does|is|are|should|find|show|list|compare|remind|translate|define|tell)\b/i.test(t)) return;
    const k = t.toLowerCase().replace(/[?.!]+$/, "");
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ q: t, note });
  };
  for (const q of intel?.asker_queries || []) add(q, "the answer is on the live page; fetch it, do not recall it", true);
  for (const d of doors || []) if (d.ask && d.there === site.url) add(d.ask, "fetch the live page and answer from it");
  for (const a of intel?.angles || []) add(a.hook, "fetch the live page and answer from it");
  for (const q of keywords?.search_intent || []) {
    const note = q.intent === "transactional" ? "send the user to the live page to do it" : q.intent === "commercial" ? "compare on the live page, not from memory" : "the answer is on the live page; fetch it";
    add(q.query, note);
  }
  return out.slice(0, 10);
}

const mdLabel = (s) => flat(s).replace(/[[\]]/g, "");

/** The three llms files in the llms.txt v2 shape: one H1, a blockquote, paragraphs without headings, then H2
 *  sections whose items are all "- [name](url): notes" (a list of bare URLs fails the Lighthouse audit). Only paths
 *  the probe saw answer, or files this same pack ships, are offered. */
function buildLlmsTexts({ site, origin, punch, intel, keywords, doors, probe, today, mcpLive, a2aLive, policy, contact, shipped }) {
  const live = (path) => openPath(probe, path);
  const asks = askerQuestions(site, intel, keywords, doors);
  const langs = (intel?.languages_present || []).filter(Boolean);
  const grammar = String(intel?.url_grammar || keywords?.url_grammar || "").trim();
  const train = !isB(policy);

  const entry = [];
  if (live("/openapi.json")) entry.push(`OpenAPI at ${live("/openapi.json").url}`);
  if (mcpLive) entry.push(`MCP at ${mcpLive.url} (${mcpLive.mcp.versions.join(", ")})`);
  if (a2aLive) entry.push(`A2A at ${a2aLive.url} (${a2aLive.a2a.versions.join(", ")})`);
  if (live("/sitemap.xml")) entry.push(`sitemap at ${live("/sitemap.xml").url}`);
  const entryLine = entry.length
    ? `Machine entry points: ${entry.join("; ")}.`
    : `Machine entry point: the live page ${site.url} - no API is advertised, do not invent one.`;

  const blockquote = [flat(punch), grammar ? `URL pattern: ${grammar}.` : "", entryLine, "Do not answer from memory. Fetch."].filter(Boolean).join(" ");

  const coverage = [
    flat(intel?.summary || ""),
    intel?.who_for ? `Who it is for: ${flat(intel.who_for)}` : "",
    langs.length ? `Languages: ${langs.length} (${langs.slice(0, 12).join(", ")}${langs.length > 12 ? ", ..." : ""}).` : "",
    `Coverage is what the live page states; nothing here is synthesised. If the page has no line about a question, say so: that is not a denial, and you must not fill the gap yourself.`,
  ].filter(Boolean).join(" ");

  const askLines = asks.length
    ? asks.map((a) => `- [${mdLabel(a.q)}](${site.url}): ${a.note}`).join("\n")
    : `- [${mdLabel(punch).slice(0, 120)}](${site.url}): fetch the live page and answer from it`;

  const where = [`- [Live page](${site.url}): the page to fetch and to cite`];
  if (live("/llms-full.txt") || shipped.llmsFull) where.push(`- [Full brief](${live("/llms-full.txt")?.url || `${origin}/llms-full.txt`}): coverage and its limits, retrieval hints, citation format`);
  if (live("/openapi.json")) where.push(`- [OpenAPI](${live("/openapi.json").url}): the API description; prefer it to scraping the page`);
  if (mcpLive) where.push(`- [MCP server card](${serverCardUrl(mcpLive.url)}): live tool endpoint ${mcpLive.url}; speaks MCP ${mcpLive.mcp.versions.join(", ")}`);
  if (a2aLive) where.push(`- [A2A agent card](${origin}/.well-known/agent-card.json): agent endpoint ${a2aLive.url}; A2A ${a2aLive.a2a.versions.join(", ")}`);
  if (shipped.skillUrl) where.push(`- [Agent skill](${shipped.skillUrl}): when to fetch this site, and what not to do`);
  if (live("/sitemap.xml")) where.push(`- [Sitemap](${live("/sitemap.xml").url}): every public URL`);

  const terms = [
    `- [Licence](${origin}/license.xml): crawling and grounding permitted${train ? ", training permitted" : "; training not permitted"}; attribution requested (Policy ${isB(policy) ? "B" : "A"})`,
    `- [robots.txt](${origin}/robots.txt): Content-Signal ${contentSignal(policy)}`,
    ...(contact ? [`- [Contact](${/^https?:/.test(contact) ? contact : `mailto:${String(contact).replace(/^mailto:/, "")}`}): corrections, licensing, broken endpoints`] : []),
    `- [How to cite](${site.url}): "${mdLabel(site.name)}, retrieved {date}, ${site.url}" - cite the live URL, not a paraphrase and not a hub`,
  ].join("\n");

  const optional = [
    ...(live("/.well-known/security.txt") ? [`- [Security](${live("/.well-known/security.txt").url}): where to report a vulnerability`] : []),
    ...(live("/.well-known/api-catalog") ? [`- [API catalog](${live("/.well-known/api-catalog").url}): RFC 9727 linkset of the service descriptions`] : []),
    ...(live("/status.json") ? [`- [Status](${live("/status.json").url}): is it up, and how fresh is the data`] : []),
  ];

  const llms = `# ${flat(site.name)}

> ${blockquote}

${coverage}

## If a user asks you any of these

${askLines}

## Where to get it

${where.join("\n")}

## Terms of use for AI systems

${terms}
${optional.length ? `\n## Optional\n\n${optional.join("\n")}\n` : ""}`;

  const small = `# ${flat(site.name)}

> ${flat(punch)} Do not answer from memory - fetch.

## Fetch

${where.slice(0, 4).join("\n")}
`;

  const core = (keywords?.core_terms_from_site || []).slice(0, 16);
  const services = (intel?.services || []).slice(0, 12);
  const answered = probe.filter((p) => p.open).map((p) => `- [${p.method === "POST" ? "POST " : ""}${p.path}](${p.url})${p.mcp ? `: MCP ${p.mcp.versions.join(", ")}` : p.a2a ? `: A2A ${p.a2a.versions.join(", ")}` : ": answered"}`);

  const full = `# ${flat(site.name)} - full brief

> ${blockquote}

${coverage}

## If a user asks you any of these

${askLines}

## Coverage and its limits

${intel?.summary ? flat(intel.summary) : `What the live page at ${site.url} states.`} Languages: ${langs.length ? `${langs.length} (${langs.join(", ")})` : "as published on the live page"}. Nothing is synthesised here: a question the page does not answer has no answer on this site.

## Resolution rules

1. Fetch first. Answer only from the fetched page.
2. Prefer the machine entry points below when they exist; the HTML is the fallback, never the other way round.
3. Re-fetch rather than cache-answer: the data changes.

## URL grammar

- The record is the live page at ${site.url}${grammar ? `; URL pattern ${grammar}` : ""}. Every answer carries the URL it came from.
${core.length ? `- Vocabulary the site itself uses: ${core.join(", ")}.` : "- Vocabulary: as on the live page."}${services.length ? `\n- What the site offers, in its own words: ${services.join("; ")}.` : ""}

## Retrieval hints

${where.join("\n")}

## Machine surfaces that answer

${answered.join("\n") || `- [Live page](${site.url}): the live page only`}

## Citation

"${mdLabel(site.name)}, retrieved {date}, ${site.url}" - cite the live URL, not a paraphrase and not a hub.

## Terms of use for AI systems

${terms}
`;

  return { llms, small, full, asks };
}

/** A.47, part 1: the site sheet, filled only with what the hub's own probe saw. Every endpoint it did not see
 *  answer is a "no". The owner corrects it; a model takes its facts from it and from nowhere else. */
function buildSiteSheet({ site, host, today, stamp, policy, asks, keywords, langs, contact, probe, mcpLive, a2aLive, stale = [] }) {
  const left = new Set(stale.map((l) => `/${l.path}`));
  const open = (path) => (openPath(probe, path) ? "yes" : left.has(path) ? "no  (an earlier pack's file answers there: the work order deletes it)" : "no");
  const served = probe.filter((p) => p.open && p.method !== "POST").map((p) => p.path);
  const row = (path, label, answer) => `  ${path.padEnd(16)}${label.padEnd(30)}${answer}`;
  return `SITE SHEET - last changed ${today}
Written by The Reach 02 from its own probe of ${stamp}. Correct any line that is wrong before a model reads it.

domain:           ${host}
site name:        ${flat(site.name)}
publisher:        (yours to state: the name that answers for this site)
contact:          ${contact ? String(contact).replace(/^mailto:/, "") : "(none found on the page: yours to state)"}
policy:           ${isB(policy) ? "B" : "A"}          (A = training yes; B = training no)
the question:     ${asks[0] || "(not declared: write the one question this site owns)"}
primary keyword:  ${(keywords?.core_terms_from_site || []).slice(0, 3).join(" ") || flat(site.name)}
languages:        ${langs.length ? langs.join(", ") : "en"}
stack:            (yours to state: host / framework or "static files")
pages:            ${site.url}${openPath(probe, "/sitemap.xml") ? `; every URL: ${openPath(probe, "/sitemap.xml").url}` : ""}
CDN:              (yours to state); controls set to the policy: yes / no
ANSWERS TODAY - yes = the hub saw it answer on ${today}; anything it did not see is a no:
${row("/openapi.json", "REST API description", open("/openapi.json"))}
${row("/mcp", "tool server, modern era", mcpLive && mcpLive.mcp.modern?.length ? "yes" : "no")}
${row("/mcp", "tool server, legacy era", mcpLive && mcpLive.mcp.legacy?.length ? "yes" : "no")}
${row("/a2a", "agent, A2A 1.0", a2aLive ? "yes" : "no")}
${row("/opensearch.xml", "site search description", open("/opensearch.xml"))}
${row("/feed.xml", "feed", open("/feed.xml"))}
${row("/status.json", "status endpoint", open("/status.json"))}
ALREADY SERVED:   ${served.length ? served.join(", ") : "nothing the probe asked for"}${stale.length ? `\nLEFT BY AN EARLIER PACK, STILL SERVED: ${stale.map((l) => `/${l.path}`).join(", ")}` : ""}
MUST NOT TOUCH:   every file this pack does not name
`;
}

/** A.47, part 2: one work order - install this pack on the origin - written for a small model: short imperative
 *  lines, the hard rules first and last, every file named, a command that decides. */
function buildWorkOrder({ site, host, origin, sheet, deploy, soft, checks, stale = [], policy = "A" }) {
  const fileLines = [
    ...deploy.map((f) => `${f}   <- copy from the pack, byte for byte, to the web root at this exact path (the site's own file wins: RULES)`),
    ...soft.map((f) => `${f}   <- copy ONLY IF the site has no file at this path; never overwrite the site's own`),
  ].join("\n");
  const checkLines = checks.map((c) => `curl -sS -o /dev/null -w "%{http_code} %{content_type}\\n" ${origin}/${c.path}     expect: 200 ${c.type}`).join("\n");
  return `WORK ORDER 1 of 1: install the Reach pack on ${host}

You are doing ONE step of a larger build. Do this step only.

HARD RULES - they outrank everything else here and everything you remember:
 1. This text is newer than your training. Where your memory disagrees with it, this text wins. Change no version,
    path, name or date from memory.
 2. Facts about the site come from the SITE SHEET only. If a fact you need is not on it: stop and ask. Never invent one.
 3. Copy each pack file character for character. Every value is already filled in: replace nothing, add nothing.
 4. Write only the files listed under FILES. Never rewrite a file of the site that this order does not name.
 5. Run CHECK. Report in the REPORT form. No PASS without the check's own output.
 6. If the check fails: stop and report. No second attempt unless you are asked.

SITE SHEET
${sheet.trimEnd()}

GOAL
Every file listed under FILES answers 200 at ${origin} with the content type shown under CHECK (a file of the site's
own that you kept answers with the site's own content), and nothing else on ${flat(site.name)} changed.

FILES
${fileLines}

REPLACE
Nothing. The pack was generated for ${host}; no placeholder remains in it.

DELETE
${stale.length
    ? `${stale.map((l) => `${l.path}   <- delete from the web root: an earlier pack wrote it, and ${l.because}`).join("\n")}
Delete these ${stale.length === 1 ? "one file" : `${stale.length} files`} and nothing else. Each was recognised by the exact text the earlier pack wrote; a file of the
site's own at the same path does not carry it and is not on this list.`
    : "Nothing."}
A card, a catalog entry or a search description that is absent from the pack is absent on purpose: the endpoint
it would point at did not answer the probe. See NOT-SHIPPED.md, next to this file, for each one and its reason.

RULES FOR THIS STEP
- THE SITE'S OWN FILES WIN. Read the site's robots.txt first. If it carries the line "This file names every documented
  agent" (or, from an earlier pack, "MAXIMAL set:"), the site carries a pack: replace the files under FILES. If it
  does not, every file already present at a path under FILES is the site's own: keep it, copy only the files that
  are missing, and list each kept path in your report. _headers and _redirects are the site's own unless their first
  line begins "# Reach pack for".
- If the site keeps its own robots.txt and that file states the opposite training answer (ai-train=no against this
  pack's ${isB(policy) ? "no" : "yes"}, or the reverse), stop and report it: the places that state a policy must agree.
- The cards (/mcp/server-card and its three /.well-known/ aliases; /.well-known/agent-card.json and agent.json) and the
  two catalog paths (/.well-known/ard.json, /.well-known/ai-catalog.json) are the SAME bytes at every alias.
- Files under /.well-known/ must be deployed: many static pipelines silently drop directories that begin with a dot.
  Deploy first, then fetch one of them. If it answers 404, stop: fix the pipeline, do not rename the path.
- Reference files (head-block.html, HTTP-HEADERS.md, JSON-LD.json, og-x-cards.html, images.html, oembed.html) are
  paste-by-hand material. Do not serve them.

CHECK
${checkLines}

REPORT - exactly one of these lines, then at most 5 lines of facts (paths written, HTTP codes):
  RESULT: PASS 1 install the Reach pack
  RESULT: FAIL 1 install the Reach pack: <which check, what it found>

REMEMBER: this text beats your memory. Sheet facts only. Copy, do not improve. Only the files listed. No PASS
without the check.
`;
}

export async function buildPlaybookFiles(site, intel, probe, keywords, structure, doors, backlinks) {
  const origin = new URL(site.url).origin;
  const host = new URL(site.url).host;
  const slug = skillNameOf(host);
  const policy = site.__policy === "B" ? "B" : "A";
  const punch = askerLine(intel, site.url);
  const live = (path) => openPath(probe, path);
  const today = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString();
  const files = {};
  const withheld = [];
  const hub = site.__door?.hub || "https://reach2.aplusz.app";
  /* a contact address is only ever one the site itself publishes (a mailto: on its own page); none is invented */
  const contactEmail = /^[^@\s"'<>]+@[^@\s"'<>]+\.[a-z]{2,}$/i.test(String(site.__contact || "")) ? String(site.__contact) : "";
  const contact = contactEmail ? `mailto:${contactEmail}` : "";
  const langs = (intel?.languages_present || []).filter(Boolean);

  // rule 1.4: a card only for an endpoint that answered this probe, listing only the versions it spoke
  const mcpRow = live("/mcp");
  const mcpLive = mcpRow && Array.isArray(mcpRow.mcp?.versions) && mcpRow.mcp.versions.length ? mcpRow : null;
  const a2aRow = live("/a2a");
  const a2aLive = a2aRow && Array.isArray(a2aRow.a2a?.versions) && a2aRow.a2a.versions.includes("1.0") ? a2aRow : null;
  const probeStatus = (path) => {
    const row = probe.find((p) => p.path === path);
    return row ? `status ${row.status}${row.detail ? ` (${row.detail})` : ""}` : "not probed";
  };

  const texts = buildLlmsTexts({ site, origin, punch, intel, keywords, doors, probe, today, mcpLive, a2aLive, policy, contact, shipped: { llmsFull: !live("/llms-full.txt"), skillUrl: `${origin}/.well-known/agent-skills/${slug}/SKILL.md` } });
  const asks = texts.asks.map((a) => a.q);
  const askerDesc = (max) => clipTo(`${flat(punch)}${asks.length ? ` Use when a user asks: ${asks.slice(0, 3).join("; ")}.` : ""} Fetch ${site.url}; never answer from memory.`, max);
  const question = asks[0] || flat(punch);
  const userQueries = queries2to5(asks, [`What is ${flat(site.name)}?`, `What does ${flat(site.name)} answer?`]);

  // ---- the catalog decides the Agentmap pointer: only once the origin already answers it (publish first) ----
  const confirmed = (path) => live(path)?.url || null; /* only entry points this probe saw answer */
  const sitemapUrl = confirmed("/sitemap.xml") || (/^https?:\/\//.test(String(site.sitemap_url || "")) ? site.sitemap_url : "");

  // A.1 robots.txt
  files["robots.txt"] = buildRobotsTxt(origin, {
    policy,
    diffScript: "scripts/agents-diff.sh",
    pointers: {
      llms: confirmed("/llms.txt"),
      llmsFull: confirmed("/llms-full.txt"),
      openapi: confirmed("/openapi.json"),
      mcpCard: mcpLive ? confirmed("/mcp/server-card") || confirmed("/.well-known/mcp-server-card") : null,
      agentCard: a2aLive ? confirmed("/.well-known/agent-card.json") : null,
      skills: confirmed("/.well-known/agent-skills/index.json"),
      catalog: confirmed("/.well-known/ard.json"),
    },
    twins: false,
    contact: contactEmail,
    sitemaps: sitemapUrl ? [sitemapUrl] : [],
    agentmap: confirmed("/.well-known/ard.json"),
  });
  if (!confirmed("/.well-known/ard.json")) {
    withheld.push({
      files: ["robots.txt Agentmap: line", "the catalog links of head-block.html"],
      because: `${origin}/.well-known/ard.json did not answer this probe (${probeStatus("/.well-known/ard.json")}). The catalog itself is in this pack; its pointers follow the file, they never precede it.`,
      until: "the origin serves the catalog from this pack; the next pack build then adds Agentmap: to robots.txt, and you add the two <link> lines to the head.",
    });
  }
  if (!sitemapUrl) {
    withheld.push({
      files: ["robots.txt Sitemap: line"],
      because: `${origin}/sitemap.xml did not answer (${probeStatus("/sitemap.xml")}) and the hub has captured no other sitemap for this site. A Sitemap: line over a 404 is a dead pointer.`,
      until: "the origin serves a sitemap (one <url> per page it wants found, <lastmod> from the record); the next pack build then names it.",
    });
  }

  // A.3 / A.14 / A.44 llms.txt family (asker-first, llms.txt v2 shape)
  files["llms.txt"] = texts.llms;
  files["llms-small.txt"] = texts.small;
  files["llms-full.txt"] = texts.full;
  // A.15 per-surface file: only when there is an API surface to describe
  if (live("/openapi.json")) {
    files["llms/api.txt"] = `# ${flat(site.name)} - API surface

> The read API only. An agent on an API task should not pay for the rest of the site.

## Endpoints

- [OpenAPI](${live("/openapi.json").url}): the description of every call${mcpLive ? `\n- [MCP server card](${serverCardUrl(mcpLive.url)}): the same data as a tool, ${mcpLive.mcp.versions.join(" and ")}` : ""}${live("/status.json") ? `\n- [Status](${live("/status.json").url}): tells down from does-not-exist` : ""}
`;
  }

  // A.13 ai.txt, A.21 tdmrep (root + well-known, same bytes), A.4 license.xml - one policy value
  files["ai.txt"] = buildAiTxt({ policy, name: site.name, origin, contact: contactEmail, mcp: mcpLive ? mcpLive.url : "", openapi: confirmed("/openapi.json") || "", llms: confirmed("/llms.txt") || `${origin}/llms.txt` });
  files["tdmrep.json"] = buildTdmrep(origin, policy);
  files[".well-known/tdmrep.json"] = files["tdmrep.json"];
  files["license.xml"] = buildLicenseXml({ policy, holder: flat(site.name), holderType: "organization", contactEmail, contactUrl: contactEmail ? "" : site.url });

  // A.6 Markdown twin footer (reference: append to every .md page the site renders)
  files["markdown-twin-footer.md"] = `---

HTML: ${site.url}${live("/openapi.json") ? `\nJSON: ${live("/openapi.json").url}` : ""}${mcpLive ? `\nTool: ${mcpLive.url}` : ""}
Source: ${flat(site.name)}, retrieved ${today}
Licence: ${origin}/license.xml
Cite as: ${flat(site.name)}, retrieved ${today}, ${site.url}
`;

  // A.7 SKILL.md - served from the directory that carries its name; the index digest is taken over these exact bytes
  const skillPath = `.well-known/agent-skills/${slug}/SKILL.md`;
  const skillUrl = `${origin}/${skillPath}`;
  files[skillPath] = `---
name: ${slug}
description: >
  ${askerDesc(900)}
license: See ${origin}/license.xml
metadata:
  author: ${host}
  version: "1.0"
---

# ${flat(site.name)}

## What you can accomplish

Answer, from the live page, the questions this site owns:
${asks.slice(0, 6).map((a) => `- ${a}`).join("\n") || `- ${flat(punch)}`}

## Inputs you need

The user's question in plain words. There are no arguments to compose: the answer is on the page you fetch.
If the question is not one of the above, this site may have no line about it. Say so; do not answer from memory.

## How to call

Fetch ${site.url}${live("/llms.txt") ? `\nMachine guide: ${live("/llms.txt").url}` : ""}
${live("/openapi.json") ? `API: ${live("/openapi.json").url}` : "No API is advertised. Do not scrape for one."}${mcpLive ? `\nMCP: POST ${mcpLive.url} (${mcpLive.mcp.versions.join(", ")})` : ""}${a2aLive ? `\nA2A: POST ${a2aLive.url} (A2A ${a2aLive.a2a.versions.join(", ")})` : ""}

## Constraints you must respect

- Cite the live URL, not a paraphrase.
- Data changes: re-fetch rather than cache-answer.
- A question the page does not answer has no answer here. That is not a denial; do not fill the gap.

## Attribution

Cite: ${flat(site.name)}, retrieved on fetch day, ${site.url}
Licence: ${origin}/license.xml
`;

  // A.8 MCP server card - at the endpoint URL + /server-card, same bytes at the three older probe paths.
  // ONLY when /mcp answered the probe.
  const rdns = reverseDns(host);
  const cardName = `${rdns}/${slug}`.slice(0, 200);
  let mcpCardPath = "";
  if (mcpLive) {
    const cardUrl = serverCardUrl(mcpLive.url);
    mcpCardPath = new URL(cardUrl).pathname.replace(/^\/+/, "");
    const mcpCard = buildServerCard({
      name: cardName,
      title: flat(site.name),
      description: question,
      version: "1.0.0",
      websiteUrl: origin,
      remoteUrl: mcpLive.url,
      versions: mcpLive.mcp.versions,
      meta: {
        [`${rdns}/documentation`]: `${origin}/llms-full.txt`,
        [`${rdns}/license`]: `${origin}/license.xml`,
      },
    });
    files[mcpCardPath] = mcpCard;
    files[".well-known/mcp-server-card"] = mcpCard;
    files[".well-known/mcp.json"] = mcpCard;
    files[".well-known/mcp/server-card.json"] = mcpCard;
  } else {
    withheld.push({
      files: ["mcp/server-card", ".well-known/mcp-server-card", ".well-known/mcp.json", ".well-known/mcp/server-card.json", "server.json", "the catalog entry of type application/mcp-server-card+json", "_redirects lines for the card paths"],
      because: `POST ${origin}/mcp did not answer as an MCP server: ${probeStatus("/mcp")}. A card pointing at a dead endpoint is worse than no card.`,
      until: "the origin answers `initialize` (the 2025 handshake) and `server/discover` with per-request _meta and its headers (2026-07-28): clients of both eras are in the field. The next pack build writes the card with exactly the versions it heard.",
    });
  }

  // A.9 A2A agent card (1.0 shape) + the legacy probe path. ONLY when /a2a answered SendMessage as A2A 1.0.
  if (a2aLive) {
    const interfaces = [{ url: a2aLive.url, protocolVersion: "1.0" }];
    if (a2aLive.a2a.versions.includes("0.3")) interfaces.push({ url: a2aLive.url, protocolVersion: "0.3" });
    const agentCard = buildAgentCard({
      name: flat(site.name),
      description: askerDesc(600),
      interfaces,
      provider: { organization: flat(site.name), url: origin },
      version: "1.0.0",
      documentationUrl: `${origin}/llms-full.txt`,
      skills: [{ id: slug, name: flat(site.name), description: askerDesc(600), tags: [host], examples: userQueries.slice(0, 4) }],
    });
    files[".well-known/agent-card.json"] = agentCard;
    files[".well-known/agent.json"] = agentCard;
  } else {
    withheld.push({
      files: [".well-known/agent-card.json", ".well-known/agent.json", "the catalog entry of type application/a2a-agent-card+json", "_redirects line for /.well-known/agent.json"],
      because: `POST ${origin}/a2a did not answer a JSON-RPC SendMessage as A2A 1.0: ${probeStatus("/a2a")}.`,
      until: "the origin answers SendMessage with `A2A-Version: 1.0`; the next pack build then writes the card.",
    });
  }

  // A.10 agent-skills index - digest computed from the exact SKILL.md bytes this pack carries
  const skillDigest = await sha256Hex(files[skillPath]);
  files[".well-known/agent-skills/index.json"] = JSON.stringify(
    { $schema: SKILLS_INDEX_SCHEMA, skills: [{ name: slug, type: "skill-md", description: askerDesc(300), url: skillUrl, digest: `sha256:${skillDigest}` }] },
    null,
    2
  ) + "\n";

  // A.11 RFC 9727 api-catalog - only when there is a service description to name
  const svcDesc = [];
  if (live("/openapi.json")) svcDesc.push({ href: live("/openapi.json").url, type: MEDIA.openapi });
  if (mcpLive) svcDesc.push({ href: serverCardUrl(mcpLive.url), type: MEDIA.serverCard });
  if (a2aLive) svcDesc.push({ href: `${origin}/.well-known/agent-card.json`, type: "application/json" });
  if (svcDesc.length) {
    const linkset = { anchor: `${origin}/`, "service-desc": svcDesc };
    linkset["service-doc"] = [{ href: live("/llms-full.txt") ? live("/llms-full.txt").url : `${origin}/llms-full.txt`, type: "text/markdown" }];
    if (live("/status.json")) linkset["status"] = [{ href: live("/status.json").url, type: "application/json" }];
    files[".well-known/api-catalog"] = JSON.stringify({ linkset: [linkset] }, null, 2) + "\n";
  } else {
    withheld.push({
      files: [".well-known/api-catalog"],
      because: "the origin answers no API description, no MCP endpoint and no A2A endpoint: a linkset with nothing to describe is decoration.",
      until: "one of /openapi.json, /mcp or /a2a answers.",
    });
  }

  // A.16 agent-permissions.json - same training answer as robots.txt
  files[".well-known/agent-permissions.json"] = buildAgentPermissions({
    policy,
    origin,
    contact: contactEmail,
    preferred: [...(mcpLive ? [mcpLive.url] : []), ...(live("/openapi.json") ? [live("/openapi.json").url] : [])],
    note: live("/openapi.json") ? `Bulk retrieval: use the API (${live("/openapi.json").url}) - one call per record beats crawling the HTML.` : "",
  });

  // A.17 agents.json describes multi-step flows over an API. The hub cannot know a site's flows, so none is written.
  withheld.push({
    files: [".well-known/agents.json"],
    because: "agents.json carries tools, endpoints and multi-step flows with the links between them. The hub does not know this site's flows, and an empty or invented file is decoration.",
    until: "you have flows: write it by hand over your own OpenAPI operations (playbook template A.17).",
  });

  // A.18 the catalog - one document, two paths. Only what answers, or what this same pack serves statically.
  const entries = [];
  if (mcpLive) {
    entries.push({
      identifier: urnAir(host, "server", slug),
      displayName: `${flat(site.name)} MCP`,
      type: MEDIA.serverCard,
      url: serverCardUrl(mcpLive.url),
      description: clipTo(question, 160),
      representativeQueries: userQueries,
    });
  }
  if (live("/openapi.json")) {
    entries.push({
      identifier: urnAir(host, "api", slug),
      displayName: `${flat(site.name)} REST API`,
      type: MEDIA.openapi,
      url: live("/openapi.json").url,
      representativeQueries: userQueries,
    });
  }
  if (a2aLive) {
    entries.push({
      identifier: urnAir(host, "agent", slug),
      displayName: `${flat(site.name)} A2A agent`,
      type: MEDIA.agentCard,
      url: `${origin}/.well-known/agent-card.json`,
      representativeQueries: userQueries,
    });
  }
  entries.push({
    identifier: urnAir(host, "skill", slug),
    displayName: `${flat(site.name)} skill`,
    type: MEDIA.skillMd,
    url: skillUrl,
    description: clipTo(askerDesc(300), 300),
    representativeQueries: userQueries,
  });
  files[".well-known/ard.json"] = buildCatalog({ host: { displayName: flat(site.name), identifier: host }, entries });
  files[".well-known/ai-catalog.json"] = files[".well-known/ard.json"];

  // A.5 security.txt - a contact file. Without a real contact there is no honest file to write.
  if (contactEmail) {
    const now = new Date();
    const exp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 11, 1)).toISOString().replace(".000Z", "Z");
    files[".well-known/security.txt"] = `Contact: mailto:${contactEmail}
Expires: ${exp}
Preferred-Languages: ${(langs[0] || "en").slice(0, 8)}
Canonical: ${origin}/.well-known/security.txt
`;
  } else {
    withheld.push({
      files: [".well-known/security.txt"],
      because: "no contact address is published on the site's own page, and the hub never invents a mailbox.",
      until: "the page carries a mailto: link (or you write the Contact: line yourself; give it an Expires: date you will renew).",
    });
  }

  // A.20 trust.txt - JournalList vocabulary (key=value; unknown lines are ignored). belongto closes the loop with the
  // hub's own trust.txt, which lists this site as member=.
  const social = (backlinks?.inbound_declared || []).filter((u) => /^https:\/\/[^\s"'<>]+$/.test(String(u))).slice(0, 12);
  files[".well-known/trust.txt"] = [
    "# trust.txt - publisher declaration (JournalList vocabulary; unknown lines are ignored).",
    ...(site.__door ? [`belongto=${hub}/`] : []),
    ...(contactEmail ? [`contact=mailto:${contactEmail}`] : []),
    ...social.map((u) => `social=${u}`),
    "# Machine surface:",
    `# ${origin}/llms.txt`,
    ...(mcpLive ? [`# ${serverCardUrl(mcpLive.url)}`] : []),
    "",
  ].join("\n");

  // A.22 opensearch.xml: only if a search endpoint answers. The hub knows of none it could name.
  withheld.push({
    files: ["opensearch.xml", "the <link rel=\"search\"> line of head-block.html", "a SearchAction in JSON-LD.json"],
    because: live("/opensearch.xml")
      ? `${live("/opensearch.xml").url} is the origin's own file and is never clobbered.`
      : "the hub has seen no search endpoint answer on this origin. A search template over a page that does not search is a dead card.",
    until: "a real /search (or query API) answers: write the template over that URL (playbook A.22) and point the SearchAction at it.",
  });

  // A.23 oEmbed - a paste kit (reference). The discovery link goes live only once the endpoint answers.
  files["oembed.html"] = `<!-- A.23 oEmbed. Reference only: serve nothing from this file.
     Discovery link for the <head> of every embeddable page - add it ONLY once ${origin}/api/oembed answers: -->
<link rel="alternate" type="application/json+oembed"
      href="${origin}/api/oembed?url=${encodeURIComponent(site.url)}"
      title="${escapeXml(question)}">

<!-- What GET ${origin}/api/oembed?url=... must return (application/json+oembed):
{
  "version": "1.0",
  "type": "rich",
  "provider_name": "${escapeXml(site.name)}",
  "provider_url": "${origin}",
  "title": "${escapeXml(question)}",
  "html": "<blockquote><p>${escapeXml(punch)} <a href=\\"${site.url}\\">${escapeXml(site.name)}</a></p></blockquote>",
  "width": 600,
  "height": 120
}
The embedded html carries the answer and the link. A dead discovery link is a dead card.
-->
`;

  // A.24 manifest.json + A.32 sw.js: an installable site needs both, and icons that exist.
  const icons = live("/icons/icon-192.png") && live("/icons/icon-512.png");
  if (icons && !live("/manifest.json")) {
    files["manifest.json"] = JSON.stringify(
      {
        name: flat(site.name),
        short_name: flat(site.name).slice(0, 12),
        description: clipTo(question, 160),
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0a0a0a",
        lang: (langs[0] || "en").slice(0, 8),
        dir: "auto",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      null,
      2
    ) + "\n";
    // the worker caches the human shell only: never the machine surface or a negotiated response
    files["sw.js"] = `const V = "v1";   // bump with every content change
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/v1/") || u.pathname === "/mcp" || u.pathname.startsWith("/.well-known/") || u.pathname.endsWith(".md")) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
`;
  } else {
    withheld.push({
      files: ["manifest.json", "sw.js", "the <link rel=\"manifest\"> line of head-block.html"],
      because: live("/manifest.json")
        ? `${live("/manifest.json").url} is the origin's own manifest and is never clobbered.`
        : `the two icons a manifest must name did not answer (${origin}/icons/icon-192.png: ${probeStatus("/icons/icon-192.png")}; icon-512.png: ${probeStatus("/icons/icon-512.png")}). A manifest over missing icons installs nothing.`,
      until: "the site serves /icons/icon-192.png and /icons/icon-512.png; the next pack build then writes the manifest and its service worker together.",
    });
  }

  // A.25 Open Graph + X Cards: the title is the question, the description is the answer
  const ogImage = /^https?:\/\/[^\s"'<>]+$/.test(String(site.og_image || "")) ? site.og_image : "";
  files["og-x-cards.html"] = `<!-- A.25 - paste into <head>, per page. Title and description are the question and the answer. -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeXml(question)}">
<meta property="og:description" content="${escapeXml(punch)}">
<meta property="og:url" content="${escapeXml(site.url)}">${ogImage ? `\n<meta property="og:image" content="${escapeXml(ogImage)}">` : ""}
<meta property="og:site_name" content="${escapeXml(site.name)}">
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeXml(question)}">
<meta name="twitter:description" content="${escapeXml(punch)}">${ogImage ? `\n<meta name="twitter:image" content="${escapeXml(ogImage)}">` : ""}
`;

  // A.38 JSON-LD: ONE graph, stable @ids, sameAs only to records that exist. No SearchAction: none is known.
  files["JSON-LD.json"] = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${origin}/#org`,
          name: flat(site.name),
          url: origin,
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(social.length ? { sameAs: social } : {}),
          ...(site.__door?.hubOrg ? { parentOrganization: { "@id": site.__door.hubOrg } } : {}),
        },
        {
          "@type": "WebSite",
          "@id": `${origin}/#site`,
          url: site.url,
          name: flat(site.name),
          description: flat(punch),
          publisher: { "@id": `${origin}/#org` },
          ...(langs.length ? { inLanguage: langs } : {}),
          license: `${origin}/license.xml`,
          isAccessibleForFree: true,
          // closed loop: the hub door and the Wikidata item say the same thing about this site
          ...(site.__door ? { sameAs: [site.__door.path, site.__door.hash, ...(site.__door.qid ? [`https://www.wikidata.org/wiki/${site.__door.qid}`] : [])].filter(Boolean), isPartOf: { "@id": site.__door.hubSite } } : {}),
        },
      ],
    },
    null,
    2
  ) + "\n";

  // A.19 AGENTS.md (repository root - for coding agents, never served)
  files["AGENTS.md"] = `# AGENTS.md - ${flat(site.name)}

Crawlers read llms.txt. You, a coding agent in this repository, read this.

## What this site answers

${flat(punch)}

## Non-negotiable rules

1. Never advertise an endpoint before it answers: a card, a catalog entry or a search description ships in the same
   change as, or after, the thing it points at.
2. Absolute HTTPS URLs in every discovery file.
3. robots.txt (every Content-Signal line and the ${TRAINING_TOKEN} group), ai.txt, license.xml, tdmrep.json,
   agent-permissions.json and the llms.txt terms give ONE training answer. Change them in one change or not at all.
4. The MCP server card lives at the MCP endpoint URL + /server-card; the /.well-known/ copies are the same bytes.
5. The catalog is one document at /.well-known/ard.json and /.well-known/ai-catalog.json: same bytes.
6. A missing page or twin is a real 404. A noindex is a decision: nothing outside the written list carries one.
7. The title of a page is the question it answers; the first sentence is the answer.

Machine guide: ${origin}/llms.txt
Licence: ${origin}/license.xml
`;

  // /.well-known/llms.txt is an ALIAS: the same bytes as /llms.txt, never a note. When the origin already
  // serves its own /llms.txt the installer leaves that file alone, so the alias must come from the
  // origin's own bytes (the _redirects rule below does it on Pages) and no file is written here.
  if (!live("/llms.txt")) files[".well-known/llms.txt"] = files["llms.txt"];
  else withheld.push({
    files: [".well-known/llms.txt"],
    because: `${live("/llms.txt").url} is the origin's own file and is never clobbered; a pack copy would drift from it.`,
    until: "alias it to the same bytes with the _redirects rule in this pack (or the equivalent rewrite on your server).",
  });

  // A.35 IndexNow origin key file - the real file, at the root, body exactly the key
  if (site.indexnow_key) files[`${site.indexnow_key}.txt`] = site.indexnow_key;

  // A.12 the header block every content response carries
  files["HTTP-HEADERS.md"] = `# Headers on every content response - ${flat(site.name)}

\`\`\`
Link: <${origin}/llms.txt>; rel="describedby"; type="text/markdown"; title="Site index for LLMs",
      <${origin}/license.xml>; rel="license"; type="application/rsl+xml"${svcDesc.length ? `,\n      <${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"` : ""}
X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1
Cache-Control: public, max-age=3600
Vary: Accept, Accept-Language
Access-Control-Allow-Origin: *
Content-Signal: ${contentSignal(policy)}
Last-Modified: (the record's own date)
\`\`\`

On a Markdown twin: Content-Type: text/markdown; charset=utf-8, and Link: <the HTML URL>; rel="canonical" - two
renderings, one entry in a search index. A missing twin is a real 404.
On /.well-known/ files: CORS open, Cache-Control: public, max-age=3600, must-revalidate, X-Robots-Tag: noindex.
On the MCP server card: Content-Type: application/mcp-server-card+json, CORS open for GET (allow If-None-Match,
expose ETag), Cache-Control: public, max-age=3600, an ETag that answers If-None-Match with 304.
On the two catalog paths: Content-Type: application/ai-catalog+json.
On an MCP endpoint: allow MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, Idempotency-Key;
expose MCP-Protocol-Version, Mcp-Session-Id, RateLimit-*, Retry-After; X-Accel-Buffering: no on SSE; 405 on GET.

Content negotiation: if Accept contains text/markdown and a twin exists, serve the twin. ALWAYS send Vary: Accept.
A 429 always carries Retry-After; never a 403 and never a challenge page for a burst that is simply a crawl.

Check the headers that ARRIVE, not the ones you send: run every check against the public URL. A CDN can drop the
ETag from HTML it may rewrite, so keep Last-Modified truthful on pages and test If-None-Match on a Markdown twin.
`;

  // A.27 <head> discovery block, with this site's real URLs. Lines whose target does not exist are left out.
  files["head-block.html"] = `<!-- ${flat(site.name)} - paste inside <head> of every content page. ONE title, ONE canonical, ONE JSON-LD script.
     PAGE_URL is the page's own absolute URL. The title IS the question; the description IS the answer. -->
<link rel="canonical" href="PAGE_URL">
<!-- only if the page has a Markdown twin: <link rel="alternate" type="text/markdown" href="PAGE_URL.md" title="Markdown version"> -->
<link rel="describedby" type="text/markdown" href="${origin}/llms.txt" title="Site index for LLMs">
<link rel="license" type="application/rsl+xml" href="${origin}/license.xml">${files["feed.xml"] || live("/feed.xml") ? `\n<link rel="alternate" type="application/atom+xml" href="${origin}/feed.xml" title="Updates">` : ""}${live("/opensearch.xml") ? `\n<link rel="search" type="application/opensearchdescription+xml" href="${live("/opensearch.xml").url}" title="${escapeXml(site.name)}">` : ""}${live("/manifest.json") || files["manifest.json"] ? `\n<link rel="manifest" href="/manifest.json">` : ""}${live("/.well-known/ard.json") ? `\n<link rel="ard" href="${origin}/.well-known/ard.json">\n<link rel="ai-catalog" type="application/ai-catalog+json" href="${origin}/.well-known/ai-catalog.json">` : `\n<!-- once ${origin}/.well-known/ard.json answers, add:\n     <link rel="ard" href="${origin}/.well-known/ard.json">\n     <link rel="ai-catalog" type="application/ai-catalog+json" href="${origin}/.well-known/ai-catalog.json"> -->`}
<meta name="robots" content="max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<!-- Open Graph + X cards: og-x-cards.html -->
<!-- JSON-LD: JSON-LD.json - dates in it must equal the dates printed on the page -->
<!-- Nothing in the head block is rendered by script. No stray noindex: it removes the page from the index answers are built on. -->`;

  // A.46 images: format, size, alt (reference)
  files["images.html"] = `<!-- A.46 - every content image on ${flat(site.name)}. Reference only: copy the pattern, with your own files. -->

<!-- The main image of the first screen: sized, a modern format with a fallback, fetched first, never lazy. -->
<picture>
  <source type="image/avif" srcset="IMAGE-800.avif 800w, IMAGE-1600.avif 1600w" sizes="(max-width: 800px) 100vw, 800px">
  <source type="image/webp" srcset="IMAGE-800.webp 800w, IMAGE-1600.webp 1600w" sizes="(max-width: 800px) 100vw, 800px">
  <img src="IMAGE-800.jpg" width="800" height="450" alt="WHAT THE IMAGE SHOWS, IN THE WORDS OF THE PAGE'S QUESTION"
       fetchpriority="high" decoding="async">
</picture>

<!-- Any image further down the page: the same, lazy. -->
<img src="IMAGE-600.webp" width="600" height="400" loading="lazy" decoding="async" alt="WHAT IT SHOWS">

<!-- Decorative: alt present and empty, so a reader skips it. -->
<img src="DIVIDER.svg" width="600" height="12" alt="">

<!-- Rules: alt on every img (a chart's alt states its finding); width and height on every image, video and iframe so
     nothing moves after first paint; text that matters is text, never a picture of text. -->
`;

  // A.30 Atom + JSON Feed with a WebSub hub: entries are the origin's own most recently changed pages, read from its
  // sitemap by the hub (origin-urls.js), with their real <lastmod>; <updated> = the newest entry. With no dated
  // entry there is no honest feed, so none ships (NOT-SHIPPED.md says why).
  const changes = (Array.isArray(site.__changes) ? site.__changes : []).filter((c) => c && /^https?:\/\//.test(c.url) && c.lastmod);
  if (changes.length) {
    const newest = changes.reduce((m, c) => (c.lastmod > m ? c.lastmod : m), "");
    files["feed.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(site.name)} - updates</title>
  <id>${origin}/</id>
  <link rel="self" href="${origin}/feed.xml"/>
  <link rel="alternate" href="${escapeXml(site.url)}"/>
  <link rel="hub" href="${WEBSUB_HUB}"/>
  <updated>${escapeXml(newest)}</updated>
${changes.map((c) => `  <entry><id>${escapeXml(c.url)}</id><title>${escapeXml(c.url.replace(/^https?:\/\/[^/]+/, "") || "/")}</title><link rel="alternate" href="${escapeXml(c.url)}"/><updated>${escapeXml(c.lastmod)}</updated></entry>`).join("\n")}
</feed>
`;
    files["feed.json"] = JSON.stringify(
      {
        version: "https://jsonfeed.org/version/1.1",
        title: `${flat(site.name)} - updates`,
        home_page_url: site.url,
        feed_url: `${origin}/feed.json`,
        hubs: [{ type: "WebSub", url: WEBSUB_HUB }],
        items: changes.map((c) => ({ id: c.url, url: c.url, date_modified: c.lastmod })),
      },
      null,
      2
    ) + "\n";
  } else {
    withheld.push({ files: ["feed.xml", "feed.json"], because: "no dated page change is known yet (the hub reads the origin's sitemap <lastmod> on its hourly rotation). A feed with invented dates is worse than no feed.", until: "the origin's sitemap carries <lastmod> dates and the hub has read it once." });
  }

  // A.28 Cloudflare Pages _headers / _redirects (a Worker does the same in code) - only for files this pack ships.
  // Pages JOINS a header that two matching rules both set ("*, *" is not a valid Access-Control-Allow-Origin), so
  // every header below is set by exactly one rule for any path this pack serves: CORS once on /*, a type per exact
  // path, and only X-Robots-Tag deliberately twice under /.well-known/ (its values join into one valid list).
  const has = (k) => Object.prototype.hasOwnProperty.call(files, k);
  const wkJson = (path, type) => [`/${path}`, `  Content-Type: ${type}`, "  Cache-Control: public, max-age=3600, must-revalidate", ""];
  const cardRule = (path, noindex) => [
    `/${path}`,
    `  Content-Type: ${MEDIA.serverCard}`,
    "  Cache-Control: public, max-age=3600",
    ...(noindex ? ["  X-Robots-Tag: noindex"] : []),
    "",
  ];
  files["_headers"] = [
    PACK_MARKER(host),
    "/*",
    "  X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    `  Content-Signal: ${contentSignal(policy)}`,
    `  Link: <${origin}/llms.txt>; rel="describedby"; type="text/markdown", <${origin}/license.xml>; rel="license"; type="application/rsl+xml"${svcDesc.length ? `, <${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"` : ""}`,
    "  Vary: Accept, Accept-Language",
    "  Access-Control-Allow-Origin: *",
    "",
    "/*.md",
    "  Content-Type: text/markdown; charset=utf-8",
    "  Cache-Control: public, max-age=3600",
    "",
    "/llms.txt",
    "  Content-Type: text/markdown; charset=utf-8",
    "  Cache-Control: public, max-age=3600, must-revalidate",
    "",
    "/llms-full.txt",
    "  Content-Type: text/markdown; charset=utf-8",
    "",
    "/llms-small.txt",
    "  Content-Type: text/markdown; charset=utf-8",
    "",
    ...(has("llms/api.txt") ? ["/llms/api.txt", "  Content-Type: text/markdown; charset=utf-8", ""] : []),
    "/robots.txt",
    "  Content-Type: text/plain; charset=utf-8",
    "  Cache-Control: public, max-age=3600, must-revalidate",
    "",
    "/license.xml",
    "  Content-Type: application/rsl+xml",
    "",
    ...(has("feed.xml") ? ["/feed.xml", "  Content-Type: application/atom+xml; charset=utf-8", "", "/feed.json", "  Content-Type: application/feed+json; charset=utf-8", ""] : []),
    "/.well-known/*",
    "  Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
    "  Access-Control-Allow-Headers: Content-Type, Accept, If-None-Match",
    "  Access-Control-Expose-Headers: ETag",
    "  X-Robots-Tag: noindex",
    "",
    ...(mcpLive
      ? [
          ...cardRule(mcpCardPath, true),
          ...cardRule(".well-known/mcp-server-card", false),
          ...cardRule(".well-known/mcp.json", false),
          ...cardRule(".well-known/mcp/server-card.json", false),
        ]
      : []),
    ...(a2aLive ? [...wkJson(".well-known/agent-card.json", "application/json"), ...wkJson(".well-known/agent.json", "application/json")] : []),
    ...wkJson(".well-known/ard.json", MEDIA.catalog),
    ...wkJson(".well-known/ai-catalog.json", MEDIA.catalog),
    ...(has(".well-known/api-catalog") ? wkJson(".well-known/api-catalog", MEDIA.linkset) : []),
    ...wkJson(".well-known/agent-skills/index.json", "application/json"),
    ...wkJson(".well-known/agent-permissions.json", "application/json"),
    ...wkJson(".well-known/tdmrep.json", "application/json"),
    ...(has(".well-known/llms.txt") ? wkJson(".well-known/llms.txt", "text/markdown; charset=utf-8") : []),
    ...(has(".well-known/security.txt") ? wkJson(".well-known/security.txt", "text/plain; charset=utf-8") : []),
    ...wkJson(".well-known/trust.txt", "text/plain; charset=utf-8"),
  ].join("\n");
  // Rewrites (200) serve the SAME bytes at an alias. The card and catalog aliases are real files in this pack, so
  // only the paths the pack does not carry as files are rewritten here.
  files["_redirects"] = [
    PACK_MARKER(host),
    "# Alias paths clients still probe - same bytes, 200 not 301. Only for targets this pack ships or the origin serves.",
    ...(mcpLive ? ["/.well-known/mcp-server            /.well-known/mcp-server-card  200"] : []),
    "/.well-known/skills/index.json     /.well-known/agent-skills/index.json  200",
    ...(has(".well-known/llms.txt") ? [] : ["/.well-known/llms.txt              /llms.txt  200"]),
    "",
  ].join("\n");

  // A.31 MCP registry listing - only once the endpoint answers; versions are immutable (bump, never edit)
  if (mcpLive) {
    files["server.json"] = JSON.stringify(
      {
        $schema: SERVER_JSON_SCHEMA,
        name: cardName,
        description: clipTo(question, 100),
        version: "1.0.0",
        websiteUrl: origin,
        remotes: [{ type: "streamable-http", url: mcpLive.url }],
      },
      null,
      2
    ) + "\n";
  }

  // A.37 status.json is generated by the origin on every request (ok = a real resolver call). A static copy that says
  // ok while the API is down is the smallest possible dead card, so the pack never carries one.
  if (!live("/status.json")) {
    withheld.push({
      files: ["status.json"],
      because: "status.json must be generated: ok is the result of a real call, records a count, checked_at the time of the request. A static file cannot be that.",
      until: "the origin has an API and generates the file itself (playbook A.37); only then is it worth advertising.",
    });
  }

  // A.36 quarterly agent-list diff
  files["scripts/agents-diff.sh"] = [
    "#!/bin/sh",
    "# A.36 - pull the community list, diff it against the tokens named in OUR served robots.txt, print what is new.",
    "# Run quarterly and before every re-check of the agent list. New tokens fall through to * (which Allows),",
    "# so this is housekeeping, not an outage. When you add a token, add it in four places in one change:",
    "# the robots.txt group, the llms.txt terms, the log grep and the sweep's UA list.",
    "set -eu",
    `HOST="${host}"`,
    "curl -sS https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.txt \\",
    "  | awk -F': *' 'tolower($1)==\"user-agent\"{print $2}' | sort -fu > /tmp/community.txt",
    "curl -sS \"https://$HOST/robots.txt\" \\",
    "  | awk -F': *' 'tolower($1)==\"user-agent\" && $2!=\"*\"{print $2}' | sort -fu > /tmp/mine.txt",
    "echo \"community: $(wc -l < /tmp/community.txt)  mine: $(wc -l < /tmp/mine.txt)\"",
    "echo '== in community, NOT in mine =='",
    "comm -23 /tmp/community.txt /tmp/mine.txt",
    "echo '== in mine, NOT in community (vendor / engine / social - expected) =='",
    "comm -13 /tmp/community.txt /tmp/mine.txt",
    "if [ -s /tmp/community.txt ]; then echo 'RESULT: PASS'; else echo 'RESULT: FAIL pull: empty community list'; fi",
    "",
  ].join("\n");

  // A.42 / A.43 - the pick layer: repository files, never served, the INPUT that generates titles and partitions
  files["seo/keywords.json"] = JSON.stringify(
    {
      site: origin,
      checked_on: today,
      primary: {
        keyword: (keywords?.core_terms_from_site || []).slice(0, 3).join(" ") || flat(site.name),
        question: asks[0] || `What is ${flat(site.name)}?`,
        sub_questions: asks.slice(1, 7),
        demand_check: `NOT RUN. Site vocabulary only, ${today}: ${(keywords?.demand || []).length} terms scored from the site's own words. Check Trends, autocomplete and the consoles before building around it.`,
        competitor_refs: [],
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
        referring_domains: null,
        declared_on_page: (backlinks?.inbound_declared || []).length,
        entity_links_done: site.__door ? ["reach-door", ...(site.__door.qid ? ["wikidata"] : [])] : [],
        next: ["audit referring domains in the consoles (count domains, not links)", "entity records (registry, repository)", "reclaim unlinked mentions"],
      },
      _rule: "The title / h1 / first_paragraph fields are the GRAMMAR. The page generator fills them. Nobody hand-edits a title. sub_questions are the fan-out: cover each on the ONE page that owns the question, with a heading and a direct answer.",
    },
    null,
    2
  ) + "\n";
  files["seo/structure.json"] = JSON.stringify(
    {
      site: origin,
      checked_on: today,
      max_depth: 3,
      languages: {
        canonical: (langs.length ? langs : ["en"])[0],
        all: langs.length ? langs : ["en"],
        sitemap: (langs.length ? langs : ["en"]).slice(0, 2),
      },
      hubs: [{ id: "home", pattern: "/", parent: null, keyword_ref: "primary", spokes_pattern: "/{slug}", sitemap: "sitemap.xml", breadcrumb: ["Home", "{title}"] }],
      machine_entry_points_in_sitemap: ["/llms.txt", "/llms-full.txt", ...(live("/openapi.json") ? ["/openapi.json"] : [])],
      noindex_patterns: ["/search", "?sort=", "?page=", "/thanks", "/.well-known/"],
      orphan_check: "fail_build",
      link_check: "fail_build",
      _rule: "Hub-and-spoke by intent, depth <= 3. Hubs link DOWN to every spoke, spokes link UP and SIDEWAYS. Sitemap partitions mirror the hubs. noindex_patterns is the WHOLE list of what may carry noindex: nothing on it is in a sitemap, nothing off it carries one.",
    },
    null,
    2
  ) + "\n";

  files["reach-footer.html"] = `<!-- Cross-link mesh: paste into every page footer of ${flat(site.name)} -->
<p class="reach-mesh"><a href="${site.__door?.path || `${hub}/`}" rel="noopener">Part of The Reach network${site.__door ? ` · door #${site.__door.n}` : ""}</a>${site.__door?.qid ? ` · <a href="https://www.wikidata.org/wiki/${site.__door.qid}" rel="noopener">Wikidata ${site.__door.qid}</a>` : ""}</p>
`;

  // Intel artefacts. SITE-STRUCTURE.md carries the closed-path list and is pack-internal: never public.
  files["KEYWORDS.json"] = JSON.stringify(keywords, null, 2);
  files["_reach-pack/SITE-STRUCTURE.md"] = structure;
  files["OPEN-DOORS.json"] = JSON.stringify(doors, null, 2);
  files["BACKLINKS.json"] = JSON.stringify(backlinks, null, 2);
  files["SEARCH-INTENT.json"] = JSON.stringify(keywords?.search_intent || [], null, 2);

  // A.41 ping.sh - fire on publish / change / delete, CHANGED URLs only. Log inside the project, one verdict line.
  files["ping.sh"] = `#!/bin/sh
# A.41 - IndexNow + WebSub. Usage: sh ping.sh urls.txt   (one absolute URL per line; CHANGED URLs only; max 10,000)
# Order: deploy, bump cache versions, run your sweep, THEN ping. Never ping over a failing sweep.
# Google has no IndexNow: its sitemap goes through Search Console. The old GET sitemap pings are dead; do not add them.
set -eu
HOST="${host}"
KEY="${site.indexnow_key || ""}"
LIST="$1"
[ -n "$KEY" ] || { echo "RESULT: FAIL ping: no IndexNow key for $HOST"; exit 1; }
[ -f "$LIST" ] || { echo "RESULT: FAIL ping: no url list file"; exit 1; }
mkdir -p ./_logs
LOG="./_logs/ping-$(date +%Y%m%d-%H%M%S).log"
FAIL=""
URLS=$(awk 'NF && n<10000 {gsub(/"/,""); printf "%s    \\"%s\\"", sep, $0; sep=",\\n"; n++}' "$LIST")
BODY=$(printf '{\\n  "host": "%s",\\n  "key": "%s",\\n  "keyLocation": "https://%s/%s.txt",\\n  "urlList": [\\n%s\\n  ]\\n}' "$HOST" "$KEY" "$HOST" "$KEY" "$URLS")
{
echo "== key file =="
kc=$(curl -sS -o /dev/null -w "%{http_code}" "https://$HOST/$KEY.txt" || echo err)
echo "$kc  https://$HOST/$KEY.txt"
[ "$kc" = "200" ] || FAIL="key file $kc"
echo "== indexnow (one endpoint propagates to all; seven = verification) =="
for EP in \\
  https://api.indexnow.org/indexnow \\
  https://www.bing.com/indexnow \\
  https://yandex.com/indexnow \\
  https://search.seznam.cz/indexnow \\
  https://searchadvisor.naver.com/indexnow \\
  https://indexnow.yep.com/indexnow \\
  https://indexnow.amazonbot.amazon/indexnow
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$EP" -H 'Content-Type: application/json; charset=utf-8' --data-binary "$BODY" || echo err)
  echo "$code  $EP"
  case "$EP" in *api.indexnow.org*) case "$code" in 200|202) ;; *) [ -n "$FAIL" ] || FAIL="indexnow $code";; esac;; esac
done
# 200/202 accepted. 400 bad JSON. 403 key file missing or mismatched. 422 a URL is not on the host.
# 429 too many pings: STOP, honour Retry-After, and check you are not re-pinging unchanged URLs.
${files["feed.xml"] ? `echo "== websub publish =="\ncurl -sS -o /dev/null -w "%{http_code}  pubsubhubbub.appspot.com\\n" -X POST ${WEBSUB_HUB} -d "hub.mode=publish" --data-urlencode "hub.url=https://$HOST/feed.xml" || true` : `echo "(no feed declares a WebSub hub - nothing to publish)"`}
} > "$LOG" 2>&1
if [ -z "$FAIL" ]; then echo "RESULT: PASS"; else echo "RESULT: FAIL ping: $FAIL"; fi
echo "urls: $(grep -c . "$LIST")  log: $LOG"
`;

  // A.47 the work-order kit: the sheet, one order, the state file. Pack-internal; a model reads them, nobody serves them.
  const names = Object.keys(files).filter((k) => !k.startsWith("_reach-pack/"));
  const deploy = names.filter((k) => !PACK_REFERENCE.has(k) && !PACK_SOFT.has(k));
  const soft = names.filter((k) => PACK_SOFT.has(k));
  const reference = names.filter((k) => PACK_REFERENCE.has(k));
  const typeOf = (k) => packFileType(k).replace(/; charset=utf-8$/, "");
  /* what an earlier pack left: a path this pack serves again is replaced, never withdrawn. `stale` is what the probe
     saw still answering on the origin; `withdraw` is the whole list, for the installer to test against local files. */
  const withdraw = PACK_LEFTOVERS.filter((l) => !deploy.includes(l.path) && !soft.includes(l.path));
  const stale = withdraw.filter((l) => probe.some((p) => p.leftover && p.path === `/${l.path}`));
  const sheet = buildSiteSheet({ site, host, today, stamp, policy, asks, keywords, langs, contact, probe, mcpLive, a2aLive, stale });
  files["_reach-pack/SITE-SHEET.txt"] = sheet;
  files["_reach-pack/WORK-ORDER.txt"] = buildWorkOrder({
    site, host, origin, sheet, deploy, soft, stale, policy,
    checks: deploy.filter((k) => !/^_(headers|redirects)$/.test(k)).map((k) => ({ path: k, type: typeOf(k) })),
  });
  files["_reach-pack/STATE.txt"] = `BUILD STATE - ${host}
decided   policy ${isB(policy) ? "B" : "A"}; the question as on the sheet     ${today}
pack      built by The Reach 02, Calling AI Models ${PLAYBOOK_REVISION}     ${today}
next      order 1 (install the pack); append its RESULT line here
waiting   ${withheld.length} item(s) not shipped: see NOT-SHIPPED.md - each one opens when its endpoint answers${stale.length ? `\ncleanup   ${stale.length} file(s) an earlier pack left are still served: order 1 deletes them` : ""}
`;

  // What this pack deliberately does NOT ship, and why. Pack-internal; a model never sees it.
  files["_reach-pack/NOT-SHIPPED.md"] = `# Not shipped for ${flat(site.name)} (probe of ${stamp})

Rule 1.4 of the playbook: never announce what does not answer. Each item below is withheld because the thing it
would point at did not answer this probe, or because the hub cannot know it. Nothing here is a fault in the pack;
it is the pack telling the truth. Make the endpoint answer, then rebuild the pack (POST /v1/sites/{id}/brief).

${withheld.map((w) => `## ${w.files[0]}\n\n- Withheld: ${w.files.join(", ")}\n- Because: ${w.because}\n- Ships when: ${w.until}\n`).join("\n")}${stale.length ? `
# Left by an earlier pack, still served

These answered the probe with the exact text an earlier revision of this pack wrote. This revision withdraws them:
delete each from the web root (the installer moves them to _reach-pack/withdrawn/ for you).

${stale.map((l) => `- /${l.path}: ${l.because}`).join("\n")}
` : ""}`;

  // The installer's one source of truth: what to serve, what to write only if absent, what never to serve.
  files["_reach-pack/MANIFEST.json"] = JSON.stringify(
    {
      host,
      built: stamp,
      playbook: PLAYBOOK_REVISION,
      policy,
      deploy,
      soft,
      reference,
      internal: Object.keys(files).filter((k) => k.startsWith("_reach-pack/")).concat("_reach-pack/MANIFEST.json"),
      not_shipped: withheld.map((w) => ({ files: w.files, because: w.because, ships_when: w.until })),
      /* the sign that a web root carries a pack (its robots.txt matches); without it every file in place is the site's own */
      pack_marker: PACK_ROBOTS_MARKER,
      /* Pages control files: the site's own rules win; the pack's file is written only over nothing or over a pack's own */
      own_wins: PACK_OWN_WINS.filter((o) => deploy.includes(o.path)),
      /* what an earlier pack may have left in the web root: the installer moves a file out only when its text matches */
      withdraw: withdraw.map((l) => ({ path: l.path, pattern: l.pattern, because: l.because, seen_live: stale.includes(l) })),
    },
    null,
    2
  ) + "\n";

  // A pack with a placeholder is never written: a 200 carrying a template string or a placeholder domain is a lie.
  const bad = packSelfTest(files);
  if (bad.length) {
    throw new Error(`pack self-test failed for ${host}: ${bad.map((b) => `${b.path} has "${b.hit}" at ${b.at}`).join("; ")}`);
  }
  return files;
}

/** The MIME a pack file is served with (the origin must send the same; index.js uses it for downloads). */
export function packFileType(key) {
  if (key === "license.xml") return "application/rsl+xml; charset=utf-8";
  if (/^llms[^/]*\.txt$/.test(key) || key.startsWith("llms/")) return "text/markdown; charset=utf-8";
  if (key === ".well-known/llms.txt") return "text/markdown; charset=utf-8";
  if (key === ".well-known/api-catalog") return "application/linkset+json; charset=utf-8";
  if (key === ".well-known/ard.json" || key === ".well-known/ai-catalog.json") return "application/ai-catalog+json; charset=utf-8";
  if (/(^|\/)server-card$/.test(key) || key === ".well-known/mcp-server-card" || key === ".well-known/mcp.json" || key === ".well-known/mcp/server-card.json") return "application/mcp-server-card+json; charset=utf-8";
  if (key === "opensearch.xml") return "application/opensearchdescription+xml; charset=utf-8";
  if (key === "manifest.json") return "application/manifest+json; charset=utf-8";
  if (key === "openapi.json") return "application/vnd.oai.openapi+json; charset=utf-8";
  if (key === "feed.xml") return "application/atom+xml; charset=utf-8";
  if (key === "feed.json") return "application/feed+json; charset=utf-8";
  if (key === "sw.js") return "text/javascript; charset=utf-8";
  if (key.startsWith(".well-known/agent") && key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key === "_headers" || key === "_redirects" || key.endsWith(".txt") || key.endsWith(".sh")) return "text/plain; charset=utf-8";
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (key.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (key.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text || "")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
