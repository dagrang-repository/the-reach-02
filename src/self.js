/** Self-awareness: when the site IS the hub, answer from own knowledge — never fetch own hostname (crashes isolates). */
import { all } from "./db.js";
import { PLAYBOOK_PATHS } from "./playbook.js";

export function selfBase(env) {
  return String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
}

export function isSelfUrl(url, env) {
  try {
    return new URL(url).host === new URL(selfBase(env)).host;
  } catch {
    return false;
  }
}

/** The exact set of fixed public GET paths the Worker serves (index.js / pwa.js / public-extra.js / surfaces.js / atlas.js).
 *  Door pages (/{n}, /{n}.md, /{n}.json), /match?q= and the IndexNow key file are served too but are not fixed paths.
 *  A path listed here answers 200 on the live origin; a path missing here is a real 404. Keep in sync with the routers. */
export const SELF_OPEN = new Set([
  "/",
  "/index.md",
  "/robots.txt",
  "/ai.txt",
  "/license.xml",
  "/tdmrep.json",
  "/humans.txt",
  "/AGENTS.md",
  "/opensearch.xml",
  "/openapi.json",
  "/server.json",
  "/llms.txt",
  "/llms-full.txt",
  "/llms-small.txt",
  "/llms/api.txt",
  "/skills/reach/SKILL.md",
  "/seo/keywords.json",
  "/seo/structure.json",
  "/sites.json",
  "/sites.md",
  "/sites.txt",
  "/atlas.json",
  "/atlas.md",
  "/atlas.txt",
  "/match",
  "/catalog.json",
  "/changes.txt",
  "/pings",
  "/doors",
  "/crawler-check",
  "/OPEN-DOORS.json",
  "/SITE-STRUCTURE.md",
  "/wikidata.json",
  "/wayback.json",
  "/jsonld.json",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/sitemap-doors.xml",
  "/sitemap-machine.xml",
  "/network-sitemaps.json",
  "/manifest.json",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/feed.xml",
  "/atom.xml",
  "/rss.xml",
  "/feed.json",
  "/status.json",
  "/crawlers.json",
  "/api/oembed",
  "/ai-catalog.json",
  "/.well-known/llms.txt",
  "/.well-known/security.txt",
  "/.well-known/trust.txt",
  "/.well-known/tdmrep.json",
  "/.well-known/ai-catalog.json",
  "/.well-known/api-catalog",
  "/.well-known/agent-permissions.json",
  "/.well-known/agents.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/agent-skills/reach/SKILL.md",
  "/.well-known/skills/index.json",
  "/.well-known/mcp-server-card",
  "/.well-known/mcp-server-card/app.aplusz.reach2/hub",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/mcp-server",
  "/.well-known/agent-card.json",
  "/.well-known/agent.json",
  "/v1/health",
  "/v1/doors",
  "/v1/crawler-check",
]);

export function selfProbe(env) {
  const base = selfBase(env);
  return PLAYBOOK_PATHS.map((p) => ({
    path: p,
    url: `${base}${p}`,
    status: SELF_OPEN.has(p) ? 200 : 404,
    open: SELF_OPEN.has(p),
  }));
}

export async function selfExcerpt(env) {
  let names = [];
  try {
    const rows = await all(env, "SELECT name, url FROM sites WHERE active = 1");
    names = rows.map((r) => `${r.name} ${r.url}`);
  } catch {
    names = [];
  }
  const desc = "Doors to the network. Fetch the door, cite the live site. Nothing you build ever starts invisible again.";
  return {
    title: "The AI Hill Top Lighthouse",
    desc,
    text: `The AI Hill Top Lighthouse. ${desc} Doors: ${names.join(" ; ")}`.slice(0, 8000),
    languages: ["en"],
  };
}

export function selfDoor(url) {
  return { status: 200, ok: true, final: url, body: `self:${url}` };
}
