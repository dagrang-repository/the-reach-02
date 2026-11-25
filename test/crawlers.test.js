/* Crawler proof (src/crawlers.js): what counts as a verified visit. Real Ed25519 signatures, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  BOT_NAMES, botClass, crawlerTick, crawlersJson, dictMember, extractCidrs, in4, in6, logCrawlerHit, parseComponents,
  refreshRanges, safeAgentUrl, verifyBotIp, webBotAuth, whichBot,
} from "../src/crawlers.js";
import { openDb } from "./d1-shim.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const b64u = (buf) => Buffer.from(buf).toString("base64url");
let sqlite = true;
try { await import("node:sqlite"); } catch { sqlite = false; }
const dbTest = (name, fn) => test(name, async (t) => (sqlite ? fn(t) : t.skip("node:sqlite is not available on this Node")));
const newEnv = async () => ({ DB: await openDb(`${ROOT}schema.sql`) });

/** Run fn with fetch replaced by a map of url -> body | { status, body } | function. Returns the URLs fetched. */
async function withFetch(routes, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    let hit = routes[String(url)];
    if (typeof hit === "function") hit = hit(init);
    if (hit === undefined) return new Response("not found", { status: 404 });
    if (typeof hit === "string") return new Response(hit, { status: 200 });
    return new Response(hit.body ?? "", { status: hit.status ?? 200, headers: hit.headers || {} });
  };
  try { await fn(calls); } finally { globalThis.fetch = real; }
  return calls;
}

/* ---------- names and jobs ---------- */

