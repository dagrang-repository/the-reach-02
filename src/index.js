import { briefingPublic, materializeTargets, runFullStack } from "./briefing.js";
import { runCycle, status } from "./cycle.js";
import { all, one, run } from "./db.js";
import { sweepDoors } from "./doors.js";
import { addSiteHtml } from "./add-ui.js";
import { pwaResponse } from "./pwa.js";
import { hillHtml, numberedSites } from "./hill.js";
import { rebuildReachMap } from "./map.js";
import {
  announceReachFeed,
  atomXml,
  feedXml,
  jsonLdDoor,
  jsonLdHill,
  linkHeaders,
  pingReachMesh,
  reachAnnounceUrls,
  reachKey,
} from "./announce.js";
import { keyForUrl } from "./known-keys.js";
import { catalogFromSlots, changesTxt, listChanges, publicPings } from "./outreach.js";
import { pingAllSites, readKeyFromOrigin, recentPings, rememberOriginKey, verifyOriginKey } from "./ping.js";
import { ensureAnswerChannel, loadPack, SITE_FEATURES, STACK_VERSION } from "./stack.js";
import { json, normalizeOriginKey, nowIso, requireAdmin, uid, unauthorized } from "./util.js";

export default {
  async scheduled(_controller, env) {
    await ensureAnswerChannel(env);
    await sweepDoors(env);
    await runCycle(env, "cron");
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const pwa = pwaResponse(path); if (pwa) return pwa;

    const publicMap = await one(env, "SELECT * FROM reach_map WHERE id = 'reach'").catch(() => null);
    const slots = await numberedSites(env, all).catch(() => []);

    const rk = reachKey(env);
    if (path === `/${rk}.txt` && request.method === "GET") {
      return new Response(rk, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if ((path === "/add" || path === "/admin") && request.method === "GET") {
      return new Response(addSiteHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/" && request.method === "GET") {
      return new Response(hillHtml(slots), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          link: `</llms.txt>; rel="alternate"; type="text/markdown", </catalog.json>; rel="alternate"; type="application/json", </feed.xml>; rel="alternate"; type="application/rss+xml"`,
        },
      });
    }
    const numbered = path.match(/^\/(\d+)$/);
    if (numbered && request.method === "GET") {
      const slot = slots.find((s) => s.n === Number(numbered[1]));
      if (!slot) return json({ ok: false, error: "no door at that number" }, 404);
      if (url.searchParams.get("go") === "1") return Response.redirect(slot.url, 302);
      const payload = {
        ok: true,
        n: slot.n,
        hash: slot.hash,
        path: slot.path,
        name: slot.name,
        live: slot.url,
        punch: slot.punch,
        languages: slot.languages || [],
        jsonld: jsonLdDoor(slot, env),
      };
      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          etag: `"n${slot.n}-${slot.id}"`,
          "last-modified": new Date().toUTCString(),
          link: linkHeaders(slot, env),
        },
      });
    }
    if (path === "/llms.txt" && request.method === "GET") {
      return new Response(publicMap?.llms_txt || "# The Reach 02\n", {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    if (path === "/sitemap.xml" && request.method === "GET") {
      return new Response(publicMap?.sitemap_xml || "<urlset></urlset>", {
        headers: { "content-type": "application/xml; charset=utf-8" },
      });
    }
    if (path === "/robots.txt" && request.method === "GET") {
      const host = env.REACH_PUBLIC_URL || "https://reach2.aplusz.app";
      return new Response(`User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml\n`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (path === "/OPEN-DOORS.json" && request.method === "GET") {
      return json(JSON.parse(publicMap?.doors_json || "[]"));
    }
    if (path === "/SITE-STRUCTURE.md" && request.method === "GET") {
      return new Response(publicMap?.structure_md || "", {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    if (path === "/catalog.json" && request.method === "GET") {
      return json(catalogFromSlots(slots));
    }
    if (path === "/changes.txt" && request.method === "GET") {
      const rows = await listChanges(env, 80).catch(() => []);
      return new Response(changesTxt(rows), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (path === "/pings" && request.method === "GET") {
      const rows = await publicPings(env, 60).catch(() => []);
      return json({ ok: true, pings: rows });
    }
    if ((path === "/feed.xml" || path === "/rss.xml") && request.method === "GET") {
      return new Response(feedXml(slots, env), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
    }
    if (path === "/atom.xml" && request.method === "GET") {
      return new Response(atomXml(slots, env), { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
    }
    if (path === "/jsonld.json" && request.method === "GET") {
      return json(jsonLdHill(slots, env));
    }

    if (path === "/v1/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "the-reach-02",
        cron: "0 */2 * * * UTC",
        must: "outward pings every cycle",
        stack_version: STACK_VERSION,
        features: SITE_FEATURES.map((f) => f.id),
      });
    }

    if ((path === "/v1/doors" || path === "/doors") && request.method === "GET") {
      return json(await sweepDoors(env));
    }

    if (path === "/v1/map" && request.method === "GET") {
      const map = await one(env, "SELECT * FROM reach_map WHERE id = 'reach'");
      return json({ ok: true, map });
    }

    if (path === "/cdn-cgi/handler/scheduled" || path === "/__scheduled") {
      const result = await runCycle(env, "local-test");
      return json(result, result.ok ? 200 : 500);
    }

    if (!requireAdmin(request, env)) return unauthorized();

    try {
      if (path === "/v1/status" && request.method === "GET") return json(await status(env));

      if (path === "/v1/run" && request.method === "POST") {
        const result = await runCycle(env, "manual");
        return json(result, result.ok ? 200 : 500);
      }

      if (path === "/v1/ping" && request.method === "POST") {
        const runId = uid("run");
        const pings = await pingAllSites(env, runId);
        return json({ ok: pings.ok, pings });
      }

      if (path === "/v1/pings" && request.method === "GET") {
        return json({ ok: true, pings: await recentPings(env) });
      }

      if (path === "/v1/map" && request.method === "POST") {
        const map = await rebuildReachMap(env);
        return json({ ok: true, sites: map.sites });
      }

      if (path === "/v1/sites" && request.method === "GET") {
        const sites = await all(env, "SELECT * FROM sites ORDER BY created_at DESC");
        return json({ ok: true, sites, stack_version: STACK_VERSION });
      }

      if (path === "/v1/sites" && request.method === "POST") {
        const body = await request.json();
        if (!body?.name || !body?.url) {
          return json({ ok: false, error: "name and url required" }, 400);
        }
        const injected = normalizeOriginKey(body.key || body.origin_key || body.indexnow_key || "");
        let parsed;
        try {
          parsed = new URL(body.url);
        } catch {
          return json({ ok: false, error: "invalid url" }, 400);
        }
        await ensureAnswerChannel(env);
        const existing = await one(env, "SELECT * FROM sites WHERE url = ?", parsed.toString());
        const id = existing?.id || uid("site");
        const ts = nowIso();
        if (existing) {
          await run(
            env,
            `UPDATE sites SET name = ?, updated_at = ?, active = 1 WHERE id = ?`,
            String(body.name).slice(0, 80),
            ts,
            id
          );
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
          const keyCheck = site.indexnow_key
            ? await verifyOriginKey(site)
            : { ok: false, detail: "no key on add and no indexnow-key meta on the page" };
          const afterSlots = await numberedSites(env, all);
          const announced = await pingReachMesh(env, reachAnnounceUrls(env, afterSlots), uid("add"));
          await announceReachFeed(env);
          return json({
            ok: true,
            site: await one(env, "SELECT * FROM sites WHERE id = ?", id),
            key_check: keyCheck,
            briefing: briefingPublic(out.briefing),
            pack: { features: out.pack?.features, doors: out.pack?.doors, ping_urls: out.pack?.pingUrls },
            map: out.map,
            announced: announced.urls,
            stack_version: STACK_VERSION,
          });
        } catch (err) {
          return json({ ok: false, site, error: String(err.message || err) });
        }
      }

      if (path.startsWith("/v1/sites/") && path.endsWith("/brief") && request.method === "POST") {
        const siteId = path.split("/")[3];
        const site = await one(env, "SELECT * FROM sites WHERE id = ?", siteId);
        if (!site) return json({ ok: false, error: "site not found" }, 404);
        const out = await runFullStack(env, site, true);
        return json({ ok: true, briefing: briefingPublic(out.briefing), pack: out.pack });
      }

      if (path.startsWith("/v1/sites/") && path.includes("/files") && request.method === "GET") {
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
        const type = fileKey.endsWith(".json")
          ? "application/json"
          : fileKey.endsWith(".xml")
            ? "application/xml"
            : fileKey.endsWith(".md")
              ? "text/markdown; charset=utf-8"
              : "text/plain; charset=utf-8";
        return new Response(body, { headers: { "content-type": type } });
      }

      if (path.startsWith("/v1/sites/") && path.endsWith("/pack") && request.method === "GET") {
        const siteId = path.split("/")[3];
        const pack = await loadPack(env, siteId);
        if (!pack) return json({ ok: false, error: "pack not found" }, 404);
        return json({ ok: true, pack });
      }

      if (path === "/v1/channels" && request.method === "POST") {
        const body = await request.json();
        const type = String(body.type || "");
        if (!["webhook", "discord", "telegram", "resend", "answer_engine"].includes(type)) {
          return json({ ok: false, error: "bad type" }, 400);
        }
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

      if (path === "/v1/ledger" && request.method === "GET") {
        return json({ ok: true, ledger: await all(env, "SELECT * FROM ledger ORDER BY sent_at DESC LIMIT 100") });
      }
      if (path === "/v1/runs" && request.method === "GET") {
        return json({ ok: true, runs: await all(env, "SELECT * FROM runs ORDER BY started_at DESC LIMIT 50") });
      }

      return json({ ok: false, error: "not found" }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err.message || err) }, 500);
    }
  },
};
