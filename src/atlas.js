/** Atlas — the network's self-maintaining knowledge base and query matcher.
 *  /atlas.md (human/AI doc) · /atlas.json (database) · /match?q= (search-term → door).
 *  Rebuilt by the 6h cron and on every site add; change-gated on briefing stamp; no fetches. */
import { all, one, run } from "./db.js";
import { asArray, nowIso, parseJsonLoose } from "./util.js";

const STOP = new Set(["the","and","for","with","that","this","you","your","its","are","was","were","from","into","every","any","all","one","two","not","but","our","out","about","what","who","how","where","when","why","can","get","site","www","http","https","com","app","org"]);

async function ensureAtlas(env) {
  await run(
    env,
    `CREATE TABLE IF NOT EXISTS atlas (
      site_id TEXT PRIMARY KEY,
      n INTEGER,
      name TEXT,
      url TEXT,
      profile_json TEXT,
      briefing_stamp TEXT,
      updated_at TEXT
    )`
  );
}

function baseUrl(env) {
  return String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
}

function tokens(text) {
  return [...new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)))];
}

function heuristicProfile(site, b) {
  const punch = b?.punch_line || site.name;
  const summary = b?.summary || "";
  const services = JSON.parse(b?.services_json || "[]");
  const angles = JSON.parse(b?.angles_json || "[]");
  const kw = tokens([site.name, punch, summary, services.join(" "), new URL(site.url).host].join(" "));
  const intents = [
    `what is ${site.name}`.toLowerCase(),
    `where do i open ${site.name}`.toLowerCase(),
    punch.toLowerCase(),
    ...angles.map((a) => String(a.hook || "").toLowerCase()),
  ].filter(Boolean);
  return {
    what_it_is: punch,
    serves: (summary || punch).slice(0, 200),
    keywords: kw.slice(0, 30),
    intents: [...new Set(intents)].slice(0, 12),
  };
}

async function aiProfile(env, site, b) {
  const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
  const out = await env.AI.run(model, {
    messages: [
      {
        role: "system",
        content: `You build a search-matching profile for a website. Return ONLY JSON:
{"what_it_is": one plain sentence, "serves": one sentence on what it serves users,
"keywords": 15-25 lowercase single words or short bigrams,
"intents": 8-12 natural things a user might type or ask that this site answers}. No markdown.`,
      },
      {
        role: "user",
        content: `Name: ${site.name}\nURL: ${site.url}\nPunch: ${b?.punch_line || ""}\nSummary: ${b?.summary || ""}\nServices: ${b?.services_json || "[]"}\nWho for: ${b?.who_for || ""}`,
      },
    ],
    max_tokens: 600,
  });
  const content = typeof out === "string" ? out : out.response || out.result || JSON.stringify(out);
  const p = parseJsonLoose(content);
  const keywords = asArray(p.keywords).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const intents = asArray(p.intents).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (!keywords.length || !intents.length) throw new Error("thin ai profile");
  return {
    what_it_is: String(p.what_it_is || "").slice(0, 240),
    serves: String(p.serves || "").slice(0, 240),
    keywords: [...new Set(keywords)].slice(0, 30),
    intents: [...new Set(intents)].slice(0, 14),
  };
}

export async function rebuildAtlas(env, onlySites = null) {
  await ensureAtlas(env);
  const ordered = await all(env, "SELECT * FROM sites WHERE active = 1 ORDER BY created_at ASC");
  const nById = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const targets = onlySites || ordered;
  const stats = { sites: targets.length, generated: 0, skipped: 0, failed: 0 };
  for (const site of targets) {
    try {
      const b = await one(env, "SELECT * FROM briefings WHERE site_id = ?", site.id);
      const stamp = b?.updated_at || site.updated_at || "";
      const existing = await one(env, "SELECT briefing_stamp FROM atlas WHERE site_id = ?", site.id);
      if (existing && existing.briefing_stamp === stamp) {
        stats.skipped += 1;
        continue;
      }
      const base = heuristicProfile(site, b);
      let profile = base;
      try {
        const ai = await aiProfile(env, site, b);
        profile = {
          what_it_is: ai.what_it_is || base.what_it_is,
          serves: ai.serves || base.serves,
          keywords: [...new Set([...ai.keywords, ...base.keywords])].slice(0, 40),
          intents: [...new Set([...ai.intents, ...base.intents])].slice(0, 18),
        };
      } catch {
        /* heuristic stands */
      }
      profile.languages = JSON.parse(site.languages_wanted || "[]");
      profile.punch = b?.punch_line || site.name;
      profile.category = b?.category || "Website";
      await run(
        env,
        `INSERT INTO atlas (site_id, n, name, url, profile_json, briefing_stamp, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           n=excluded.n, name=excluded.name, url=excluded.url,
           profile_json=excluded.profile_json, briefing_stamp=excluded.briefing_stamp, updated_at=excluded.updated_at`,
        site.id,
        nById.get(site.id) || 0,
        site.name,
        site.url,
        JSON.stringify(profile),
        stamp,
        nowIso()
      );
      stats.generated += 1;
    } catch {
      stats.failed += 1;
    }
  }
  // door numbers can shift only by additions; keep every row's n synced
  for (const s of ordered) {
    await run(env, "UPDATE atlas SET n = ? WHERE site_id = ?", nById.get(s.id), s.id).catch(() => null);
  }
  return stats;
}

