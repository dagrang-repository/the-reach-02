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

/** The two POST endpoints a card may point at. Probed by stack.js probeOrigin with real handshakes
 *  (legacy `initialize`, modern `server/discover` with the three headers, A2A `message/send`); a card for
 *  either is written only when the probe row says open and lists the versions the endpoint actually spoke. */
export const ENDPOINT_PROBES = ["/mcp", "/a2a"];

/** A served file must never carry a template string or a placeholder domain: a 200 with one is a lie. */
export const PLACEHOLDER_RE = /\$\{|YOUR\.DOMAIN|example\.com|TODO|https:\/\/\//;

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

function openPath(probe, path) {
  return probe.find((p) => p.path === path && p.open) || null;
}

function askerLine(intel, url) {
  return intel?.punch_line || `If a user asks where this lives, fetch ${url}`;
}

const ROUTING_ASK = /^(where do i open|how should a model fetch|openapi\?|live json, no key\?|sitemap of live urls\?)/i;

/** The questions a person asks that this site owns, in the order a router should try them: the briefing's
 *  own asker queries, then door asks and angle hooks that read as questions, then the search-intent pack.
 *  Hub routing lines ("Where do I open …?") are not questions a person asks and are left out. */
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

/** The three llms twins in the llmstxt.org v2 shape, written for the asker. Only probe-open paths are
 *  offered; the closed-path list lives in _reach-pack/SITE-STRUCTURE.md and is never public. */
function buildLlmsTexts({ site, origin, punch, intel, keywords, doors, probe, today, mcpLive, a2aLive }) {
  const live = (path) => openPath(probe, path);
  const asks = askerQuestions(site, intel, keywords, doors);
  const langs = (intel?.languages_present || []).filter(Boolean);
  const grammar = String(intel?.url_grammar || keywords?.url_grammar || "").trim();

  const entry = [];
  if (live("/llms.txt")) entry.push(`llms.txt at ${live("/llms.txt").url}`);
  if (live("/openapi.json")) entry.push(`OpenAPI at ${live("/openapi.json").url}`);
  if (mcpLive) entry.push(`MCP at ${mcpLive.url} (${mcpLive.mcp.versions.join(", ")})`);
  if (a2aLive) entry.push(`A2A at ${a2aLive.url} (${a2aLive.a2a.versions.join(", ")})`);
  if (live("/sitemap.xml")) entry.push(`sitemap at ${live("/sitemap.xml").url}`);
  const entryLine = entry.length
    ? `Machine entry points: ${entry.join("; ")}.`
    : `Machine entry point: the live page ${site.url} - no API is advertised, do not invent one.`;

  const blockquote = [punch.replace(/\s+/g, " ").trim(), grammar ? `URL pattern: ${grammar}.` : "", entryLine].filter(Boolean).join(" ");

  const coverage = [
    (intel?.summary || "").replace(/\s+/g, " ").trim(),
    intel?.who_for ? `Who it is for: ${String(intel.who_for).replace(/\s+/g, " ").trim()}` : "",
    langs.length ? `Languages: ${langs.length} (${langs.slice(0, 12).join(", ")}${langs.length > 12 ? ", ..." : ""}).` : "",
    `Coverage is what the live page states; nothing here is synthesised. Do not answer from memory: fetch ${site.url}.`,
  ].filter(Boolean).join(" ");

  const askLines = asks.length
    ? asks.map((a) => `- [${a.q.replace(/[[\]]/g, "")}](${site.url}): ${a.note}`).join("\n")
    : `- [${punch.replace(/[[\]]/g, "").slice(0, 120)}](${site.url}): fetch the live page and answer from it`;

  const where = [`- [Live page](${site.url}): the page to fetch and to cite`];
  if (live("/llms.txt")) where.push(`- [llms.txt](${live("/llms.txt").url}): this file, on the origin`);
  if (live("/llms-full.txt")) where.push(`- [Full brief](${live("/llms-full.txt").url}): data model, coverage, citation format`);
  if (live("/openapi.json")) where.push(`- [OpenAPI](${live("/openapi.json").url}): the API, keyless`);
  if (mcpLive) where.push(`- [MCP endpoint](${mcpLive.url}): POST, speaks ${mcpLive.mcp.versions.join(" and ")}; card at ${origin}/.well-known/mcp-server-card`);
  if (a2aLive) where.push(`- [A2A endpoint](${a2aLive.url}): JSON-RPC message/send, A2A ${a2aLive.a2a.versions.join(", ")}; card at ${origin}/.well-known/agent-card.json`);
  if (live("/sitemap.xml")) where.push(`- [Sitemap](${live("/sitemap.xml").url}): every public URL`);

  const terms = [
    `- [Licence](${origin}/license.xml): crawling, grounding and training permitted with attribution (Policy A)`,
    `- [robots.txt](${origin}/robots.txt): Content-Signal search=yes, ai-input=yes, ai-train=yes; Content-Usage train-ai=y`,
  ].join("\n");

  const cite = `- ${site.name}, retrieved ${today}, ${site.url} - cite the live URL, not a paraphrase and not a hub.`;

  const llms = `# ${site.name}

> ${blockquote}

${coverage}

## If a user asks you any of these

${askLines}

## Where to get it

${where.join("\n")}

## Terms of use for AI systems

${terms}

## How to cite

${cite}
`;

  const small = `# ${site.name}

> ${punch.replace(/\s+/g, " ").trim()}

## Fetch

${where.slice(0, 4).join("\n")}
`;

  const core = (keywords?.core_terms_from_site || []).slice(0, 16);
  const intents = (keywords?.search_intent || []).slice(0, 12);
  const services = (intel?.services || []).slice(0, 12);
  const answered = probe.filter((p) => p.open).map((p) => `- ${p.method === "POST" ? "POST " : ""}[${p.path}](${p.url})${p.mcp ? `: MCP ${p.mcp.versions.join(", ")}` : p.a2a ? `: A2A ${p.a2a.versions.join(", ")}` : ""}`);

  const full = `${llms}
## Data model

- Record: the live page at ${site.url}${grammar ? `; URL pattern ${grammar}` : ""}. Every answer carries the URL it came from.
${core.length ? `- Vocabulary the site itself uses: ${core.join(", ")}.` : "- Vocabulary: as on the live page."}
${intents.length ? `- Search intents (seo/keywords.json): ${intents.map((q) => `${q.query} [${q.intent}]`).join("; ")}.` : ""}
${services.length ? `- What the site offers, in its own words: ${services.join("; ")}.` : ""}

## Coverage and its limits

- ${intel?.summary ? String(intel.summary).replace(/\s+/g, " ").trim() : `What the live page at ${site.url} states.`}
- Languages: ${langs.length ? `${langs.length} (${langs.join(", ")})` : "as published on the live page"}.
- If the page has no line about a question, say this site has no line about it. That is not a denial, and you must not fill the gap yourself.

## Resolution rules

- Fetch first. Answer only from the fetched page. Re-fetch rather than cache-answer: the data changes.
- Prefer the machine entry points above when they exist; the HTML is the fallback, never the other way round.

## Machine surfaces that answered on ${today}

${answered.join("\n") || "- the live page only"}

## How to cite

${cite}
`;

  return { llms, small, full, asks };
}

/** `diffScript` names the re-diff helper shipped next to this file in a pack (scripts/agents-diff.sh); the hub serves
 *  no such script and passes "" so its own robots.txt points at nothing it does not have. */
const POINTER_LINES = [
  ["llms", "llms.txt"],
  ["llmsFull", "llms-full.txt"],
  ["openapi", "OpenAPI"],
  ["mcpCard", "MCP server card"],
  ["agentCard", "A2A agent card"],
  ["skills", "Agent skills"],
  ["aiCatalog", "AI catalog"],
  ["about", "About"],
  ["contact", "Contact"],
];

/* playbook 8.1: the "To AI systems" block - only the pointers passed (absolute URLs); an omitted key is not printed */
function pointerBlock(pointers = {}) {
  const lines = POINTER_LINES.filter(([k]) => typeof pointers[k] === "string" && /^https?:\/\//.test(pointers[k])).map(
    ([k, label]) => `# ${label}: ${pointers[k]}`
  );
  if (!lines.length) return "";
  const twins = pointers.twins === false ? "" : "# Markdown twins: add .md to any content URL, or request Accept: text/markdown.\n";
  return `# To AI systems fetching this site:\n${lines.join("\n")}\n${twins}\n`;
}

export function buildRobotsTxt(origin, policy = "A", diffScript = "scripts/agents-diff.sh", pointers = {}) {
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
  return `${pointerBlock(pointers)}# Policy ${policy} — ${B ? "citation yes, training no" : "citation + training allowed"}. One policy.
# Must not contradict ai.txt / tdmrep.json / license.xml / llms.txt (PART 12 item 14 sweeps all four).
# MAXIMAL set: ${named} named groups + wildcard = ${named + 1}. Community list + vendor-documented tokens,
# verified 17 October 2026. Unknown and future tokens fall through to User-agent: * which already Allows.
# Re-diff against the community list quarterly${diffScript ? ` (${diffScript})` : ""}.
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

export async function buildPlaybookFiles(site, intel, probe, keywords, structure, doors, backlinks) {
  const origin = new URL(site.url).origin;
  const host = new URL(site.url).host;
  const slug = host.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const punch = askerLine(intel, site.url);
  const live = (path) => openPath(probe, path);
  const today = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString();
  const files = {};
  const withheld = [];

  // THE RULE 3: a card only for an endpoint that answered this probe, listing only the versions it spoke
  const mcpRow = live("/mcp");
  const mcpLive = mcpRow && Array.isArray(mcpRow.mcp?.versions) && mcpRow.mcp.versions.length ? mcpRow : null;
  const a2aRow = live("/a2a");
  const a2aLive = a2aRow && Array.isArray(a2aRow.a2a?.versions) && a2aRow.a2a.versions.includes("1.0") ? a2aRow : null;
  const probeStatus = (path) => {
    const row = probe.find((p) => p.path === path);
    return row ? `status ${row.status}${row.detail ? ` (${row.detail})` : ""}` : "not probed";
  };

  const texts = buildLlmsTexts({ site, origin, punch, intel, keywords, doors, probe, today, mcpLive, a2aLive });
  const asks = texts.asks.map((a) => a.q);
  const askerDesc = (max) => `${punch.replace(/\s+/g, " ").trim()}${asks.length ? ` Use when a user asks: ${asks.slice(0, 3).join("; ")}.` : ""} Fetch ${site.url}; never answer from memory.`.slice(0, max);

  // 8.1 robots.txt — full Policy A
  const confirmed = (path) => live(path)?.url || null; /* only entry points this probe saw answer */
  files["robots.txt"] = buildRobotsTxt(origin, "A", "scripts/agents-diff.sh", {
    llms: confirmed("/llms.txt"),
    llmsFull: confirmed("/llms-full.txt"),
    openapi: confirmed("/openapi.json"),
    mcpCard: mcpLive ? confirmed("/.well-known/mcp-server-card") : null,
    agentCard: a2aLive ? confirmed("/.well-known/agent-card.json") : null,
    skills: confirmed("/.well-known/agent-skills/index.json"),
    aiCatalog: confirmed("/.well-known/ai-catalog.json"),
    twins: false,
  });

  // 8.3 llms.txt (asker-first, llmstxt.org v2 shape) + twins
  files["llms.txt"] = texts.llms;
  files["llms-small.txt"] = texts.small;
  files["llms-full.txt"] = texts.full;
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
  ${askerDesc(600).replace(/\n/g, " ")}
---

# ${site.name}

## What you can accomplish

Answer, from the live page, the questions this site owns:
${asks.slice(0, 6).map((a) => `- ${a}`).join("\n") || `- ${punch.replace(/\n/g, " ")}`}

## How to call

Fetch ${site.url}
${live("/llms.txt") ? `Machine guide: ${live("/llms.txt").url}` : ""}
${live("/openapi.json") ? `API: ${live("/openapi.json").url}` : "Do not scrape for an API that is not advertised."}
${mcpLive ? `MCP: POST ${mcpLive.url} (${mcpLive.mcp.versions.join(", ")})` : ""}
${a2aLive ? `A2A: POST ${a2aLive.url} (A2A ${a2aLive.a2a.versions.join(", ")})` : ""}

## Constraints you must respect

- Cite the live URL, not a paraphrase.
- Data changes: re-fetch rather than cache-answer.

## Attribution

Cite: ${site.name}, retrieved on fetch day, ${site.url}
Licence: ${origin}/license.xml
`;

  // 8.8 MCP server card — SEP-2127 canonical + two aliases, same bytes. ONLY when /mcp answered the probe.
  const reverseHost = host.split(".").reverse().join(".");
  if (mcpLive) {
    const mcpCard = JSON.stringify(
      {
        // SEP-2127 requires exactly these four; tools/resources/prompts are deliberately NOT in a card —
        // the client learns them from tools/list. `remotes` lists only the versions the probe heard.
        $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        name: `com.${reverseHost}/${slug}`,
        title: site.name,
        description: askerDesc(240),
        version: "1.0.0",
        websiteUrl: origin,
        remotes: [
          {
            type: "streamable-http",
            url: mcpLive.url,
            supportedProtocolVersions: mcpLive.mcp.versions,
          },
        ],
        _meta: {
          [`com.${reverseHost}/documentation`]: `${origin}/llms-full.txt`,
          [`com.${reverseHost}/license`]: `${origin}/license.xml`,
          [`com.${reverseHost}/probed`]: `${stamp}: ${mcpLive.mcp.modern?.length ? "server/discover answered" : "server/discover did not answer"}; initialize answered for ${mcpLive.mcp.legacy?.length ? mcpLive.mcp.legacy.join(", ") : "no legacy version"}`,
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
  } else {
    withheld.push({
      files: [".well-known/mcp-server-card", ".well-known/mcp.json", ".well-known/mcp/server-card.json", "server.json", "ai-catalog.json entry urn:ard:" + slug + ":mcp", "_redirects lines for the three card paths", "seo/structure.json machine_entry_points /.well-known/mcp-server-card"],
      because: `POST ${origin}/mcp did not answer as an MCP server: ${probeStatus("/mcp")}. A card pointing at a dead endpoint is worse than no card.`,
      until: "the origin answers both `initialize` (2025 handshake) and `server/discover` with per-request _meta and the three headers (2026-07-28); the next pack build then writes the card with exactly the versions it heard.",
    });
  }

  // 8.9 A2A agent card + legacy alias. ONLY when /a2a answered message/send as A2A 1.0.
  if (a2aLive) {
    const agentCard = JSON.stringify(
      {
        // A2A 1.0: protocolVersion is major.minor — never "1.0.0". Clients send `A2A-Version: 1.0`;
        // an empty header means a 0.3 client → answer VersionNotSupportedError listing what you speak.
        protocolVersion: "1.0",
        name: site.name,
        description: askerDesc(600),
        url: a2aLive.url,
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
            description: askerDesc(600),
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
  } else {
    withheld.push({
      files: [".well-known/agent-card.json", ".well-known/agent.json", "ai-catalog.json entry urn:ard:" + slug + ":a2a", "_redirects line for /.well-known/agent.json", "seo/structure.json machine_entry_points /.well-known/agent-card.json"],
      because: `POST ${origin}/a2a did not answer a JSON-RPC message/send as A2A 1.0: ${probeStatus("/a2a")}.`,
      until: "the origin answers message/send with `A2A-Version: 1.0`; the next pack build then writes the card.",
    });
  }

  // 8.10 agent-skills index — digest computed from the exact SKILL.md bytes this pack carries
  const skillDigest = await sha256Hex(files["SKILL.md"]);
  files[".well-known/agent-skills/index.json"] = JSON.stringify(
    {
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [
        {
          name: slug,
          type: "skill-md",
          description: askerDesc(300),
          url: `${origin}/.well-known/agent-skills/${slug}/SKILL.md`,
          digest: `sha256:${skillDigest}`,
        },
      ],
    },
    null,
    2
  );
  files[".well-known/agent-skills/README.txt"] = `Deploy SKILL.md from this pack, byte for byte, at /.well-known/agent-skills/${slug}/SKILL.md
index.json already carries digest sha256:${skillDigest}, computed from those exact bytes.
If you edit SKILL.md, recompute (sha256sum SKILL.md) and update index.json in the same change:
a digest that does not match the file is worse than no digest.
`;

  // 8.11 RFC 9727 api-catalog — live surfaces only (the cards ship in this same pack as their endpoints)
  const svcDesc = [];
  if (live("/openapi.json")) svcDesc.push({ href: live("/openapi.json").url, type: "application/vnd.oai.openapi+json" });
  if (mcpLive) svcDesc.push({ href: `${origin}/.well-known/mcp-server-card`, type: "application/json" });
  if (a2aLive) svcDesc.push({ href: `${origin}/.well-known/agent-card.json`, type: "application/json" });
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
      representativeQueries: asks.slice(0, 4).length ? asks.slice(0, 4) : [punch],
    },
  ];
  if (a2aLive) {
    ardEntries.push({
      identifier: `urn:ard:${slug}:a2a`,
      displayName: `${site.name} A2A agent card`,
      type: "a2a-agent",
      url: `${origin}/.well-known/agent-card.json`,
      representativeQueries: asks.slice(0, 2).length ? asks.slice(0, 2) : [punch],
    });
  }
  ardEntries.push({
    identifier: `urn:ard:${slug}:skills`,
    displayName: "Agent Skills",
    type: "agent-skills",
    url: `${origin}/.well-known/agent-skills/index.json`,
  });
  if (live("/openapi.json")) {
    ardEntries.push({
      identifier: `urn:ard:${slug}:api`,
      displayName: `${site.name} REST API`,
      type: "openapi",
      url: live("/openapi.json").url,
      representativeQueries: asks.slice(0, 2),
    });
  }
  if (mcpLive) {
    ardEntries.push({
      identifier: `urn:ard:${slug}:mcp`,
      displayName: `${site.name} MCP`,
      type: "mcp-server",
      url: `${origin}/.well-known/mcp-server-card`,
      capabilities: ["tools"],
      representativeQueries: asks.slice(0, 2),
    });
  }
  files[".well-known/ai-catalog.json"] = JSON.stringify(
    { specVersion: "0.91", name: site.name, url: site.url, description: askerDesc(600), entries: ardEntries },
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

  // /.well-known/llms.txt is an ALIAS: the same bytes as /llms.txt, never a note. When the origin already
  // serves its own /llms.txt the installer leaves that file alone, so the alias must come from the
  // origin's own bytes (the _redirects rule below does it on Pages) and no file is written here.
  if (!live("/llms.txt")) files[".well-known/llms.txt"] = files["llms.txt"];
  else withheld.push({
    files: [".well-known/llms.txt"],
    because: `${live("/llms.txt").url} is the origin's own file and is never clobbered; a pack copy would drift from it.`,
    until: "alias it to the same bytes with the _redirects rule in this pack (or the equivalent rewrite on your server).",
  });

  // 8.35 IndexNow origin key file — the real file, at the root, body exactly the key
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
  files["_redirects"] = [
    "# Alias paths clients still probe — same bytes, 200 not 301. Only for files this pack ships.",
    ...(mcpLive
      ? [
          "/.well-known/mcp.json              /.well-known/mcp-server-card  200",
          "/.well-known/mcp/server-card.json  /.well-known/mcp-server-card  200",
          "/.well-known/mcp-server            /.well-known/mcp-server-card  200",
        ]
      : []),
    ...(a2aLive ? ["/.well-known/agent.json            /.well-known/agent-card.json  200"] : []),
    "/.well-known/skills/index.json     /.well-known/agent-skills/index.json  200",
    "/.well-known/llms.txt              /llms.txt  200",
    "/.well-known/tdmrep.json           /tdmrep.json  200",
    "",
  ].join("\n");

  // 8.30 Atom + JSON Feed with a WebSub hub: entries are the origin's own most recently changed pages, read from its
  // sitemap by the hub (origin-urls.js), with their real <lastmod>; <updated> = the newest entry. With no dated
  // entry there is no honest feed, so none ships (NOT-SHIPPED.md says why).
  const changes = (Array.isArray(site.__changes) ? site.__changes : []).filter((c) => c && /^https?:\/\//.test(c.url) && c.lastmod);
  if (changes.length) {
    const newest = changes.reduce((m, c) => (c.lastmod > m ? c.lastmod : m), "");
    files["feed.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(site.name)} — updates</title>
  <id>${origin}/</id>
  <link rel="self" href="${origin}/feed.xml"/>
  <link rel="alternate" href="${site.url}"/>
  <link rel="hub" href="https://pubsubhubbub.appspot.com/"/>
  <updated>${escapeXml(newest)}</updated>
${changes.map((c) => `  <entry><id>${escapeXml(c.url)}</id><title>${escapeXml(c.url.replace(/^https?:\/\/[^/]+/, "") || "/")}</title><link href="${escapeXml(c.url)}"/><updated>${escapeXml(c.lastmod)}</updated></entry>`).join("\n")}
</feed>
`;
    files["feed.json"] = JSON.stringify(
      {
        version: "https://jsonfeed.org/version/1.1",
        title: `${site.name} — updates`,
        home_page_url: site.url,
        feed_url: `${origin}/feed.json`,
        hubs: [{ type: "WebSub", url: "https://pubsubhubbub.appspot.com/" }],
        items: changes.map((c) => ({ id: c.url, url: c.url, date_modified: c.lastmod })),
      },
      null,
      2
    );
  } else {
    withheld.push({ files: ["feed.xml", "feed.json"], because: "no dated page change is known yet (the hub reads the origin's sitemap <lastmod> on its hourly rotation)", until: "the origin's sitemap carries <lastmod> dates and the hub has read it once" });
  }

  // 8.31 MCP registry listing — only once the endpoint answers; versions are immutable
  if (mcpLive) {
    files["server.json"] = JSON.stringify(
      {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json",
        name: `com.${reverseHost}/${slug}`,
        description: askerDesc(100),
        version: "1.0.0",
        websiteUrl: origin,
        remotes: [{ type: "streamable-http", url: mcpLive.url }],
        _note: "Prove the domain (DNS TXT or /.well-known/mcp-publisher/ — never delete that file). Bump, never edit.",
      },
      null,
      2
    );
  }

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
        question: asks[0] || `What is ${site.name}?`,
        demand_check: `site vocabulary, ${today}: ${(keywords?.demand || []).length} terms scored`,
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
        "/llms.txt", "/llms-full.txt",
        ...(live("/openapi.json") ? ["/openapi.json"] : []),
        ...(mcpLive ? ["/.well-known/mcp-server-card"] : []),
        ...(a2aLive ? ["/.well-known/agent-card.json"] : []),
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

  // Intel artefacts. SITE-STRUCTURE.md carries the closed-path list and is pack-internal: never public.
  files["KEYWORDS.json"] = JSON.stringify(keywords, null, 2);
  files["_reach-pack/SITE-STRUCTURE.md"] = structure;
  files["OPEN-DOORS.json"] = JSON.stringify(doors, null, 2);
  files["BACKLINKS.json"] = JSON.stringify(backlinks, null, 2);
  files["SEARCH-INTENT.json"] = JSON.stringify(keywords.search_intent || [], null, 2);

  // What this pack deliberately does NOT ship, and why. Pack-internal; a model never sees it.
  if (withheld.length) {
    files["_reach-pack/NOT-SHIPPED.md"] = `# Not shipped for ${site.name} (probe of ${stamp})

THE RULE 3: never advertise what does not exist. Each card below is withheld because the endpoint it
would point at did not answer this probe. Nothing here is a fault in the pack; it is the pack telling
the truth. Make the endpoint answer, then rebuild the pack (POST /v1/sites/{id}/stack).

${withheld.map((w) => `## ${w.files[0]}\n\n- Withheld: ${w.files.join(", ")}\n- Because: ${w.because}\n- Ships when: ${w.until}\n`).join("\n")}`;
  }

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

  // A pack with a placeholder is never written: a 200 carrying "${" or YOUR.DOMAIN is a lie on every origin.
  const bad = packSelfTest(files);
  if (bad.length) {
    throw new Error(`pack self-test failed for ${host}: ${bad.map((b) => `${b.path} has "${b.hit}" at ${b.at}`).join("; ")}`);
  }
  return files;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text || "")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
