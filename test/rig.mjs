/* The rig: the hub served from this folder on 127.0.0.1, with an in-memory database and a few sample doors.
   No Cloudflare account, no network, nothing written anywhere. It is what the sweep is run against before a deploy:

     node test/rig.mjs                  (port 8772)
     pwsh tools/reachability.ps1 -Hub http://127.0.0.1:8772 -HubOnly

   The served files name the canonical origin (REACH_PUBLIC_URL), exactly as in production; the sweep rewrites
   those URLs to the rig before it probes them. Needs Node 22.5 or later (node:sqlite). */
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import { openDb } from "./d1-shim.js";
import { seedAtlas } from "./seed.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8772);
const CANON = process.env.REACH_PUBLIC_URL || "https://reach2.aplusz.app";

export async function rigEnv() {
  const DB = await openDb(`${ROOT}schema.sql`);
  /* the same public vars the Worker is deployed with (wrangler.jsonc), so the sweep finds the key file it expects */
  const vars = /"INDEXNOW_KEY"\s*:\s*"([A-Za-z0-9_-]{8,128})"/.exec(readFileSync(`${ROOT}wrangler.jsonc`, "utf8"));
  const env = { DB, REACH_PUBLIC_URL: CANON, INDEXNOW_KEY: vars ? vars[1] : "0123456789abcdef0123456789abcdef", ADMIN_TOKEN: "rig-token" };
  const now = new Date().toISOString();
  const add = (id, name, url, n, description) =>
    DB.prepare("INSERT INTO sites (id, name, url, languages_wanted, indexnow_key, created_at, updated_at, active, description, door_n) VALUES (?, ?, ?, '[]', ?, ?, ?, 1, ?, ?)")
      .bind(id, name, url, `k${n}0123456789abcdef0123456789ab`, "2026-10-01T08:00:00.000Z", `2026-11-${10 + n}T09:00:00.000Z`, description, n)
      .run();
  /* the hub's own door sits between the others, as in production: its twins are the hub's twins */
  await add("rig1", "Visa Answers", "https://visa-answers.test/", 1, "Do I need a visa for a country with my passport?");
  await add("rig0", "The Reach 02", `${CANON}/`, 2, "Which of these live sites answers my question?");
  await add("rig2", "Cheap Flights", "https://cheap-flights.test/", 3, "Which day is the cheapest to fly?");
  await add("rig3", "Globe Warn", "https://globe-warn.test/", 4, "Is there a travel warning for this country?");
  /* the atlas job ran: /match has something to match against, as in production */
  await seedAtlas(worker, env, CANON, [{ id: "rig1", n: 1, key: "visa" }, { id: "rig2", n: 3, key: "flights" }, { id: "rig3", n: 4, key: "warn" }]);
  /* the hourly cron ran: /status.json reports the hub as healthy */
  await DB.prepare("INSERT INTO runs (id, started_at, finished_at, trigger, ok, attempted, delivered, skipped, failed, detail) VALUES ('rig_run', ?, ?, 'cron', 1, 0, 0, 0, 0, 'rig')").bind(now, now).run();
  return env;
}

export async function startRig(port = PORT) {
  const env = await rigEnv();
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => null)) };
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && k !== "host" && k !== "connection") headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
      const out = await worker.fetch(request, env, ctx);
      const h = {};
      for (const [k, v] of out.headers) h[k] = v;
      res.writeHead(out.status, h);
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`rig error: ${String(err?.stack || err)}\n`);
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, env, url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/* started only when run directly; under the test runner (which loads every file in test/) it stays a module */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && !process.env.NODE_TEST_CONTEXT) {
  const rig = await startRig();
  console.log(`rig: ${rig.url}  (canonical origin in served files: ${CANON})`);
}
