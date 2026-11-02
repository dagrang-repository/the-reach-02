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

/** A URL fit for a report: no query string, and any token-like path segment masked (claim links are private). */
export function redact(u, base = PP) {
  try { const x = new URL(u, base); return x.origin + x.pathname.replace(/[A-Za-z0-9_-]{16,}/g, "***"); } catch { return "?"; }
}

/** What a human would see: url, visible inputs/buttons, any alert text. Used when a step does not go as expected. */
export async function seen(page) {
  const s = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = [...document.querySelectorAll("input, textarea, select")].filter(vis)
      .map((i) => [i.tagName.toLowerCase(), i.type, i.name, i.placeholder, i.getAttribute("autocomplete"), i.getAttribute("inputmode"), i.maxLength > 0 && i.maxLength < 50 ? "max" + i.maxLength : ""].filter(Boolean).join("/")).slice(0, 10);
    const buttons = [...document.querySelectorAll("button, [role=button], input[type=submit]")].filter(vis)
      .map((b) => (b.innerText || b.value || "").trim().replace(/\s+/g, " ").slice(0, 32)).filter(Boolean).slice(0, 10);
    const alerts = [...document.querySelectorAll("[role=alert], [aria-live], .text-red-500, .text-red-600, .error")].filter(vis)
      .map((a) => a.innerText.trim().replace(/\s+/g, " ").slice(0, 120)).filter(Boolean).slice(0, 3);
    return { url: location.href, title: document.title.slice(0, 60), inputs, buttons, alerts };
  });
  return { ...s, url: redact(s.url) };
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
    // never the button that asked for the code ("Continue with email") - pressing it again would send a new code
    const ok = page.getByRole("button", { name: /verify|confirm|sign in|log in|submit|continue/i }).filter({ hasNotText: /google|github|apple|with email|send/i }).first();
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

/* ------------------------------------------------------------------------------------------------------------
 * Listing: key -> logo -> create (REST) -> claim (browser, FREE plan only) -> watch (REST) -> record on the hub
 * ------------------------------------------------------------------------------------------------------------ */
const API = PP + "/api/v1";
const PAY_URL = /checkout|stripe|paypal|billing|payment|lemonsqueezy|paddle|\/pay(\/|$)/i;
const MONEY = /[$€£]\s?[1-9]|\bpay\b|checkout|purchase|\bbuy\b|upgrade|promot|featured|sponsor|boost|\bcard\b|subscribe|outrank|\blaunch now\b|always-on|one-time/i;
const FREE = /\bfree\b|[$€£]\s?0(?![\d.,]*[1-9])/i;

