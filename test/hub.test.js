/* The hub's own surface, called in-process: the Worker's fetch handler against an in-memory database
   (test/d1-shim.js, Node's built-in SQLite). No network, no wrangler. Run: npm test
   On a Node without node:sqlite (before 22.5) these tests are skipped, not failed. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb } from "./d1-shim.js";
import { seedAtlas } from "./seed.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE = "https://hub.test";
const URN = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

let worker = null;
let env = null;
let S = null; // src/surfaces.js
let skip = false;

before(async () => {
  let DB;
  try {
    DB = await openDb(`${ROOT}schema.sql`);
  } catch (err) {
    skip = `node:sqlite is not available on this Node (${process.version}): ${String(err?.message || err).slice(0, 80)}`;
    return;
  }
  worker = (await import("../src/index.js")).default;
  S = await import("../src/surfaces.js");
  env = { DB, REACH_PUBLIC_URL: BASE, INDEXNOW_KEY: "0123456789abcdef0123456789abcdef", ADMIN_TOKEN: "test-token" };
  const now = "2026-11-20T10:00:00.000Z";
  const add = (id, name, url, n, active = 1) =>
    DB.prepare("INSERT INTO sites (id, name, url, languages_wanted, indexnow_key, created_at, updated_at, active, description, door_n) VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?, ?)")
      .bind(id, name, url, `k${n}0123456789abcdef`, now, now, active, `${name} answers one question.`, n)
      .run();
  await add("s1", "Visa Answers", "https://visa-answers.test/", 1);
  await add("s2", "Cheap Flights", "https://cheap-flights.test/", 2);
  await add("s3", "Globe Warn", "https://globe-warn.test/", 3);
  await seedAtlas(worker, env, BASE, [{ id: "s1", n: 1, key: "visa" }, { id: "s2", n: 2, key: "flights" }, { id: "s3", n: 3, key: "warn" }]);
});

const ctx = { waitUntil() {} };
const call = (path, init = {}) => worker.fetch(new Request(BASE + path, init), env, ctx);
const get = async (path, headers = {}) => {
  const res = await call(path, { headers });
  return { res, status: res.status, type: res.headers.get("content-type") || "", text: await res.text() };
};
const post = async (path, body, headers = {}) => {
  const res = await call(path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { res, status: res.status, text, json };
};
const t = (name, fn) => test(name, async (ctx2) => (skip ? ctx2.skip(skip) : fn(ctx2)));

/* ---------- every declared path answers ---------- */

t("every fixed public path the hub declares answers 200", async () => {
  const { SELF_OPEN } = await import("../src/self.js");
  for (const p of SELF_OPEN) {
    const path = p === "/api/oembed" ? `/api/oembed?url=${encodeURIComponent(`${BASE}/1`)}` : p;
    const r = await call(path);
    assert.equal(r.status, 200, `${p} answered ${r.status}`);
  }
  assert.equal((await call("/no-such-page")).status, 404, "an unknown path is a real 404");
  assert.equal((await call("/999")).status, 404, "an unknown door is a real 404");
  assert.equal((await call("/999.md")).status, 404, "a missing twin is a real 404");
});

/* ---------- one policy, every place ---------- */

t("the places that must agree all say the hub's one policy", async () => {
  const yes = S.POLICY === "A";
  const signal = `search=yes, ai-input=yes, ai-train=${yes ? "yes" : "no"}`;
  const robots = (await get("/robots.txt")).text;
  assert.match(robots, new RegExp(`User-agent: \\*\\nAllow: /\\nContent-Signal: ${signal}\\nContent-Usage: train-ai=${yes ? "y" : "n"}\\n`));
  assert.equal(robots.match(/^Content-Signal: .*$/gm).length, 249, "wildcard + 248 named groups each carry the signal");
  assert.ok(robots.match(/^Content-Signal: .*$/gm).every((l) => l === `Content-Signal: ${signal}`), "every Content-Signal line says the same thing");
  assert.match(robots, new RegExp(`User-agent: __usage_ai-training\\n${yes ? "Allow" : "Disallow"}: /`));
  assert.match((await get("/ai.txt")).text, new RegExp(`^Training: ${yes ? "allowed" : "disallowed"}$`, "m"));
  const lic = (await get("/license.xml")).text;
  assert.match(lic, yes ? /<permits type="usage">search ai-input ai-index ai-train<\/permits>/ : /<prohibits type="usage">ai-train<\/prohibits>/);
  const tdm = JSON.parse((await get("/tdmrep.json")).text);
  assert.equal(tdm[0]["tdm-reservation"], yes ? 0 : 1);
  assert.equal((await get("/.well-known/tdmrep.json")).text, (await get("/tdmrep.json")).text);
  assert.equal(JSON.parse((await get("/.well-known/agent-permissions.json")).text).defaults.train, yes);
  assert.match((await get("/llms.txt")).text, new RegExp(`ai-train=${yes ? "yes" : "no"}`));
  for (const p of ["/", "/1", "/1.md", "/llms.txt", "/openapi.json", "/mcp/server-card"]) {
    assert.equal((await call(p)).headers.get("content-signal"), signal, `${p}: Content-Signal header`);
  }
});

