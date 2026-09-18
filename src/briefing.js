import { all, one, run } from "./db.js";
import { asArray, detectLanguagesFromHtml, nowIso, parseJsonLoose, stripHtml } from "./util.js";
import { applyFullStack, ensureAnswerChannel } from "./stack.js";
import { rebuildReachMap } from "./map.js";

const SYSTEM = `You extract product intelligence from a website excerpt.
Return ONLY a JSON object with keys:
category, services (array), languages_present, languages_target,
summary (max 60 words), punch_line, value_bring, who_for,
asker_queries (array), angles (array of {id, label, hook}).
No markdown.`;

function fallbackIntel(site, excerpt) {
  const punch = excerpt.title || site.name;
  return {
    category: "Website",
    services: [excerpt.desc || punch].filter(Boolean),
    languages_present: excerpt.languages?.length ? excerpt.languages : ["en"],
    languages_target: excerpt.languages?.length ? excerpt.languages : ["en"],
    summary: (excerpt.desc || excerpt.text || punch).slice(0, 600),
    punch_line: punch.slice(0, 240),
    value_bring: (excerpt.desc || "Open the live site.").slice(0, 600),
    who_for: "Anyone looking for this product by name or job.",
    asker_queries: [`What is ${site.name}?`, punch],
    angles: [
      { id: "core", label: "Core", hook: punch.slice(0, 280) },
      { id: "direct", label: "Direct", hook: `${site.name}: ${excerpt.desc || punch}`.slice(0, 280) },
    ],
    model: "heuristic",
  };
}

export async function fetchExcerpt(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "TheReach02/1.1", accept: "text/html" },
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1];
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || ["", ""])[1];
  const languages = detectLanguagesFromHtml(html, res.headers.get("content-language"));
  return {
    title: stripHtml(title).slice(0, 200),
    desc: desc.slice(0, 400),
    text: stripHtml(html).slice(0, 8000),
    languages,
  };
}

export async function analyzeSite(env, site, excerpt) {
  const fallback = fallbackIntel(site, excerpt);
  try {
    const model = env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const out = await env.AI.run(model, {
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Site: ${site.name}\nURL: ${site.url}\nTitle: ${excerpt.title}\nMeta: ${excerpt.desc}\nExcerpt: ${excerpt.text}`,
        },
      ],
      max_tokens: 900,
    });
    const content = typeof out === "string" ? out : out.response || out.result || JSON.stringify(out);
    const parsed = parseJsonLoose(content);
    const angles = asArray(parsed.angles)
      .map((a, i) => {
        if (typeof a === "string") return { id: `angle_${i + 1}`, label: a.slice(0, 40), hook: a };
        return {
          id: String(a.id || `angle_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40),
          label: String(a.label || a.id || `angle ${i + 1}`).slice(0, 80),
          hook: String(a.hook || a.label || "").slice(0, 280),
        };
      })
      .filter((a) => a.hook);
    if (!angles.length) angles.push({ id: "core", label: "core", hook: fallback.punch_line });
    return {
      category: String(parsed.category || fallback.category).slice(0, 80),
      services: asArray(parsed.services).slice(0, 20),
      languages_present: [...new Set(asArray(parsed.languages_present).concat(excerpt.languages || []))].slice(0, 16),
      languages_target: [...new Set(asArray(parsed.languages_present).concat(excerpt.languages || []))].slice(0, 16),
      summary: String(parsed.summary || fallback.summary).slice(0, 600),
      punch_line: String(parsed.punch_line || fallback.punch_line).slice(0, 240),
      value_bring: String(parsed.value_bring || fallback.value_bring).slice(0, 600),
      who_for: String(parsed.who_for || fallback.who_for).slice(0, 400),
      asker_queries: asArray(parsed.asker_queries).slice(0, 12),
      angles,
      model,
    };
  } catch {
    return fallback;
  }
}

