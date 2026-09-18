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

/** Paths the Worker actually serves publicly (keep in sync with index.js / pwa.js / public-extra.js routes). */
const SELF_OPEN = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/llms-small.txt",
  "/manifest.json",
  "/.well-known/llms.txt",
  "/.well-known/security.txt",
  "/.well-known/ai-catalog.json",
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
  const desc = "Doors to the network. Fetch the door, cite the live site.";
  return {
    title: "The Reach 02",
    desc,
    text: `The Reach 02. ${desc} Doors: ${names.join(" ; ")}`.slice(0, 8000),
    languages: ["en"],
  };
}

export function selfDoor(url) {
  return { status: 200, ok: true, final: url, body: `self:${url}` };
}
