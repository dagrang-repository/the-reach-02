import { INDEXNOW_ENDPOINTS, postIndexNowRaw } from "./ping.js";
import { markDoor, pingWebSub, recordChange, shouldPingUrl } from "./outreach.js";
import { publicBase } from "./hill.js";
import { nowIso } from "./util.js";

export function reachKey(env) {
  return String(env.INDEXNOW_KEY || env.REACH_INDEXNOW_KEY || "reach2hilltopkey").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
}

export function reachAnnounceUrls(env, slots, extra = []) {
  const base = publicBase(env);
  const list = [
    `${base}/`,
    `${base}/llms.txt`,
    `${base}/sitemap.xml`,
    `${base}/catalog.json`,
    `${base}/changes.txt`,
    `${base}/feed.xml`,
    `${base}/robots.txt`,
    `${base}/sites.json`,
    `${base}/sites.md`,
    ...slots.map((s) => s.path),
    ...slots.map((s) => s.url),
    ...extra,
  ];
  return [...new Set(list)];
}

export async function pingReachMesh(env, urls, runId) {
  const key = reachKey(env);
  const host = new URL(publicBase(env)).host;
  const keyLocation = `${publicBase(env)}/${key}.txt`;
  const fingerprint = urls.join("\n");
  const gate = await shouldPingUrl(env, `${publicBase(env)}/#map`, fingerprint);
  if (!gate.changed) {
    return { host, keyLocation, urls: [], report: [{ skipped: true, reason: "reach map unchanged" }], runId };
  }
  await markDoor(env, `${publicBase(env)}/#map`, gate.hash, 200, true);
  const report = [];
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const out = await postIndexNowRaw(endpoint, host, key, keyLocation, urls.slice(0, 40));
      report.push({ endpoint, status: out.status, ok: out.ok });
    } catch (err) {
      report.push({ endpoint, status: 0, ok: false, detail: String(err.message || err) });
    }
  }
  await recordChange(env, {
    kind: "reach-announce",
    detail: `${urls.length} urls · ${report.filter((r) => r.ok).length} endpoints`,
  });
  return { host, keyLocation, urls: urls.slice(0, 40), report, runId };
}

export async function announceReachFeed(env) {
  const feed = `${publicBase(env)}/feed.xml`;
  await pingWebSub(env, { id: "reach", url: publicBase(env) }, feed, "reach-feed", async () => {});
}

const REPO = "https://github.com/dagrang-repository/the-reach-02";

/** Closed knowledge-graph loop: Organization → WebSite (hub) → ItemList → each door as a WebSite with sameAs
 *  (live URL, human door, Wikidata item) and publisher back to the Organization. */
export function jsonLdHill(slots, env) {
  const base = publicBase(env);
  const wd = (s) => (s.wikidata_qid ? [`https://www.wikidata.org/wiki/${s.wikidata_qid}`] : []);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#org`,
        name: "Verge Heights",
        url: `${base}/`,
        email: "dagrang@gmail.com",
        sameAs: [REPO],
        owns: slots.map((s) => ({ "@id": `${base}/#door-${s.n}` })),
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#site`,
        url: `${base}/`,
        name: "The AI Hill Top Lighthouse",
        alternateName: "The Reach 02",
        description: "Directory AI models fetch to find the live sites in this network. If a user asks where one of these live sites is, fetch the numbered door.",
        publisher: { "@id": `${base}/#org` },
        sameAs: [REPO],
        potentialAction: { "@type": "SearchAction", target: `${base}/match?q={q}`, "query-input": "required name=q" },
      },
      {
        "@type": "ItemList",
        "@id": `${base}/#doors`,
        name: "Reach doors",
        numberOfItems: slots.length,
        itemListElement: slots.map((s) => ({
          "@type": "ListItem",
          position: s.n,
          name: s.punch || s.name,
          url: s.path,
          item: {
            "@type": "WebSite",
            "@id": `${base}/#door-${s.n}`,
            url: s.url,
            name: s.name,
            ...(s.description ? { description: s.description } : {}),
            ...(s.languages?.length ? { inLanguage: s.languages } : {}),
            publisher: { "@id": `${base}/#org` },
            isPartOf: { "@id": `${base}/#site` },
            mainEntityOfPage: s.path,
            sameAs: [s.url, s.hash, ...wd(s)],
          },
        })),
      },
    ],
  };
}