test("user agents are filed under the right token and the right job", () => {
  const cases = [
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.3; +https://openai.com/gptbot)", "GPTBot", "train"],
    ["Mozilla/5.0 (compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot)", "OAI-SearchBot", "search"],
    ["Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)", "ChatGPT-User", "user"],
    ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot", "train"],
    ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0)", "Claude-SearchBot", "search"],
    ["Mozilla/5.0 (compatible; Claude-User/1.0)", "Claude-User", "user"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Agent/1.0) Chrome/154.0.0.0 Safari/537.36", "Claude-Agent", "agent"],
    ["Mozilla/5.0 (compatible; PerplexityBot/1.0)", "PerplexityBot", "search"],
    ["Mozilla/5.0 (compatible; Perplexity-User/1.0)", "Perplexity-User", "user"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot", "search"],
    ["Mozilla/5.0 (compatible; Google-Agent)", "Google-Agent", "agent"],
    ["Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "Bingbot", "search"],
    ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-externalagent", "train"],
    ["meta-webindexer/1.1", "meta-webindexer", "search"],
    ["meta-externalfetcher/1.1", "meta-externalfetcher", "user"],
    ["Mozilla/5.0 (compatible; Amzn-SearchBot/0.1)", "Amzn-SearchBot", "search"],
    ["Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", "Amazonbot", "search"],
    ["Mozilla/5.0 (compatible; MistralAI-User/1.0)", "MistralAI-User", "user"],
    ["Mozilla/5.0 (compatible; MistralAI-Index/1.0)", "MistralAI-Index", "search"],
    ["Mozilla/5.0 (compatible; Kimi-SearchBot/1.0)", "Kimi-SearchBot", "search"],
    ["CCBot/2.0 (https://commoncrawl.org/faq/)", "CCBot", "train"],
  ];
  for (const [ua, name, job] of cases) {
    assert.equal(whichBot(ua), name, ua);
    assert.equal(botClass(name), job, name);
  }
  assert.equal(whichBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36"), null, "a browser is not a crawler");
  assert.equal(botClass("signed:agent.bot.goog"), "agent");
  assert.equal(botClass("Meta"), "train", "rows logged under an older name keep their job");
  assert.equal(new Set(BOT_NAMES).size, BOT_NAMES.length);
});

/* ---------- IP ranges ---------- */

test("CIDR matching, IPv4 and IPv6", () => {
  assert.ok(in4("20.171.206.5", "20.171.206.0/24"));
  assert.ok(!in4("20.171.207.5", "20.171.206.0/24"));
  assert.ok(in4("1.2.3.4", "1.2.3.4/32"));
  assert.ok(in6("2a03:2880:f800:1::5", "2a03:2880:f800::/40"));
  assert.ok(!in6("2a03:2881::5", "2a03:2880:f800::/40"));
  assert.ok(!in4("not-an-ip", "1.2.3.0/24"));
});

test("range documents are read whatever their shape, and a per-bot list is not mixed with its neighbour's", () => {
  const google = JSON.stringify({ creationTime: "2026-11-25T10:00:00.000000", prefixes: [{ ipv4Prefix: "66.249.64.0/27" }, { ipv6Prefix: "2001:4860:4801:10::/64" }] });
  assert.deepEqual(extractCidrs(google, "Googlebot"), ["66.249.64.0/27", "2001:4860:4801:10::/64"]);
  const perBot = JSON.stringify({ updated: "2026-11-20", ClaudeBot: { ipv4: ["160.79.104.0/23"] }, "Claude-User": { ipv4: ["160.79.106.0/24"], ipv6: ["2607:6bc0::/48"] } });
  assert.deepEqual(extractCidrs(perBot, "ClaudeBot"), ["160.79.104.0/23"]);
  assert.deepEqual(extractCidrs(perBot, "Claude-User"), ["160.79.106.0/24", "2607:6bc0::/48"]);
  const named = JSON.stringify({ bots: [{ name: "claudebot", prefixes: [{ cidr: "10.1.0.0/16" }] }, { name: "Claude-SearchBot", prefixes: [{ cidr: "10.2.0.0/16" }] }] });
  assert.deepEqual(extractCidrs(named, "Claude-SearchBot"), ["10.2.0.0/16"]);
  assert.deepEqual(extractCidrs(named, "Some-Other-Bot").sort(), ["10.1.0.0/16", "10.2.0.0/16"], "no label for this token: the vendor's whole list");
  /* a signed list: a compact JWS whose payload is the JSON; bare addresses are single hosts */
  const jws = `${b64u("{}")}.${b64u(JSON.stringify({ addresses: ["34.1.2.3", "2600:1900::1", "34.9.0.0/20"] }))}.${b64u("sig")}`;
  assert.deepEqual(extractCidrs(jws, "Claude-Agent"), ["34.1.2.3/32", "2600:1900::1/128", "34.9.0.0/20"]);
  assert.deepEqual(extractCidrs(JSON.stringify({ payload: b64u(JSON.stringify(["52.0.0.0/8"])), signatures: [] }), "x"), ["52.0.0.0/8"]);
  /* a page that prints its ranges */
  assert.deepEqual(extractCidrs("<html><li>52.70.240.171/32</li><li>2600:1f18::/36</li> updated 10:00:00 on 2026-11-25</html>", "Amazonbot"), ["52.70.240.171/32", "2600:1f18::/36"]);
  assert.deepEqual(extractCidrs("", "x"), []);
  assert.deepEqual(extractCidrs("<html>no ranges here, version 1.2.3</html>", "x"), []);
  assert.deepEqual(extractCidrs(JSON.stringify({ prefixes: [{ ipv4Prefix: "999.1.1.1/24" }, { ipv4Prefix: "1.1.1.0/40" }] }), "x"), [], "invalid ranges are dropped");
});

dbTest("a bad answer never replaces a good list, and a failed refresh is not retried every hour", async () => {
  const env = await newEnv();
  const good = JSON.stringify({ prefixes: [{ ipv4Prefix: "20.171.206.0/24" }] });
  await withFetch({ "https://openai.com/gptbot.json": good }, async () => {
    await refreshRanges(env, { max: 50 });
  });
  assert.ok(await verifyBotIp(env, "GPTBot", "20.171.206.9"));
  assert.ok(!(await verifyBotIp(env, "GPTBot", "8.8.8.8")), "a name with the wrong address is not verified");
  assert.ok(!(await verifyBotIp(env, "CCBot", "20.171.206.9")), "no published ranges: never verified by IP");
  /* the vendor now answers garbage: the list we hold stays */
  await withFetch({ "https://openai.com/gptbot.json": "<html>maintenance</html>" }, async () => {
    await refreshRanges(env, { max: 50, force: true });
  });
  assert.ok(await verifyBotIp(env, "GPTBot", "20.171.206.9"), "the last good list survives a bad answer");
  /* every vendor file was tried a moment ago: the next tick fetches nothing */
  const calls = await withFetch({}, async () => { await refreshRanges(env, { max: 50 }); });
  assert.equal(calls.length, 0);
});

dbTest("the daily refresh is spread: at most `max` vendor files per tick, a shared file fetched once", async () => {
  const env = await newEnv();
  const first = await withFetch({}, async () => { await refreshRanges(env, { max: 5 }); });
  assert.ok(first.length <= 5, `${first.length} files in one tick`);
  assert.equal(new Set(first).size, first.length, "no file is fetched twice in one tick");
  const all = new Set(first);
  for (let i = 0; i < 12; i++) for (const u of await withFetch({}, async () => { await refreshRanges(env, { max: 5 }); })) all.add(u);
  assert.ok(all.has("https://claude.com/crawling/bots.json") && all.has("https://claude.com/.well-known/sail"));
  assert.ok(all.has("https://developers.google.com/static/crawling/ipranges/common-crawlers.json"), "the range files at their current addresses");
  assert.ok(all.has("https://www.perplexity.com/perplexitybot.json"));
  assert.ok(![...all].some((u) => u.includes("/static/search/apis/ipranges/") || u.includes("perplexity.ai")), "no retired address");
  assert.equal((await crawlerTick(env)).refreshed, 0);
});

/* ---------- Web Bot Auth ---------- */

async function agentKey() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const thumb = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`{"crv":"Ed25519","kty":"OKP","x":"${jwk.x}"}`)));
  return { pair, jwk: { kty: "OKP", crv: "Ed25519", x: jwk.x }, thumb };
}

