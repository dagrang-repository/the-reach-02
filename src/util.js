export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(String(a || ""));
  const bb = enc.encode(String(b || ""));
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i] ^ bb[i];
  return out === 0;
}

export function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const hdr = request.headers.get("authorization") || "";
  const got = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  return timingSafeEqual(got, token);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---- body decoding: the response charset first, then a mojibake repair pass ----------------------
   A UTF-8 body read as Windows-1252 and re-encoded shows up as "â€”" for "—" and "Â·" for "·".
   Every such string is a byte sequence we can reverse: map each char back to its 1252 byte, decode as
   UTF-8. If the reverse pass fails (not actually mojibake) the original text is kept. */
const CP1252_HIGH = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
const MOJIBAKE_RE = /[ÃÂ][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|â€[\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]?/;

export function looksMojibake(s) {
  return MOJIBAKE_RE.test(String(s || ""));
}

export function repairMojibake(s) {
  const text = String(s || "");
  if (!looksMojibake(text)) return text;
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x100) bytes.push(code);
    else if (CP1252_HIGH[ch] !== undefined) bytes.push(CP1252_HIGH[ch]);
    else return text; // a real non-Latin character: this is not a 1252 round trip
  }
  try {
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    return looksMojibake(fixed) && fixed.length >= text.length ? text : fixed;
  } catch {
    return text;
  }
}

function charsetOf(contentType) {
  const m = String(contentType || "").match(/charset\s*=\s*["']?([A-Za-z0-9_.:-]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/** Decode a response body: header charset, then <meta charset> sniffed from the first bytes, then UTF-8;
 *  a mojibake pass at the end catches bodies that were already double-encoded at the origin. */
export function decodeBody(bytes, contentType = "") {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const tryDecode = (label) => {
    if (!label) return null;
    try {
      return new TextDecoder(label).decode(u8);
    } catch {
      return null;
    }
  };
  let label = charsetOf(contentType);
  let text = tryDecode(label);
  if (text === null) {
    text = tryDecode("utf-8") || "";
    label = "utf-8";
    const head = text.slice(0, 2048);
    const sniff = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)/i) || head.match(/<\?xml[^>]+encoding=["']([A-Za-z0-9_.:-]+)["']/i);
    const sniffed = sniff ? sniff[1].toLowerCase() : "";
    if (sniffed && sniffed !== "utf-8" && sniffed !== "utf8") {
      const again = tryDecode(sniffed);
      if (again !== null) {
        text = again;
        label = sniffed;
      }
    }
  }
  return repairMojibake(text);
}

export function parseJsonLoose(text) {
  if (!text) throw new Error("empty model output");
  if (typeof text === "object") return text;
  const raw = String(text);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

export function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

export function originOf(url) {
  return new URL(url).origin;
}

export function hostOf(url) {
  return new URL(url).host.replace(/^www\./, "");
}

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/;

export function normalizeLang(code) {
  const raw = String(code || "").trim().replace("_", "-");
  if (!raw) return "";
  const base = raw.split(/[,;]/)[0].trim();
  const short = base.toLowerCase();
  if (short === "en-us" || short === "en-gb") return short.slice(0, 2) === "en" ? "en" : short;
  if (!LANG_RE.test(short)) return "";
  return short.slice(0, 2);
}

export function detectLanguagesFromHtml(html, headerLang) {
  const found = [];
  const push = (v) => {
    const n = normalizeLang(v);
    if (n && !found.includes(n)) found.push(n);
  };
  push(headerLang);
  const doc = String(html || "");
  const htmlLang = doc.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (htmlLang) push(htmlLang[1]);
  const og = doc.match(/property=["']og:locale["'][^>]*content=["']([^"']+)["']/i);
  if (og) push(og[1]);
  for (const m of doc.matchAll(/hreflang=["']([^"']+)["']/gi)) {
    if (m[1] && m[1].toLowerCase() !== "x-default") push(m[1]);
  }
  const meta = doc.match(/http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i);
  if (meta) meta[1].split(/[,;]/).forEach(push);
  return found.length ? found : ["en"];
}

export function normalizeOriginKey(raw) {
  const key = String(raw || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return "";
  return key;
}

/** Exact tag to put in the site <head>:
 *  <meta name="indexnow-key" content="YOUR_KEY">
 */
export function extractIndexNowKeyFromHtml(html) {
  const doc = String(html || "");
  const patterns = [
    /<meta\b[^>]*\bname=["']indexnow-key["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']indexnow-key["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = doc.match(re);
    if (m) {
      const key = normalizeOriginKey(m[1]);
      if (key) return key;
    }
  }
  const href = doc.match(/href=["']\/?([A-Za-z0-9_-]{8,128})\.txt["']/i);
  if (href) return normalizeOriginKey(href[1]);
  return "";
}

/** Read a request body up to `max` bytes. Content-Length is honoured first; a chunked body is counted as it
 *  arrives and the stream is cancelled the moment it passes the cap, so a public endpoint never materialises
 *  more than `max` bytes of a stranger's request. Returns { text, bytes } or { tooBig: true, bytes }. */
export async function readBodyCapped(request, max = 65536) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max) {
    try { await request.body?.cancel(); } catch { /* already gone */ }
    return { tooBig: true, bytes: declared };
  }
  if (!request.body) return { text: "", bytes: 0 };
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      try { await reader.cancel(); } catch { /* already gone */ }
      return { tooBig: true, bytes };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return { text: new TextDecoder().decode(all), bytes };
}

/** Read at most `max` bytes of a Response body and cancel the rest: an origin's reply never costs more than the cap,
 *  whatever it streams. Returns a Uint8Array (decode with decodeBody / TextDecoder). */
export async function readResponseCapped(res, max) {
  if (!res || !res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  try {
    while (n < max) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const buf = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.length - o);
    if (take <= 0) break;
    buf.set(c.subarray(0, take), o);
    o += take;
  }
  return buf;
}

/** Drop a Response body unread (a non-ok answer we will not look at). */
export async function discardBody(res) {
  try { await res?.body?.cancel(); } catch { /* nothing to drain */ }
}
