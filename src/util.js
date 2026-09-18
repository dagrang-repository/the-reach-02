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
