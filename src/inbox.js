/* Reach 02 - inbox (Cloudflare Email Routing -> this Worker's email() handler).
 * One address today: peerpush@aplusz.app. It exists so the hands-free PeerPush bot can finish signing in: PeerPush
 * mails a 6-digit code that lives 5 minutes; the bot (GitHub Actions) asks for it at admin GET /v1/inbox/code.
 * - Forwards nothing to anyone, with ONE exception (owner's rule): a sign-in code nobody's bot is waiting for is the
 *   owner signing in by hand, so that mail is forwarded to the owner the moment it lands. The bot announces itself
 *   (POST /v1/inbox/expect) right before it asks PeerPush for a code; one announcement claims one code.
 * - Accepts mail only when the From header (or envelope sender) is PeerPush; every other sender is refused during
 *   the SMTP conversation, so no bounce mail is ever generated.
 * - Keeps a short audit row per accepted mail (sender, subject, first words) for 30 days - PeerPush's own notices
 *   ("your product is live") land here too. Codes are never shown in listings and each is handed out once.
 * - A forged "PeerPush" mail can do no harm: the only thing ever done with its content is typing a code into
 *   PeerPush's own sign-in form, which rejects a wrong one.
 * Read only through admin-gated /v1/inbox endpoints; nothing here is public. */
import { all, one, run } from "./db.js";
import { json, nowIso, uid } from "./util.js";

export const INBOXES = {
  "peerpush@aplusz.app": { service: "peerpush", senders: /(^|\.)peerpush\.(com|net)$/i }
};
const RAW_MAX = 262144;              // read at most 256 KB of any message
const CODE_LIFE_MS = 5 * 60 * 1000;  // PeerPush: "This code expires in 5 minutes and can only be used once."
const KEEP_DAYS = 30;
const KEEP_REJECTED_DAYS = 2;
const OWNER_DEFAULT = "dagrang@gmail.com";
const ownerOf = (env) => String(env.INBOX_OWNER || OWNER_DEFAULT).trim();

export async function ensureInboxTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      received_at TEXT NOT NULL,
      from_addr TEXT,
      subject TEXT,
      code TEXT,
      used_at TEXT,
      snippet TEXT
    )`
  ).run();
}

/* ---------- MIME, just enough: multipart, base64, quoted-printable, encoded-word subjects ---------- */

function splitHead(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: "" };
}

export function headerOf(head, name) {
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const m = new RegExp(`^${name}:[ \\t]*(.*)$`, "im").exec(unfolded);
  return m ? m[1].trim() : "";
}

function bytesToText(bytes, charset) {
  try { return new TextDecoder((charset || "utf-8").toLowerCase(), { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}

function b64Bytes(s) {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  try { return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0)); } catch { return new Uint8Array(0); }
}

function qpBytes(s) {
  const soft = s.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i];
    if (c === "=" && /^[0-9A-F]{2}$/i.test(soft.slice(i + 1, i + 3))) { out.push(parseInt(soft.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(soft.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}

export function decodeWords(s) {
  // RFC 2047: whitespace between two adjacent encoded words is not part of the text
  return String(s || "").replace(/(\?=)\s+(=\?)/g, "$1$2").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, txt) => {
    const bytes = enc.toLowerCase() === "b" ? b64Bytes(txt) : qpBytes(txt.replace(/_/g, " "));
    return bytesToText(bytes, cs);
  });
}

function param(value, name) {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, "i").exec(value || "");
  return m ? (m[2] !== undefined ? m[2] : m[1]) : "";
}

/** Every text/plain and text/html part, decoded - plain parts first. */
export function textParts(raw, depth = 0) {
  const { head, body } = splitHead(raw);
  const type = headerOf(head, "content-type") || "text/plain";
  const enc = headerOf(head, "content-transfer-encoding").toLowerCase();
  if (/^multipart\//i.test(type) && depth < 4) {
    const boundary = param(type, "boundary");
    if (!boundary) return [];
    const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*\\r?\\n?`));
    const found = parts.filter((p) => p.trim()).flatMap((p) => textParts(p, depth + 1));
    return [...found.filter((p) => p.kind === "plain"), ...found.filter((p) => p.kind === "html")];
  }
  if (!/^text\/(plain|html)/i.test(type)) return [];
  const bytes = enc === "base64" ? b64Bytes(body) : enc === "quoted-printable" ? qpBytes(body) : Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
  return [{ kind: /html/i.test(type) ? "html" : "plain", text: bytesToText(bytes, param(type, "charset")) }];
}

