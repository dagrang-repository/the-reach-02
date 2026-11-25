/* The hub's own door (the hub listed among its doors): one canonical, the same in the header and in the head, and
   never a second copy of the home page in a sitemap. Uses the rig's database, where door 2 is the hub itself.
   Run: npm test. Skipped on a Node without node:sqlite. */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE = "https://reach2.aplusz.app";
let worker = null;
let env = null;
let skip = false;

before(async () => {
  try {
    const rig = await import("./rig.mjs");
    env = await rig.rigEnv();
    worker = (await import("../src/index.js")).default;
  } catch (err) {
    skip = `node:sqlite is not available on this Node (${process.version}): ${String(err?.message || err).slice(0, 80)}`;
  }
});

const ctx = { waitUntil() {} };
const get = async (path, headers = {}) => {
  const res = await worker.fetch(new Request(BASE + path, { headers }), env, ctx);
  return { res, status: res.status, text: await res.text(), link: res.headers.get("link") || "" };
};
const headCanonical = (html) => (html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/) || [])[1] || "";
const headerCanonical = (link) => (link.match(/<([^>]+)>;\s*rel="canonical"/) || [])[1] || "";
const t = (name, fn) => test(name, async (c) => (skip ? c.skip(skip) : fn(c)));

t("the hub's own door names the home page as canonical, in the header as in the head", async () => {
  const own = await get("/2");
  assert.equal(own.status, 200);
  assert.equal(headCanonical(own.text), `${BASE}/`);
  assert.equal(headerCanonical(own.link), `${BASE}/`, "the Link header and the head give one canonical");
  assert.match(own.link, new RegExp(`<${BASE}/index\\.md>; rel="alternate"; type="text/markdown"`));
  assert.equal((own.link.match(/rel="canonical"/g) || []).length, 1);
  /* its twins are the hub's twins */
  const md = await worker.fetch(new Request(`${BASE}/2.md`), env, ctx);
  assert.equal(md.status, 301);
  assert.equal(md.headers.get("location"), `${BASE}/index.md`);
  const js = await worker.fetch(new Request(`${BASE}/2.json`), env, ctx);
  assert.equal(js.status, 301);
  assert.equal(js.headers.get("location"), `${BASE}/sites.json`);
  /* asked for Markdown on the page address, it names the home page too */
  const neg = await get("/2", { accept: "text/markdown" });
  assert.equal(headerCanonical(neg.link), `${BASE}/`);
});

t("every other door, the home page and the about page name themselves, header and head alike", async () => {
  for (const p of ["/", "/about", "/1", "/3", "/4"]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    const want = p === "/" ? `${BASE}/` : BASE + p;
    assert.equal(headCanonical(r.text), want, `${p} head`);
    assert.equal(headerCanonical(r.link), want, `${p} header`);
  }
  for (const [twin, page] of [["/1.md", "/1"], ["/1.json", "/1"], ["/index.md", "/"], ["/about.md", "/about"]]) {
    const r = await get(twin);
    assert.equal(headerCanonical(r.link), BASE + page, `${twin} names its page`);
  }
});

t("the hub's own door is not a second home page in the sitemaps or one of 'these sites' in llms.txt", async () => {
  const pages = (await get("/sitemap-doors.xml")).text;
  const seconds = (await get("/sitemap-md.xml")).text;
  assert.ok(!pages.includes(`<loc>${BASE}/2</loc>`) && !seconds.includes(`<loc>${BASE}/2.md</loc>`));
  for (const n of [1, 3, 4]) assert.ok(pages.includes(`<loc>${BASE}/${n}</loc>`) && seconds.includes(`<loc>${BASE}/${n}.md</loc>`));
  const llms = (await get("/llms.txt")).text;
  assert.match(llms, /Which of these 3 live sites/);
  assert.ok(!llms.includes(`](${BASE}/2)`), "the hub does not route a question to itself");
});
