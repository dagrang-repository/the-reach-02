/* /a2a - A2A 1.0, JSON-RPC. The card at /.well-known/agent-card.json declares two skills (match, doors);
   this is the endpoint that answers them, so the card is not a pointer at nothing. Clients send
   `A2A-Version: 1.0`; a missing header is a 0.3 client and is still answered (same body, version echoed);
   any other version gets VersionNotSupportedError listing what is spoken. Same resolver as everything else.
   A malformed message is a JSON-RPC -32602 inside the envelope, never a bare 500; a body past BODY_MAX bytes is 413. */
import { matchResult } from "./atlas.js";
import { publicBase } from "./hill.js";
import { A2A_SPOKEN, CORS, preflight, sitesJson } from "./surfaces.js";
import { readBodyCapped } from "./util.js";

export const BODY_MAX = 65536;

const send = (o, version, status = 200) =>
  new Response(JSON.stringify(o) + "\n", { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "a2a-version": version, ...CORS } });

const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** What the user actually typed, pulled out of the A2A message parts. Only object parts of kind/type "text" count. */
function textOf(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter((p) => isObject(p) && (p.kind === "text" || p.type === "text"))
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join(" ")
    .trim();
}

/** Why a message/send params object is not one, or "" when it is. */
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

  const asked = request.headers.get("a2a-version") || url.searchParams.get("A2A-Version") || "0.3";
  if (!A2A_SPOKEN.includes(asked)) {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "VersionNotSupportedError", data: { supported: A2A_SPOKEN, requested: asked } } }, "1.0", 400);
  }

  const read = await readBodyCapped(request, BODY_MAX);
  if (read.tooBig) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Request too large: ${BODY_MAX} bytes at most`, data: { max_bytes: BODY_MAX } } }, asked, 413);
  let body;
  try { body = JSON.parse(read.text); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, asked, 400); }
  if (!isObject(body)) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, asked, 400);
  const id = body.id ?? null;
  if (body.method !== "message/send") {
    return send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + body.method, data: { supported: ["message/send"] } } }, asked, 200);
  }
  const why = invalidParams(body.params);
  if (why) return send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: " + why } }, asked, 400);

  const base = publicBase(env);
  const msg = body.params?.message;
  const text = textOf(msg);
  const want = String(body.params?.metadata?.skill || msg?.metadata?.skill || (text ? "match" : "doors"));
  let out;
  const skill = want;
  if (want === "doors") out = sitesJson(slots, env, base);
  else if (want === "match") out = text ? await matchResult(env, text) : { ok: false, found: false, error: "send the question as a text part", hub: `${base}/` };
  else out = { ok: false, found: false, error: "unknown skill: " + want, skills: ["match", "doors"] };

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
        metadata: { skill, license: `${base}/license.xml`, hub: `${base}/` },
      },
    },
    asked
  );
}
