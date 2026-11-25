/* /mcp - DUAL ERA.
   A client that sends per-request `_meta` naming 2026-07-28 is served that revision: stateless, `server/discover`
   (supportedVersions, capabilities, ttlMs, cacheScope, serverInfo in _meta), the request headers checked against the
   body (MCP-Protocol-Version, Mcp-Method, and Mcp-Name on tools/call and resources/read - Base64 sentinel decoded),
   `resultType` on every result, ttlMs + cacheScope on every list and read, no `ping` (the revision removed it), an
   unknown method as 404 + -32601. A client that opens with `initialize`, or that names a 2025 revision in `_meta`, is
   served the 2025 wire shape instead. Every version the card and server/discover advertise answers here; a version
   not in that list is -32022 with the list.
   Resources: the two documents a model should read whole (the full brief, the atlas) are listed AND readable -
   resources/list without resources/read would be a pointer at nothing.
   JSON-RPC batches (an array body) are answered element by element, as the 2025-03-26 transport required.
   Tools in a fixed order: match{q}, door{n}, list_doors{}. Each structuredContent is exactly the object the
   HTTP route returns (/match?q=, /{n}.json, /sites.json) - the same functions, never a second resolver.
   A request body is read up to BODY_MAX bytes and no further: past that the answer is 413. */
import { MATCH_RULES_TEXT, handleAtlas, matchResult } from "./atlas.js";
import { one } from "./db.js";
import { publicBase } from "./hill.js";
import { publicExtra } from "./public-extra.js";
import { CORS, MCP_LEGACY, MCP_MODERN, MCP_NAME, MCP_VERSION, doorJsonOf, preflight, sitesJson } from "./surfaces.js";
import { readBodyCapped } from "./util.js";

export const BODY_MAX = 65536;
/** A batch answers at most BATCH_MAX elements, list_doors (the whole record set) at most once per batch, and the
 *  replies of one batch together at most BATCH_REPLY_MAX bytes: an element that would pass the budget is answered
 *  with an error telling the client to send it in its own request. One request can never buy more than about one
 *  record set of reply, whatever its shape. */
export const BATCH_MAX = 8;
export const BATCH_REPLY_MAX = 96 * 1024;
const SPOKEN = [MCP_MODERN, ...MCP_LEGACY];
const eraOf = (request) => {
  const h = request.headers.get("mcp-protocol-version") || "";
  return SPOKEN.includes(h) ? h : MCP_LEGACY[0];
};

const send = (o, status = 200, version = MCP_MODERN) =>
  new Response(JSON.stringify(o) + "\n", {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "mcp-protocol-version": version, ...CORS },
  });

