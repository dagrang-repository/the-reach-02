import { briefingPublic, materializeTargets, runFullStack } from "./briefing.js";
import { CRONS, CRON_TRUTH, SWEEP_BODY_MAX, latestSweep, runCycle, status, storeSweep } from "./cycle.js";
import { all, one, run } from "./db.js";
import { loadSweep, refreshSweeps } from "./doors.js";
import { addSiteHtml } from "./add-ui.js";
import { captureBatch, captureSite, captureView, ensureCaptureColumns } from "./capture.js";
import { handleWikidata, wikidataJson, wikidataTick } from "./wikidata.js";
import { handleWayback, waybackJson, waybackTick } from "./wayback.js";
import { handlePaid, recheckPaidKeys } from "./paid.js";
import { pwaResponse } from "./pwa.js";
import { publicExtra } from "./public-extra.js";
import { isSelfUrl } from "./self.js";
import { handleAtlas, handleBriefs, listGaps, rebuildAtlas } from "./atlas.js";
import { doorNumberState, ensureDoorNumbers, hillHtml, numberedSites, publicBase } from "./hill.js";
import { DEFAULT_MACHINE_ENTRIES, networkSitemapsJson, rebuildReachMap, sitemapDoorsXml, sitemapIndexXml, sitemapMachineXml } from "./map.js";
import * as announce from "./announce.js";
import { announceReachFeed, pingReachMesh, reachAnnounceItems, reachKey } from "./mesh.js";
import { keyForUrl } from "./known-keys.js";
import { catalogFromSlots, changesTxt, listChanges, publicPings } from "./outreach.js";
import { pingAllSites, readKeyFromOrigin, recentPings, rememberOriginKey, verifyOriginKey } from "./ping.js";
import { ensureAnswerChannel, loadPack, SITE_FEATURES, STACK_VERSION } from "./stack.js";
import { json, normalizeOriginKey, nowIso, readBodyCapped, requireAdmin, uid, unauthorized } from "./util.js";
import { mcp } from "./mcp.js";
import { bingSubmitSitemap, gscSubmitSitemap } from "./outreach.js";
import { sweepAllowsPing } from "./sweep.js";
import { healthReport } from "./health.js";
import { a2a } from "./a2a.js";
import { safeUrl } from "./seo.js";
import { handleEmail, handleInbox } from "./inbox.js";
import { decorate, doorDateOf, doorHtmlOf, doorJsonOf, doorMarkdownOf, etagOf, homeMarkdownOf, hubSurfaces, isNoindex, loadA, preflight, tagged } from "./surfaces.js";

const { atomXml, feedXml, jsonLdHill } = announce;
/* /rss.xml serves RSS 2.0; /feed.xml is Atom. announce.js may export rssXml; until then feedXml is the RSS body. */
const rssXml = typeof announce.rssXml === "function" ? announce.rssXml : feedXml;

const HTML = "text/html; charset=utf-8";
const MD = "text/markdown; charset=utf-8";
const JSON_T = "application/json; charset=utf-8";
const XML = "application/xml; charset=utf-8";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const SCHEDULED_PATHS = new Set(["/cdn-cgi/handler/scheduled", "/__scheduled"]);

