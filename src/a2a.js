/* /a2a - A2A over JSON-RPC, in both wires the card at /.well-known/agent-card.json lists.

   A2A 1.0 (`A2A-Version: 1.0`, or ?A2A-Version=1.0): method SendMessage. The reply is a SendMessageResponse holding a
   Message: role ROLE_AGENT, a contextId, parts { text } and { data, mediaType } - no `kind` discriminators. Errors
   carry `data` as an array of google.rpc.ErrorInfo objects, and VersionNotSupportedError is -32009.
   A2A 0.3 (no version header: an empty header IS 0.3): method message/send. The reply is the 0.3 Message:
   kind "message", role "agent", parts { kind: "text" } and { kind: "data" }.

   A client is answered in the wire of the METHOD it used: a parser is tied to the vocabulary it speaks, and a client
   that says SendMessage without the header (or message/send with it) still gets an answer it can read.
   The hub answers in one round-trip and keeps no tasks, so the task methods answer honestly: TaskNotFoundError for a
   task id, an empty list for ListTasks, UnsupportedOperationError for streams, PushNotificationNotSupportedError for
   webhooks, ExtendedAgentCardNotConfiguredError for the extended card. Nothing the card does not offer pretends to work.
   Same resolver as every other surface (src/atlas.js). A malformed message is a JSON-RPC -32602 inside the envelope,
   never a bare 500; a body past BODY_MAX bytes is 413. */
import { matchResult } from "./atlas.js";
import { publicBase } from "./hill.js";
import { A2A_SPOKEN, CORS, preflight, sitesJson } from "./surfaces.js";
import { readBodyCapped } from "./util.js";

export const BODY_MAX = 65536;
export const A2A_SKILLS = ["match", "doors"];

/* method -> [wire, operation]. The 1.0 names are PascalCase; the 0.3 names are slash-separated. */
const METHODS = {
  SendMessage: ["1.0", "send"],
  SendStreamingMessage: ["1.0", "stream"],
  GetTask: ["1.0", "task"],
  ListTasks: ["1.0", "list"],
  CancelTask: ["1.0", "task"],
  SubscribeToTask: ["1.0", "stream"],
  CreateTaskPushNotificationConfig: ["1.0", "push"],
  GetTaskPushNotificationConfig: ["1.0", "push"],
  ListTaskPushNotificationConfigs: ["1.0", "push"],
  DeleteTaskPushNotificationConfig: ["1.0", "push"],
  GetExtendedAgentCard: ["1.0", "card"],
  "message/send": ["0.3", "send"],
  "message/stream": ["0.3", "stream"],
  "tasks/get": ["0.3", "task"],
  "tasks/cancel": ["0.3", "task"],
  "tasks/resubscribe": ["0.3", "stream"],
  "tasks/pushNotificationConfig/set": ["0.3", "push"],
  "tasks/pushNotificationConfig/get": ["0.3", "push"],
  "tasks/pushNotificationConfig/list": ["0.3", "push"],
  "tasks/pushNotificationConfig/delete": ["0.3", "push"],
  "agent/getAuthenticatedExtendedCard": ["0.3", "card"],
};

/* A2A-specific JSON-RPC codes (specification 5.4) */
const E = {
  TaskNotFound: [-32001, "Task not found", "TASK_NOT_FOUND"],
  PushNotificationNotSupported: [-32003, "Push Notification is not supported", "PUSH_NOTIFICATION_NOT_SUPPORTED"],
  UnsupportedOperation: [-32004, "This operation is not supported", "UNSUPPORTED_OPERATION"],
  ExtendedAgentCardNotConfigured: [-32007, "Extended Agent Card is not configured", "EXTENDED_AGENT_CARD_NOT_CONFIGURED"],
  VersionNotSupported: [-32009, "VersionNotSupportedError: this A2A version is not supported", "VERSION_NOT_SUPPORTED"],
};

const send = (o, version, status = 200) =>
  new Response(JSON.stringify(o) + "\n", { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "a2a-version": version, ...CORS } });

const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** A JSON-RPC error. In the 1.0 wire `data` is an array of typed detail objects (ProtoJSON Any); ErrorInfo metadata is
 *  a string map. In the 0.3 wire `data` is a plain object, as 0.3 clients read it. */
function fail(id, wire, kind, meta = {}, message = "") {
  const [code, text, reason] = E[kind];
  const strings = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)]));
  const data = wire === "1.0" ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, domain: "a2a-protocol.org", metadata: strings }] : meta;
  return { jsonrpc: "2.0", id, error: { code, message: message || text, data } };
}

function rpcError(id, wire, code, message, meta = null) {
  const data = !meta ? undefined : wire === "1.0" ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "INVALID_REQUEST", domain: "a2a-protocol.org", metadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)])) }] : meta;
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

/** What the user actually typed, pulled out of the message parts: a 1.0 part is { text }, a 0.3 part is
 *  { kind: "text", text }. A part that carries a file, a URL or data is not a question. */