export async function pp(path, key, { method = "GET", body = null, idem = "" } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { "X-PeerPush-Api-Key": key, accept: "application/json", "user-agent": UA_HUB,
      ...(body ? { "content-type": "application/json" } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, j, text: t.slice(0, 300) };
}

/** The bot's own API key: the one kept (sealed) on the hub if PeerPush still accepts it, else a new one made on
 *  /user/api-keys in the signed-in session and handed to the hub. Never printed. */
/* Every pp_live_ string on the page (text, inputs, code blocks, data attributes). A masked preview
 * ("pp_live_ab12...2509") is collected too - it simply fails the API check below and is never kept. */
async function keysOnPage(page) {
  return page.evaluate(() => {
    const re = /pp_live_[A-Za-z0-9_-]{8,}/g;
    const texts = [document.body.innerText, ...[...document.querySelectorAll("input, textarea, code, pre, [data-key], [data-value]")]
      .map((e) => e.value || e.textContent || e.getAttribute("data-key") || e.getAttribute("data-value") || "")];
    return [...new Set(texts.flatMap((t) => String(t || "").match(re) || []))];
  });
}
async function clipboardText(page) {
  try { return String(await page.evaluate(() => navigator.clipboard.readText())).trim(); } catch { return ""; }
}
/** A key counts only when the PeerPush API itself accepts it. */
async function firstWorking(cands) {
  for (const k of cands) if (/^pp_live_[A-Za-z0-9_-]{8,}$/.test(k || "") && (await pp("/categories", k)).status === 200) return k;
  return "";
}
/** Read a full key: what is on screen, then each Reveal, then each Copy (clipboard). Never Revoke. */
async function readKey(page) {
  let key = await firstWorking(await keysOnPage(page));
  for (const label of [/^\s*reveal\b/i, /^\s*copy\b/i]) {
    if (key) break;
    const buttons = page.getByRole("button", { name: label });
    for (let i = 0; i < Math.min(await buttons.count(), 6) && !key; i++) {
      await buttons.nth(i).click({ timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(900);
      key = await firstWorking([...(await keysOnPage(page)), await clipboardText(page)]);
    }
  }
  return key;
}

/** The bot's own API key: the one kept (sealed) on the hub if PeerPush still accepts it; else one already on the
 *  account if it can be read in full; else a new one. Handed to the hub; never printed. */
export async function ensureKey(page) {
  const kept = (await hub("/v1/peerpush/key")).key;
  if (kept && (await pp("/categories", kept)).status === 200) return { key: kept, made: false };
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(PP).origin }).catch(() => null);
  await page.goto(PP + "/user/api-keys", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  let key = await readKey(page);                       // a key made on an earlier run, if PeerPush still shows it
  let made = false;
  if (!key) {
    const name = page.locator('input[placeholder*="server" i], input[name*="name" i], input[type="text"]:not([placeholder*="Search" i])').first();
    await name.waitFor({ state: "visible", timeout: 20000 });
    await name.fill("Reach 02 bot");
    await page.getByRole("button", { name: /^\s*(create key|create|generate)\b/i }).first().click();
    await page.waitForTimeout(2500);
    key = await readKey(page);
    made = true;
  }
  if (!key) throw new Error("API key page: no full key readable (on screen, Reveal or Copy) - saw " + JSON.stringify(await seen(page)));
  await hub("/v1/peerpush/key", "POST", { key });
  return { key, made };
}

async function isImage(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA_HUB }, redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    await r.arrayBuffer().catch(() => null);
    return r.ok && /^image\/(png|jpe?g|webp)/i.test(type);
  } catch { return false; }
}

/** A square logo the site itself publishes: manifest icons, apple-touch-icon, sized PNG icons - largest first -
 *  then the usual /icon-512.png paths, then its social image. Every candidate is fetched and must be a PNG/JPEG/WebP. */