export async function refreshBriefing(env, site, force = false) {
  const ttlHours = Number(env.BRIEFING_TTL_HOURS || 24);
  const existing = await one(env, "SELECT * FROM briefings WHERE site_id = ?", site.id);
  if (existing && !force) {
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (age < ttlHours * 3600 * 1000) return { briefing: existing, intel: null, refreshed: false };
  }
  const excerpt = await fetchExcerpt(site.url);
  const intel = await analyzeSite(env, site, excerpt);
  const ts = nowIso();
  await run(
    env,
    `INSERT INTO briefings (
      site_id, category, services_json, languages_present, languages_target,
      summary, punch_line, value_bring, who_for, angles_json, raw_excerpt, model, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      category=excluded.category, services_json=excluded.services_json,
      languages_present=excluded.languages_present, languages_target=excluded.languages_target,
      summary=excluded.summary, punch_line=excluded.punch_line, value_bring=excluded.value_bring,
      who_for=excluded.who_for, angles_json=excluded.angles_json, raw_excerpt=excluded.raw_excerpt,
      model=excluded.model, updated_at=excluded.updated_at`,
    site.id,
    intel.category,
    JSON.stringify(intel.services),
    JSON.stringify(intel.languages_present),
    JSON.stringify([...new Set(intel.languages_target)]),
    intel.summary,
    intel.punch_line,
    intel.value_bring,
    intel.who_for,
    JSON.stringify(intel.angles),
    `${excerpt.title}\n${excerpt.desc}\n${excerpt.text}`.slice(0, 4000),
    intel.model,
    existing?.created_at || ts,
    ts
  );
  const langs = [...new Set(intel.languages_present.concat(intel.languages_target))];
  await run(
    env,
    "UPDATE sites SET languages_wanted = ?, updated_at = ? WHERE id = ?",
    JSON.stringify(langs),
    ts,
    site.id
  );
  site.languages_wanted = JSON.stringify(langs);
  const briefing = await one(env, "SELECT * FROM briefings WHERE site_id = ?", site.id);
  return { briefing, intel, refreshed: true };
}

export async function materializeTargets(env, siteId) {
  const briefing = await one(env, "SELECT * FROM briefings WHERE site_id = ?", siteId);
  const channels = await all(env, "SELECT * FROM channels WHERE active = 1");
  if (!briefing || !channels.length) return 0;
  const angles = JSON.parse(briefing.angles_json || "[]");
  let locales = JSON.parse(briefing.languages_target || "[]");
  if (!locales.length) locales = ["en"];
  const ts = nowIso();
  for (const channel of channels) {
    if (channel.type === "resend") continue;
    for (const angle of angles) {
      for (const locale of locales) {
        const id = `${siteId}:${channel.id}:${angle.id}:${locale}`;
        await run(
          env,
          `INSERT OR IGNORE INTO targets (id, site_id, channel_id, angle_id, locale, label, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          siteId,
          channel.id,
          angle.id,
          String(locale).slice(0, 12),
          `${channel.name} / ${angle.label} / ${locale}`,
          ts
        );
      }
    }
  }
  return 1;
}

export async function runFullStack(env, site, force = true) {
  await ensureAnswerChannel(env);
  const out = await refreshBriefing(env, site, force);
  const pack = await applyFullStack(env, site, out.briefing, out.intel);
  await materializeTargets(env, site.id);
  const map = await rebuildReachMap(env);
  return { briefing: out.briefing, intel: out.intel, pack, map };
}

export function briefingPublic(row) {
  if (!row) return null;
  return {
    site_id: row.site_id,
    category: row.category,
    services: JSON.parse(row.services_json || "[]"),
    languages_present: JSON.parse(row.languages_present || "[]"),
    languages_target: JSON.parse(row.languages_target || "[]"),
    summary: row.summary,
    punch_line: row.punch_line,
    value_bring: row.value_bring,
    who_for: row.who_for,
    angles: JSON.parse(row.angles_json || "[]"),
    updated_at: row.updated_at,
  };
}
