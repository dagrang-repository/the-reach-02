/* The probes and the contact lookup (src/stack.js): what the hub is willing to call "answered". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contactFromHtml, probeA2a, probeMcp, probeOrigin, STACK_VERSION, SITE_FEATURES } from "../src/stack.js";

/** Run fn with globalThis.fetch replaced by a handler(url, init) -> { status, json }. */
async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const out = await handler(String(url), init, init.body ? JSON.parse(init.body) : null);
    return new Response(out.json === undefined ? "" : JSON.stringify(out.json), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
  };
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test("contact: only an address the site itself publishes, its own domain first, never an invented one", () => {
  const site = "https://www.visa-answers.test/";
  assert.equal(contactFromHtml('<a href="mailto:press@elsewhere.test">x</a> <a href="mailto:Hello@Visa-Answers.test?subject=hi">y</a>', site), "hello@visa-answers.test");
  assert.equal(contactFromHtml('<a href="mailto:owner@mailbox.test">x</a>', site), "owner@mailbox.test");
  assert.equal(contactFromHtml("<p>write to hello at visa-answers dot test</p>", site), "", "no mailto link, no contact");
  assert.equal(contactFromHtml('<a href="mailto:?subject=share">share</a>', site), "");
  assert.equal(contactFromHtml('<a href="mailto:noreply@visa-answers.test">x</a>', site), "");
  assert.equal(contactFromHtml('<a href="/cdn-cgi/l/email-protection#a1b2">[email protected]</a>', site), "", "an obfuscated address stays hidden");
  assert.equal(contactFromHtml("", "not a url"), "");
});

test("MCP probe: both eras, the 2026-07-28 member name and the name earlier drafts used", async () => {
  const server = (discoverMember) => async (_url, init, body) => {
    if (body.method === "initialize") return { json: { jsonrpc: "2.0", id: body.id, result: { protocolVersion: body.params.protocolVersion, capabilities: {}, serverInfo: { name: "x", version: "1" } } } };
    if (body.method === "server/discover") {
      assert.equal(init.headers["MCP-Protocol-Version"], "2026-07-28");
      assert.equal(init.headers["Mcp-Method"], "server/discover");
      assert.equal(body.params._meta["io.modelcontextprotocol/protocolVersion"], "2026-07-28");
      assert.deepEqual(body.params._meta["io.modelcontextprotocol/clientCapabilities"], {});
      return { json: { jsonrpc: "2.0", id: body.id, result: { resultType: "complete", [discoverMember]: ["2026-07-28"], capabilities: {} } } };
    }
    return { status: 404, json: { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } } };
  };
  for (const member of ["supportedVersions", "supportedProtocolVersions"]) {
    const row = await withFetch(server(member), () => probeMcp("https://x.test"));
    assert.equal(row.open, true);
    assert.deepEqual(row.mcp.modern, ["2026-07-28"], `${member} was not read`);
    assert.deepEqual(row.mcp.legacy, ["2025-11-25", "2025-06-18", "2025-03-26"]);
  }
  const legacyOnly = await withFetch(async (_u, _i, body) => (body.method === "initialize"
    ? { json: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } } }
    : { status: 400, json: { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found" } } }), () => probeMcp("https://x.test"));
  assert.deepEqual(legacyOnly.mcp.versions, ["2025-06-18"], "only the version the endpoint echoed back");
  const dead = await withFetch(async () => ({ status: 404, json: undefined }), () => probeMcp("https://x.test"));
  assert.equal(dead.open, false);
  assert.deepEqual(dead.mcp.versions, []);
});

test("A2A probe: 1.0 is heard only from a SendMessage answered in the 1.0 shape", async () => {
  const both = await withFetch(async (_u, init, body) => {
    if (body.method === "SendMessage") {
      assert.equal(init.headers["A2A-Version"], "1.0");
      assert.equal(body.params.message.role, "ROLE_USER");
      assert.deepEqual(body.params.message.parts, [{ text: "probe" }]);
      return { json: { jsonrpc: "2.0", id: 1, result: { message: { messageId: "a", role: "ROLE_AGENT", parts: [{ text: "ok" }] } } } };
    }
    assert.equal(init.headers["A2A-Version"], undefined, "a 0.3 client sends no version header");
    return { json: { jsonrpc: "2.0", id: 2, result: { kind: "message", role: "agent", parts: [] } } };
  }, () => probeA2a("https://x.test"));
  assert.equal(both.open, true);
  assert.deepEqual(both.a2a.versions, ["1.0", "0.3"]);

  /* an endpoint that answers a 0.3 body to everything is NOT a 1.0 endpoint */
  const old = await withFetch(async (_u, _i, body) => (body.method === "message/send"
    ? { json: { jsonrpc: "2.0", id: 2, result: { kind: "message", role: "agent", parts: [] } } }
    : { json: { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } } }), () => probeA2a("https://x.test"));
  assert.equal(old.open, false, "0.3 only: no card");
  assert.deepEqual(old.a2a.versions, ["0.3"]);
  assert.match(old.detail, /SendMessage/);

  const mislabelled = await withFetch(async (_u, _i, body) => ({ json: { jsonrpc: "2.0", id: body.id, result: { kind: "message", role: "agent", parts: [] } } }), () => probeA2a("https://x.test"));
  assert.equal(mislabelled.open, false, "a 0.3 result under a 1.0 request is not 1.0");
  assert.match(mislabelled.detail, /not the 1\.0 shape/);

  const task = await withFetch(async (_u, _i, body) => (body.method === "SendMessage" ? { json: { jsonrpc: "2.0", id: 1, result: { task: { id: "t", status: { state: "TASK_STATE_SUBMITTED" } } } } } : { status: 404, json: undefined }), () => probeA2a("https://x.test"));
  assert.deepEqual(task.a2a.versions, ["1.0"], "a task is a 1.0 answer too");
});