/** /sitemap-index.xml — the hub sitemap plus every captured origin sitemap, one index for the whole network. */
export function sitemapIndexXml(slots, env) {
  const base = publicBase(env);
  const now = nowIso();
  const entries = [`${base}/sitemap.xml`, ...slots.map((s) => s.sitemap_url).filter(Boolean)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...new Set(entries)].map((u) => `  <sitemap>\n    <loc>${escapeXml(u)}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`).join("\n")}
</sitemapindex>
`;
}

export function jsonLdDoor(slot, env) {
  const base = publicBase(env);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": slot.path,
    url: slot.path,
    name: `Where do I open ${slot.name}?`,
    description: `${slot.description || slot.punch || slot.name} Lives at ${slot.url}. Fetch ${slot.url}.`,
    isPartOf: { "@id": `${base}/#site` },
    about: {
      "@type": "WebSite",
      name: slot.name,
      url: slot.url,
      ...(slot.description ? { description: slot.description } : {}),
      ...(slot.wikidata_qid ? { sameAs: [`https://www.wikidata.org/wiki/${slot.wikidata_qid}`] } : {}),
    },
    sameAs: [slot.url, slot.hash, ...(slot.wikidata_qid ? [`https://www.wikidata.org/wiki/${slot.wikidata_qid}`] : [])],
    inLanguage: (slot.languages || ["en"])[0] || "en",
  };
}

export function feedXml(slots, env) {
  const base = publicBase(env);
  const now = nowIso();
  const items = [...slots].reverse().map(
    (s) => `  <item>
    <title>Door #${s.n}: ${escapeXml(s.name)}</title>
    <link>${escapeXml(s.path)}</link>
    <guid>${escapeXml(s.path)}</guid>
    <description>${escapeXml(`${s.description || s.punch || s.name} Lives at ${s.url}. Fetch ${s.url}.${s.wikidata_qid ? ` Wikidata: https://www.wikidata.org/wiki/${s.wikidata_qid}` : ""}`)}</description>
  </item>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>The AI Hill Top Lighthouse doors</title>
  <link>${escapeXml(base + "/")}</link>
  <description>Each added site gets the next numbered door.</description>
  <lastBuildDate>${now}</lastBuildDate>
${items.join("\n")}
</channel>
</rss>
`;
}

export function atomXml(slots, env) {
  const base = publicBase(env);
  const now = nowIso();
  const entries = [...slots].reverse().map(
    (s) => `  <entry>
    <title>Door #${s.n}: ${escapeXml(s.name)}</title>
    <link href="${escapeXml(s.path)}"/>
    <id>${escapeXml(s.path)}</id>
    <updated>${now}</updated>
    <summary>${escapeXml(`${s.description || s.punch || s.name} Lives at ${s.url}. Fetch ${s.url}.${s.wikidata_qid ? ` Wikidata: https://www.wikidata.org/wiki/${s.wikidata_qid}` : ""}`)}</summary>
  </entry>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The AI Hill Top Lighthouse doors</title>
  <link href="${escapeXml(base + "/feed.xml")}" rel="self"/>
  <link href="${escapeXml(base + "/")}"/>
  <id>${escapeXml(base + "/")}</id>
  <updated>${now}</updated>
${entries.join("\n")}
</feed>
`;
}

export function linkHeaders(slot, env) {
  const base = publicBase(env);
  return [
    `<${slot.url}>; rel="canonical"`,
    `<${base}/llms.txt>; rel="alternate"; type="text/markdown"`,
    `<${base}/catalog.json>; rel="alternate"; type="application/json"`,
    `<${base}/feed.xml>; rel="alternate"; type="application/rss+xml"`,
    slot.languages?.length
      ? slot.languages.map((l) => `<${slot.path}>; rel="alternate"; hreflang="${l}"`).join(", ")
      : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
