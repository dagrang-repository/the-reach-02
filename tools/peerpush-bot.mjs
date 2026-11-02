// Reach 02 - PeerPush bot (runs on GitHub Actions, never on a PC).
// Account: peerpush@aplusz.app. Its sign-in codes arrive by Cloudflare Email Routing at the Reach Worker
// (src/inbox.js): the bot announces itself (POST /v1/inbox/expect), presses "Continue with email", then reads its
// code once (GET /v1/inbox/code). A code it did not announce is the owner's and is forwarded to him instead.
// The browser is a plain headless Chromium - not disguised. If PeerPush ever shows a bot check, the bot stops and
// says so; it never tries to get around one.
// Modes (argv[2]):  signup  - create the account (first run)   |   signin - sign in and prove the session
// Output: GitHub annotations (max 8) + "RESULT:" line. No code, key or claim link is ever printed.
import { chromium } from "playwright";

const PP = process.env.PEERPUSH_BASE || "https://peerpush.com";   // override only for the local rehearsal
const HUB = process.env.REACH_HUB || "https://reach2.aplusz.app";
const TOKEN = process.env.REACH_ADMIN_TOKEN || "";
const EMAIL = process.env.PEERPUSH_EMAIL || "peerpush@aplusz.app";
const MAKER = "Verge Heights";
const UA_HUB = "Reach02-PeerPushBot/1.0 (+https://reach2.aplusz.app)";
const CHALLENGE = /challenges\.cloudflare\.com|turnstile|hcaptcha\.com|recaptcha|captcha/i;

const notes = [];
const note = (title, msg) => notes.push({ title, msg: String(msg).replace(/\r?\n/g, " ").replace(/%/g, "%25").slice(0, 900) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function hub(path, method = "GET", body = null) {
  const r = await fetch(HUB + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "user-agent": UA_HUB, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok || !j) throw new Error(`hub ${method} ${path.split("?")[0]} -> ${r.status} ${t.slice(0, 120)}`);
  return j;
}

/** What a human would see: url, visible inputs/buttons, any alert text. Used when a step does not go as expected. */
export async function seen(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = [...document.querySelectorAll("input, textarea, select")].filter(vis)
      .map((i) => [i.tagName.toLowerCase(), i.type, i.name, i.placeholder, i.getAttribute("autocomplete"), i.getAttribute("inputmode"), i.maxLength > 0 && i.maxLength < 50 ? "max" + i.maxLength : ""].filter(Boolean).join("/")).slice(0, 10);
    const buttons = [...document.querySelectorAll("button, [role=button], input[type=submit]")].filter(vis)
      .map((b) => (b.innerText || b.value || "").trim().replace(/\s+/g, " ").slice(0, 32)).filter(Boolean).slice(0, 10);
    const alerts = [...document.querySelectorAll("[role=alert], [aria-live], .text-red-500, .text-red-600, .error")].filter(vis)
      .map((a) => a.innerText.trim().replace(/\s+/g, " ").slice(0, 120)).filter(Boolean).slice(0, 3);
    return { url: location.href, title: document.title.slice(0, 60), inputs, buttons, alerts };
  });
}

async function challenged(page) {
  if (page.frames().some((f) => CHALLENGE.test(f.url()))) return true;
  return /just a moment|verify you are human/i.test(await page.title());
}

