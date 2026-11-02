// Reach 02 - PeerPush probe (read-only). Runs on a GitHub runner, the same place the PeerPush bot will run.
// Answers one question before anything is built: can a plain headless browser reach PeerPush's sign-in form,
// or is there a bot check in the way? It loads pages and reads them. It never types, submits or creates anything.
// The browser is NOT disguised: default headless user agent. If PeerPush challenges it, that is the answer.
// Output: GitHub annotations (::notice::), max 8, so the verdict is readable without the log.
import { chromium } from "playwright";

const BASE = "https://peerpush.com";
const notes = [];
const note = (title, msg) => notes.push({ title, msg: String(msg).replace(/\r?\n/g, " ").replace(/%/g, "%25").slice(0, 900) });
const CHALLENGE_URL = /challenges\.cloudflare\.com|turnstile|hcaptcha\.com|recaptcha|captcha/i;
const CHALLENGE_HTML = /cf-turnstile|g-recaptcha|h-captcha|challenge-platform|cf-chl-|Just a moment\.\.\./i;
const CHALLENGE_TITLE = /just a moment|attention required|access denied|verify you are human/i;

async function look(page, url) {
  let status = 0, headers = {};
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = res ? res.status() : 0;
    headers = res ? res.headers() : {};
  } catch (e) { return { url, error: String(e.message || e).slice(0, 160) }; }
  await page.waitForTimeout(4000); // let client-side rendering and any challenge script settle
  const html = await page.content();
  const title = await page.title();
  const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== "about:blank");
  const challenge = CHALLENGE_TITLE.test(title) || CHALLENGE_HTML.test(html) || frames.some((u) => CHALLENGE_URL.test(u))
    || headers["cf-mitigated"] === "challenge";
  return { url, final: page.url(), status, title: title.slice(0, 80), challenge, server: headers["server"] || "", frames: frames.filter((u) => CHALLENGE_URL.test(u)).slice(0, 3) };
}

async function formOf(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = [...document.querySelectorAll("input")].filter(vis).map((i) =>
      [i.type, i.name, i.id, i.placeholder, i.getAttribute("autocomplete"), i.getAttribute("inputmode"), i.maxLength > 0 && i.maxLength < 100 ? "max" + i.maxLength : ""]
        .filter(Boolean).join("/")).slice(0, 8);
    const buttons = [...document.querySelectorAll("button, [role=button], a[href*='google'], input[type=submit]")].filter(vis)
      .map((b) => (b.innerText || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean).slice(0, 10);
    const forms = [...document.querySelectorAll("form")].map((f) => (f.getAttribute("action") || "(js)") + ":" + (f.method || "get")).slice(0, 4);
    return { inputs, buttons, forms };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  // 1. home, and every link that looks like sign-in / sign-up
  const home = await look(page, BASE + "/");
  const authLinks = home.error ? [] : await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].filter((a) => /sign ?in|log ?in|sign ?up|get started|submit/i.test(a.innerText || ""))
      .map((a) => (a.innerText.trim().replace(/\s+/g, " ").slice(0, 20)) + "=" + a.getAttribute("href")).slice(0, 8));
  note("1 home", JSON.stringify({ ...home, authLinks }));

  // 2. the sign-in page: first discovered link, else the usual paths
  const hrefs = authLinks.map((l) => l.split("=").slice(1).join("=")).filter((h) => /sign|log|auth/i.test(h));
  const candidates = [...new Set([...hrefs, "/login", "/sign-in", "/signin", "/auth/signin"])].slice(0, 5);
  let signin = null;
  for (const h of candidates) {
    const url = h.startsWith("http") ? h : BASE + (h.startsWith("/") ? h : "/" + h);
    const r = await look(page, url);
    if (r.error || r.status >= 400) continue;
    const form = await formOf(page);
    signin = { ...r, ...form };
    if (form.inputs.some((i) => /email/i.test(i))) break;
  }
  note("2 sign-in", JSON.stringify(signin || { error: "no sign-in page found", tried: candidates }));

  // 3. the submit page (where a human would add a product) - only read
  const sub = await look(page, BASE + "/submit");
  note("3 submit", JSON.stringify({ ...sub, ...(sub.error ? {} : await formOf(page)) }));

  // 4. the public API from this runner (no key): is the API reachable from GitHub's IPs?
  try {
    const r = await fetch(BASE + "/api/v1/categories", { headers: { accept: "application/json" } });
    const t = await r.text();
    note("4 api", `GET /api/v1/categories -> ${r.status} ${t.slice(0, 220)}`);
  } catch (e) { note("4 api", "fetch failed: " + (e.message || e)); }

  // verdict: a sign-in page with an email field and no challenge anywhere = the bot can proceed
  const blocked = [home, signin, sub].some((x) => x && x.challenge);
  const emailField = !!(signin && signin.inputs && signin.inputs.some((i) => /email/i.test(i)));
  const verdict = blocked ? "FAIL bot check present" : emailField ? "PASS no bot check, email sign-in form reachable" : "FAIL no email sign-in form found";
  note("verdict", "RESULT: " + verdict);
} finally {
  await browser.close();
}
for (const n of notes.slice(0, 8)) console.log(`::notice title=PeerPush probe ${n.title}::${n.msg}`);
