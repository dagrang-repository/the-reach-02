const STOP = new Set(
  "the a an and or of to for in on at by from with as is are was be this that it you your we our not no yes if then than so but if how what where when who why which can will just more most also into over out up down off about across after before between without within per via".split(
    " "
  )
);

function wordsFrom(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && w.length <= 32 && !STOP.has(w) && !/^\d+$/.test(w));
}

function count(list) {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function intentOf(query) {
  const q = query.toLowerCase();
  if (/^(where|how do i open|official|login|homepage)/.test(q)) return "navigational";
  if (/^(buy|price|cost|book|order|subscribe|download|sign up)/.test(q)) return "transactional";
  if (/^(best|vs|compare|review|alternative)/.test(q)) return "commercial";
  return "informational";
}

export function buildKeywordPack(site, excerpt, intel) {
  const raw = [
    site.name,
    excerpt?.title,
    excerpt?.desc,
    excerpt?.text,
    intel?.punch_line,
    intel?.summary,
    ...(intel?.services || []),
    ...(intel?.asker_queries || []),
  ]
    .filter(Boolean)
    .join(" ");
  const freq = count(wordsFrom(raw)).slice(0, 40);
  const siteWords = freq.map(([term, n]) => {
    const inTitle = wordsFrom(excerpt?.title || site.name).includes(term);
    const inPunch = wordsFrom(intel?.punch_line || "").includes(term);
    const demand = n * 2 + (inTitle ? 8 : 0) + (inPunch ? 6 : 0);
    return { term, uses_on_site: n, in_title: inTitle, demand_score: demand };
  });
  siteWords.sort((a, b) => b.demand_score - a.demand_score);

  const queries = [
    intel?.punch_line || site.name,
    `What is ${site.name}?`,
    `Where do I open ${site.name}?`,
    ...(intel?.asker_queries || []),
    ...(intel?.services || []).slice(0, 8).map((s) => String(s)),
  ].filter(Boolean);

  const search_intent = [...new Set(queries)]
    .slice(0, 20)
    .map((query) => ({
      query: String(query).slice(0, 180),
      intent: intentOf(String(query)),
      door: site.url,
      from_site_words: true,
    }));

  const similar_ranked = (intel?.services || [])
    .slice(0, 8)
    .map((s) => ({
      lookalike_query: `${s} official`,
      note: "check who already ranks for this job; do not copy their brand terms",
      door: site.url,
    }));

  return {
    site_wide: true,
    separate_from: ["llms.txt", "sitemap.xml", "robots.txt"],
    core_terms_from_site: siteWords.slice(0, 24).map((x) => x.term),
    demand: siteWords.slice(0, 24),
    search_intent,
    similar_ranked,
    do_not_target: ["unsolicited email harvest", "impersonating official issuers"],
  };
}

export function scanBacklinks(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const hrefs = [...String(html || "").matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const relMe = [...String(html || "").matchAll(/rel=["'][^"']*me[^"']*["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const sameAs = [...String(html || "").matchAll(/"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)].flatMap((m) => {
    try {
      const v = JSON.parse(m[1].startsWith("[") ? m[1] : `"${m[1].replace(/"/g, "")}"`);
      return Array.isArray(v) ? v : [v];
    } catch {
      return [];
    }
  });
  const pingback = /rel=["']pingback["']/i.test(html || "");
  const webmention = /rel=["']webmention["']/i.test(html || "");
  const outbound = [];
  const seen = new Set();
  for (const href of hrefs) {
    try {
      const abs = new URL(href, pageUrl);
      if (abs.origin === origin) continue;
      if (!/^https?:$/.test(abs.protocol)) continue;
      const host = abs.host.replace(/^www\./, "");
      if (seen.has(host)) continue;
      seen.add(host);
      outbound.push(abs.toString());
    } catch {
      /* skip */
    }
  }
  return {
    inbound_declared: [...new Set([...relMe, ...sameAs])].slice(0, 20),
    outbound_from_homepage: outbound.slice(0, 24),
    pingback,
    webmention,
    note: "This is origin-visible link graph, not a third-party backlink index.",
  };
}
