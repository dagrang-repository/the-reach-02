/* The per-site pack (src/playbook.js): honest by construction, one policy in every place, Revision 3 shapes.
   Run: npm test   (node --test, no dependencies) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_GROUPS, CITATION_AGENTS, TRAINING_ONLY, TRAINING_TOKEN, PLAYBOOK_PATHS, PLACEHOLDER_RE, MEDIA, SERVER_CARD_SCHEMA,
  PACK_LEFTOVERS, PACK_OWN_WINS, PACK_REFERENCE, PACK_ROBOTS_MARKER, PACK_SOFT, carriesPack, isPackOwn, leftoverOf, buildPlaybookFiles, buildRobotsTxt, buildLicenseXml, buildAiTxt, buildTdmrep,
  buildAgentPermissions, contentSignal, packFileType, packSelfTest, sha256Hex, skillNameOf, urnAir, queries2to5, clipTo,
} from "../src/playbook.js";
import * as F from "./fixtures.js";

const URN = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;
const doors = (s) => [{ ask: "Where do I open Visa Answers?", there: s.url, open: true }];

async function pack({ full = false, policy = "A", ownLlms = false } = {}) {
  const s = F.site();
  if (policy === "B") s.__policy = "B";
  let pr = F.probe({ paths: PLAYBOOK_PATHS, open: ownLlms ? ["/llms.txt"] : [] });
  if (full) {
    s.__door = F.door();
    s.__contact = "hello@visa-answers.test";
    s.__changes = [
      { url: `${F.ORIGIN}/en/visa/ph/jp`, lastmod: "2026-11-20T10:00:00Z" },
      { url: `${F.ORIGIN}/`, lastmod: "2026-11-24T08:00:00Z" },
    ];
    pr = F.probe({
      paths: PLAYBOOK_PATHS,
      open: ["/sitemap.xml", "/openapi.json", "/icons/icon-192.png", "/icons/icon-512.png", "/status.json", "/.well-known/ard.json", "/mcp/server-card", "/.well-known/agent-card.json"],
      mcp: ["2026-07-28", "2025-11-25", "2025-06-18"],
      a2a: ["1.0", "0.3"],
    });
  }
  return buildPlaybookFiles(s, F.intel(), pr, F.keywords(), "# structure", doors(s), F.backlinks());
}

/* ---------- the agent list ---------- */