t("robots.txt: wildcard first, both sitemaps and the catalog named, every pointer answers", async () => {
  const robots = (await get("/robots.txt")).text;
  assert.ok(robots.indexOf("User-agent: *") < robots.indexOf("User-agent: GPTBot"));
  assert.deepEqual(robots.trim().split("\n").slice(-4), [`License: ${BASE}/license.xml`, `Sitemap: ${BASE}/sitemap.xml`, `Sitemap: ${BASE}/sitemap-md.xml`, `Agentmap: ${BASE}/.well-known/ard.json`]);
  const pointers = [...robots.matchAll(/^#\s+(https:\/\/\S+)$/gm)].map((m) => m[1]);
  assert.ok(pointers.length >= 7);
  for (const u of [...pointers, `${BASE}/sitemap.xml`, `${BASE}/sitemap-md.xml`, `${BASE}/.well-known/ard.json`, `${BASE}/license.xml`]) {
    assert.equal((await call(u.slice(BASE.length))).status, 200, `robots.txt points at ${u}`);
  }
  assert.ok(!/Disallow/.test(robots) || S.POLICY === "B");
});

t("license.xml is RSL 1.0: a path, the holder beside the licence, ai-index kept, no dead terms link", async () => {
  const { text, type } = await get("/license.xml");
  assert.match(type, /^application\/rsl\+xml/);
  assert.match(text, /<content url="\/">/);
  assert.match(text, new RegExp(`<copyright type="organization" contactEmail="[^"]+">${S.PUBLISHER}</copyright>`));
  assert.ok(text.includes(`contactEmail="${S.CONTACT}"`));
  assert.ok(!/<terms>/.test(text));
  assert.ok(text.indexOf("</license>") < text.indexOf("<copyright"));
});

/* ---------- the MCP server card ---------- */

t("MCP server card: its own address, the right type, the same bytes at every alias, an ETag that answers 304", async () => {
  const card = await get("/mcp/server-card");
  assert.equal(card.status, 200);
  assert.match(card.type, /^application\/mcp-server-card\+json/);
  for (const p of S.MCP_CARD_PATHS) {
    const r = await get(p);
    assert.equal(r.text, card.text, `${p} is not the same bytes`);
    assert.match(r.type, /^application\/mcp-server-card\+json/, `${p} content type`);
  }
  const j = JSON.parse(card.text);
  assert.equal(j.$schema, "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
  assert.equal(j.name, S.MCP_NAME);
  assert.match(j.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.ok(j.description.length >= 1 && j.description.length <= 100, `description is ${j.description.length} characters`);
  assert.ok(j.title.length <= 100);
  assert.equal(j.version, S.MCP_VERSION);
  assert.deepEqual(j.remotes, [{ type: "streamable-http", url: `${BASE}/mcp`, supportedProtocolVersions: [S.MCP_MODERN, ...S.MCP_LEGACY] }]);
  for (const k of ["tools", "resources", "prompts"]) assert.ok(!(k in j));
  /* headers the extension asks for: open CORS for GET, If-None-Match allowed, ETag exposed, cacheable */
  const h = card.res.headers;
  assert.equal(h.get("access-control-allow-origin"), "*");
  assert.match(h.get("access-control-allow-methods"), /GET/);
  assert.match(h.get("access-control-allow-headers"), /If-None-Match/i);
  assert.match(h.get("access-control-expose-headers"), /ETag/i);
  assert.match(h.get("cache-control"), /public, max-age=3600/);
  assert.equal(h.get("x-robots-tag"), "noindex");
  const etag = h.get("etag");
  assert.ok(etag);
  const again = await call("/mcp/server-card", { headers: { "if-none-match": etag } });
  assert.equal(again.status, 304);
  /* the registry listing says the same name and version */
  const reg = JSON.parse((await get("/server.json")).text);
  assert.equal(reg.name, j.name);
  assert.equal(reg.version, j.version);
  assert.match(reg.$schema, /2025-12-11\/server\.schema\.json$/);
  assert.ok(reg.description.length <= 100);
});

/* ---------- /mcp: the card says what the endpoint says ---------- */

const META = (v) => ({ "io.modelcontextprotocol/protocolVersion": v, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} });
const modern = (method, params = {}, extra = {}) =>
  post("/mcp", { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META("2026-07-28") } }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, ...extra });

t("MCP 2026-07-28: server/discover is the schema's shape and agrees with the card", async () => {
  const d = await modern("server/discover");
  assert.equal(d.status, 200);
  const r = d.json.result;
  assert.equal(r.resultType, "complete");
  assert.deepEqual(r.supportedVersions, [S.MCP_MODERN, ...S.MCP_LEGACY]);
  assert.equal(typeof r.ttlMs, "number");
  assert.ok(r.ttlMs >= 0);
  assert.ok(["public", "private"].includes(r.cacheScope));
  assert.ok(r.capabilities.tools && r.capabilities.resources);
  assert.deepEqual(r._meta["io.modelcontextprotocol/serverInfo"], { name: S.MCP_NAME, version: S.MCP_VERSION });
  /* the names earlier drafts used are still there for clients built from them */
  assert.deepEqual(r.supportedProtocolVersions, r.supportedVersions);
  assert.equal(r.serverInfo.name, S.MCP_NAME);
  const card = JSON.parse((await get("/mcp/server-card")).text);
  assert.deepEqual(card.remotes[0].supportedProtocolVersions, r.supportedVersions, "the card lists exactly what the endpoint speaks");
  assert.equal(card.name, r._meta["io.modelcontextprotocol/serverInfo"].name);
  assert.equal(card.version, r._meta["io.modelcontextprotocol/serverInfo"].version);
  /* every version it advertises answers when a client names it */
  for (const v of r.supportedVersions) {
    const x = await post("/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: META(v) } }, { "MCP-Protocol-Version": v, "Mcp-Method": "tools/list" });
    assert.ok(Array.isArray(x.json.result?.tools), `version ${v} does not answer tools/list`);
  }
  /* the POST alias on the well-known path answers too */
  const alias = await post("/.well-known/mcp-server", { jsonrpc: "2.0", id: 3, method: "server/discover", params: { _meta: META("2026-07-28") } }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover" });
  assert.deepEqual(alias.json.result.supportedVersions, r.supportedVersions);
});

t("MCP 2026-07-28: tools, header validation, errors", async () => {
  const { TOOLS } = await import("../src/mcp.js");
  assert.deepEqual(TOOLS.map((x) => x.name), S.MCP_TOOL_NAMES, "the tool list and the catalog's capability list are one list");
  const list = await modern("tools/list");
  assert.equal(list.json.result.resultType, "complete");
  assert.deepEqual(list.json.result.tools.map((x) => x.name), S.MCP_TOOL_NAMES);
  assert.equal(typeof list.json.result.ttlMs, "number");
  assert.equal(list.json.result.cacheScope, "public");
  const door = await modern("tools/call", { name: "door", arguments: { n: 1 } }, { "Mcp-Name": "door" });
  assert.equal(door.status, 200);
  assert.equal(door.json.result.structuredContent.name, "Visa Answers");
  assert.equal(door.json.result.structuredContent.source_url, "https://visa-answers.test/");
  assert.equal(door.json.result.isError, false);
  const none = await modern("tools/call", { name: "door", arguments: { n: 999 } }, { "Mcp-Name": "door" });
  assert.equal(none.json.result.structuredContent.found, false, "an unknown door is found:false, never a made-up record");
  /* a required header missing or different from the body is 400 + HeaderMismatch */
  const noHeader = await post("/mcp", { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: META("2026-07-28") } });
  assert.equal(noHeader.status, 400);
  assert.equal(noHeader.json.error.code, -32020);
  const wrongName = await modern("tools/call", { name: "door", arguments: { n: 1 } }, { "Mcp-Name": "match" });
  assert.equal(wrongName.status, 400);
  assert.equal(wrongName.json.error.code, -32020);
  const encoded = await modern("tools/call", { name: "door", arguments: { n: 1 } }, { "Mcp-Name": `=?base64?${Buffer.from("door").toString("base64")}?=` });
  assert.equal(encoded.status, 200, "a Base64-sentinel Mcp-Name is decoded before it is compared");
  /* a version it does not speak: 400 + -32022 with the list */
  const bad = await post("/mcp", { jsonrpc: "2.0", id: 5, method: "tools/list", params: { _meta: META("1900-01-01") } }, { "MCP-Protocol-Version": "1900-01-01", "Mcp-Method": "tools/list" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, -32022);
  assert.deepEqual(bad.json.error.data.supported, [S.MCP_MODERN, ...S.MCP_LEGACY]);
  assert.equal(bad.json.error.data.requested, "1900-01-01");
  /* an unknown method, and ping (removed in this revision): 404 + -32601 */
  for (const m of ["nope/nothing", "ping"]) {
    const x = await modern(m);
    assert.equal(x.status, 404, `${m} status`);
    assert.equal(x.json.error.code, -32601);
  }
  assert.equal((await call("/mcp")).status, 405, "GET on the endpoint is 405");
});

t("MCP resources are listed AND readable", async () => {
  const list = await modern("resources/list");
  const uris = list.json.result.resources.map((r) => r.uri);
  assert.deepEqual(uris, [`${BASE}/llms-full.txt`, `${BASE}/atlas.md`]);
  assert.equal(typeof list.json.result.ttlMs, "number");
  for (const uri of uris) {
    const r = await modern("resources/read", { uri }, { "Mcp-Name": uri });
    assert.equal(r.status, 200, `${uri} status`);
    const c = r.json.result.contents[0];
    assert.equal(c.uri, uri);
    assert.equal(c.mimeType, "text/markdown");
    assert.ok(c.text.length > 200, `${uri} is empty`);
    assert.equal(c.text, (await get(uri.slice(BASE.length))).text, "the resource is the same bytes the HTTP route serves");
    assert.equal(typeof r.json.result.ttlMs, "number");
    assert.equal(r.json.result.cacheScope, "public");
  }
  const missing = await modern("resources/read", { uri: `${BASE}/nope` }, { "Mcp-Name": `${BASE}/nope` });
  assert.equal(missing.json.error.code, -32602, "not found is -32602 since 2026-07-28");
  const noName = await modern("resources/read", { uri: uris[0] });
  assert.equal(noName.json.error.code, -32020, "resources/read needs Mcp-Name = params.uri");
});

t("MCP legacy era: initialize, ping, tools without modern-only fields, batches", async () => {
  for (const v of S.MCP_LEGACY) {
    const init = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v, capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    assert.equal(init.json.result.protocolVersion, v);
    assert.equal(init.json.result.serverInfo.name, S.MCP_NAME);
    assert.equal(init.json.result.serverInfo.version, S.MCP_VERSION);
  }
  assert.deepEqual((await post("/mcp", { jsonrpc: "2.0", id: 2, method: "ping" })).json.result, {}, "a 2025 client still gets its pong");
  const list = await post("/mcp", { jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.ok(Array.isArray(list.json.result.tools));
  assert.ok(!("resultType" in list.json.result), "resultType is a 2026-07-28 field");
  const missing = await post("/mcp", { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: `${BASE}/nope` } });
  assert.equal(missing.json.error.code, -32002, "the 2025 revisions used -32002 for resource not found");
  const batch = await post("/mcp", [{ jsonrpc: "2.0", id: 7, method: "ping" }, { jsonrpc: "2.0", id: 8, method: "tools/list" }]);
  assert.ok(Array.isArray(batch.json) && batch.json.length === 2);
  assert.equal((await post("/mcp", { jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
});

/* ---------- A2A ---------- */

t("A2A agent card is the 1.0 shape, same bytes at both paths, one interface per version the endpoint speaks", async () => {
  const a = await get("/.well-known/agent-card.json");
  assert.equal((await get("/.well-known/agent.json")).text, a.text);
  const j = JSON.parse(a.text);
  for (const gone of ["url", "protocolVersion", "preferredTransport", "additionalInterfaces"]) assert.ok(!(gone in j), `top-level ${gone} is the 0.3 shape`);
  assert.ok(!("stateTransitionHistory" in j.capabilities));
  assert.deepEqual(j.supportedInterfaces, S.A2A_SPOKEN.map((v) => ({ url: `${BASE}/a2a`, protocolBinding: "JSONRPC", protocolVersion: v })));
  assert.equal(j.supportedInterfaces[0].protocolVersion, "1.0", "the preferred interface comes first");
  for (const k of ["name", "description", "supportedInterfaces", "version", "capabilities", "defaultInputModes", "defaultOutputModes", "skills"]) assert.ok(k in j);
  assert.equal(j.capabilities.streaming, false);
  assert.equal(j.capabilities.extendedAgentCard, false);
  const { A2A_SKILLS } = await import("../src/a2a.js");
  assert.deepEqual(j.skills.map((s) => s.id), A2A_SKILLS, "the card's skills are the ones the endpoint answers");
  for (const s of j.skills) assert.ok(s.id && s.name && s.description && s.tags.length && s.examples.length >= 2);
});

t("A2A 1.0: SendMessage answers a Message in the 1.0 wire", async () => {
  const send = (params, headers = { "A2A-Version": "1.0" }) => post("/a2a", { jsonrpc: "2.0", id: 1, method: "SendMessage", params }, headers);
  const list = await send({ message: { messageId: "m1", role: "ROLE_USER", parts: [{ text: "list" }] }, metadata: { skill: "doors" } });
  assert.equal(list.status, 200);
  const m = list.json.result.message;
  assert.ok(m, "the result is a SendMessageResponse holding a message");
  assert.equal(m.role, "ROLE_AGENT");
  assert.ok(m.messageId && m.contextId, "a server message carries a messageId and a contextId");
  assert.ok(!("kind" in m) && m.parts.every((p) => !("kind" in p)), "no 0.3 kind discriminators in a 1.0 reply");
  assert.equal(typeof m.parts[0].text, "string");
  assert.ok(m.parts[1].data && m.parts[1].mediaType === "application/json");
  assert.equal(m.parts[1].data.count ?? m.parts[1].data.sites?.length, 3);
  const keep = await send({ message: { messageId: "m2", contextId: "ctx-42", role: "ROLE_USER", parts: [{ text: "list" }] }, metadata: { skill: "doors" } });
  assert.equal(keep.json.result.message.contextId, "ctx-42", "a client's contextId is preserved");
  const q = await send({ message: { messageId: "m3", role: "ROLE_USER", parts: [{ text: "which site answers a question nobody here answers" }] } });
  assert.equal(q.status, 200);
  assert.equal(q.json.result.message.metadata.skill, "match");
  assert.equal(q.res.headers.get("a2a-version"), "1.0");
  /* the version may travel as a query parameter instead of a header */
  const viaQuery = await post("/a2a?A2A-Version=1.0", { jsonrpc: "2.0", id: 2, method: "SendMessage", params: { message: { messageId: "m4", role: "ROLE_USER", parts: [{ text: "list" }] }, metadata: { skill: "doors" } } });
  assert.ok(viaQuery.json.result.message);
});

t("A2A 0.3: message/send with no version header still gets the 0.3 wire", async () => {
  const r = await post("/a2a", { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "text", text: "list" }] }, metadata: { skill: "doors" } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.kind, "message");
  assert.equal(r.json.result.role, "agent");
  assert.deepEqual(r.json.result.parts.map((p) => p.kind), ["text", "data"]);
  assert.equal(r.res.headers.get("a2a-version"), "0.3");
});

t("A2A errors: unsupported version is -32009 and lists what is spoken; nothing the card does not offer pretends to work", async () => {
  const bad = await post("/a2a", { jsonrpc: "2.0", id: 1, method: "SendMessage", params: {} }, { "A2A-Version": "9.9" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, -32009);
  assert.match(bad.json.error.message, /VersionNotSupportedError/);
  assert.ok(Array.isArray(bad.json.error.data), "error.data is an array of typed objects in A2A 1.0");
  assert.equal(bad.json.error.data[0]["@type"], "type.googleapis.com/google.rpc.ErrorInfo");
  assert.equal(bad.json.error.data[0].reason, "VERSION_NOT_SUPPORTED");
  assert.equal(bad.json.error.data[0].metadata.supported, S.A2A_SPOKEN.join(", "));
  const v1 = { "A2A-Version": "1.0" };
  const code = async (method, params = {}) => (await post("/a2a", { jsonrpc: "2.0", id: 1, method, params }, v1)).json.error?.code;
  assert.equal(await code("GetTask", { id: "t1" }), -32001, "no tasks are kept: TaskNotFoundError");
  assert.equal(await code("CancelTask", { id: "t1" }), -32001);
  assert.equal(await code("SendStreamingMessage", { message: {} }), -32004, "streaming is not offered: UnsupportedOperationError");
  assert.equal(await code("SubscribeToTask", { id: "t1" }), -32004);
  assert.equal(await code("CreateTaskPushNotificationConfig", {}), -32003);
  assert.equal(await code("GetExtendedAgentCard"), -32007);
  assert.equal(await code("NoSuchMethod"), -32601);
  assert.deepEqual((await post("/a2a", { jsonrpc: "2.0", id: 1, method: "ListTasks", params: {} }, v1)).json.result, { tasks: [], nextPageToken: "", pageSize: 0, totalSize: 0 });
  const cont = await post("/a2a", { jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: { messageId: "m", taskId: "t9", role: "ROLE_USER", parts: [{ text: "x" }] } } }, v1);
  assert.equal(cont.json.error.code, -32001, "a message that continues a task names a task this agent never created");
  const garbage = await call("/a2a", { method: "POST", headers: { "A2A-Version": "1.0" }, body: "{not json" });
  assert.equal(garbage.status, 400);
  assert.equal((await call("/a2a")).status, 405);
});

/* ---------- the catalog ---------- */

/* ---------- the admin call the installer uses ---------- */

t("POST /v1/sites/{id}/pack rebuilds one pack over the stored briefing: admin only, no model call, leftovers seen", async () => {
  const admin = { authorization: `Bearer ${env.ADMIN_TOKEN}` };
  assert.equal((await call("/v1/sites/s1/pack", { method: "POST" })).status, 401, "no token, no rebuild");
  assert.equal((await call("/v1/sites/nope/pack", { method: "POST", headers: admin })).status, 404);
  await env.DB.prepare("INSERT INTO briefings (site_id, category, services_json, languages_present, languages_target, summary, punch_line, value_bring, who_for, angles_json, raw_excerpt, model, created_at, updated_at) VALUES ('s1', 'travel', '[\"Visa lookup\"]', '[\"en\"]', '[]', 'Visa rules for every passport.', 'Do I need a visa for a country with my passport?', '', 'Travellers', '[]', '', 'test', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')").run();
  const oldStatus = '{\n  "ok": true,\n  "version": "1.0.0",\n  "checked_at": "2026-11-02T08:12:44.101Z",\n  "_note": "Regenerate on every deploy: ok must be a real check. A status file that says ok while the API is down is the smallest dead card."\n}';
  const real = globalThis.fetch;
  let modelCalls = 0;
  env.AI = { run: async () => { modelCalls++; return { response: "{}" }; } };
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    if (u.host !== "visa-answers.test") return new Response("no such host in this test", { status: 502 });
    if (init.method === "POST") return new Response("{}", { status: 404 });
    if (u.pathname === "/") return new Response('<!doctype html><html><head><title>Visa Answers</title></head><body><a href="mailto:hello@visa-answers.test">write</a></body></html>', { status: 200, headers: { "content-type": "text/html" } });
    if (u.pathname === "/status.json") return new Response(oldStatus, { status: 200 });
    return new Response("not found", { status: 404 });
  };
  try {
    const r = await call("/v1/sites/s1/pack", { method: "POST", headers: admin });
    assert.equal(r.status, 200);
    const out = await r.json();
    assert.equal(out.ok, true);
    assert.equal(out.manifest, true, "the rebuilt pack carries the installer's manifest");
    assert.equal(out.fresh_briefing, false);
    assert.equal(modelCalls, 0, "a pack rebuild over a stored briefing asks no model");
  } finally { globalThis.fetch = real; delete env.AI; }
  const list = await (await call("/v1/sites/s1/files", { headers: admin })).json();
  assert.ok(list.files.includes("_reach-pack/MANIFEST.json") && list.files.includes("robots.txt"));
  const man = await (await call("/v1/sites/s1/files/_reach-pack/MANIFEST.json", { headers: admin })).json();
  assert.equal(man.host, "visa-answers.test");
  assert.equal(man.withdraw.find((w) => w.path === "status.json").seen_live, true, "the probe recognised the earlier pack's static status file");
  assert.ok(man.deploy.includes(".well-known/security.txt"), "the contact the page itself publishes is used");
  const sec = await (await call("/v1/sites/s1/files/.well-known/security.txt", { headers: admin })).text();
  assert.match(sec, /^Contact: mailto:hello@visa-answers\.test$/m);
  const card = await call("/v1/sites/s1/files/.well-known/ard.json", { headers: admin });
  assert.match(card.headers.get("content-type"), /^application\/ai-catalog\+json/);
});

/* ---------- one answer, whoever asks ---------- */

t("one question, three callers: /match, the MCP tool and both A2A wires name the same door; a miss stays a miss", async () => {
  const q = "do I need a visa for Japan";
  const http = JSON.parse((await get(`/match?q=${encodeURIComponent(q)}`)).text);
  assert.equal(http.best?.n, 1, "the visa door answers a visa question");
  assert.equal(http.best.live, "https://visa-answers.test/");
  assert.equal(http.match_confidence, "strong");
  const tool = await modern("tools/call", { name: "match", arguments: { q } }, { "Mcp-Name": "match" });
  assert.equal(tool.json.result.isError, false);
  assert.equal(tool.json.result.structuredContent.best.n, 1);
  assert.deepEqual(JSON.parse(tool.json.result.content[0].text).best.n, 1, "the text block is the same object");
  const a1 = await post("/a2a", { jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: { messageId: "q1", role: "ROLE_USER", parts: [{ text: q }] } } }, { "A2A-Version": "1.0" });
  const m1 = a1.json.result.message;
  assert.equal(m1.parts[1].data.best.n, 1);
  assert.match(m1.parts[0].text, /Visa Answers/, "the text part names the door a reader would open");
  assert.match(m1.parts[0].text, /https:\/\/visa-answers\.test\//, "and its live address");
  const a3 = await post("/a2a", { jsonrpc: "2.0", id: 2, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "q2", parts: [{ kind: "text", text: q }] } } });
  assert.equal(a3.json.result.parts[1].data.best.n, 1);
  /* different questions, different doors */
  assert.equal(JSON.parse((await get("/match?q=cheapest+day+to+fly+to+Tokyo")).text).best?.n, 2);
  assert.equal(JSON.parse((await get("/match?q=travel+warning+for+Peru")).text).best?.n, 3);
  /* nobody here answers this: no door is invented, by any caller */
  const miss = JSON.parse((await get("/match?q=zzqqxxzzqq")).text);
  assert.equal(miss.best, null);
  assert.equal(miss.match_confidence, "none");
  const missTool = await modern("tools/call", { name: "match", arguments: { q: "zzqqxxzzqq" } }, { "Mcp-Name": "match" });
  assert.equal(missTool.json.result.structuredContent.best, null);
  const missA2a = await post("/a2a", { jsonrpc: "2.0", id: 3, method: "SendMessage", params: { message: { messageId: "q3", role: "ROLE_USER", parts: [{ text: "zzqqxxzzqq" }] } } }, { "A2A-Version": "1.0" });
  assert.equal(missA2a.json.result.message.parts[1].data.best, null);
  assert.doesNotMatch(missA2a.json.result.message.parts[0].text, /visa-answers|cheap-flights|globe-warn/, "a miss names no door as the answer");
});

t("the catalog: one document at ard.json and ai-catalog.json, Revision 3 entries, every url answers", async () => {
  const ard = await get("/.well-known/ard.json");
  assert.match(ard.type, /^application\/ai-catalog\+json/);
  for (const p of ["/.well-known/ai-catalog.json", "/ai-catalog.json"]) {
    const r = await get(p);
    assert.equal(r.text, ard.text, `${p} is not the same bytes`);
    assert.match(r.type, /^application\/ai-catalog\+json/);
  }
  const j = JSON.parse(ard.text);
  assert.equal(j.specVersion, "0.9");
  assert.ok(j.host.displayName);
  assert.equal(j.host.identifier, "hub.test");
  const ids = new Set();
  for (const e of j.entries) {
    assert.match(e.identifier, URN, e.identifier);
    assert.ok(e.identifier.startsWith("urn:air:hub.test:"));
    assert.ok(!ids.has(e.identifier));
    ids.add(e.identifier);
    assert.ok(e.displayName);
    assert.match(e.type, /^[a-z]+\/[a-z0-9.+-]+$/, `${e.type} is not a media type`);
    assert.ok(("url" in e) !== ("data" in e));
    assert.ok(e.representativeQueries.length >= 2 && e.representativeQueries.length <= 5, `${e.identifier}: ${e.representativeQueries.length} queries`);
    for (const q of e.representativeQueries) assert.match(q, /\?$|\.$/, `not a user question: ${q}`);
    assert.equal((await call(e.url.slice(BASE.length))).status, 200, `the catalog advertises ${e.url}`);
  }
  assert.deepEqual(j.entries.slice(0, 4).map((e) => e.type), ["application/mcp-server-card+json", "application/vnd.oai.openapi+json", "application/a2a-agent-card+json", "application/agent-skills+md"]);
  assert.equal(j.entries[0].url, `${BASE}/mcp/server-card`, "the MCP entry points at the card's own address");
  assert.deepEqual(j.entries[0].capabilities, S.MCP_TOOL_NAMES);
  assert.equal(j.entries.filter((e) => e.identifier.includes(":door:")).length, 3);
  /* pointers: the Link header, the head of a page, robots.txt */
  const home = await get("/");
  const link = home.res.headers.get("link");
  assert.match(link, new RegExp(`<${BASE}/\\.well-known/ard\\.json>; rel="ard"`));
  assert.match(link, new RegExp(`<${BASE}/\\.well-known/ai-catalog\\.json>; rel="ai-catalog"`));
  assert.ok(home.text.includes(`<link rel="ard" href="${BASE}/.well-known/ard.json">`));
  assert.ok(home.text.includes(`<link rel="ai-catalog" type="application/ai-catalog+json" href="${BASE}/.well-known/ai-catalog.json">`));
  assert.equal(ard.res.headers.get("x-robots-tag"), "noindex");
  assert.equal((await call("/.well-known/ard.json", { headers: { "if-none-match": ard.res.headers.get("etag") } })).status, 304);
  /* the RFC 9727 linkset names the card at its own address, with its own type */
  const api = JSON.parse((await get("/.well-known/api-catalog")).text);
  assert.ok(api.linkset[0]["service-desc"].some((x) => x.href === `${BASE}/mcp/server-card` && x.type === "application/mcp-server-card+json"));
});

t("the skill is served from the directory that carries its name, and the index digest is over its bytes", async () => {
  const { sha256Hex } = await import("../src/playbook.js");
  const idx = JSON.parse((await get("/.well-known/agent-skills/index.json")).text);
  assert.equal((await get("/.well-known/skills/index.json")).text, JSON.stringify(idx, null, 2) + "\n");
  const sk = idx.skills[0];
  assert.equal(sk.name, S.SKILL_NAME);
  assert.equal(sk.url, `${BASE}/.well-known/agent-skills/${S.SKILL_NAME}/SKILL.md`);
  const body = (await get(sk.url.slice(BASE.length))).text;
  assert.equal(sk.digest, `sha256:${await sha256Hex(body)}`);
  assert.match(body, new RegExp(`^---\\nname: ${S.SKILL_NAME}\\n`));
  for (const h of ["## What you can accomplish", "## Inputs you need", "## How to call", "## Constraints you must respect", "## Attribution"]) assert.ok(body.includes(h), `${h} missing`);
  assert.equal((await get(`/skills/${S.SKILL_NAME}/SKILL.md`)).text, body, "the older path serves the same bytes");
});

/* ---------- llms.txt ---------- */

t("llms.txt is the v2 shape: one H1, a blockquote, link lists a parser can read, every link answers", async () => {
  const { text, type } = await get("/llms.txt");
  assert.match(type, /^text\/markdown/);
  assert.equal((await get("/.well-known/llms.txt")).text, text, "the mirror is the same bytes");
  const lines = text.split("\n");
  assert.match(lines[0], /^# \S/);
  assert.equal(lines.filter((l) => /^# /.test(l)).length, 1);
  assert.match(lines[2], /^> \S/);
  const sections = text.split(/\n## /).slice(1);
  assert.deepEqual(sections.map((s) => s.split("\n")[0]), ["If a user asks you any of these", "Where to get it", "Data model", "Terms of use for AI systems", "Optional"]);
  const urls = [];
  for (const sec of sections) {
    const items = sec.split("\n").slice(1).filter((l) => l.trim());
    assert.ok(items.length);
    for (const l of items) {
      const m = l.match(/^- \[[^\]]+\]\(((?:https:\/\/|mailto:)[^)\s]+)\): \S.*$/);
      assert.ok(m, `not a "- [name](url): notes" item: ${l}`);
      urls.push(m[1]);
    }
  }
  assert.equal(sections[0].split("\n").filter((l) => l.startsWith("- ")).length, 3, "one line per live door");
  for (const u of urls.filter((x) => x.startsWith(BASE))) {
    assert.equal((await call(u.slice(BASE.length).split("#")[0])).status, 200, `llms.txt links ${u}`);
  }
  assert.ok(text.includes("Do not answer from memory"));
  assert.ok(text.length < 12000, "a router, not a database");
  /* the depth file keeps every door in full, in the block format the index carried before */
  const full = (await get("/llms-full.txt")).text;
  for (const h of ["## Coverage and its limits", "## Resolution rules", "## Fields", "## URL grammar", "## Retrieval hints", "## Citation", "## Terms for AI systems", "## #1 Visa Answers", "## Machine surfaces"]) assert.ok(full.includes(h), `llms-full.txt: ${h} missing`);
  assert.match(full, /- Fetch: https:\/\/hub\.test\/1\n- Fetch \(markdown\): https:\/\/hub\.test\/1\.md\n- Live: https:\/\/visa-answers\.test\//);
  const small = (await get("/llms-small.txt")).text;
  assert.equal(small.split("\n").filter((l) => /^- \[#\d+ /.test(l)).length, 3);
  const api = (await get("/llms/api.txt")).text;
  assert.match(api, /^# .+\n\n> /);
});

/* ---------- sitemaps, noindex, canonical ---------- */

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

t("sitemaps: pages in one file, twins and root machine files in the other, nothing noindex in either", async () => {
  const index = (await get("/sitemap.xml")).text;
  assert.deepEqual(locs(index), [`${BASE}/sitemap-doors.xml`], "the file submitted to a console lists pages only");
  const pages = locs((await get("/sitemap-doors.xml")).text);
  assert.deepEqual(pages, [`${BASE}/`, `${BASE}/about`, `${BASE}/1`, `${BASE}/2`, `${BASE}/3`]);
  const second = locs((await get("/sitemap-md.xml")).text);
  for (const u of [`${BASE}/index.md`, `${BASE}/about.md`, `${BASE}/1.md`, `${BASE}/llms.txt`, `${BASE}/llms-full.txt`, `${BASE}/openapi.json`]) assert.ok(second.includes(u), `sitemap-md.xml lacks ${u}`);
  assert.ok(pages.every((u) => !/\.md$/.test(u)));
  for (const u of [...pages, ...second]) {
    assert.ok(!u.includes("/.well-known/"), `${u}: files under /.well-known/ stay out of the sitemap`);
    const r = await call(u.slice(BASE.length));
    assert.equal(r.status, 200, `${u} is in a sitemap and answers ${r.status}`);
    assert.ok(!/noindex/.test(r.headers.get("x-robots-tag") || ""), `${u} is in a sitemap and carries noindex`);
  }
  /* a page names itself as canonical; a twin names its page */
  for (const u of pages) assert.match((await call(u.slice(BASE.length))).headers.get("link"), new RegExp(`<${u.replace(/[.]/g, "\\.")}>; rel="canonical"`), `${u} canonical`);
  for (const [twin, page] of [["/index.md", "/"], ["/about.md", "/about"], ["/1.md", "/1"]]) {
    assert.match((await call(twin)).headers.get("link"), new RegExp(`<${BASE}${page === "/" ? "/" : page}>; rel="canonical"`), `${twin} names ${page} as canonical`);
  }
});

t("noindex is exactly the declared list", async () => {
  const { STRUCTURE } = await import("../src/seo.js");
  assert.ok(STRUCTURE.noindex_patterns.includes("/.well-known/"));
  for (const p of ["/.well-known/ard.json", "/.well-known/agent-card.json", "/.well-known/security.txt", "/mcp/server-card", "/match?q=x", "/add", "/crawler-check"]) {
    assert.equal((await call(p)).headers.get("x-robots-tag"), "noindex", `${p} should carry noindex`);
  }
  for (const p of ["/", "/about", "/1", "/1.md", "/index.md", "/llms.txt", "/llms-full.txt", "/openapi.json", "/robots.txt", "/sites.json", "/atlas.md", "/feed.xml"]) {
    assert.equal((await call(p)).headers.get("x-robots-tag"), "max-snippet:-1, max-image-preview:large, max-video-preview:-1", `${p} must not carry noindex`);
  }
  for (const p of STRUCTURE.machine_entry_points_in_sitemap) assert.ok(!S.isNoindex(p), `${p} is in the sitemap list and on the noindex list`);
});

/* ---------- pages: head block, about, link integrity ---------- */

t("the head block of every page: one title, one canonical, the licence, the twin, both catalog relations", async () => {
  for (const p of ["/", "/about", "/1"]) {
    const { text } = await get(p);
    const head = text.slice(0, text.indexOf("</head>"));
    assert.equal((head.match(/<title>/g) || []).length, 1, `${p}: one title`);
    assert.equal((head.match(/rel="canonical"/g) || []).length, 1, `${p}: one canonical`);
    assert.equal((head.match(/application\/ld\+json/g) || []).length, 1, `${p}: one JSON-LD script`);
    for (const needle of [
      `<link rel="canonical" href="${BASE}${p === "/" ? "/" : p}">`,
      `<link rel="license" type="application/rsl+xml" href="${BASE}/license.xml">`,
      `<link rel="describedby" type="text/markdown" href="${BASE}/llms.txt"`,
      `type="text/markdown" href="${BASE}${p === "/" ? "/index" : p}.md"`,
      `<link rel="ard" href="${BASE}/.well-known/ard.json">`,
      `<meta name="robots" content="max-snippet:-1, max-image-preview:large, max-video-preview:-1">`,
      `type="application/feed+json"`,
    ]) assert.ok(head.includes(needle), `${p}: head lacks ${needle}`);
    assert.ok(!/noindex/.test(head), `${p}: a stray noindex`);
    const ld = JSON.parse(head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.ok(Array.isArray(ld["@graph"]));
  }
});

t("the about page says who is behind the hub, and its graph restates only what the page shows", async () => {
  const { ABOUT_UPDATED } = await import("../src/about.js");
  const { text, res } = await get("/about");
  assert.ok(text.includes(S.PUBLISHER));
  assert.ok(text.includes(`mailto:${S.CONTACT}`));
  assert.ok(text.includes("How is a record made?"));
  assert.ok(text.includes(`datetime="${ABOUT_UPDATED}"`));
  assert.equal(new Date(res.headers.get("last-modified")).toISOString().slice(0, 10), ABOUT_UPDATED, "Last-Modified is the day the text changed");
  const ld = JSON.parse(text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const page = ld["@graph"].find((n) => n["@type"] === "AboutPage");
  assert.equal(page.dateModified, ABOUT_UPDATED);
  const org = ld["@graph"].find((n) => n["@type"] === "Organization");
  assert.ok(text.includes(org.name) && text.includes(org.email), "the publisher node says nothing the page does not show");
  const md = await get("/about.md");
  assert.match(md.type, /^text\/markdown/);
  assert.ok(md.text.includes(S.PUBLISHER));
  assert.equal((await get("/about", { accept: "text/markdown" })).text, md.text, "Accept: text/markdown serves the twin");
  assert.match((await call("/about")).headers.get("vary"), /Accept/i);
  assert.ok((await get("/")).text.includes('<a href="/about">'), "the about page is linked from the home page");
  assert.ok((await get("/index.md")).text.includes(`${BASE}/about`));
});

t("link integrity: every internal link a page renders is a path the Worker serves", async () => {
  const seen = new Set();
  for (const p of ["/", "/about", "/1", "/2"]) {
    const { text } = await get(p);
    for (const m of text.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
      let u = m[1];
      if (u.startsWith(BASE)) u = u.slice(BASE.length) || "/";
      if (!u.startsWith("/") || u.startsWith("//")) continue;
      seen.add(u);
    }
  }
  for (const p of ["/index.md", "/about.md", "/1.md"]) {
    const { text } = await get(p);
    for (const m of text.matchAll(/https:\/\/hub\.test(\/[^\s)>"`]*)/g)) {
      const u = m[1].replace(/[.,;]+$/, "");
      if (!/[{}]/.test(u)) seen.add(u.split("#")[0]);
    }
  }
  assert.ok(seen.size > 20, `only ${seen.size} links found`);
  for (const u of seen) {
    const r = await call(u === "/match?q=X" ? "/match?q=x" : u);
    assert.ok(r.status < 400, `${u} is linked from a page and answers ${r.status}`);
  }
});

t("discovery files answer If-None-Match with 304, and a twin keeps a truthful Last-Modified", async () => {
  for (const p of ["/robots.txt", "/llms.txt", "/license.xml", "/ai.txt", "/openapi.json", "/.well-known/agent-card.json", "/.well-known/api-catalog", "/.well-known/security.txt", "/1.md", "/about.md"]) {
    const first = await call(p);
    const etag = first.headers.get("etag");
    assert.ok(etag, `${p} has no ETag`);
    assert.equal((await call(p, { headers: { "if-none-match": etag } })).status, 304, `${p} does not answer 304`);
  }
  assert.ok((await call("/1.md")).headers.get("last-modified"));
  /* security.txt: a contact, an expiry under a year away, stable for the month */
  const sec = (await get("/.well-known/security.txt")).text;
  assert.ok(sec.includes(`Contact: mailto:${S.CONTACT}`));
  const exp = new Date(sec.match(/^Expires: (.+)$/m)[1]);
  assert.ok(exp > new Date() && exp - new Date() < 366 * 24 * 3600 * 1000);
  assert.equal(exp.getUTCDate(), 1);
});

t("status.json is generated and names the versions the endpoints speak", async () => {
  const s = JSON.parse((await get("/status.json")).text);
  assert.equal(typeof s.ok, "boolean");
  assert.equal(s.version, S.MCP_VERSION);
  assert.deepEqual(s.mcp_protocol_versions, [S.MCP_MODERN, ...S.MCP_LEGACY]);
  assert.deepEqual(s.a2a_versions, S.A2A_SPOKEN);
  assert.ok(s.checked_at);
  assert.equal(s.doors, 3);
});

t("OpenAPI: 3.1, every summary is a question, the version is the card's", async () => {
  const { text, type } = await get("/openapi.json");
  assert.match(type, /^application\/vnd\.oai\.openapi\+json/);
  const o = JSON.parse(text);
  assert.match(o.openapi, /^3\.1\.\d+$/);
  assert.equal(o.info.version, S.MCP_VERSION);
  for (const [p, v] of Object.entries(o.paths)) assert.match(v.get.summary, /\?$/, `${p}: the summary is the question the call answers`);
  assert.ok(o.paths["/{n}.json"].get.parameters[0].description);
  assert.ok(!/briefed/.test(text), "the confidence levels named are the ones the hub assigns");
});

/* ---------- the repository's own AGENTS.md ---------- */

t("AGENTS.md at the repository root is the file the hub serves", async () => {
  const root = readFileSync(`${ROOT}AGENTS.md`, "utf8").replace(/\r\n/g, "\n");
  assert.equal(root, S.agentsMd("https://reach2.aplusz.app"));
  assert.equal((await get("/AGENTS.md")).text, S.agentsMd(BASE));
});