export async function logoFor(site) {
  const cands = [];
  try {
    const res = await fetch(site.websiteUrl, { headers: { "user-agent": UA_HUB, accept: "text/html" }, redirect: "follow" });
    const html = (await res.text()).slice(0, 400000);
    const base = res.url || site.websiteUrl;
    const links = html.match(/<link\b[^>]*>/gi) || [];
    const attr = (tag, a) => { const m = new RegExp(`\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag); return m ? (m[2] ?? m[3] ?? m[4] ?? "") : ""; };
    const size = (s) => Math.max(0, ...String(s || "").split(/\s+/).map((x) => parseInt(x, 10) || 0));
    const man = links.find((l) => /\brel\s*=\s*["']?manifest/i.test(l));
    if (man) {
      try {
        const mu = new URL(attr(man, "href"), base).href;
        const mj = await (await fetch(mu, { headers: { "user-agent": UA_HUB } })).json();
        for (const ic of mj.icons || []) cands.push({ url: new URL(ic.src, mu).href, size: size(ic.sizes), pref: /maskable/i.test(ic.purpose || "") ? 0 : 1 });
      } catch { /* no manifest */ }
    }
    for (const l of links) {
      const rel = attr(l, "rel").toLowerCase(), href = attr(l, "href");
      if (!href || /\.(svg|ico)(\?|$)/i.test(href)) continue;
      if (rel.includes("apple-touch-icon")) cands.push({ url: new URL(href, base).href, size: size(attr(l, "sizes")) || 180, pref: 1 });
      else if (/\bicon\b/.test(rel)) cands.push({ url: new URL(href, base).href, size: size(attr(l, "sizes")) || 32, pref: 1 });
    }
    for (const p of ["/icon-512.png", "/icons/icon-512.png", "/icon-192.png", "/apple-touch-icon.png"]) cands.push({ url: new URL(p, base).href, size: 100, pref: 0 });
  } catch { /* site unreachable from here: fall back to its social image */ }
  cands.sort((a, b) => (b.size >= 128) - (a.size >= 128) || b.pref - a.pref || b.size - a.size);
  const seenUrl = new Set();
  for (const c of cands) {
    if (seenUrl.has(c.url)) continue;
    seenUrl.add(c.url);
    if (await isImage(c.url)) return c.url;
  }
  if (site.og_image && (await isImage(site.og_image))) return site.og_image;
  return "";
}

/** Create the listing once. The Idempotency-Key ties it to the door, so a retry can never make a second one. */
export async function createListing(key, item) {
  const logoUrl = await logoFor(item);
  if (!logoUrl) return { ok: false, detail: "no usable logo found on the site" };
  const body = { name: item.name, tagline: item.tagline, description: item.description, websiteUrl: item.websiteUrl, logoUrl, contactEmail: item.contactEmail };
  const r = await pp("/products", key, { method: "POST", body, idem: `reach02-door-${item.n}` });
  const id = r.j?.data?.id, claimUrl = r.j?.data?.claimUrl;
  if (r.status === 201 || (r.status === 200 && id)) return { ok: true, id, claimUrl, logoUrl };
  return { ok: false, detail: `create ${r.status}: ${(r.j?.error?.message || r.text || "").slice(0, 200)}` };
}

async function safeClick(page, loc) {
  const text = ((await loc.innerText().catch(() => "")) || (await loc.getAttribute("value").catch(() => "")) || "").trim();
  if (MONEY.test(text) && !FREE.test(text)) throw new Error(`refused to click "${text.slice(0, 50)}" - it costs money`);
  await loc.click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  if (PAY_URL.test(page.url())) throw new Error("a payment page opened - stopped, nothing paid");
  return text.slice(0, 40);
}

/** The page's visible words, text node by text node with spaces between (innerText glues inline neighbours). */
async function pageWords(page) {
  return page.evaluate(() => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName) ? 1 : 3) });
    while (w.nextNode()) out.push(w.currentNode.textContent);
    return out.join(" ").replace(/\s+/g, " ").slice(0, 6000);
  });
}


/* What a free PLAN choice reads like - "Launch for free", "Free launch", "Free plan", "Join the free queue", "$0" -
 * as opposed to a menu entry such as "Free Tools". Searched only outside the site's nav, header and footer. */
const FREE_PLAN = /^\s*(free|\$\s?0|launch (for )?free|free launch|free (plan|listing|tier|option)|(submit|list|publish|continue|start|choose|select|join)( (for|the))? free( (queue|launch|plan))?|wait in line( for free)?)\b/i;
export async function freePlanOption(page) {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const money = /[$€£]\s?[1-9]|upgrade|promot|featured|sponsor|boost/i;
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inChrome = (el) => !!el.closest("nav, header, footer, [role=navigation], [role=banner], [role=contentinfo], [role=menu]");
    document.querySelectorAll("[data-reach-free]").forEach((e) => e.removeAttribute("data-reach-free"));
    for (const el of document.querySelectorAll('button, [role="radio"], [role="button"], label, input[type="radio"], a')) {
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
      if (!vis(el) || inChrome(el) || !text || text.length > 60 || money.test(text) || !re.test(text)) continue;
      if (el.tagName === "A" && !/claim|launch|plan|free|submit|queue/i.test(el.getAttribute("href") || "")) continue;
      el.setAttribute("data-reach-free", "1");
      return true;
    }
    return false;
  }, FREE_PLAN.source);
  return found ? page.locator('[data-reach-free="1"]').first() : null;
}

/** Claim with the private link, confirm the details, choose the FREE plan. Returns what it reached. */
export async function claimListing(page, item, trail) {
  await page.goto(item.claim_url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);
  if (/\/auth\//.test(page.url())) { await signIn(page); await page.goto(item.claim_url, { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(3000); }
  trail.push(["claim page", await seen(page)]);
  const claimBtn = page.getByRole("button", { name: /^\s*claim\b/i }).first();
  if (await claimBtn.count()) {
    trail.push(["clicked", await safeClick(page, claimBtn)]);
    trail.push(["after claim", { ...(await seen(page)), path: redact(page.url().split(item.product_id || "\u0000").join("{id}")) }]);
  }
  return planLoop(page, item, trail);
}

/** The product's own row on /user/products: does it still offer a launch plan, and what state does it show?
 *  The row is the repeated list item holding the product's name (or the block around a lone product). The plan link
 *  inside that row - and only that one - is marked for a click. */
async function rowState(page, name) {
  await page.goto(PP + "/user/products", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.evaluate((name) => {
    document.querySelectorAll("[data-reach-plan]").forEach((e) => e.removeAttribute("data-reach-plan"));
    const isPlan = (e) => /choose (a )?launch plan|choose (a )?plan/i.test((e.innerText || "").trim());
    const chrome = "nav, header, footer, [role=navigation], [role=banner], [role=contentinfo]";
    const sig = (e) => e.tagName + "." + (typeof e.className === "string" ? e.className : "");
    const rowOf = (leaf) => {
      for (let el = leaf; el && el.parentElement && el !== document.body; el = el.parentElement) {
        if ([...el.parentElement.children].filter((c) => sig(c) === sig(el)).length >= 2) return el;
      }
      let el = leaf;
      while (el.parentElement && el.parentElement !== document.body && (el.parentElement.innerText || "").length < 1500
        && [...el.parentElement.querySelectorAll("a, button")].filter(isPlan).length <= 1) el = el.parentElement;
      return el;
    };
    // text node by node, space-separated: innerText glues inline neighbours ("Coming soon"+"Actions")
    const words = (el) => { const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) out.push(w.currentNode.textContent); return out.join(" ").replace(/\s+/g, " ").trim(); };
    const leaves = [...document.querySelectorAll("body *")].filter((el) => !el.closest(chrome)
      && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").includes(name)));
    if (!leaves.length) return { listed: false, plan: false, ready: false, state: "", text: "" };
    const row = rowOf(leaves[0]);
    const plan = [...row.querySelectorAll("a, button")].find(isPlan);
    if (plan) plan.setAttribute("data-reach-plan", "1");
    const text = words(row).slice(0, 300);
    const ready = /\bready to launch\b/i.test(text);
    const m = text.match(/\bcoming soon\b|\bin (the )?(free )?queue\b|\bqueued\b|\bscheduled\b|\bwaiting\b|\bpublished\b|\blive\b|\blaunch(es|ing) (on|in)\b/i);
    return { listed: true, plan: !!plan, ready, state: m ? m[0] : "", text };
  }, name);
}

/** A claimed listing whose plan is not chosen yet: its own row's "Choose launch plan", then the free plan.
 *  A row no longer offering a plan is already past this step - nothing is chosen again. */
export async function finishListing(page, item, trail) {
  const r = await rowState(page, item.name);
  trail.push(["products page", { plan: r.plan, ready: r.ready, state: r.state, row: r.text.slice(0, 160) }]);
  if (!r.listed) return { reached: "claimed", free: false, note: "product not on /user/products" };
  if (!r.plan) return { reached: r.ready ? "claimed" : "submitted", free: false, note: r.state || r.text.slice(0, 80) };
  trail.push(["choose plan", await safeClick(page, page.locator('[data-reach-plan="1"]').first())]);
  trail.push(["plan page", { ...(await seen(page)), path: redact(page.url().split(item.product_id || "\u0000").join("{id}")) }]);
  return planLoop(page, item, trail);
}

/** A confirmation the free choice opened (a dialog), and its confirm button - never one that costs money. */
async function dialogConfirm(page) {
  const found = await page.evaluate(() => {
    document.querySelectorAll("[data-reach-ok]").forEach((e) => e.removeAttribute("data-reach-ok"));
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const boxes = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]')].filter(vis);
    for (const box of boxes) {
      for (const b of box.querySelectorAll("button, [role=button], input[type=submit]")) {
        const t = (b.innerText || b.value || "").trim().replace(/\s+/g, " ");
        if (!vis(b) || !t || /[$€£]\s?[1-9]|pay|checkout|upgrade|promot|featured|launch now|cancel|close|back/i.test(t)) continue;
        if (/^(join( the)?( free)?( launch)? queue|confirm|yes|continue|submit|ok|join|launch for free|use free|free)\b/i.test(t)) {
          b.setAttribute("data-reach-ok", "1");
          return { text: t, dialog: (box.innerText || "").replace(/\s+/g, " ").slice(0, 200) };
        }
      }
    }
    return null;
  });
  return found ? { loc: page.locator('[data-reach-ok="1"]').first(), ...found } : null;
}

const priced = (page) => page.locator("button, a, [role=button]").filter({ hasText: /[$€£]\s?[1-9]/ }).count();

/** Take the FREE plan, never anything that costs money, then prove it on the product's own row.
 *  - editor screens (no prices on them): Save / Continue / Next / Confirm / Submit / Done / Finish only
 *  - a page showing prices (the plan page): ONLY the free option and the confirmation it opens may be pressed
 *  - success is decided by /user/products alone: the row no longer offers a launch plan and is not "Ready to launch" */
async function planLoop(page, item, trail) {
  let free = false, last = "";
  const slugOf = () => (page.url().match(/\/p\/([^/?#]+)\/plans/) || [])[1] || "";
  let slug = slugOf();
  for (let step = 0; step < 7; step++) {
    if (PAY_URL.test(page.url())) throw new Error("a payment page opened - stopped, nothing paid");
    slug = slug || slugOf();
    if (!free) {
      const option = await freePlanOption(page);
      if (option) {
        trail.push(["free plan", await safeClick(page, option)]);
        const dlg = await dialogConfirm(page);
        trail.push(["after free", { ...(await seen(page)), dialog: dlg ? dlg.dialog : "" }]);
        if (dlg) trail.push(["confirmed", await safeClick(page, dlg.loc)]);
        free = true;
        break;
      }
    }
    if ((await priced(page)) > 0) { trail.push(["priced page", "no free option found - nothing pressed"]); break; }
    const go = page.getByRole("button", { name: /^\s*(save( and continue| changes)?|continue|next|confirm|submit|done|finish)\b/i }).first();
    if (!(await go.count()) || !(await go.isVisible().catch(() => false))) break;
    const label = await safeClick(page, go);
    const now = JSON.stringify(await seen(page));
    trail.push([`step ${step + 1}`, label]);
    if (now === last) { trail.push(["stuck", await seen(page)]); break; }   // the same screen twice: a field needs attention
    last = now;
  }
  const v = await rowState(page, item.name);
  trail.push(["verified on /user/products", { plan: v.plan, ready: v.ready, state: v.state, row: v.text.slice(0, 160) }]);
  const queued = v.listed && !v.plan && !v.ready;
  return { reached: queued ? "submitted" : "claimed", free, slug, note: v.state || v.text.slice(0, 80) };
}

/** REST status; live once PeerPush reports a published date. */
export async function watchListing(key, item) {
  const s = await pp(`/products/${encodeURIComponent(item.product_id)}/status`, key);
  const status = s.j?.data?.status || "";
  const slug = s.j?.data?.slug || item.slug || "";
  if (slug) {
    const p = await pp(`/products/${encodeURIComponent(slug)}`, key);
    const published = p.j?.data?.publishedAt || "";
    if (published) return { live: true, slug, published, url: p.j?.data?.url || `${PP}/p/${slug}` };
  }
  return { live: false, slug, status };
}

async function listing(page, { only = 0 } = {}) {
  const { key, made } = await ensureKey(page);
  note("2 key", made ? "made a new API key for the bot and kept it (sealed) on the hub" : "kept API key still valid");
  const q = await hub(`/v1/peerpush/queue?limit=3${only ? `&n=${only}` : ""}`);
  const done = [];
  for (const item of q.items) {
    const trail = [];
    try {
      if (item.phase === "create") {
        const c = await createListing(key, item);
        if (!c.ok) { await hub("/v1/peerpush/record", "POST", { n: item.n, status: "error", detail: c.detail }); done.push(`#${item.n} ${c.detail}`); continue; }
        await hub("/v1/peerpush/record", "POST", { n: item.n, status: "created", product_id: c.id, claim_url: c.claimUrl, detail: `logo ${redact(c.logoUrl)}` });
        Object.assign(item, { phase: "claim", product_id: c.id, claim_url: c.claimUrl });
        note(`3 #${item.n} created`, `product ${c.id}, tagline "${item.tagline}", logo ${redact(c.logoUrl)}`);
      }
      if (item.phase === "watch") {
        // PeerPush is the truth, not the hub's record: a listing its own row still offers a plan for is not queued
        const truth = await rowState(page, item.name);
        if (truth.listed && (truth.plan || truth.ready)) {
          note(`3 #${item.n} corrected`, `hub said queued, PeerPush shows "${truth.ready ? "Ready to launch" : "Choose launch plan"}" - finishing it now`);
          Object.assign(item, { phase: "claim", status: "claimed" });
        }
      }
      if (item.phase === "claim") {
        // a link already used to claim no longer opens: a claimed listing is finished from /user/products
        const r = item.status === "claimed" ? await finishListing(page, item, trail) : await claimListing(page, item, trail);
        if (r.slug) item.slug = r.slug;
        await hub("/v1/peerpush/record", "POST", { n: item.n, status: r.reached, slug: r.slug || item.slug || "",
          detail: r.reached === "submitted" ? `in the free queue - row shows: ${r.note || "no plan to choose"}`.slice(0, 280)
            : `claimed, not queued yet - row shows: ${r.note || "?"}`.slice(0, 280) });
        for (const [k, v] of trail.slice(-7)) note(`4 #${item.n} ${k}`, typeof v === "string" ? v : JSON.stringify(v));
        done.push(`#${item.n} ${r.reached === "submitted" ? "in the free queue (verified on /user/products)" : "claimed, NOT queued - " + (r.note || "?")}`);
        if (r.reached === "submitted") item.phase = "watch";
        else continue;
      }
      if (item.phase === "watch") {
        const w = await watchListing(key, item);
        if (w.live) await hub("/v1/peerpush/record", "POST", { n: item.n, status: "live", slug: w.slug, listing_url: w.url, published_at: w.published });
        else if (w.slug) await hub("/v1/peerpush/record", "POST", { n: item.n, status: "submitted", slug: w.slug, detail: `in the free queue (${w.status || "unpublished"})` });
        done.push(`#${item.n} ${w.live ? "LIVE " + w.url : "waiting in the free queue"}`);
      }
    } catch (e) {
      for (const [k, v] of trail.slice(-4)) note(`4 #${item.n} ${k}`, typeof v === "string" ? v : JSON.stringify(v));
      // the true state comes from PeerPush itself: claimed or still waiting for its claim
      let status = "error";
      if (item.product_id) {
        const s = await pp(`/products/${encodeURIComponent(item.product_id)}/status`, key).catch(() => null);
        status = s?.j?.data?.status === "claimed" ? "claimed" : "created";
      }
      await hub("/v1/peerpush/record", "POST", { n: item.n, status, detail: String(e.message || e).slice(0, 280) }).catch(() => null);
      throw new Error(`#${item.n}: ${e.message || e}`);
    }
  }
  return done.length ? done.join(" · ") : "nothing to do today";
}