test("the stack version moved with the pack's shape, and no feature id is listed twice", () => {
  assert.equal(STACK_VERSION, 7);
  const ids = SITE_FEATURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SITE_FEATURES.find((f) => f.id === "agents_v3").label.includes("248"));
});

test("origin probe: an earlier pack's static file is closed and flagged; a site's own file at the same path is not", async () => {
  const oldStatus = '{\n  "ok": true,\n  "version": "1.0.0",\n  "checked_at": "2026-11-02T08:12:44.101Z",\n  "_note": "Regenerate on every deploy: ok must be a real check. A status file that says ok while the API is down is the smallest dead card."\n}';
  const oldStructure = JSON.stringify({ site: "https://x.test", checked_on: "2026-11-02", max_depth: 3, languages: { canonical: "en", all: ["en"], sitemap: ["en"] }, hubs: [{ id: "home", pattern: "/", parent: null, keyword_ref: "primary", spokes_pattern: "/{slug}" }] }, null, 2);
  const serve = (files) => async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (init.method === "POST") return new Response("{}", { status: 404 });
    return path in files ? new Response(files[path], { status: 200 }) : new Response("not found", { status: 404 });
  };
  const real = globalThis.fetch;
  try {
    globalThis.fetch = serve({ "/status.json": oldStatus, "/seo/structure.json": oldStructure, "/robots.txt": "User-agent: *\nAllow: /\n" });
    const rows = await probeOrigin("https://x.test");
    const status = rows.find((r) => r.path === "/status.json");
    assert.equal(status.leftover, true);
    assert.equal(status.open, false, "a static ok is not a status endpoint");
    assert.match(status.detail, /left by an earlier pack/);
    assert.equal(rows.find((r) => r.path === "/seo/structure.json")?.leftover, true);
    assert.equal(rows.find((r) => r.path === "/seo/keywords.json"), undefined, "a leftover-only path that is absent leaves no row");
    assert.equal(rows.find((r) => r.path === "/robots.txt").open, true);
    /* the site's own generated status and its own structure file */
    globalThis.fetch = serve({ "/status.json": '{"ok":true,"records":4211,"checked_at":"2026-11-24T08:00:00Z"}', "/seo/structure.json": '{"site":"https://x.test","hubs":[]}' });
    const own = await probeOrigin("https://x.test");
    assert.equal(own.find((r) => r.path === "/status.json").open, true);
    assert.equal(own.find((r) => r.path === "/status.json").leftover, undefined);
    assert.equal(own.find((r) => r.path === "/seo/structure.json"), undefined, "the site's own repository file is none of the pack's business");
  } finally { globalThis.fetch = real; }
});