async function atlasRows(env) {
  await ensureAtlas(env);
  const rows = await all(env, "SELECT * FROM atlas ORDER BY n ASC");
  return rows.map((r) => ({ ...r, profile: JSON.parse(r.profile_json || "{}") }));
}

export function buildAtlasJson(rows, base) {
  return {
    specVersion: "1.0",
    name: "The AI Hill Top Lighthouse",
    tagline: "Nothing you build ever starts invisible again.",
    match_endpoint: `${base}/match?q={query}`,
    updated_at: rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), ""),
    sites: rows.map((r) => ({
      n: r.n,
      name: r.name,
      url: r.url,
      door: `${base}/${r.n}`,
      hash: `${base}/#${r.n}`,
      punch: r.profile.punch || r.name,
      category: r.profile.category || "Website",
      what_it_is: r.profile.what_it_is || "",
      serves: r.profile.serves || "",
      languages: r.profile.languages || [],
      keywords: r.profile.keywords || [],
      intents: r.profile.intents || [],
    })),
  };
}

export function buildAtlasMd(rows, base) {
  return `# The AI Hill Top Lighthouse — Network Atlas

> Nothing you build ever starts invisible again.
> ${rows.length} sites. Ask "which site answers X?" → fetch ${base}/match?q=X
> Machine database: ${base}/atlas.json

${rows
  .map(
    (r) => `## #${r.n} ${r.name}
- What it is: ${r.profile.what_it_is || r.profile.punch || r.name}
- Serves: ${r.profile.serves || ""}
- Live: ${r.url}
- Door: ${base}/${r.n} (human: ${base}/#${r.n})
- Category: ${r.profile.category || "Website"} · Languages: ${(r.profile.languages || []).join(", ") || "en"}
- Keywords: ${(r.profile.keywords || []).join(", ")}
- Ask it:
${(r.profile.intents || []).map((i) => `  - ${i}`).join("\n")}`
  )
  .join("\n\n")}
`;
}

export function scoreQuery(q, entry) {
  const qn = String(q).toLowerCase().trim();
  const qTokens = tokens(qn);
  const p = entry.profile || entry;
  let score = 0;
  const why = [];
  const nameL = String(entry.name || "").toLowerCase();
  if (qn.includes(nameL) || nameL.includes(qn)) {
    score += 6;
    why.push("name");
  }
  const punchL = String(p.punch || "").toLowerCase();
  if (punchL && (punchL.includes(qn) || qn.includes(punchL))) {
    score += 4;
    why.push("punch");
  }
  for (const intent of p.intents || []) {
    if (intent.includes(qn) || qn.includes(intent)) {
      score += 8;
      why.push(`intent:${intent.slice(0, 40)}`);
      break;
    }
    const it = tokens(intent);
    const overlap = it.filter((t) => qTokens.includes(t)).length;
    if (it.length && overlap / it.length >= 0.6 && overlap >= 2) {
      score += 5;
      why.push(`intent~:${intent.slice(0, 40)}`);
      break;
    }
  }
  const kws = p.keywords || [];
  let kwHits = 0;
  for (const t of qTokens) if (kws.includes(t)) kwHits += 1;
  for (const k of kws) if (k.includes(" ") && qn.includes(k)) kwHits += 2;
  if (kwHits) {
    score += Math.min(kwHits * 2, 10);
    why.push(`keywords:${kwHits}`);
  }
  const desc = `${p.what_it_is || ""} ${p.serves || ""}`.toLowerCase();
  const dHits = qTokens.filter((t) => desc.includes(t)).length;
  if (dHits) score += Math.min(dHits, 3);
  return { score, why };
}

export async function handleAtlas(path, url, env) {
  const base = baseUrl(env);
  if (path === "/atlas.json") {
    const rows = await atlasRows(env);
    return new Response(JSON.stringify(buildAtlasJson(rows, base), null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }
  if (path === "/atlas.md" || path === "/atlas.txt") {
    const rows = await atlasRows(env);
    return new Response(buildAtlasMd(rows, base), {
      headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }
  if (path === "/match") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      return new Response(
        JSON.stringify({ ok: true, usage: `${base}/match?q=your search term`, atlas: `${base}/atlas.json` }, null, 2),
        { headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }
    const rows = await atlasRows(env);
    const ranked = rows
      .map((r) => {
        const s = scoreQuery(q, r);
        return { n: r.n, name: r.name, live: r.url, fetch: `${base}/${r.n}`, punch: r.profile.punch, score: s.score, why: s.why };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return new Response(
      JSON.stringify(
        {
          ok: true,
          q,
          best: ranked[0] || null,
          matches: ranked,
          note: ranked.length ? "Fetch the live URL. Cite the live site." : "No door matches; fetch the hub and browse doors.",
          hub: `${base}/`,
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } }
    );
  }
  return null;
}
