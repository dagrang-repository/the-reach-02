import { runFullStack } from "./briefing.js";
import { all, one, run } from "./db.js";
import { rebuildAtlas } from "./atlas.js";
import { numberedSites } from "./hill.js";
import { rebuildReachMap } from "./map.js";
import { announceReachFeed, pingReachMesh, reachAnnounceUrls } from "./announce.js";
import { keyForUrl } from "./known-keys.js";
import { readKeyFromOrigin, rememberOriginKey, verifyOriginKey } from "./ping.js";
import { ensureAnswerChannel } from "./stack.js";
import { isSelfUrl } from "./self.js";
import { json, normalizeOriginKey, nowIso, requireAdmin, uid, unauthorized } from "./util.js";

export const PAID_SLOTS = 13;

const api = (env) => (env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com");
const host = (env) => (env.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
const configured = (env) => !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET && env.PAYPAL_PLAN_ID);

async function ensurePaid(env) {
  await run(env, `CREATE TABLE IF NOT EXISTS paid_subs (
    id TEXT PRIMARY KEY,
    sub_id TEXT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    origin_key TEXT,
    status TEXT NOT NULL,
    site_id TEXT,
    door_n INTEGER,
    detail TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await run(env, `CREATE INDEX IF NOT EXISTS idx_paid_sub ON paid_subs(sub_id)`).catch(() => null);
}

async function activeCount(env) {
  const r = await one(env, "SELECT COUNT(*) AS c FROM paid_subs WHERE status = 'active'").catch(() => null);
  return r ? Number(r.c || 0) : 0;
}

export async function slotsOpen(env) {
  await ensurePaid(env);
  return (await activeCount(env)) < PAID_SLOTS;
}

async function paypalToken(env) {
  const res = await fetch(api(env) + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: "Basic " + btoa(env.PAYPAL_CLIENT_ID + ":" + env.PAYPAL_SECRET),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error("paypal auth failed");
  return data.access_token;
}

async function addSite(env, input) {
  const parsed = new URL(input.url);
  await ensureAnswerChannel(env);
  const existing = await one(env, "SELECT * FROM sites WHERE url = ?", parsed.toString());
  const id = existing?.id || uid("site");
  const ts = nowIso();
  if (existing) {
    await run(env, "UPDATE sites SET name = ?, updated_at = ?, active = 1 WHERE id = ?", String(input.name).slice(0, 80), ts, id);
  } else {
    await run(
      env,
      `INSERT INTO sites (id, name, url, languages_wanted, created_at, updated_at, active)
       VALUES (?, ?, ?, '[]', ?, ?, 1)`,
      id,
      String(input.name).slice(0, 80),
      parsed.toString(),
      ts,
      ts
    );
  }
  let site = await one(env, "SELECT * FROM sites WHERE id = ?", id);
  const injected = normalizeOriginKey(input.key || "");
  if (injected) {
    site = await rememberOriginKey(env, site, injected);
  } else {
    const known = keyForUrl(site.url);
    if (known) site = await rememberOriginKey(env, site, known);
    else {
      const found = await readKeyFromOrigin(site.url).catch(() => ({}));
      if (found && found.key) site = await rememberOriginKey(env, site, found.key);
    }
  }
  await runFullStack(env, site, true);
  const keyCheck = site.indexnow_key
    ? (isSelfUrl(site.url, env) ? { ok: true } : await verifyOriginKey(site).catch(() => ({ ok: false })))
    : { ok: false };
  const slots = await numberedSites(env, all);
  await pingReachMesh(env, reachAnnounceUrls(env, slots), uid("paid")).catch(() => null);
  await announceReachFeed(env).catch(() => null);
  await rebuildAtlas(env, [await one(env, "SELECT * FROM sites WHERE id = ?", id)]).catch(() => null);
  const slot = slots.find((s) => s.url === site.url) || null;
  return { site_id: id, door_n: slot ? slot.n : null, key_ok: !!keyCheck.ok };
}

async function activate(env, row, subId) {
  if (row.status === "active") return row;
  if ((await activeCount(env)) >= PAID_SLOTS) {
    await run(env, "UPDATE paid_subs SET status = 'waitlist', detail = 'slots full', updated_at = ? WHERE id = ?", nowIso(), row.id);
    return await one(env, "SELECT * FROM paid_subs WHERE id = ?", row.id);
  }
  let out = null;
  let detail = "";
  try {
    out = await addSite(env, { name: row.name, url: row.url, key: row.origin_key });
  } catch (err) {
    detail = String(err.message || err).slice(0, 180);
  }
  await run(
    env,
    "UPDATE paid_subs SET status = ?, sub_id = COALESCE(?, sub_id), site_id = ?, door_n = ?, detail = ?, updated_at = ? WHERE id = ?",
    out ? "active" : "failed",
    subId || null,
    out ? out.site_id : null,
    out ? out.door_n : null,
    detail,
    nowIso(),
    row.id
  );
  return await one(env, "SELECT * FROM paid_subs WHERE id = ?", row.id);
}

async function deactivate(env, row, why) {
  if (row.site_id) {
    await run(env, "UPDATE sites SET active = 0, updated_at = ? WHERE id = ?", nowIso(), row.site_id).catch(() => null);
    await run(env, "DELETE FROM atlas WHERE site_id = ?", row.site_id).catch(() => null);
    await rebuildReachMap(env).catch(() => null);
  }
  await run(env, "UPDATE paid_subs SET status = 'cancelled', detail = ?, updated_at = ? WHERE id = ?", String(why).slice(0, 120), nowIso(), row.id);
}

async function verifyWebhook(env, headers, raw) {
  const token = await paypalToken(env);
  const res = await fetch(api(env) + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_time: headers.get("paypal-transmission-time"),
      cert_url: headers.get("paypal-cert-url"),
      auth_algo: headers.get("paypal-auth-algo"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(raw),
    }),
  });
  const data = await res.json().catch(() => ({}));
  return data.verification_status === "SUCCESS";
}

function returnPage(env) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Subscription &mdash; The AI Hill Top Lighthouse</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
main{max-width:28rem;margin:0 auto;padding:3rem 1.25rem;text-align:center}
a{color:#8dff9a}h1{color:#8dff9a;font-size:1.3rem}</style></head>
<body><main><h1 id="t">Confirming your subscription...</h1><p id="p">This takes a few seconds.</p>
<p><a href="/">doors</a> &middot; <a href="/add">add page</a></p></main>
<script>
const j = new URLSearchParams(location.search).get("j");
let tries = 0;
async function poll(){
  tries++;
  try{
    const r = await fetch("/v1/join/status?j=" + encodeURIComponent(j));
    const d = await r.json();
    if(d.status === "active"){
      document.getElementById("t").textContent = "Live" + (d.door_n ? " as door #" + d.door_n : "");
      document.getElementById("p").innerHTML = d.door_n ? '<a href="/' + d.door_n + '">Open door #' + d.door_n + '</a>' : "Your listing is live.";
      return;
    }
    if(d.status === "failed" || d.status === "cancelled" || d.status === "waitlist"){
      document.getElementById("t").textContent = "Pending review";
      document.getElementById("p").textContent = "Your payment is recorded. The listing is being placed.";
      return;
    }
  }catch(e){}
  if(tries < 40) setTimeout(poll, 3000);
  else{
    document.getElementById("t").textContent = "Payment recorded";
    document.getElementById("p").textContent = "Your door goes live as soon as PayPal confirms. Check the doors page shortly.";
  }
}
if(j) poll();
</script></body></html>`;
}

export async function recheckPaidKeys(env) {
  await ensurePaid(env);
  const rows = await all(env, "SELECT * FROM paid_subs WHERE status = 'active' AND site_id IS NOT NULL").catch(() => []);
  for (const r of rows) {
    const site = await one(env, "SELECT * FROM sites WHERE id = ?", r.site_id).catch(() => null);
    if (!site || site.indexnow_key) continue;
    const found = await readKeyFromOrigin(site.url).catch(() => ({}));
    if (found && found.key) await rememberOriginKey(env, site, found.key).catch(() => null);
  }
}

export async function handlePaid(path, request, url, env) {
  if (path === "/v1/slots" && request.method === "GET") {
    const ready = configured(env);
    const open = ready ? await slotsOpen(env) : false;
    return json({ ok: true, ready, open, note: open ? "Listing slots are limited." : "Slots are currently full." });
  }

  if (path === "/v1/join" && request.method === "POST") {
    await ensurePaid(env);
    if (!configured(env)) return json({ ok: false, error: "Slots are currently full." }, 503);
    if (!(await slotsOpen(env))) return json({ ok: false, error: "Slots are currently full." }, 409);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim().slice(0, 80);
    const raw = String(body.url || "").trim();
    const key = normalizeOriginKey(String(body.key || "").trim());
    if (name.length < 2) return json({ ok: false, error: "site name required" }, 400);
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return json({ ok: false, error: "invalid url" }, 400);
    }
    if (!/^https?:$/.test(parsed.protocol)) return json({ ok: false, error: "url must be http or https" }, 400);
    if (parsed.hostname === new URL(host(env)).hostname) return json({ ok: false, error: "that URL is this directory" }, 400);
    const dupe = await one(env, "SELECT id FROM sites WHERE url = ? AND active = 1", parsed.toString()).catch(() => null);
    if (dupe) return json({ ok: false, error: "that URL is already listed" }, 409);
    const since = new Date(Date.now() - 3600000).toISOString();
    const flood = await one(env, "SELECT COUNT(*) AS c FROM paid_subs WHERE status = 'pending' AND created_at > ?", since).catch(() => null);
    if (flood && Number(flood.c || 0) > 20) return json({ ok: false, error: "try again in a few minutes" }, 429);

    const id = uid("join");
    const ts = nowIso();
    await run(
      env,
      `INSERT INTO paid_subs (id, name, url, origin_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      id,
      name,
      parsed.toString(),
      key || null,
      ts,
      ts
    );
    try {
      const token = await paypalToken(env);
      const res = await fetch(api(env) + "/v1/billing/subscriptions", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json", "PayPal-Request-Id": id },
        body: JSON.stringify({
          plan_id: env.PAYPAL_PLAN_ID,
          custom_id: id,
          application_context: {
            brand_name: "The AI Hill Top Lighthouse",
            user_action: "SUBSCRIBE_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: host(env) + "/paid/return?j=" + id,
            cancel_url: host(env) + "/add",
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const approve = (data.links || []).find((l) => l.rel === "approve");
      if (!approve) {
        await run(env, "UPDATE paid_subs SET status = 'failed', detail = ?, updated_at = ? WHERE id = ?", String(data.message || "no approval link").slice(0, 160), nowIso(), id);
        return json({ ok: false, error: "payment setup unavailable, try again shortly" }, 502);
      }
      await run(env, "UPDATE paid_subs SET sub_id = ?, updated_at = ? WHERE id = ?", data.id || null, nowIso(), id);
      return json({ ok: true, j: id, approve: approve.href });
    } catch (err) {
      await run(env, "UPDATE paid_subs SET status = 'failed', detail = ?, updated_at = ? WHERE id = ?", String(err.message || err).slice(0, 160), nowIso(), id);
      return json({ ok: false, error: "payment setup unavailable, try again shortly" }, 502);
    }
  }

  if (path === "/v1/join/status" && request.method === "GET") {
    await ensurePaid(env);
    const id = url.searchParams.get("j") || "";
    let row = await one(env, "SELECT * FROM paid_subs WHERE id = ?", id).catch(() => null);
    if (!row) return json({ ok: false, error: "unknown" }, 404);
    if (row.status === "pending" && row.sub_id && configured(env)) {
      try {
        const token = await paypalToken(env);
        const res = await fetch(api(env) + "/v1/billing/subscriptions/" + row.sub_id, { headers: { authorization: "Bearer " + token } });
        const data = await res.json().catch(() => ({}));
        if (data.status === "ACTIVE") row = await activate(env, row, row.sub_id);
      } catch {}
    }
    return json({ ok: true, status: row.status, door_n: row.door_n || null });
  }

  if (path === "/paid/return" && request.method === "GET") {
    return new Response(returnPage(env), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (path === "/paypal/webhook" && request.method === "POST") {
    await ensurePaid(env);
    const raw = await request.text();
    if (!env.PAYPAL_WEBHOOK_ID || !configured(env)) return json({ ok: false }, 503);
    const good = await verifyWebhook(env, request.headers, raw).catch(() => false);
    if (!good) return json({ ok: false, error: "bad signature" }, 400);
    const ev = JSON.parse(raw);
    const type = String(ev.event_type || "");
    const res = ev.resource || {};
    if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
      const row =
        (res.custom_id ? await one(env, "SELECT * FROM paid_subs WHERE id = ?", res.custom_id).catch(() => null) : null) ||
        (res.id ? await one(env, "SELECT * FROM paid_subs WHERE sub_id = ?", res.id).catch(() => null) : null);
      if (row) await activate(env, row, res.id || null);
      return json({ ok: true });
    }
    if (["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED"].includes(type)) {
      const row = res.id ? await one(env, "SELECT * FROM paid_subs WHERE sub_id = ?", res.id).catch(() => null) : null;
      if (row) await deactivate(env, row, type);
      return json({ ok: true });
    }
    if (type === "PAYMENT.SALE.DENIED" || type === "PAYMENT.SALE.REVERSED" || type === "PAYMENT.SALE.REFUNDED") {
      const sub = res.billing_agreement_id || null;
      const row = sub ? await one(env, "SELECT * FROM paid_subs WHERE sub_id = ?", sub).catch(() => null) : null;
      if (row) await deactivate(env, row, type);
      return json({ ok: true });
    }
    return json({ ok: true, ignored: type });
  }

  if (path === "/v1/paid" && request.method === "GET") {
    if (!requireAdmin(request, env)) return unauthorized();
    await ensurePaid(env);
    return json({
      ok: true,
      slots: PAID_SLOTS,
      used: await activeCount(env),
      subs: await all(env, "SELECT * FROM paid_subs ORDER BY created_at DESC LIMIT 100"),
    });
  }

  if (path === "/v1/paid/retry" && request.method === "POST") {
    if (!requireAdmin(request, env)) return unauthorized();
    await ensurePaid(env);
    const row = await one(env, "SELECT * FROM paid_subs WHERE id = ?", url.searchParams.get("j") || "").catch(() => null);
    if (!row) return json({ ok: false, error: "unknown" }, 404);
    return json({ ok: true, sub: await activate(env, row, row.sub_id) });
  }

  return null;
}