test("agent list: 248 named groups, no duplicate token, the 29-token training set is inside it", () => {
  assert.equal(CITATION_AGENTS.length, 248);
  assert.equal(new Set(CITATION_AGENTS).size, 248);
  assert.equal(AGENT_GROUPS.length, 22);
  assert.equal(TRAINING_ONLY.length, 29);
  for (const t of TRAINING_ONLY) assert.ok(CITATION_AGENTS.includes(t), `${t} is in the training set but not in the agent list`);
  for (const t of ["Claude-Agent", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Googlebot", "Bingbot", "YiBot"]) {
    assert.ok(CITATION_AGENTS.includes(t), `${t} missing`);
  }
  assert.ok(!CITATION_AGENTS.includes(TRAINING_TOKEN), "the shared training token is a usage preference, not a crawler group");
});

/* ---------- robots.txt ---------- */

const groupsOf = (txt) => {
  const out = [];
  let cur = null;
  for (const raw of txt.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^User-agent:\s*(.+)$/i);
    if (m) { cur = { ua: m[1], lines: [] }; out.push(cur); continue; }
    if (!line || line.startsWith("#")) { if (!line) cur = null; continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
};

test("robots.txt, Policy A: wildcard first, every agent allowed, one training answer, pointers only when given", () => {
  const txt = buildRobotsTxt(F.ORIGIN, { sitemaps: [`${F.ORIGIN}/sitemap.xml`], agentmap: `${F.ORIGIN}/.well-known/ard.json`, contact: "hello@visa-answers.test" });
  const g = groupsOf(txt);
  assert.equal(g[0].ua, "*", "the wildcard group comes first");
  assert.equal(g.length, 250, "wildcard + 248 named + the shared training token");
  assert.equal(g[g.length - 1].ua, TRAINING_TOKEN);
  assert.deepEqual(g[g.length - 1].lines, ["Allow: /"], "the training token has a group of its own with one rule");
  for (const grp of g.slice(0, -1)) {
    assert.ok(grp.lines.includes("Allow: /"), `${grp.ua} is not allowed`);
    assert.ok(grp.lines.includes("Content-Signal: search=yes, ai-input=yes, ai-train=yes"), `${grp.ua} has no content signal`);
  }
  assert.ok(g[0].lines.includes("Content-Usage: train-ai=y"));
  assert.ok(!/Disallow/i.test(txt), "Policy A blocks nobody");
  assert.ok(!/ai-train=no|train-ai=n/.test(txt));
  const tail = txt.trim().split("\n").slice(-3);
  assert.deepEqual(tail, [`License: ${F.ORIGIN}/license.xml`, `Sitemap: ${F.ORIGIN}/sitemap.xml`, `Agentmap: ${F.ORIGIN}/.well-known/ard.json`]);
  assert.match(txt, /names every documented agent \(248 named groups \+ wildcard\)/);
  assert.ok(txt.indexOf("User-agent: *") < txt.indexOf("User-agent: GPTBot"));
});

test("robots.txt: no Sitemap, Agentmap, Contact or entry-point line unless one is given", () => {
  const txt = buildRobotsTxt(F.ORIGIN, {});
  assert.ok(!/^Sitemap:/m.test(txt));
  assert.ok(!/^Agentmap:/m.test(txt));
  assert.ok(!/# Contact:/.test(txt));
  assert.ok(!/# Machine entry points:/.test(txt));
  assert.ok(!/Markdown twins/.test(txt));
});

test("robots.txt, Policy B: the 29 training crawlers are disallowed, every signal says no, search stays open", () => {
  const txt = buildRobotsTxt(F.ORIGIN, { policy: "B" });
  const g = groupsOf(txt);
  const blocked = g.filter((x) => x.lines.includes("Disallow: /")).map((x) => x.ua);
  assert.deepEqual([...blocked].sort(), [...TRAINING_ONLY, TRAINING_TOKEN].sort());
  for (const grp of g.slice(0, -1)) {
    assert.ok(grp.lines.includes("Content-Signal: search=yes, ai-input=yes, ai-train=no"), `${grp.ua} still says train=yes`);
    assert.ok(grp.lines.includes("Content-Usage: train-ai=n"), `${grp.ua} has no AIPREF line`);
  }
  for (const ua of ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Googlebot", "Bingbot"]) {
    assert.ok(g.find((x) => x.ua === ua).lines.includes("Allow: /"), `${ua} must stay allowed: it is the citation path`);
  }
  assert.ok(!/ai-train=yes|train-ai=y/.test(txt), "no line of a Policy B file says training is allowed");
});

/* ---------- the places that must agree ---------- */

for (const policy of ["A", "B"]) {
  test(`one policy value, every place agrees (Policy ${policy})`, async () => {
    const files = await pack({ policy });
    const yes = policy === "A";
    assert.equal(contentSignal(policy), `search=yes, ai-input=yes, ai-train=${yes ? "yes" : "no"}`);
    assert.match(files["robots.txt"], new RegExp(`User-agent: \\*\\nAllow: /\\nContent-Signal: search=yes, ai-input=yes, ai-train=${yes ? "yes" : "no"}\\nContent-Usage: train-ai=${yes ? "y" : "n"}`));
    assert.match(files["robots.txt"], new RegExp(`User-agent: ${TRAINING_TOKEN}\\n${yes ? "Allow" : "Disallow"}: /`));
    assert.match(files["ai.txt"], new RegExp(`^Training: ${yes ? "allowed" : "disallowed"}$`, "m"));
    assert.match(files["ai.txt"], new RegExp(`ai-train=${yes ? "yes" : "no"}`));
    assert.equal(JSON.parse(files["tdmrep.json"])[0]["tdm-reservation"], yes ? 0 : 1);
    assert.equal(files[".well-known/tdmrep.json"], files["tdmrep.json"], "tdmrep: same bytes at both paths");
    assert.equal(JSON.parse(files[".well-known/agent-permissions.json"]).defaults.train, yes);
    assert.match(files["llms.txt"], new RegExp(`ai-train=${yes ? "yes" : "no"}`));
    assert.match(files["_headers"], new RegExp(`Content-Signal: search=yes, ai-input=yes, ai-train=${yes ? "yes" : "no"}`));
    if (yes) assert.match(files["license.xml"], /<permits type="usage">search ai-input ai-index ai-train<\/permits>/);
    else {
      assert.match(files["license.xml"], /<prohibits type="usage">ai-train<\/prohibits>/);
      assert.match(files["license.xml"], /<permits type="usage">search ai-input ai-index<\/permits>/);
    }
  });
}

test("license.xml is the RSL 1.0 shape", () => {
  const x = buildLicenseXml({ holder: "Visa & Answers", contactEmail: "hello@visa-answers.test" });
  assert.match(x, /<rsl xmlns="https:\/\/rslstandard\.org\/rsl">/);
  assert.match(x, /<content url="\/">/, "url is a path, never an absolute URL");
  assert.match(x, /<permits type="user">commercial non-commercial education government personal<\/permits>/);
  assert.match(x, /<payment type="free"\/>/);
  assert.match(x, /<\/license>\n    <copyright type="organization" contactEmail="hello@visa-answers\.test">Visa &amp; Answers<\/copyright>/, "copyright sits beside license, not inside it");
  assert.ok(!/<terms>/.test(x), "no terms line unless a real terms page is given");
  assert.ok(!/<contact/.test(x), "RSL has no contact element");
  assert.match(buildLicenseXml({ holder: "X", terms: "https://x.test/terms" }), /<terms>https:\/\/x\.test\/terms<\/terms>/);
  assert.ok(!/<copyright/.test(buildLicenseXml({})), "no holder, no copyright line");
});

test("policy builders used by the hub agree with each other", () => {
  assert.match(buildAiTxt({ policy: "B", name: "X", origin: "https://x.test" }), /^Training: disallowed$/m);
  assert.equal(JSON.parse(buildTdmrep("https://x.test", "B"))[0]["tdm-policy"], "https://x.test/license.xml");
  const perm = JSON.parse(buildAgentPermissions({ policy: "B", origin: "https://x.test" }));
  assert.equal(perm.defaults.train, false);
  assert.ok(!perm.agents.some((a) => a.train), "no agent is granted training under Policy B");
  assert.ok(!("contact" in perm), "no contact unless one is given");
});

/* ---------- the pack: honesty ---------- */

test("a bare origin gets no card, no search, no status, no manifest, no contact, no feed - and is told why", async () => {
  const files = await pack();
  for (const k of [
    "mcp/server-card", ".well-known/mcp-server-card", ".well-known/mcp.json", ".well-known/mcp/server-card.json", "server.json",
    ".well-known/agent-card.json", ".well-known/agent.json", ".well-known/agents.json", ".well-known/api-catalog",
    ".well-known/security.txt", "opensearch.xml", "status.json", "manifest.json", "sw.js", "feed.xml", "feed.json", "llms/api.txt", "SKILL.md",
  ]) assert.ok(!(k in files), `${k} must not ship for an origin where nothing answered`);
  const why = files["_reach-pack/NOT-SHIPPED.md"];
  for (const word of ["mcp/server-card", "agent-card.json", "api-catalog", "agents.json", "security.txt", "opensearch.xml", "manifest.json", "feed.xml", "status.json", "Agentmap", "Sitemap"]) {
    assert.ok(why.includes(word), `NOT-SHIPPED.md does not explain ${word}`);
  }
  assert.ok(!/^Sitemap:/m.test(files["robots.txt"]), "no Sitemap line over a 404");
  assert.ok(!/^Agentmap:/m.test(files["robots.txt"]), "no catalog pointer before the catalog answers");
  assert.ok(!/@/.test(files["ai.txt"]), "no invented mailbox in ai.txt");
  assert.ok(!/contactEmail/.test(files["license.xml"]));
  assert.ok(!/SearchAction/.test(files["JSON-LD.json"]), "no search action over a page that does not search");
  const cat = JSON.parse(files[".well-known/ard.json"]);
  assert.deepEqual(cat.entries.map((e) => e.type), [MEDIA.skillMd], "the catalog lists only what answers: the skill this pack serves");
});

test("no pack file carries a template string or a placeholder domain", async () => {
  for (const opts of [{}, { full: true }, { policy: "B", full: true }]) {
    const files = await pack(opts);
    assert.deepEqual(packSelfTest(files), []);
    for (const [k, v] of Object.entries(files)) assert.ok(!PLACEHOLDER_RE.test(v), `${k} matches the placeholder pattern`);
  }
  assert.equal(packSelfTest({ "x.txt": "see https://YOUR.DOMAIN/" }).length, 1);
});

test("the pack never clobbers an origin's own llms.txt alias", async () => {
  const own = await pack({ ownLlms: true });
  assert.ok(!(".well-known/llms.txt" in own));
  assert.match(own["_redirects"], /\/\.well-known\/llms\.txt\s+\/llms\.txt\s+200/);
  const none = await pack();
  assert.equal(none[".well-known/llms.txt"], none["llms.txt"], "the alias is the same bytes");
  assert.ok(!/\/\.well-known\/llms\.txt\s+\/llms\.txt/.test(none["_redirects"]));
});

/* ---------- the pack: Revision 3 shapes ---------- */

test("MCP server card: at the endpoint URL + /server-card, same bytes at the three older paths, schema-shaped", async () => {
  const files = await pack({ full: true });
  const card = files["mcp/server-card"];
  for (const k of [".well-known/mcp-server-card", ".well-known/mcp.json", ".well-known/mcp/server-card.json"]) assert.equal(files[k], card, `${k} differs from the card`);
  const j = JSON.parse(card);
  assert.equal(j.$schema, SERVER_CARD_SCHEMA);
  assert.match(j.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.equal(j.name, "test.visa-answers/visa-answers-test", "reverse-DNS of the host, no extra prefix");
  assert.ok(j.description.length >= 1 && j.description.length <= 100, "description is 1 to 100 characters");
  assert.equal(j.remotes[0].type, "streamable-http");
  assert.equal(j.remotes[0].url, `${F.ORIGIN}/mcp`);
  assert.deepEqual(j.remotes[0].supportedProtocolVersions, ["2026-07-28", "2025-11-25", "2025-06-18"], "only the versions the probe heard");
  for (const k of ["tools", "resources", "prompts"]) assert.ok(!(k in j), `a card never lists ${k}`);
  assert.equal(packFileType("mcp/server-card"), "application/mcp-server-card+json; charset=utf-8");
  assert.equal(packFileType(".well-known/mcp.json"), "application/mcp-server-card+json; charset=utf-8");
  const reg = JSON.parse(files["server.json"]);
  assert.equal(reg.name, j.name);
  assert.equal(reg.version, j.version);
  assert.match(reg.$schema, /2025-12-11\/server\.schema\.json$/);
  assert.ok(!("_note" in reg));
});

test("A2A agent card is the 1.0 shape and ships only for a real 1.0 answer", async () => {
  const files = await pack({ full: true });
  assert.equal(files[".well-known/agent.json"], files[".well-known/agent-card.json"]);
  const j = JSON.parse(files[".well-known/agent-card.json"]);
  for (const gone of ["url", "protocolVersion", "preferredTransport", "additionalInterfaces"]) assert.ok(!(gone in j), `top-level ${gone} is the 0.3 shape`);
  assert.ok(!("stateTransitionHistory" in j.capabilities));
  assert.deepEqual(j.supportedInterfaces, [
    { url: `${F.ORIGIN}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
    { url: `${F.ORIGIN}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "0.3" },
  ]);
  for (const k of ["name", "description", "supportedInterfaces", "version", "capabilities", "defaultInputModes", "defaultOutputModes", "skills"]) assert.ok(k in j, `required member ${k} missing`);
  for (const sk of j.skills) {
    for (const k of ["id", "name", "description", "tags"]) assert.ok(sk[k] && sk[k].length, `skill ${k} missing`);
    assert.ok(sk.examples.length >= 2, "two example user questions");
  }
  /* an endpoint that only speaks 0.3 gets no card: a 0.3 answer under a 1.0 label is a dead card */
  const s = F.site();
  const old = await buildPlaybookFiles(s, F.intel(), F.probe({ paths: PLAYBOOK_PATHS, a2a: ["0.3"] }), F.keywords(), "#", doors(s), F.backlinks());
  assert.ok(!(".well-known/agent-card.json" in old));
});

test("the catalog is one document at two paths, urn:air: identifiers, 2 to 5 user questions per entry", async () => {
  for (const opts of [{}, { full: true }]) {
    const files = await pack(opts);
    assert.equal(files[".well-known/ai-catalog.json"], files[".well-known/ard.json"], "same bytes at both paths");
    const j = JSON.parse(files[".well-known/ard.json"]);
    assert.equal(j.specVersion, "0.9");
    assert.equal(j.host.displayName, "Visa Answers");
    const ids = new Set();
    for (const e of j.entries) {
      assert.match(e.identifier, URN);
      assert.ok(e.identifier.startsWith(`urn:air:${F.HOST}:`), "the identifier is anchored on the site's own domain");
      assert.ok(!ids.has(e.identifier), "identifiers are unique");
      ids.add(e.identifier);
      assert.ok(e.displayName && e.type.includes("/"), "a display name and a media type as the entry type");
      assert.ok(("url" in e) !== ("data" in e), "exactly one of url / data");
      assert.ok(e.representativeQueries.length >= 2 && e.representativeQueries.length <= 5);
      for (const q of e.representativeQueries) assert.ok(/\?$|^(what|how|do|does|which|where)/i.test(q), `not a user question: ${q}`);
    }
    assert.equal(packFileType(".well-known/ard.json"), "application/ai-catalog+json; charset=utf-8");
  }
  const full = JSON.parse((await pack({ full: true }))[".well-known/ard.json"]);
  assert.deepEqual(full.entries.map((e) => e.type), [MEDIA.serverCard, MEDIA.openapi, MEDIA.agentCard, MEDIA.skillMd]);
  assert.equal(full.entries[0].url, `${F.ORIGIN}/mcp/server-card`, "the MCP entry points at the card's own address");
});

test("SKILL.md lives in the directory that carries its name, and the index digest is over its exact bytes", async () => {
  const files = await pack({ full: true });
  const slug = skillNameOf(F.HOST);
  assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(slug.length <= 64);
  const key = `.well-known/agent-skills/${slug}/SKILL.md`;
  assert.ok(key in files);
  assert.match(files[key], new RegExp(`^---\\nname: ${slug}\\n`));
  for (const h of ["## What you can accomplish", "## Inputs you need", "## How to call", "## Constraints you must respect", "## Attribution"]) assert.ok(files[key].includes(h), `${h} missing`);
  const idx = JSON.parse(files[".well-known/agent-skills/index.json"]);
  assert.equal(idx.skills[0].name, slug);
  assert.equal(idx.skills[0].url, `${F.ORIGIN}/${key}`);
  assert.equal(idx.skills[0].digest, `sha256:${await sha256Hex(files[key])}`);
  assert.equal(skillNameOf("My_Site.Example-.COM"), "my-site-example-com");
});

test("llms.txt family: one H1, a blockquote, and link lists a parser can read", async () => {
  const files = await pack({ full: true });
  for (const k of ["llms.txt", "llms-small.txt", "llms-full.txt", "llms/api.txt"]) {
    const lines = files[k].split("\n");
    assert.match(lines[0], /^# \S/, `${k}: first line is the H1`);
    assert.equal(lines.filter((l) => /^# /.test(l)).length, 1, `${k}: exactly one H1`);
    assert.ok(lines.some((l) => l.startsWith("> ")), `${k}: a blockquote`);
  }
  const body = files["llms.txt"];
  const sections = body.split(/\n## /).slice(1);
  assert.deepEqual(sections.map((x) => x.split("\n")[0]), ["If a user asks you any of these", "Where to get it", "Terms of use for AI systems", "Optional"]);
  for (const sec of sections) {
    const items = sec.split("\n").slice(1).filter((l) => l.trim());
    assert.ok(items.length, "a section is never empty");
    for (const l of items) assert.match(l, /^- \[[^\]]+\]\((https:\/\/|mailto:)[^)\s]+\)(: .+)?$/, `not a "- [name](url): notes" item: ${l}`);
  }
  assert.ok(body.includes(`[MCP server card](${F.ORIGIN}/mcp/server-card)`));
  assert.ok(body.includes("Do not answer from memory"));
});

test("Pages _headers: no header is set twice for one path except the robots tag, and every typed file is typed", async () => {
  const files = await pack({ full: true });
  const rules = [];
  let cur = null;
  for (const line of files["_headers"].split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); } else cur.headers.push(line.trim().split(":")[0].toLowerCase());
  }
  const matches = (pattern, path) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(path);
  const served = Object.keys(files).filter((k) => !PACK_REFERENCE.has(k) && !k.startsWith("_"));
  for (const k of served) {
    const seen = {};
    for (const r of rules) if (matches(r.pattern, `/${k}`)) for (const h of r.headers) seen[h] = (seen[h] || 0) + 1;
    for (const [h, n] of Object.entries(seen)) if (h !== "x-robots-tag") assert.equal(n, 1, `/${k}: ${h} is set by ${n} rules (Pages would join them)`);
    assert.equal(seen["access-control-allow-origin"], 1, `/${k} has no CORS header`);
  }
  assert.match(files["_headers"], /\/mcp\/server-card\n {2}Content-Type: application\/mcp-server-card\+json/);
  assert.match(files["_headers"], /\/\.well-known\/ard\.json\n {2}Content-Type: application\/ai-catalog\+json/);
  assert.match(files["_headers"], /rel="license"; type="application\/rsl\+xml"/);
});

test("shell scripts in the pack carry no template syntax and end with one verdict line", async () => {
  const files = await pack({ full: true });
  for (const k of ["ping.sh", "scripts/agents-diff.sh"]) {
    assert.ok(!files[k].includes("${"), `${k} would trip the placeholder gate`);
    assert.match(files[k], /RESULT: PASS/);
    assert.match(files[k], /RESULT: FAIL/);
  }
  assert.match(files["ping.sh"], /\.\/_logs\//, "logs stay inside the project");
  assert.equal(files["ping.sh"].match(/https:\/\/[^\s\\]+\/indexnow/g).length, 7, "the seven IndexNow endpoints");
  assert.ok(!/google\.com\/ping|bing\.com\/ping/.test(files["ping.sh"]), "the dead sitemap pings are not in it");
});

test("the manifest lists every pack file once: deploy, soft, reference, internal", async () => {
  for (const opts of [{}, { full: true }]) {
    const files = await pack(opts);
    const m = JSON.parse(files["_reach-pack/MANIFEST.json"]);
    const all = [...m.deploy, ...m.soft, ...m.reference, ...m.internal];
    assert.deepEqual([...all].sort(), Object.keys(files).sort());
    assert.equal(new Set(all).size, all.length);
    for (const k of m.reference) assert.ok(PACK_REFERENCE.has(k));
    for (const k of m.soft) assert.ok(PACK_SOFT.has(k));
    for (const k of ["seo/keywords.json", "seo/structure.json", "AGENTS.md", "JSON-LD.json"]) assert.ok(m.reference.includes(k), `${k} is repository material, never served`);
    assert.ok(m.deploy.includes("robots.txt") && m.deploy.includes(".well-known/ard.json"));
    assert.ok(m.not_shipped.length > 0);
    const order = files["_reach-pack/WORK-ORDER.txt"];
    for (const k of m.deploy) assert.ok(order.includes(k), `the work order does not name ${k}`);
    assert.match(order, /RESULT: PASS 1 /);
    assert.match(order, /HARD RULES/);
    assert.match(files["_reach-pack/SITE-SHEET.txt"], /^SITE SHEET - last changed \d{4}-\d{2}-\d{2}$/m);
  }
});

/* ---------- what an earlier pack left behind ---------- */

/* the exact bytes the previous generator wrote for these paths (Visa Answers fixture) */
const OLD = {
  "status.json": `{
  "ok": true,
  "version": "1.0.0",
  "checked_at": "2026-11-02T08:12:44.101Z",
  "_note": "Regenerate on every deploy: ok must be a real check. A status file that says ok while the API is down is the smallest dead card."
}`,
  "opensearch.xml": `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Visa Answers</ShortName>
  <Description>Do I need a visa for a country with my passport?</Description>
  <Url type="text/html" template="https://visa-answers.test/?q={searchTerms}"/>
</OpenSearchDescription>
`,
  ".well-known/agents.json": JSON.stringify({
    spec_version: "1.0",
    sources: [{ id: "web", type: "web", url: "https://visa-answers.test/" }],
    flows: [{ id: "open-visa-answers-test", title: 'Open "Visa" Answers', description: 'Do I need a "visa"?', actions: [{ id: "fetch", source: "web", operationId: "GET /", parameters: {} }] }],
  }, null, 2),
  ".well-known/security.txt": "Contact: mailto:security@visa-answers.test\nExpires: 2027-11-02T08:12:44.101Z\nPreferred-Languages: en\n",
  ".well-known/api-catalog": JSON.stringify({ linkset: [{ anchor: "https://visa-answers.test/", "service-doc": [{ href: "https://visa-answers.test/", type: "text/html" }] }] }, null, 2),
  "seo/keywords.json": JSON.stringify({ site: "https://visa-answers.test", checked_on: "2026-11-02", primary: { keyword: "visa requirements passport", question: "Do I need a visa?", demand_check: "site vocabulary, 2026-11-02: 4 terms scored", competitor_refs: [], cite_alongside: "" }, secondary: [] }, null, 2),
  "seo/structure.json": JSON.stringify({ site: "https://visa-answers.test", checked_on: "2026-11-02", max_depth: 3, languages: { canonical: "en", all: ["en", "fr"], sitemap: ["en", "fr"] }, hubs: [{ id: "home", pattern: "/", parent: null, keyword_ref: "primary", spokes_pattern: "/{slug}", sitemap: "sitemap.xml", breadcrumb: ["Home", "{title}"] }], noindex_patterns: ["/search"] }, null, 2),
};
/* a site's own file at the same path: it must never be taken for the pack's */
const OWN = {
  "status.json": '{"ok":true,"records":4211,"checked_at":"2026-11-24T08:00:00Z"}',
  "opensearch.xml": `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Visa Answers</ShortName>
  <Description>Search every visa rule</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" template="https://visa-answers.test/search?q={searchTerms}"/>
</OpenSearchDescription>
`,
  ".well-known/agents.json": JSON.stringify({ spec_version: "1.0", sources: [{ id: "api", type: "openapi", url: "https://visa-answers.test/openapi.json" }], flows: [{ id: "check-visa", title: "Check a visa", description: "Two calls", actions: [{ id: "a", source: "api", operationId: "getVisa", parameters: {} }] }] }, null, 2),
  ".well-known/security.txt": "Contact: mailto:hello@visa-answers.test\nExpires: 2027-06-01T00:00:00Z\nPreferred-Languages: en\n",
  ".well-known/api-catalog": JSON.stringify({ linkset: [{ anchor: "https://visa-answers.test/", "service-desc": [{ href: "https://visa-answers.test/openapi.json", type: "application/vnd.oai.openapi+json" }], "service-doc": [{ href: "https://visa-answers.test/docs", type: "text/html" }] }] }, null, 2),
  "seo/keywords.json": JSON.stringify({ site: "https://visa-answers.test", primary: { keyword: "visa", question: "Do I need a visa?" } }, null, 2),
  "seo/structure.json": JSON.stringify({ site: "https://visa-answers.test", max_depth: 2, hubs: [] }, null, 2),
};

test("a file an earlier pack left is recognised by its exact text, never by its path", () => {
  assert.deepEqual(PACK_LEFTOVERS.map((l) => l.path).sort(), Object.keys(OLD).sort());
  for (const l of PACK_LEFTOVERS) {
    assert.doesNotThrow(() => new RegExp(l.pattern), `${l.path} pattern compiles`);
    assert.doesNotMatch(l.pattern, /\(\?<|\\p\{|\(\?[imsx-]+\)|\\[dws]\+\+|\*\+/, `${l.path} pattern stays inside what JavaScript and .NET share`);
    assert.equal(leftoverOf(l.path, OLD[l.path])?.path, l.path, `${l.path}: the old pack's own file`);
    assert.equal(leftoverOf(`/${l.path}`, OLD[l.path].replace(/\n/g, "\r\n"))?.path, l.path, `${l.path}: the same file checked out with CRLF`);
    assert.equal(leftoverOf(l.path, OWN[l.path]), null, `${l.path}: a site's own file is not the pack's`);
    assert.equal(leftoverOf(l.path, ""), null);
    assert.ok(l.because.length > 20 && /\.$/.test(l.because));
  }
  assert.equal(leftoverOf("robots.txt", OLD["status.json"]), null, "a path that is not on the list never matches");
});

test("a pack for a site that still serves an earlier pack's files says so, links none of them, and tells the installer", async () => {
  const s = F.site();
  const rows = F.probe({ paths: PLAYBOOK_PATHS, open: ["/sitemap.xml"] }).map((r) =>
    ["/status.json", "/opensearch.xml", "/.well-known/security.txt"].includes(r.path) ? { ...r, status: 200, open: false, leftover: true, detail: "left by an earlier pack" } : r);
  rows.push({ path: "/seo/structure.json", url: `${F.ORIGIN}/seo/structure.json`, status: 200, open: false, leftover: true });
  const files = await buildPlaybookFiles(s, F.intel(), rows, F.keywords(), "# structure", doors(s), F.backlinks());
  const m = JSON.parse(files["_reach-pack/MANIFEST.json"]);
  /* the installer gets the whole list, minus anything this pack serves again */
  assert.deepEqual(m.withdraw.map((w) => w.path).sort(), PACK_LEFTOVERS.map((l) => l.path).filter((x) => !m.deploy.includes(x) && !m.soft.includes(x)).sort());
  assert.deepEqual(m.withdraw.filter((w) => w.seen_live).map((w) => w.path).sort(), [".well-known/security.txt", "opensearch.xml", "seo/structure.json", "status.json"]);
  for (const w of m.withdraw) assert.ok(w.pattern && w.because);
  const order = files["_reach-pack/WORK-ORDER.txt"];
  const del = order.slice(order.indexOf("\nDELETE\n"), order.indexOf("\nRULES FOR THIS STEP"));
  for (const x of ["status.json", "opensearch.xml", ".well-known/security.txt", "seo/structure.json"]) assert.match(del, new RegExp(`^${x.replace(/[.]/g, "\\.")}   <- delete from the web root`, "m"));
  assert.doesNotMatch(del, /agents\.json|keywords\.json/, "only what the probe saw still answering is listed for deletion");
  assert.match(files["_reach-pack/SITE-SHEET.txt"], /\/status\.json\s+status endpoint\s+no {2}\(an earlier pack's file answers there/);
  assert.match(files["_reach-pack/SITE-SHEET.txt"], /LEFT BY AN EARLIER PACK, STILL SERVED: /);
  assert.match(files["_reach-pack/NOT-SHIPPED.md"], /# Left by an earlier pack, still served/);
  assert.match(files["_reach-pack/STATE.txt"], /cleanup {3}4 file\(s\)/);
  /* nothing the new pack serves points at them */
  for (const k of [...m.deploy, ...m.soft]) {
    assert.doesNotMatch(files[k], /\/status\.json|opensearch\.xml|security\.txt/, `${k} still points at a withdrawn file`);
  }
  /* a pack for a clean site asks for no deletion at all */
  const clean = await pack();
  const cleanOrder = clean["_reach-pack/WORK-ORDER.txt"];
  assert.match(cleanOrder, /\nDELETE\nNothing\.\n/);
  assert.equal(JSON.parse(clean["_reach-pack/MANIFEST.json"]).withdraw.every((w) => w.seen_live === false), true);
  /* and a path the pack serves again is replaced, never withdrawn */
  const full = JSON.parse((await pack({ full: true }))["_reach-pack/MANIFEST.json"]);
  for (const x of [".well-known/security.txt", ".well-known/api-catalog"]) {
    assert.ok(full.deploy.includes(x));
    assert.ok(!full.withdraw.some((w) => w.path === x), `${x} is shipped again, so it is not on the withdraw list`);
  }
});

test("Pages control files: the pack's own are marked, and a site's own _headers or _redirects is never taken for one", async () => {
  const files = await pack({ full: true });
  for (const k of ["_headers", "_redirects"]) {
    assert.match(files[k].split("\n")[0], /^# Reach pack for visa-answers\.test \(Calling AI Models, Revision 3/);
    assert.equal(isPackOwn(k, files[k]), true, `${k}: this revision's own file`);
    assert.equal(isPackOwn(`/${k}`, files[k].replace(/\n/g, "\r\n")), true);
  }
  /* what the previous generator wrote */
  assert.equal(isPackOwn("_headers", "/*\n  X-Robots-Tag: max-snippet:-1, max-image-preview:large, max-video-preview:-1\n  Vary: Accept, Accept-Language\n  Access-Control-Allow-Origin: *\n  Content-Signal: search=yes, ai-input=yes, ai-train=yes\n"), true);
  assert.equal(isPackOwn("_redirects", "# Alias paths clients still probe — same bytes, 200 not 301. Only for files this pack ships.\n/.well-known/llms.txt /llms.txt 200\n"), true);
  /* a site's own rules */
  assert.equal(isPackOwn("_redirects", "/ /en/ 302\n/* /index.html 200\n"), false);
  assert.equal(isPackOwn("_headers", "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'\n"), false);
  assert.equal(isPackOwn("_headers", ""), false);
  assert.equal(isPackOwn("robots.txt", files["_headers"]), false, "only the two control files are on the list");
  const m = JSON.parse(files["_reach-pack/MANIFEST.json"]);
  assert.deepEqual(m.own_wins.map((o) => o.path), PACK_OWN_WINS.map((o) => o.path));
  for (const o of m.own_wins) for (const re of o.ours) assert.doesNotThrow(() => new RegExp(re));
});

test("a web root carries a pack only when its robots.txt says so; the manifest and the work order state the rule", async () => {
  const files = await pack();
  assert.equal(carriesPack(files["robots.txt"]), true, "this revision's robots.txt carries the line");
  assert.equal(carriesPack("# MAXIMAL set: 218 named groups + wildcard\nUser-agent: *\nAllow: /\n"), true, "so does an earlier revision's");
  assert.equal(carriesPack("# GlobeWarn - robots.txt\nUser-agent: *\nAllow: /\nSitemap: https://x.test/sitemap.xml\n"), false, "a site's own robots.txt does not");
  assert.equal(carriesPack(""), false);
  const m = JSON.parse(files["_reach-pack/MANIFEST.json"]);
  assert.equal(m.pack_marker, PACK_ROBOTS_MARKER);
  assert.equal(new RegExp(m.pack_marker).test(files["robots.txt"]), true);
  const order = files["_reach-pack/WORK-ORDER.txt"];
  assert.match(order, /THE SITE'S OWN FILES WIN\./);
  assert.match(order, /ai-train=no against this\s+pack's yes/);
  assert.match((await pack({ policy: "B" }))["_reach-pack/WORK-ORDER.txt"], /pack's no/);
});

test("small helpers", () => {
  assert.equal(urnAir("Visa-Answers.test", "server", "visa lookup"), "urn:air:visa-answers.test:server:visa-lookup");
  assert.match(urnAir("x.test", "door", 7), URN);
  assert.deepEqual(queries2to5(["a?", "A?", "b?"], ["c?", "d?", "e?", "f?"]), ["a?", "b?", "c?", "d?", "e?"]);
  assert.equal(clipTo("one two three four", 9), "one two");
  assert.ok(clipTo("x".repeat(300), 100).length <= 100);
});