/** Read-only: where does PeerPush keep a claimed product, and which links lead to its editor / launch flow?
 *  Navigates and reads only - no click on PeerPush. */
async function discover(page, n) {
  const { key } = await ensureKey(page);
  const item = (await hub(`/v1/peerpush/queue?n=${n}`)).items.find((i) => i.n === n);
  if (!item?.product_id) return "no product recorded for that door";
  const s = await pp(`/products/${encodeURIComponent(item.product_id)}/status`, key);
  const d = s.j?.data || {};
  const slug = d.slug || "";
  note("2 api status", JSON.stringify({ http: s.status, ...Object.fromEntries(Object.entries(d).filter(([k]) => !/claim|token|url/i.test(k))) }).slice(0, 600));
  const id = item.product_id;
  const mask = (u) => redact(String(u).split(id).join("{id}"));
  const paths = ["/user", "/user/products", "/dashboard", "/user/launches", ...(slug ? [`/products/${slug}`, `/p/${slug}`, `/${slug}`] : []), `/products/${id}/edit`, `/user/products/${id}`];
  for (const p of paths) {
    try {
      await page.goto(PP + p, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      const links = await page.evaluate(([idv, slugv]) => [...document.querySelectorAll("a[href]")]
        .map((a) => [(a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 28), a.href])
        .filter(([t, h]) => h && (h.includes(idv) || (slugv && h.includes(slugv)) || /edit|launch|plan|claim|submit|dashboard|my-?products/i.test(h + " " + t)))
        .slice(0, 10), [id, slug]);
      const v = await seen(page);
      note(`3 ${p.split(id).join("{id}")}`, JSON.stringify({ at: mask(page.url()), title: v.title, buttons: v.buttons.filter((b) => !/^(Browse|Integrate|1)$/.test(b)).slice(0, 8), links: links.map(([t, h]) => `${t}=${mask(h)}`) }));
    } catch (e) { note(`3 ${p}`, "error " + String(e.message).slice(0, 80)); }
  }
  // the product's own row now: still offering "Choose launch plan", or showing a queue state?
  await page.goto(PP + "/user/products", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const row = await page.evaluate((name) => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode.textContent);
    const text = out.join(" ").replace(/\s+/g, " ");
    const i = text.indexOf(name);
    const plan = [...document.querySelectorAll("a, button")].find((e) => /choose (a )?launch plan/i.test(e.innerText || ""));
    return { around: i >= 0 ? text.slice(Math.max(0, i - 40), i + 260) : "(name not on page)", plan_href: plan ? plan.href : "" };
  }, item.name);
  note("4 row now", JSON.stringify({ around: row.around.slice(0, 160), plan_link: row.plan_href ? redact(row.plan_href) : "none" }));
  if (row.plan_href) {
    await page.goto(row.plan_href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    // what the free choice IS, and what the action controls are - before and after selecting it (selection only:
    // proven harmless, it changes nothing on its own)
    const scan = () => page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const words = (el) => { const o = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (w.nextNode()) o.push(w.currentNode.textContent); return o.join(" ").replace(/\s+/g, " ").trim(); };
      const attrs = (e) => ["role", "type", "href", "aria-checked", "aria-selected", "aria-pressed", "aria-disabled", "data-state", "disabled", "name", "value", "form"]
        .map((a) => e.hasAttribute(a) ? `${a}=${String(e.getAttribute(a)).slice(0, 40)}` : "").filter(Boolean).join(" ");
      const free = [...document.querySelectorAll("button, a, label, [role], input")].filter(vis)
        .find((e) => /join the free queue/i.test(e.innerText || e.value || ""));
      const card = free ? (free.closest("[data-state], [role=radio], label, li, section, article, form, div") || free.parentElement) : null;
      const controls = [...document.querySelectorAll("main button, main a[href], main [role=button], main [role=radio], main input, form button")]
        .filter(vis).map((e) => `${e.tagName.toLowerCase()}[${attrs(e)}] "${(e.innerText || e.value || "").trim().replace(/\s+/g, " ").slice(0, 34)}"`).slice(0, 18);
      return {
        free: free ? `${free.tagName.toLowerCase()}[${attrs(free)}] "${(free.innerText || "").trim().slice(0, 40)}"` : "none",
        free_html: free ? free.outerHTML.replace(/\s+/g, " ").slice(0, 300) : "",
        card: card ? words(card).slice(0, 260) : "",
        form: free && free.closest("form") ? `${free.closest("form").getAttribute("action") || "(js)"} ${free.closest("form").method}` : "no form",
        controls
      };
    });
    const before = await scan();
    note("5 free choice", JSON.stringify({ free: before.free, form: before.form, html: before.free_html }));
    note("6 free card", before.card);
    note("7 controls before", before.controls.join(" | ").slice(0, 900));
    // let the page finish wiring its buttons (a Next.js page is inert until it hydrates)
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(3000);
    const wired = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) => /^\s*join the free queue\s*$/i.test(e.innerText || ""));
      if (!b) return { found: false };
      const pk = Object.keys(b).find((k) => k.startsWith("__reactProps"));
      const props = pk ? Object.keys(b[pk] || {}) : [];
      return { found: true, react: !!pk, handlers: props.filter((p) => /^on[A-Z]/.test(p)), disabled: b.disabled,
        nextReady: !!(window.next && window.next.router) || !!document.querySelector("#__next, [data-nextjs-scroll-focus-boundary]") };
    });
    note("7 button wiring", JSON.stringify(wired));
    const opt = page.getByRole("button", { name: /^\s*join the free queue\s*$/i }).first();
    if (await opt.count()) {
      // what the click does: every fetch/XHR it sends with PeerPush's reply, console errors, and any toast or
      // message that appears (a MutationObserver catches one that vanishes within seconds)
      const net = [];
      const onResp = async (r) => {
        const req = r.request();
        if (!["fetch", "xhr"].includes(req.resourceType())) return;
        let body = ""; try { body = (await r.text()).replace(/\s+/g, " ").slice(0, 220); } catch { body = "(no body)"; }
        net.push(`${req.method()} ${redact(r.url())} -> ${r.status()} ${body}`);
      };
      const cons = [];
      const onCons = (m) => { if (["error", "warning"].includes(m.type())) cons.push(m.text().slice(0, 160)); };
      page.on("response", onResp); page.on("console", onCons);
      await page.evaluate(() => {
        window.__reachToasts = [];
        new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          const t = (n.innerText || n.textContent || "").trim().replace(/\s+/g, " ");
          if (t && t.length < 400) window.__reachToasts.push(`<${n.tagName.toLowerCase()}${n.getAttribute("role") ? " role=" + n.getAttribute("role") : ""}> ${t}`);
        } }).observe(document.body, { childList: true, subtree: true });
        const push = history.pushState; history.pushState = function (...a) { window.__reachToasts.push("pushState " + String(a[2] || "")); return push.apply(this, a); };
      });
      await opt.click({ timeout: 10000 }).catch((e) => cons.push("click failed: " + e.message.slice(0, 100)));
      await page.waitForTimeout(6000);
      page.off("response", onResp); page.off("console", onCons);
      const toasts = await page.evaluate(() => window.__reachToasts || []);
      const after = await scan();
      note("8 click sent", (net.length ? net.join(" || ") : "no fetch/XHR at all").slice(0, 900));
      note("9 click said", JSON.stringify({ url: redact(page.url()), toasts: toasts.slice(0, 4), console: cons.slice(0, 4), card: after.card.slice(0, 160) }).slice(0, 900));
    }
  }
  return `status ${d.status || "?"}, slug ${slug || "-"}`;
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
    if (mode === "discover") {
      const n = Number(process.env.PEERPUSH_DOOR || 0);
      if (!n) throw new Error("discover needs a door number");
      note("verdict", `RESULT: PASS discover door ${n}: ${await discover(page, n)}`);
      return true;
    }
    if (mode === "list") {
      const only = Number(process.env.PEERPUSH_DOOR || 0);
      const said = await listing(page, { only });
      note("verdict", `RESULT: PASS list${only ? " door " + only : ""}: ${said}`);
      return true;
    }
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
  for (const n of notes.slice(-10)) console.log(`::notice title=PeerPush ${n.title}::${n.msg}`);
  if (!ok) process.exit(1);
}