export const TOOLS = [
  {
    name: "match",
    title: "Which site answers this question?",
    description:
      "Which of the live sites in this network answers the user's question? One required argument: q, the question in plain words (200 characters at most). Returns best (the top door: n, name, live URL, punch, asks (the site's own question lines), score, status, source_url, license, retrieved_at, confidence), match_confidence (strong, weak or none), matches[] and blocked[] (doors whose own 'does not answer' lines removed them). " + MATCH_RULES_TEXT + " When best is null, NO door in this hub answers it - do not pick one of the weak matches yourself. A best with status closed is last seen live, not live. Cite the live URL on the record, not the hub.",
    inputSchema: {
      type: "object",
      required: ["q"],
      properties: { q: { type: "string", minLength: 1, maxLength: 200, description: "The user's question, plain text. Example: do I need a visa for Japan" } },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "door",
    title: "Open one door",
    description:
      "Door n of the hub: the site's name, the question it answers, its live URL, and its record (sitemap, llms.txt, feed, languages, IndexNow key URL, Wikidata) with source_url, license, retrieved_at and confidence. One required argument: n, an integer door number from 1 upwards. A hit carries found:true; an unknown n returns found:false - never a made-up record.",
    inputSchema: { type: "object", required: ["n"], properties: { n: { type: "integer", minimum: 1, description: "Door number. Example: 1" } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_doors",
    title: "List every door",
    description:
      "Every door record in one call - the same object as GET /sites.json: name, live URL, sitemap, llms.txt, description, languages, feed, IndexNow key URL, door URLs and Wikidata item when one exists. No arguments. Use match first when the user has a question; use this to browse or when match returned best:null.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

async function runTool(name, a, env, slots) {
  const base = publicBase(env);
  if (name === "match") {
    const q = String(a.q || "").trim();
    if (!q) return { ok: false, found: false, error: "q is required: the user's question in plain words" };
    return matchResult(env, q);
  }
  if (name === "door") {
    const n = Number(a.n);
    const slot = Number.isInteger(n) ? slots.find((s) => s.n === n) : null;
    if (!slot) return { ok: false, found: false, error: "no door at that number", doors: slots.length, hub: `${base}/` };
    return doorJsonOf(slot, env, slots);
  }
  if (name === "list_doors") return sitesJson(slots, env, base);
  return null;
}

/** The readable resources: the same bytes the HTTP routes serve, through the same functions. */
const RESOURCES = (base) => [
  { uri: `${base}/llms-full.txt`, name: "llms-full.txt", title: "Full brief", description: "Every door in full, with its live URL, record and status; resolution rules, fields, citation format.", mimeType: "text/markdown" },
  { uri: `${base}/atlas.md`, name: "atlas.md", title: "Network atlas", description: "What each site is, its keywords and the questions it answers, with the match rules.", mimeType: "text/markdown" },
];

async function readResource(uri, env, slots) {
  const base = publicBase(env);
  try {
    if (uri === `${base}/llms-full.txt`) {
      const map = await one(env, "SELECT * FROM reach_map WHERE id = 'reach'").catch(() => null);
      const res = await publicExtra("/llms-full.txt", env, slots, map);
      return res ? await res.text() : null;
    }
    if (uri === `${base}/atlas.md`) {
      const res = await handleAtlas("/atlas.md", new URL(uri), env);
      return res && res.ok ? await res.text() : null;
    }
  } catch { /* an unreadable resource is reported as not found, never as a 500 */ }
  return null;
}

/** An Mcp-Name / Mcp-Param header value as the client meant it: `=?base64?...?=` carries UTF-8 the header could not. */
export function headerValue(raw) {
  if (raw == null) return null;
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(raw);
  if (!m) return raw;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host = "";
  try { host = new URL(origin).host; } catch { return false; }
  const own = new URL(publicBase(env)).host;
  return host === own || /(^|\.)aplusz\.app$/.test(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

/** One JSON-RPC message -> { payload, status, version } or null for a notification (no reply). */
async function dispatch(body, request, env, slots) {
  const base = publicBase(env);
  const id = body && typeof body === "object" && !Array.isArray(body) ? body.id ?? null : null;
  /* the version this reply is stamped with is the version its BODY is rendered in: the one in _meta, else the one
     initialize negotiates, else the 2025 shape - stamped with the client's own header when that names a 2025
     revision, else the newest 2025 revision. A 2026-07-28 header without _meta is not a 2026 request. */
  const headerVersion = request.headers.get("mcp-protocol-version") || "";
  let version = MCP_LEGACY.includes(headerVersion) ? headerVersion : MCP_LEGACY[0];
  const ok = (result, status = 200) => ({ payload: { jsonrpc: "2.0", id, result }, status, version });
  const bad = (code, message, data, status = 200) => ({ payload: { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }, status, version });
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.method !== "string") return bad(-32600, "Invalid Request", null, 400);
  const doors = slots.filter((sl) => !sl.self);
  const closed = doors.filter((sl) => sl.status === "closed").length;
  const instructions = `The Reach 02 lists ${doors.length - closed} sites behind numbered doors${closed ? ` (and ${closed} closed)` : ""}. Call match with the user's question; best:null means no door answers it - do not fill the gap yourself. Cite the live URL (source_url) on every record.`;

  /* ---- legacy era: the handshake ------------------------------------------- */
  if (body.method === "initialize") {
    const want = body.params?.protocolVersion;
    version = MCP_LEGACY.includes(want) ? want : MCP_LEGACY[0];
    return ok({
      protocolVersion: version,
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
      serverInfo: { name: MCP_NAME, version: MCP_VERSION },
      instructions,
    });
  }
  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") return null;

  /* ---- the version travels in _meta, per request: any advertised version answers ---- */
  const meta = body.params?._meta ?? {};
  const v = meta["io.modelcontextprotocol/protocolVersion"] || meta.protocolVersion || "";
  if (v && !SPOKEN.includes(v)) return bad(-32022, "Unsupported protocol version", { supported: SPOKEN, requested: v }, 400);
  if (v) version = v;
  const modern = v === MCP_MODERN;
  if (modern && request.headers.get("mcp-protocol-version") !== v) return bad(-32020, "Header mismatch: MCP-Protocol-Version", null, 400);
  if (modern && request.headers.get("mcp-method") !== body.method) return bad(-32020, "Header mismatch: Mcp-Method", null, 400);
  /* Mcp-Name mirrors params.name (tools/call, prompts/get) or params.uri (resources/read) */
  const named = body.method === "resources/read" ? body.params?.uri : body.params?.name;
  if (modern && ["tools/call", "resources/read", "prompts/get"].includes(body.method) && headerValue(request.headers.get("mcp-name")) !== named) return bad(-32020, "Header mismatch: Mcp-Name", null, 400);

  const serverMeta = modern ? { _meta: { "io.modelcontextprotocol/serverInfo": { name: MCP_NAME, version: MCP_VERSION } } } : {};
  const done = (res) => (modern ? { resultType: "complete", ...res, ...serverMeta } : res);

  const cache = { ttlMs: 3600000, cacheScope: "public" };
  if (body.method === "server/discover") {
    return ok(done({
      supportedVersions: SPOKEN,
      capabilities: { tools: { listChanged: false }, resources: {} },
      instructions,
      ...cache,
      /* not in the 2026-07-28 schema: the names earlier drafts of this revision used, kept for clients built from
         them (a result may carry extra members). The schema's own serverInfo is in _meta. */
      supportedProtocolVersions: SPOKEN,
      serverInfo: { name: MCP_NAME, version: MCP_VERSION, websiteUrl: `${base}/`, documentationUrl: `${base}/llms-full.txt` },
    }));
  }
  /* ping left the protocol in 2026-07-28; a 2025 client still gets its pong */
  if (body.method === "ping" && !modern) return ok({});
  if (body.method === "tools/list") return ok(done({ tools: TOOLS, ...cache }));
  if (body.method === "tools/call") {
    const name = body.params?.name;
    if (!TOOLS.some((t) => t.name === name)) return bad(-32602, "Unknown tool: " + name, { tools: TOOLS.map((t) => t.name) });
    const args = body.params?.arguments;
    const out = await runTool(name, args && typeof args === "object" && !Array.isArray(args) ? args : {}, env, slots);
    return ok(done({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: out?.found === false && !!out?.error }));
  }
  if (body.method === "resources/list") return ok(done({ resources: RESOURCES(base), ...cache }));
  if (body.method === "resources/templates/list") return ok(done({ resourceTemplates: [], ...cache }));
  if (body.method === "resources/read") {
    const uri = body.params?.uri;
    const hit = typeof uri === "string" ? RESOURCES(base).find((r) => r.uri === uri) : null;
    const text = hit ? await readResource(uri, env, slots) : null;
    /* not found is -32602 since 2026-07-28; the 2025 revisions used -32002 */
    if (text == null) return bad(modern ? -32602 : -32002, "Resource not found", { uri: typeof uri === "string" ? uri.slice(0, 300) : null, resources: RESOURCES(base).map((r) => r.uri) });
    return ok(done({ contents: [{ uri, mimeType: hit.mimeType, text }], ttlMs: 600000, cacheScope: "public" }));
  }
  return bad(-32601, "Method not found: " + body.method, { doors: slots.length }, modern ? 404 : 200);
}

export async function mcp(request, env, slots) {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return new Response("Use POST\n", { status: 405, headers: { allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8", ...CORS } });
  /* the spec MUSTs an Origin check on a browser-originated request */
  if (!originAllowed(request, env)) return new Response("Forbidden origin\n", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });

  const era = eraOf(request);
  const read = await readBodyCapped(request, BODY_MAX);
  if (read.tooBig) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Request too large: ${BODY_MAX} bytes at most`, data: { max_bytes: BODY_MAX } } }, 413, era);
  let body;
  try { body = JSON.parse(read.text); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, era); }
  if (!body || typeof body !== "object") return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400, era);

  /* a batch: every element answered in order, BATCH_MAX at most, list_doors once; notifications only is 202, no body */
  if (Array.isArray(body)) {
    if (!body.length) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: empty batch" } }, 400, era);
    if (body.length > BATCH_MAX) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Invalid Request: ${BATCH_MAX} elements per batch at most`, data: { max_elements: BATCH_MAX, received: body.length } } }, 400, era);
    const replies = [];
    let version = MCP_LEGACY[0];
    let listed = 0;
    let spent = 0;
    for (const item of body) {
      const itemId = !!item && typeof item === "object" && !Array.isArray(item) ? item.id ?? null : null;
      const isList = !!item && typeof item === "object" && !Array.isArray(item) && item.method === "tools/call" && item.params?.name === "list_doors";
      if (isList && listed >= 1) {
        replies.push({ jsonrpc: "2.0", id: itemId, error: { code: -32600, message: "list_doors answers once per batch: it is the whole record set" } });
        continue;
      }
      if (isList) listed += 1;
      const r = await dispatch(item, request, env, slots);
      if (!r) continue;
      const size = JSON.stringify(r.payload).length;
      if (spent + size > BATCH_REPLY_MAX) {
        replies.push({ jsonrpc: "2.0", id: itemId, error: { code: -32600, message: `batch reply budget (${BATCH_REPLY_MAX} bytes) spent: send this call in its own request`, data: { max_reply_bytes: BATCH_REPLY_MAX } } });
        continue;
      }
      spent += size;
      replies.push(r.payload);
      version = r.version;
    }
    if (!replies.length) return new Response(null, { status: 202, headers: CORS });
    return send(replies, 200, version);
  }

  const r = await dispatch(body, request, env, slots);
  if (!r) return new Response(null, { status: 202, headers: CORS });
  return send(r.payload, r.status, r.version);
}