function textOf(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter((p) => isObject(p) && typeof p.text === "string" && (p.kind === undefined || p.kind === "text") && (p.type === undefined || p.type === "text"))
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/** Why a send params object is not one, or "" when it is. */
function invalidParams(params) {
  if (params != null && !isObject(params)) return "params must be an object";
  const msg = params?.message;
  if (msg != null && !isObject(msg)) return "params.message must be an object";
  if (msg?.parts != null && !Array.isArray(msg.parts)) return "params.message.parts must be an array of parts";
  if (params?.metadata != null && !isObject(params.metadata)) return "params.metadata must be an object";
  if (msg?.metadata != null && !isObject(msg.metadata)) return "params.message.metadata must be an object";
  return "";
}

export async function a2a(request, url, env, slots) {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return new Response("Use POST\n", { status: 405, headers: { allow: "POST, OPTIONS", "content-type": "text/plain; charset=utf-8", ...CORS } });

  /* the version the client names; an empty header is a 0.3 client (specification 3.6.2) */
  const named = (request.headers.get("a2a-version") || url.searchParams.get("A2A-Version") || "").trim();
  const asked = named || "0.3";
  if (!A2A_SPOKEN.includes(asked)) return send(fail(null, "1.0", "VersionNotSupported", { supported: A2A_SPOKEN, requested: asked }), "1.0", 400);

  const read = await readBodyCapped(request, BODY_MAX);
  if (read.tooBig) return send(rpcError(null, asked, -32600, `Request too large: ${BODY_MAX} bytes at most`, { max_bytes: BODY_MAX }), asked, 413);
  let body;
  try { body = JSON.parse(read.text); } catch { return send(rpcError(null, asked, -32700, "Invalid JSON payload"), asked, 400); }
  if (!isObject(body) || typeof body.method !== "string") return send(rpcError(isObject(body) ? body.id ?? null : null, asked, -32600, "Request payload validation error"), asked, 400);
  const id = body.id ?? null;

  const known = METHODS[body.method];
  if (!known) {
    return send(rpcError(id, asked, -32601, "Method not found: " + body.method, { supported: ["SendMessage (A2A 1.0)", "message/send (A2A 0.3)"] }), asked, 200);
  }
  const [wire, op] = known;
  if (op === "stream") return send(fail(id, wire, "UnsupportedOperation", { method: body.method, reason: "this agent answers in one response; its card declares streaming: false" }), wire, 200);
  if (op === "push") return send(fail(id, wire, "PushNotificationNotSupported", { method: body.method }), wire, 200);
  if (op === "card") return send(fail(id, wire, "ExtendedAgentCardNotConfigured", { card: `${publicBase(env)}/.well-known/agent-card.json` }), wire, 200);
  if (op === "task") return send(fail(id, wire, "TaskNotFound", { taskId: String(body.params?.id ?? ""), reason: "this agent answers with a message and keeps no tasks" }), wire, 200);
  if (op === "list") return send({ jsonrpc: "2.0", id, result: { tasks: [], nextPageToken: "", pageSize: 0, totalSize: 0 } }, wire, 200);

  const why = invalidParams(body.params);
  if (why) return send(rpcError(id, wire, -32602, "Invalid parameters: " + why), wire, 400);

  const base = publicBase(env);
  const msg = body.params?.message;
  /* a message that continues a task names a task this agent never created */
  if (typeof msg?.taskId === "string" && msg.taskId) return send(fail(id, wire, "TaskNotFound", { taskId: msg.taskId, reason: "this agent answers with a message and keeps no tasks" }), wire, 200);

  const text = textOf(msg);
  const want = String(body.params?.metadata?.skill || msg?.metadata?.skill || (text ? "match" : "doors"));
  let out;
  const skill = want;
  if (want === "doors") out = sitesJson(slots, env, base);
  else if (want === "match") out = text ? await matchResult(env, text) : { ok: false, found: false, error: "send the question as a text part", hub: `${base}/` };
  else out = { ok: false, found: false, error: "unknown skill: " + want, skills: A2A_SKILLS };

  const summary =
    skill === "doors"
      ? `${slots.length} doors on The Reach 02. Each record carries the live URL to cite.`
      : out?.best && out.best.status === "closed"
        ? `Door ${out.best.n}, ${out.best.name}, would answer it but is closed${out.best.closed_since ? ` since ${out.best.closed_since}` : ""}: last seen live at ${out.best.live}; do not cite it as live.`
        : out?.best
          ? `Door ${out.best.n}, ${out.best.name}, answers it: ${out.best.live}. Cite that live URL.`
          : out?.about_hub
            ? String(out.note)
            : out?.ok
              ? `No door on The Reach 02 answers this${out.match_confidence === "weak" ? " (only weak partial overlaps, listed in matches; they are not answers)" : ""}. That is not a denial - this hub simply has no site for it.`
          : String(out?.error || "no answer");

  const metadata = { skill, license: `${base}/license.xml`, hub: `${base}/` };
  if (wire === "1.0") {
    const contextId = typeof msg?.contextId === "string" && msg.contextId ? msg.contextId.slice(0, 200) : crypto.randomUUID();
    return send(
      {
        jsonrpc: "2.0",
        id,
        result: {
          message: {
            messageId: crypto.randomUUID(),
            contextId,
            role: "ROLE_AGENT",
            parts: [
              { text: summary, mediaType: "text/plain" },
              { data: out, mediaType: "application/json" },
            ],
            metadata,
          },
        },
      },
      "1.0"
    );
  }
  return send(
    {
      jsonrpc: "2.0",
      id,
      result: {
        kind: "message",
        role: "agent",
        messageId: crypto.randomUUID(),
        parts: [
          { kind: "text", text: summary },
          { kind: "data", data: out },
        ],
        metadata,
      },
    },
    "0.3"
  );
}