function notFound(path) {
  if (path.endsWith(".json")) return json({ ok: false, found: false, error: `no resource at ${path}` }, 404);
  return new Response(`Not found: ${path}\n`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export default {
  /* Cloudflare Email Routing -> peerpush@aplusz.app lands here (src/inbox.js). Forwards nothing. */
  async email(message, env) {
    await handleEmail(message, env);
  },

  async scheduled(controller, env) {
    if (controller && controller.cron === "0 */6 * * *") {
      /* the six-hourly run leaves its own runs row (trigger 'atlas'), so the health report can see it ran */
      const runId = uid("run");
      const started = nowIso();
      let ok = true;
      let detail = "";
      try {
        const a = await rebuildAtlas(env);
        detail = `atlas: ${a?.generated ?? 0} generated, ${a?.skipped ?? 0} unchanged, ${a?.failed ?? 0} failed`;
        ok = !a?.failed;
      } catch (err) {
        ok = false;
        detail = `atlas failed: ${String(err?.message || err).slice(0, 300)}`;
      }
      const g = await submitHubSitemap(env).catch((err) => ({ ok: false, reason: String(err?.message || err) }));
      detail += ` · sitemaps: ${g.skipped ? `skipped (${g.reason})` : g.reason}`;
      await run(env, `INSERT INTO runs (id, started_at, finished_at, trigger, ok, attempted, delivered, skipped, failed, detail) VALUES (?, ?, ?, 'atlas', ?, 0, 0, 0, 0, ?)`, runId, started, nowIso(), ok ? 1 : 0, detail.slice(0, 800)).catch(() => null);
      return;
    }
    await ensureAnswerChannel(env);
    await ensureCaptureColumns(env).catch(() => null);
    const slots = await numberedSites(env, all).catch(() => []);
    await refreshSweeps(env, slots, publicBase(env)).catch(() => null);
    await recheckPaidKeys(env).catch(() => null);
    await captureBatch(env, 3, 24).catch(() => null);
    await runCycle(env, "cron");
    await wikidataTick(env).catch(() => null);
    await waybackTick(env).catch(() => null);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    /* one origin: any other host (workers.dev, previews) is one 301 to the canonical origin; loopback is wrangler dev */
    const canon = new URL(publicBase(env));
    if (url.host !== canon.host && !LOOPBACK.test(url.hostname)) {
      return decorate(Response.redirect(`${canon.origin}${url.pathname}${url.search}`, 301), path, env, request.method);
    }
    if (request.method === "OPTIONS") return decorate(preflight(), path, env, request.method);

    const isHead = request.method === "HEAD";
    const req = isHead ? new Request(request, { method: "GET" }) : request;

    let res;
    try {
      res = await route(req, env, url, path);
    } catch (err) {
      /* the exception text stays in the log and goes to the owner (admin token); a stranger gets the fact of the
         failure, not the database's wording */
      console.error(`unhandled ${request.method} ${path}:`, err?.stack || err);
      res = json({ ok: false, error: requireAdmin(request, env) ? String(err?.message || err).slice(0, 400) : "internal error" }, 500);
    }
    res = decorate(res, path, env, request.method);
    return isHead ? new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
  },
};

async function route(request, env, url, path) {
  const method = request.method;
  const base = publicBase(env);
  const pwa = pwaResponse(path);
  if (pwa) return pwa;

  const publicMap = await one(env, "SELECT * FROM reach_map WHERE id = 'reach'").catch(() => null);
  const slots = await numberedSites(env, all).catch(() => []);

  /* the tool endpoints: /mcp (and POST on the card path), /a2a */
  if (path === "/mcp" || (path === "/.well-known/mcp-server" && method === "POST")) return mcp(request, env, slots);
  if (path === "/a2a") return a2a(request, url, env, slots);

  if (method === "GET") {
    const surface = await hubSurfaces(path, request, url, env, slots, publicMap);
    if (surface) return surface;
    const extra = await publicExtra(path, env, slots, publicMap);
    if (extra) return extra;

    const rk = reachKey(env);
    if (path === `/${rk}.txt`) return new Response(rk, { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (path === "/add" || path === "/admin") return new Response(addSiteHtml(), { headers: { "content-type": HTML } });

    /* the home page and its twin */
    if (path === "/" || path === "/index.md") {
      const accept = request.headers.get("accept") || "";
      const stamp = publicMap?.updated_at ? new Date(publicMap.updated_at) : null;
      if (path === "/index.md" || accept.includes("text/markdown")) {
        return tagged(await homeMarkdownOf(slots, env, publicMap), MD, request, { lastModified: stamp });
      }
      return tagged(hillHtml(slots, jsonLdHill(slots, env, publicMap), env, publicMap), HTML, request, { lastModified: stamp });
    }

    /* the doors: /{n} negotiates HTML | JSON | Markdown; /{n}.json and /{n}.md are the fixed forms; unknown n is a real 404 */
    const door = path.match(/^\/(\d+)(\.md|\.json|\.html\.md)?$/);
    if (door) {
      const n = Number(door[1]);
      const ext = door[2] || "";
      if (ext === ".html.md") return Response.redirect(`${base}/${n}.md`, 301);
      /* one spelling per door: /01, /001, /1/ are one 301 to /1 (rank 15) */
      if (door[1] !== String(n) || (url.pathname !== path && url.pathname.endsWith("/"))) {
        return Response.redirect(`${base}/${n}${ext}${url.search}`, 301);
      }
      const accept = request.headers.get("accept") || "";
      const shape = ext === ".json" ? "json" : ext === ".md" ? "md" : accept.includes("text/markdown") ? "md" : accept.includes("application/json") ? "json" : "html";
      const slot = slots.find((s) => s.n === n);
      /* the hub's own door: its twins are the hub's twins (rank 14), so nothing pinged 404s */
      if (slot && isSelfUrl(slot.url, env)) {
        if (ext === ".md") return Response.redirect(`${base}/index.md`, 301);
        if (ext === ".json") return Response.redirect(`${base}/sites.json`, 301);
      }
      if (!slot) {
        /* a number is never reused: one that belonged to a deactivated door is 410 Gone, one never issued is 404 */
        if ((await doorNumberState(env, n)) === "gone") {
          if (shape === "json") return json({ ok: false, found: false, gone: true, n, hub: `${base}/` }, 410);
          return new Response(`Door ${n} is gone: it was removed from this network, and a door number is never reused.\nAll doors: ${base}/\n`, { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        if (shape === "json") return json({ ok: false, found: false, error: "no door at that number", doors: slots.length, hub: `${base}/` }, 404);
        const ns = slots.map((s) => s.n).filter(Number.isFinite);
        const lo = ns.length ? Math.min(...ns) : 0;
        const hi = ns.length ? Math.max(...ns) : 0;
        const range = ns.length ? `Door numbers run from ${lo} to ${hi} (${ns.length} doors; a removed number is never reused): ${base}/${lo} … ${base}/${hi}` : "There are no doors yet.";
        return new Response(`No door at ${path}\n${range}\n`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      if (url.searchParams.get("go") === "1") {
        /* only an http(s) live URL is ever a Location; anything else stored is printed on the door, never followed */
        const live = safeUrl(slot.url);
        if (!live) return new Response(`Door ${n} has no http(s) live URL to follow: ${slot.url}\n`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
        return Response.redirect(live, 302);
      }
      const lastModified = await doorDateOf(slot);
      if (shape === "json") {
        /* the ETag is taken over the record without its per-request retrieved_at, so If-None-Match can answer 304 */
        const rec = await doorJsonOf(slot, env, slots);
        const etag = etagOf(JSON.stringify({ ...rec, retrieved_at: undefined }));
        return tagged(JSON.stringify(rec, null, 2) + "\n", JSON_T, request, { lastModified, etag });
      }
      if (shape === "md") return tagged(await doorMarkdownOf(slot, env, slots), MD, request, { lastModified });
      return tagged(await doorHtmlOf(slot, env, slots), HTML, request, { lastModified });
    }

    const atlas = await handleAtlas(path, url, env);
    if (atlas) return atlas;

    if (path === "/llms.txt") return new Response(publicMap?.llms_txt || "# The AI Hill Top Lighthouse\n", { headers: { "content-type": MD } });

    /* sitemaps: hub-host children only; other origins' sitemaps are advisory in /network-sitemaps.json */
    const stamp = publicMap?.updated_at || null;
    if (path === "/sitemap.xml" || path === "/sitemap-index.xml") return new Response(sitemapIndexXml(env, stamp), { headers: { "content-type": XML } });
    if (path === "/sitemap-doors.xml") {
      const dates = new Map();
      for (const s of slots) dates.set(s.n, await doorDateOf(s));
      return new Response(sitemapDoorsXml(slots, env, dates, stamp), { headers: { "content-type": XML } });
    }
    if (path === "/sitemap-machine.xml") {
      /* ONE list: seo/structure.json's machine_entry_points_in_sitemap (DEFAULT_MACHINE_ENTRIES is that same array),
         so what the file declares is what the sitemap carries; a noindex path (API routes, /match, the admin pages -
         the one list in seo/structure.json) is never a sitemap <loc>; the /.well-known cards are not noindex, so they
         are listed and served indexable - the sitemap and the headers say the same thing */
      const A = await loadA();
      const entries = [...new Set([...DEFAULT_MACHINE_ENTRIES, ...(A.STRUCTURE?.machine_entry_points_in_sitemap || [])])].filter((p) => !isNoindex(p));
      return new Response(sitemapMachineXml(env, stamp, entries), { headers: { "content-type": XML } });
    }
    if (path === "/network-sitemaps.json") return json(networkSitemapsJson(slots, env));

    if (path === "/OPEN-DOORS.json") return json(JSON.parse(publicMap?.doors_json || "[]"));
    if (path === "/SITE-STRUCTURE.md") return new Response(publicMap?.structure_md || "", { headers: { "content-type": MD } });
    if (path === "/catalog.json") return json(catalogFromSlots(slots, env));
    if (path === "/changes.txt") {
      const rows = await listChanges(env, 80).catch(() => []);
      return new Response(changesTxt(rows), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (path === "/pings") return json({ ok: true, pings: await publicPings(env, 60).catch(() => []) });

    /* feeds: Atom at /feed.xml (and /atom.xml), RSS 2.0 at /rss.xml */
    if (path === "/feed.xml" || path === "/atom.xml") return new Response(atomXml(slots, env), { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
    if (path === "/rss.xml") return new Response(rssXml(slots, env), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });

    if (path === "/jsonld.json") return json(jsonLdHill(slots, env, publicMap));
    if (path === "/wikidata.json") return json(wikidataJson(slots, base));
    if (path === "/wayback.json") return json(await waybackJson(env, slots, base));

    if (path === "/v1/health") {
      return json({ ok: true, service: "the-reach-02", crons: CRONS, schedule: CRON_TRUTH, stack_version: STACK_VERSION, features: SITE_FEATURES.map((f) => f.id) });
    }
    /* the last stored sweep, written by scheduled(); a public GET never probes the origins */
    if (path === "/v1/doors" || path === "/doors") {
      const stored = await loadSweep(env, "doors");
      return json({ ...stored, refresh: `POST ${base}/v1/doors (Bearer)` });
    }
    if (path === "/v1/map") return json({ ok: true, map: publicMap });
  }

  const paid = await handlePaid(path, request, url, env);
  if (paid) return paid;

  /* an unknown path outside /v1/ is a real 404 - the admin gate guards /v1/* and the scheduled test paths only */
  if (!path.startsWith("/v1/") && !SCHEDULED_PATHS.has(path)) return notFound(path);

  if (!requireAdmin(request, env)) return unauthorized();

  if (SCHEDULED_PATHS.has(path)) {
    const result = await runCycle(env, "local-test");
    return json(result, result.ok ? 200 : 500);
  }

  if (path === "/v1/status" && method === "GET") return json({ ...(await status(env)), health: await healthReport(env, slots) });
  /* THE SWEEP'S VERDICT: tools/reachability.ps1 posts its reach-doors.json here after every run;
     the cycle reads the latest verdict and never pings over a failing sweep (playbook PART 20) */
  if (path === "/v1/sweep" && method === "POST") {
    /* read to the cap and no further: a larger sweep is refused whole (413), never cut into broken JSON */
    const read = await readBodyCapped(request, SWEEP_BODY_MAX);
    if (read.tooBig) return json({ ok: false, error: `sweep body too large: ${SWEEP_BODY_MAX} bytes at most`, max_bytes: SWEEP_BODY_MAX }, 413);
    let body = null;
    try { body = JSON.parse(read.text); } catch { body = null; }
    if (!body || typeof body.verdict !== "string") return json({ ok: false, error: "verdict required" }, 400);
    return json({ ok: true, sweep: await storeSweep(env, body) });
  }
  if (path === "/v1/sweep" && method === "GET") return json({ ok: true, sweep: await latestSweep(env) });

  const wd = await handleWikidata(path, request, url, env);
  if (wd) return wd;
  const wb = await handleWayback(path, request, url, env);
  if (wb) return wb;
  const ib = await handleInbox(path, request, url, env);
  if (ib) return ib;

  if (path === "/v1/doors" && method === "POST") {
    return json(await refreshSweeps(env, slots, base));
  }

  if (path === "/v1/run" && method === "POST") {
    const result = await runCycle(env, "manual");
    return json(result, result.ok ? 200 : 500);
  }

  if (path === "/v1/atlas" && method === "POST") {
    const out = await rebuildAtlas(env, null, url.searchParams.get("force") === "1");
    return json({ ok: true, atlas: out });
  }

  if (path === "/v1/capture" && method === "POST") {
    await ensureCaptureColumns(env);
    const n = Number(url.searchParams.get("n") || 0);
    if (n) {
      const slot = slots.find((s) => s.n === n);
      if (!slot) return json({ ok: false, error: "no door at that number" }, 404);
      const site = await one(env, "SELECT * FROM sites WHERE id = ?", slot.id);
      const captured = await captureSite(env, site, { description: url.searchParams.get("description") || "", sitemap: url.searchParams.get("sitemap") || "", llms: url.searchParams.get("llms") || "" });
      await rebuildReachMap(env);
      const after = (await numberedSites(env, all)).find((s) => s.n === n);
      return json({ ok: true, captured_at: captured.captured_at, record: captureView(after, env, base) });
    }
    const limit = Math.max(1, Math.min(12, Number(url.searchParams.get("limit") || 6)));
    const maxAge = Number(url.searchParams.get("max_age_hours") ?? 24);
    const out = await captureBatch(env, limit, maxAge);
    if (out.captured) await rebuildReachMap(env);
    return json({ ok: true, ...out });
  }

  if (path === "/v1/capture" && method === "GET") {
    await ensureCaptureColumns(env);
    const rows = await all(env, "SELECT name, url, captured_at, description IS NOT NULL AND description != '' AS has_description, sitemap_url IS NOT NULL AND sitemap_url != '' AS has_sitemap, llms_url IS NOT NULL AND llms_url != '' AS has_llms, languages_count FROM sites WHERE active = 1 ORDER BY created_at ASC");
    return json({ ok: true, total: rows.length, captured: rows.filter((r) => r.captured_at).length, sites: rows });
  }

  if (path === "/v1/gaps" && method === "GET") return json({ ok: true, gaps: await listGaps(env) });

  if (path.startsWith("/v1/briefs") && method === "GET") {
    const briefs = await handleBriefs(path, env);
    if (briefs) return briefs;
  }

  if (path === "/v1/ping" && method === "POST") {
    const runId = uid("run");
    const pings = await pingAllSites(env, runId);
    return json({ ok: pings.ok, pings });
  }

  if (path === "/v1/pings" && method === "GET") return json({ ok: true, pings: await recentPings(env) });

  if (path === "/v1/map" && method === "POST") {
    const map = await rebuildReachMap(env);
    return json({ ok: true, sites: map.sites });
  }

  if (path === "/v1/sites" && method === "GET") {
    const sites = await all(env, "SELECT * FROM sites ORDER BY created_at DESC");
    return json({ ok: true, sites, stack_version: STACK_VERSION });
  }

  if (path === "/v1/sites" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ ok: false, error: "a JSON body is required: {name, url}" }, 400);
    if (!body?.name || !body?.url) return json({ ok: false, error: "name and url required" }, 400);
    const injected = normalizeOriginKey(body.key || body.origin_key || body.indexnow_key || "");
    let parsed;
    try {
      parsed = new URL(body.url);
    } catch {
      return json({ ok: false, error: "invalid url" }, 400);
    }
    /* a door's live URL is fetched, redirected to, linked from the twins and listed in the feeds: http(s) only */
    if (!/^https?:$/.test(parsed.protocol)) return json({ ok: false, error: "url must be http or https" }, 400);
    await ensureAnswerChannel(env);
    const existing = await one(env, "SELECT * FROM sites WHERE url = ?", parsed.toString());
    const id = existing?.id || uid("site");
    const ts = nowIso();
    if (existing) {
      await run(env, `UPDATE sites SET name = ?, updated_at = ?, active = 1 WHERE id = ?`, String(body.name).slice(0, 80), ts, id);
    } else {
      await run(
        env,
        `INSERT INTO sites (id, name, url, languages_wanted, created_at, updated_at, active)
         VALUES (?, ?, ?, '[]', ?, ?, 1)`,
        id,
        String(body.name).slice(0, 80),
        parsed.toString(),
        ts,
        ts
      );
      await ensureDoorNumbers(env); /* the new door's permanent number: MAX(door_n)+1, never a reused one */
    }
    let site = await one(env, "SELECT * FROM sites WHERE id = ?", id);
    if (injected) {
      site = await rememberOriginKey(env, site, injected);
    } else {
      const known = keyForUrl(site.url);
      if (known) site = await rememberOriginKey(env, site, known);
      else {
        const found = await readKeyFromOrigin(site.url);
        if (found.key) site = await rememberOriginKey(env, site, found.key);
      }
    }
    try {
      const out = await runFullStack(env, site, true);
      site = await captureSite(env, site, { description: body.description || "", sitemap: body.sitemap || "", llms: body.llms || "" }).catch(() => site);
      await rebuildReachMap(env);
      const keyCheck = site.indexnow_key
        ? isSelfUrl(site.url, env)
          ? { url: "", status: 200, ok: true, detail: "self: worker serves its own key file" }
          : await verifyOriginKey(site, env) /* with env: the check it runs is recorded as door_status.key_ok */
        : { ok: false, detail: "no key on add and no indexnow-key meta on the page" };
      const afterSlots = await numberedSites(env, all);
      /* pingReachMesh and announceReachFeed carry the sweep gate themselves (src/sweep.js): never over a failing sweep */
      const announced = await pingReachMesh(env, await reachAnnounceItems(env, afterSlots), uid("add"));
      if (announced.doors_changed) await announceReachFeed(env);
      await rebuildAtlas(env, [await one(env, "SELECT * FROM sites WHERE id = ?", id)]).catch(() => null);
      const slotNow = afterSlots.find((s) => s.id === id);
      return json({
        ok: true,
        site: await one(env, "SELECT * FROM sites WHERE id = ?", id),
        record: slotNow ? captureView(slotNow, env, base) : null,
        key_check: keyCheck,
        briefing: briefingPublic(out.briefing, site.name),
        pack: { features: out.pack?.features, doors: out.pack?.doors, ping_urls: out.pack?.pingUrls },
        map: out.map,
        announced: announced.urls,
        announce_report: announced.report,
        stack_version: STACK_VERSION,
      });
    } catch (err) {
      return json({ ok: false, site, error: String(err.message || err) });
    }
  }

  if (path.startsWith("/v1/sites/") && path.endsWith("/brief") && method === "POST") {
    const siteId = path.split("/")[3];
    const site = await one(env, "SELECT * FROM sites WHERE id = ?", siteId);
    if (!site) return json({ ok: false, error: "site not found" }, 404);
    const out = await runFullStack(env, site, true);
    await captureSite(env, site).catch(() => null);
    await rebuildReachMap(env);
    await rebuildAtlas(env, [site]).catch(() => null);
    return json({ ok: true, briefing: briefingPublic(out.briefing, site.name), pack: out.pack });
  }

  if (path.startsWith("/v1/sites/") && path.includes("/files") && method === "GET") {
    const parts = path.split("/").filter(Boolean);
    const siteId = parts[2];
    const pack = await loadPack(env, siteId);
    if (!pack) return json({ ok: false, error: "pack not found" }, 404);
    const files = pack.files || {};
    const fileKey = parts.slice(4).join("/");
    if (!fileKey) {
      return json({
        ok: true,
        files: Object.keys(files).filter((k) => k !== "gaps" && k !== "backlinks"),
        curl: Object.keys(files)
          .filter((k) => typeof files[k] === "string")
          .map((k) => `curl -sS -H "Authorization: Bearer $TOKEN" $HOST/v1/sites/${siteId}/files/${k} -o public/${k}`),
      });
    }
    const body = files[fileKey];
    if (typeof body !== "string") return json({ ok: false, error: "file not found" }, 404);
    return new Response(body, { headers: { "content-type": packFileType(fileKey) } });
  }

  if (path.startsWith("/v1/sites/") && path.endsWith("/pack") && method === "GET") {
    const siteId = path.split("/")[3];
    const pack = await loadPack(env, siteId);
    if (!pack) return json({ ok: false, error: "pack not found" }, 404);
    return json({ ok: true, pack });
  }

  if (path === "/v1/channels" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ ok: false, error: "a JSON body is required: {type, name, url?}" }, 400);
    const type = String(body.type || "");
    if (!["webhook", "discord", "telegram", "resend", "answer_engine"].includes(type)) return json({ ok: false, error: "bad type" }, 400);
    const id = uid("ch");
    await run(
      env,
      `INSERT INTO channels (id, type, name, config_json, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      id,
      type,
      String(body.name || type).slice(0, 80),
      JSON.stringify({ url: body.url || null, chat_id: body.chat_id || null, from: body.from || null }),
      nowIso()
    );
    const sites = await all(env, "SELECT id FROM sites WHERE active = 1");
    for (const s of sites) await materializeTargets(env, s.id);
    return json({ ok: true, channel_id: id });
  }

  if (path === "/v1/ledger" && method === "GET") return json({ ok: true, ledger: await all(env, "SELECT * FROM ledger ORDER BY sent_at DESC LIMIT 100") });
  if (path === "/v1/runs" && method === "GET") return json({ ok: true, runs: await all(env, "SELECT * FROM runs ORDER BY started_at DESC LIMIT 50") });

  return json({ ok: false, error: "not found" }, 404);
}

/** The MIME a pack file is served with when downloaded through /v1/sites/{id}/files/{key}. */
function packFileType(key) {
  if (key === "license.xml") return "application/rsl+xml; charset=utf-8";
  if (/^llms[^/]*\.txt$/.test(key) || key.startsWith("llms/")) return "text/markdown; charset=utf-8";
  if (key === ".well-known/api-catalog") return "application/linkset+json; charset=utf-8";
  if (key === "opensearch.xml") return "application/opensearchdescription+xml; charset=utf-8";
  if (key === "manifest.json") return "application/manifest+json; charset=utf-8";
  if (key === "openapi.json") return "application/vnd.oai.openapi+json; charset=utf-8";
  if (key === "feed.xml") return "application/atom+xml; charset=utf-8";
  if (key === "feed.json") return "application/feed+json; charset=utf-8";
  if (key === "sw.js") return "text/javascript; charset=utf-8";
  if (key.startsWith(".well-known/mcp") || key.startsWith(".well-known/agent")) return "application/json; charset=utf-8";
  if (key === "_headers" || key === "_redirects" || key.endsWith(".txt") || key.endsWith(".sh")) return "text/plain; charset=utf-8";
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (key.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (key.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

/** Search Console: the hub's own sitemap index, submitted when the map's content moved since the last accepted
 *  submission (never on a schedule alone), never over a failing sweep. Off until the owner sets GSC_SA_JSON. */
async function submitHubSitemap(env) {
  const gate = await sweepAllowsPing(env);
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  const base = publicBase(env);
  const sitemap = `${base}/sitemap.xml`;
  const map = await one(env, "SELECT updated_at FROM reach_map WHERE id = 'reach'").catch(() => null);
  const engines = [
    { kind: "gsc-hub", endpoint: "webmasters.sitemaps.put", on: !!env.GSC_SA_JSON, send: () => gscSubmitSitemap(env, sitemap) },
    { kind: "bing-hub", endpoint: "bing.SubmitFeed", on: !!env.BING_WEBMASTER_KEY, send: () => bingSubmitSitemap(env, `${base}/`, sitemap) },
  ];
  const said = [];
  for (const e of engines) {
    if (!e.on) { said.push(`${e.kind}: off`); continue; }
    const last = await one(env, "SELECT created_at FROM pings WHERE kind = ? AND ok = 1 ORDER BY created_at DESC LIMIT 1", e.kind).catch(() => null);
    if (last && map?.updated_at && last.created_at >= map.updated_at) { said.push(`${e.kind}: unchanged`); continue; }
    const out = await e.send();
    if (out.skipped) { said.push(`${e.kind}: ${out.reason}`); continue; }
    await run(env, `INSERT INTO pings (id, run_id, site_id, kind, endpoint, url, status, ok, detail, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`, uid("ping"), e.kind, e.endpoint, sitemap, out.status || 0, out.ok ? 1 : 0, out.property ? `property ${out.property}` : out.detail || out.reason || "", nowIso()).catch(() => null);
    said.push(`${e.kind}: ${out.ok ? "submitted" : `failed ${out.status || ""}`}`);
  }
  return { ok: true, reason: said.join(", ") };
}