/** Sign up or sign in with an emailed 6-digit code. Returns { ms } on success, throws with what it saw otherwise. */
export async function signIn(page, { signup = false } = {}) {
  await page.goto(PP + (signup ? "/auth/signup" : "/auth/login"), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  if (await challenged(page)) throw new Error("bot check on the sign-in page - stopping, nothing bypassed");

  const email = page.locator('input[type="email"], input[name="email"]').first();
  await email.waitFor({ state: "visible", timeout: 20000 });
  for (const sel of ['input[name="name"]', 'input[autocomplete="name"]', 'input[placeholder*="name" i]']) {
    const n = page.locator(sel).first();
    if ((await n.count()) && (await n.isVisible())) { await n.fill(MAKER); break; }
  }
  await email.fill(EMAIL);
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if ((await b.isVisible()) && !(await b.isChecked())) await b.check().catch(() => null);
  }

  // announce first, so the inbox keeps this code for the bot instead of forwarding it to the owner
  const ex = await hub("/v1/inbox/expect?service=peerpush", "POST");
  const go = page.getByRole("button", { name: /continue with email|sign up|create account|continue|send( me)? (a )?code|send/i })
    .filter({ hasNotText: /google|github|apple/i }).first();
  await go.click({ timeout: 15000 });
  const started = Date.now();

  const codeBox = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="6"], input[maxlength="1"], input[name*="code" i], input[name*="otp" i]');
  try { await codeBox.first().waitFor({ state: "visible", timeout: 30000 }); }
  catch { throw new Error("no code field after Continue - saw " + JSON.stringify(await seen(page))); }
  if (await challenged(page)) throw new Error("bot check after Continue - stopping, nothing bypassed");

  let code = null;
  while (Date.now() - started < 240000) {
    const r = await hub(`/v1/inbox/code?service=peerpush&since=${encodeURIComponent(ex.since)}`);
    if (r.code) { code = r.code; break; }
    await sleep(3000);
  }
  if (!code) throw new Error("no code reached the inbox within 4 minutes (route peerpush@aplusz.app -> the-reach-02?)");
  const arrived = Date.now() - started;

  const n = await codeBox.count();
  if (n >= 6) { for (let i = 0; i < 6; i++) await codeBox.nth(i).fill(code[i]); }
  else { await codeBox.first().click(); await codeBox.first().fill(""); await page.keyboard.type(code, { delay: 70 }); }
  await page.waitForTimeout(2000);
  if (/\/auth\//.test(page.url())) {
    const ok = page.getByRole("button", { name: /verify|continue|sign in|log in|submit|confirm/i }).filter({ hasNotText: /google|github|apple/i }).first();
    if (await ok.count()) await ok.click().catch(() => null);
  }
  await page.waitForURL((u) => !/\/auth\//.test(u.toString()), { timeout: 30000 }).catch(() => null);
  if (/\/auth\//.test(page.url())) throw new Error("still on the sign-in page after the code - saw " + JSON.stringify(await seen(page)));
  return { ms: arrived };
}

/** Signed in for real: an account-only page opens without being sent back to /auth. */
export async function provenSession(page) {
  await page.goto(PP + "/user/api-keys", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  return { ok: !/\/auth\//.test(page.url()), ...(await seen(page)) };
}

async function main(mode) {
  if (!TOKEN) throw new Error("REACH_ADMIN_TOKEN missing");
  const box = await hub("/v1/inbox?service=peerpush&limit=1");           // proves the deployed inbox answers
  note("0 hub", `inbox endpoint ok=${box.ok}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    let r;
    try { r = await signIn(page, { signup: mode === "signup" }); }
    catch (e) {
      // the account may already exist (second run of "signup"): the normal sign-in is the same code loop
      if (mode === "signup" && /no code field|still on the sign-in/i.test(e.message)) { note("1 signup", e.message); r = await signIn(page, { signup: false }); }
      else throw e;
    }
    note("1 code loop", `code travelled PeerPush -> peerpush@aplusz.app -> Worker -> bot in ${Math.round(r.ms / 1000)} s`);
    const s = await provenSession(page);
    note("2 session", JSON.stringify(s));
    if (!s.ok) throw new Error("signed in but account pages still redirect to sign-in");
    note("verdict", `RESULT: PASS ${mode}: bot account signed in hands-free, code in ${Math.round(r.ms / 1000)} s`);
    return true;
  } catch (e) {
    note("failed at", JSON.stringify(await seen(page).catch(() => ({}))));
    note("verdict", "RESULT: FAIL " + String(e.message || e).slice(0, 600));
    return false;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || "signin";
  const ok = await main(mode).catch((e) => { note("verdict", "RESULT: FAIL " + (e.message || e)); return false; });
  for (const n of notes.slice(-8)) console.log(`::notice title=PeerPush ${n.title}::${n.msg}`);
  if (!ok) process.exit(1);
}