/** A signed GET. `mode`: "01" (dictionary Signature-Agent, ;key= component) or "00" (bare string, plain component). */
async function signed(key, { url = "https://hub.test/1", agent = "https://agent.test/jwks.json", mode = "01", components = null, created = null, expires = null, tag = "web-bot-auth", tamper = false, keyid = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const c = created ?? now - 5;
  const e = expires ?? now + 300;
  const saHeader = mode === "01" ? `sig1="${agent}"` : `"${agent}"`;
  const comps = components ?? (mode === "01" ? ['"@authority"', '"signature-agent";key="sig1"'] : ['"@authority"', '"signature-agent"']);
  const params = `(${comps.join(" ")});created=${c};expires=${e};keyid="${keyid ?? key.thumb}";alg="ed25519";tag="${tag}"`;
  const u = new URL(url);
  const lines = comps.map((id) => {
    if (id === '"@authority"') return `${id}: ${u.host}`;
    if (id === '"@target-uri"') return `${id}: ${u.href}`;
    if (id === '"@method"') return `${id}: GET`;
    if (id === '"signature-agent";key="sig1"') return `${id}: "${agent}"`;
    if (id === '"signature-agent"') return `${id}: ${saHeader}`;
    throw new Error(`test cannot sign ${id}`);
  });
  lines.push(`"@signature-params": ${params}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key.pair.privateKey, new TextEncoder().encode(lines.join("\n"))));
  if (tamper) sig[0] ^= 0xff;
  return new Request(url, { headers: { "Signature-Input": `sig1=${params}`, Signature: `sig1=:${Buffer.from(sig).toString("base64")}:`, "Signature-Agent": saHeader, "User-Agent": "SomeAgent/1.0" } });
}

test("signature parsing helpers", () => {
  const c = parseComponents('"@authority" "signature-agent";key="sig1" "content-digest"');
  assert.deepEqual(c.map((x) => x.name), ["@authority", "signature-agent", "content-digest"]);
  assert.equal(c[1].id, '"signature-agent";key="sig1"');
  assert.equal(c[1].params.key, "sig1");
  assert.equal(parseComponents('"@authority" garbage'), null);
  assert.equal(dictMember('sig1="https://a.test/k.json", sig2="https://b.test/k.json"', "sig2"), '"https://b.test/k.json"');
  assert.equal(dictMember('"https://a.test"', "sig1"), null);
  assert.equal(safeAgentUrl("https://agent.bot.goog").href, "https://agent.bot.goog/.well-known/http-message-signatures-directory", "an origin-only value is the older form: the well-known directory");
  assert.equal(safeAgentUrl("https://agent.test/keys/jwks.json").href, "https://agent.test/keys/jwks.json", "a URL with a path is the JWK Set itself");
  for (const bad of ["http://agent.test/jwks.json", "https://127.0.0.1/jwks.json", "https://localhost/jwks.json", "https://[::1]/k", "https://box.internal/k", "https://user:pw@agent.test/k", "not a url"]) assert.equal(safeAgentUrl(bad), null, bad);
});

dbTest("Web Bot Auth: a valid signature is verified - the current draft form and the older one", async () => {
  const key = await agentKey();
  const jwks = JSON.stringify({ keys: [key.jwk] });
  for (const mode of ["01", "00"]) {
    const env = await newEnv();
    const agent = mode === "01" ? "https://agent.test/jwks.json" : "https://agent.test";
    const keyUrl = mode === "01" ? agent : "https://agent.test/.well-known/http-message-signatures-directory";
    await withFetch({ [keyUrl]: jwks }, async (calls) => {
      const r = await webBotAuth(env, await signed(key, { mode, agent }));
      assert.deepEqual(r, { state: "verified", agent: mode === "01" ? "agent.test/jwks.json" : "agent.test" }, `draft -${mode}`);
      assert.deepEqual(calls, [keyUrl], "the key is fetched from the URL the agent names, and nowhere else");
      /* the key set is cached: a second request costs no fetch */
      assert.equal((await webBotAuth(env, await signed(key, { mode, agent }))).state, "verified");
      assert.equal(calls.length, 1);
    });
  }
});

dbTest("Web Bot Auth: what is NOT verified", async () => {
  const key = await agentKey();
  const other = await agentKey();
  const jwks = JSON.stringify({ keys: [key.jwk] });
  const routes = { "https://agent.test/jwks.json": jwks };
  const state = async (opts, r = routes) => { const env = await newEnv(); let out; await withFetch(r, async () => { out = await webBotAuth(env, await signed(opts.key || key, opts)); }); return out.state; };
  assert.equal(await state({ tamper: true }), "invalid", "a signature that does not verify");
  assert.equal(await state({ url: "https://hub.test/2", components: ['"@target-uri"', '"signature-agent";key="sig1"'] }), "verified", "@target-uri may stand in for @authority");
  assert.equal(await state({ components: ['"signature-agent";key="sig1"'] }), "invalid", "neither @authority nor @target-uri is covered");
  assert.equal(await state({ components: ['"@authority"'] }), "invalid", "the agent header is sent but not covered");
  assert.equal(await state({ expires: Math.floor(Date.now() / 1000) - 10, created: Math.floor(Date.now() / 1000) - 100 }), "invalid", "expired");
  assert.equal(await state({ created: Math.floor(Date.now() / 1000) - 10, expires: Math.floor(Date.now() / 1000) + 90000 }), "invalid", "valid for more than 24 hours");
  assert.equal(await state({ tag: "something-else" }), "none", "a signature with another tag is not ours to judge");
  assert.equal(await state({ key: other }), "unverified", "the key is not in the set the agent publishes");
  assert.equal(await state({}, {}), "unverified", "the key URL does not answer");
  assert.equal(await state({}, { "https://agent.test/jwks.json": { status: 302, headers: { location: "https://evil.test/jwks.json" } }, "https://evil.test/jwks.json": jwks }), "unverified", "a redirect is not followed");
  assert.equal(await state({ agent: "http://agent.test/jwks.json" }), "unverified", "a plain-http key URL is never fetched");
  /* the RFC 9421 example key is never an agent, even when a directory lists it */
  const rfc = { kty: "OKP", crv: "Ed25519", x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs" };
  const rfcThumb = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`{"crv":"Ed25519","kty":"OKP","x":"${rfc.x}"}`)));
  assert.equal(rfcThumb, "poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U");
  assert.equal(await state({ keyid: rfcThumb }, { "https://agent.test/jwks.json": JSON.stringify({ keys: [rfc] }) }), "unverified");
  /* a signature over plain HTTP is refused */
  const env = await newEnv();
  await withFetch(routes, async () => { assert.equal((await webBotAuth(env, await signed(key, { url: "http://hub.test/1" }))).state, "invalid"); });
  assert.equal((await webBotAuth(env, new Request("https://hub.test/1"))).state, "none", "an unsigned request");
});

dbTest("Web Bot Auth: a failed fetch never evicts a key already held; a directory that resolves replaces the set", async () => {
  const key = await agentKey();
  const env = await newEnv();
  const url = "https://agent.test/jwks.json";
  await withFetch({ [url]: JSON.stringify({ keys: [key.jwk] }) }, async () => { assert.equal((await webBotAuth(env, await signed(key))).state, "verified"); });
  /* the cached set is now stale, and the directory is down */
  await env.DB.prepare("UPDATE wba_directory SET at = ? WHERE url = ?").bind(Date.now() - 2 * 3600000, url).run();
  await withFetch({ [url]: { status: 503 } }, async (calls) => {
    assert.equal((await webBotAuth(env, await signed(key))).state, "verified", "the key we hold still verifies");
    assert.equal((await webBotAuth(env, await signed(key))).state, "verified");
    assert.equal(calls.length, 1, "the failed fetch is remembered for five minutes, not repeated per request");
  });
  /* the directory answers again, without the key: the key is gone */
  const other = await agentKey();
  await env.DB.prepare("DELETE FROM wba_directory WHERE url = ?").bind(`neg:${url}`).run();
  await withFetch({ [url]: JSON.stringify({ keys: [other.jwk] }) }, async () => { assert.equal((await webBotAuth(env, await signed(key))).state, "unverified"); });
});

dbTest("a visit is logged with its verdict and no address; the public totals separate verified from claimed", async () => {
  const env = await newEnv();
  await withFetch({ "https://openai.com/gptbot.json": JSON.stringify({ prefixes: [{ ipv4Prefix: "20.171.206.0/24" }] }) }, async () => { await refreshRanges(env, { max: 50 }); });
  const hit = (ua, ip, path) => logCrawlerHit(env, new Request(`https://hub.test${path}`, { headers: { "User-Agent": ua, "CF-Connecting-IP": ip } }), path, 200);
  await hit("Mozilla/5.0 (compatible; GPTBot/1.3)", "20.171.206.9", "/1.md");
  await hit("Mozilla/5.0 (compatible; GPTBot/1.3)", "203.0.113.7", "/1");
  await hit("Mozilla/5.0 (compatible; Claude-User/1.0)", "203.0.113.8", "/2.json");
  assert.equal(await hit("Mozilla/5.0 Chrome/141.0", "203.0.113.9", "/"), false, "a browser is not logged");
  const rows = (await env.DB.prepare("SELECT * FROM crawler_hits ORDER BY id").all()).results;
  assert.deepEqual(rows.map((r) => [r.bot, r.class, r.door, r.verified]), [["GPTBot", "train", 1, 1], ["GPTBot", "train", 1, 0], ["Claude-User", "user", 2, 0]]);
  assert.ok(!JSON.stringify(rows).includes("203.0.113") && !JSON.stringify(rows).includes("20.171.206"), "no address is stored");
  const pub = await crawlersJson(env, [{ n: 1, name: "Visa Answers" }, { n: 2, name: "Cheap Flights" }]);
  const gpt = pub.bots.find((b) => b.bot === "GPTBot");
  assert.equal(gpt.verified_30d, 1);
  assert.equal(gpt.claimed_30d, 2);
  assert.deepEqual(pub.by_class_30d.train, { verified_30d: 1, claimed_30d: 2 });
  assert.deepEqual(pub.door_renderings_30d, { html: 1, markdown: 1, json: 1 });
  assert.deepEqual(pub.web_bot_auth_30d, { verified: 0, unverified: 0, invalid: 0 });
  assert.ok(pub.classes.agent);
  assert.ok(!JSON.stringify(pub).includes("203.0.113"));
});