export function visibleText(part) {
  if (part.kind !== "html") return part.text;
  return part.text
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

/** The sign-in code: six digits after "code"/"log in"/"sign in" (HTML already stripped, so a colour like #080210
 *  never counts), else a line holding nothing but six digits. */
export function findCode(parts) {
  for (const p of parts) {
    const t = visibleText(p);
    const near = /(?:code|log(?:ging)?[ -]?in|sign(?:ing)?[ -]?in)[\s\S]{0,400}?(?<![#\w])(\d{6})(?!\w)/i.exec(t);
    if (near) return near[1];
  }
  for (const p of parts) {
    const alone = /^[ \t]*(\d{6})[ \t]*$/m.exec(visibleText(p));
    if (alone) return alone[1];
  }
  return "";
}

/* ---------- the email() handler ---------- */

async function readRaw(message) {
  const reader = message.raw.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size >= RAW_MAX) { await reader.cancel().catch(() => null); break; }
  }
  const all8 = new Uint8Array(Math.min(size, RAW_MAX));
  let at = 0;
  for (const c of chunks) { const take = Math.min(c.length, all8.length - at); all8.set(c.subarray(0, take), at); at += take; if (at >= all8.length) break; }
  return binaryString(all8);
}

/** One char per byte (0-255), exactly - TextDecoder("latin1") is really windows-1252 and remaps 0x80-0x9F.
 *  Parts are re-decoded later with their own charset. */
export function binaryString(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}

const domainOf = (addr) => (String(addr || "").match(/@([^>\s]+)>?\s*$/) || [])[1] || "";

export async function handleEmail(message, env) {
  await ensureInboxTable(env);
  const to = String(message.to || "").toLowerCase().trim();
  const box = INBOXES[to];
  const raw = await readRaw(message);
  const { head } = splitHead(raw);
  const fromHeader = decodeWords(headerOf(head, "from"));
  const subject = decodeWords(headerOf(head, "subject")).slice(0, 200);
  const senderOk = box && (box.senders.test(domainOf(fromHeader)) || box.senders.test(domainOf(message.from)));
  const now = nowIso();

  if (!senderOk) {
    await run(env, "INSERT INTO inbox (id, service, received_at, from_addr, subject, code, used_at, snippet) VALUES (?, 'rejected', ?, ?, ?, NULL, NULL, ?)",
      uid("mail"), now, (fromHeader || String(message.from || "")).slice(0, 160), subject, `to ${to}`.slice(0, 120)).catch(() => null);
    message.setReject("This address accepts mail from one service only.");
    return;
  }

  const parts = textParts(raw);
  const code = findCode(parts);
  const firstWords = parts.length ? visibleText(parts[0]).replace(/\s+/g, " ").trim().slice(0, 280) : "";

  /* a code with a bot waiting for it is the bot's; a code with no bot waiting is the owner's - forward it now */
  let forwarded = "";
  if (code) {
    const waiting = await claimExpectation(env, box.service);
    if (!waiting) forwarded = await forwardToOwner(message, env, { subject, code, text: firstWords || visibleText(parts[0] || { kind: "plain", text: "" }) });
  }
  await run(env, "INSERT INTO inbox (id, service, received_at, from_addr, subject, code, used_at, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("mail"), box.service, now, fromHeader.slice(0, 160), subject,
    code || null, forwarded ? now : null, forwarded ? `forwarded to owner (${forwarded})` : code ? "" : firstWords);

  const keep = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const keepRejected = new Date(Date.now() - KEEP_REJECTED_DAYS * 86400000).toISOString();
  await run(env, "DELETE FROM inbox WHERE received_at < ? OR (service = 'rejected' AND received_at < ?)", keep, keepRejected).catch(() => null);
}

/** The bot's announcement, consumed by the first code that arrives inside its 5-minute window. */
async function claimExpectation(env, service) {
  const since = new Date(Date.now() - CODE_LIFE_MS).toISOString();
  const row = await one(env, "SELECT id FROM inbox WHERE service = ? AND used_at IS NULL AND received_at >= ? ORDER BY received_at ASC LIMIT 1",
    `expect:${service}`, since);
  if (!row) return false;
  const took = await run(env, "UPDATE inbox SET used_at = ? WHERE id = ? AND used_at IS NULL", nowIso(), row.id);
  return !!took?.meta?.changes;
}

/** The owner's own sign-in: the original mail, forwarded as it lands (Email Routing forward, so the owner gets
 *  PeerPush's real message). If the forward is refused - the owner's address not verified as an Email Routing
 *  destination - the email hub sends the code instead (send_email binding MAIL, from notify.aplusz.app). */
async function forwardToOwner(message, env, { subject, code, text }) {
  const owner = ownerOf(env);
  try { await message.forward(owner); return "forward"; } catch { /* fall through to the email hub */ }
  if (env.MAIL && typeof env.MAIL.send === "function") {
    try {
      await env.MAIL.send({
        to: owner,
        from: { email: env.MAIL_FROM || "reach2@notify.aplusz.app", name: "Reach 02" },
        subject: `${subject || "PeerPush sign-in"}: ${code}`,
        text: `Your PeerPush sign-in code (peerpush@aplusz.app): ${code}\n\nIt expires 5 minutes after PeerPush sent it.\n\n${String(text || "").slice(0, 600)}\n`
      });
      return "hub";
    } catch { /* nothing else to try */ }
  }
  return "";
}

/* ---------- admin endpoints (the admin gate runs before this) ---------- */

export async function handleInbox(path, request, url, env) {
  if (path !== "/v1/inbox" && path !== "/v1/inbox/code" && path !== "/v1/inbox/expect") return null;
  await ensureInboxTable(env);
  const service = String(url.searchParams.get("service") || "peerpush").replace(/[^a-z0-9-]/gi, "").slice(0, 40);

  if (path === "/v1/inbox/expect") {
    /* the bot, right before it presses "Continue with email": the next code is mine, do not forward it */
    if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
    const at = nowIso();
    await run(env, "INSERT INTO inbox (id, service, received_at, from_addr, subject, code, used_at, snippet) VALUES (?, ?, ?, 'bot', 'expecting a code', NULL, NULL, '')",
      uid("mail"), `expect:${service}`, at);
    return json({ ok: true, expecting: service, since: at, window_seconds: CODE_LIFE_MS / 1000 });
  }
  if (request.method !== "GET") return json({ ok: false, error: "GET only" }, 405);

  if (path === "/v1/inbox/code") {
    /* the newest unused code younger than its 5-minute life, received at or after ?since= (the moment the bot
       pressed "Continue with email"), handed out exactly once */
    const freshest = new Date(Date.now() - CODE_LIFE_MS).toISOString();
    const since = String(url.searchParams.get("since") || "");
    const floor = since && since > freshest ? since : freshest;
    const row = await one(env,
      "SELECT id, code, received_at FROM inbox WHERE service = ? AND code IS NOT NULL AND used_at IS NULL AND received_at >= ? ORDER BY received_at DESC LIMIT 1",
      service, floor);
    if (!row) return json({ ok: true, code: null, waiting: true });
    const claimed = await run(env, "UPDATE inbox SET used_at = ? WHERE id = ? AND used_at IS NULL", nowIso(), row.id);
    if (!claimed?.meta?.changes) return json({ ok: true, code: null, waiting: true });
    return json({ ok: true, code: row.code, received_at: row.received_at });
  }

  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 20)));
  const rows = await all(env,
    "SELECT received_at, service, from_addr, subject, code IS NOT NULL AS has_code, used_at, snippet FROM inbox WHERE service = ? OR ? = 'all' ORDER BY received_at DESC LIMIT ?",
    service, service, limit);
  return json({ ok: true, service, mails: rows.map((r) => ({ ...r, has_code: !!r.has_code })) });
}
