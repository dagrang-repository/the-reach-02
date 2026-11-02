import { publicBase } from "./hill.js";
import {
  SITE_NAME,
  SITE_ALT,
  TAGLINE,
  REPO,
  WEBSUB_HUB,
  doorDate,
  doorPublished,
  homeDate,
  homePublished,
  homeQuestion,
  homeAnswer,
  metaDescription,
  doorHeadline,
  doorAnswer,
  ogImage,
  safeUrl,
} from "./seo.js";

/* ---------- the knowledge graph: stable site-wide nodes, one @graph per page ---------- */
const wdUrl = (s) => (/^Q\d+$/.test(String(s?.wikidata_qid || "")) ? `https://www.wikidata.org/wiki/${s.wikidata_qid}` : "");

/** #org — the same identifier on every page. `owns` is listed only on the hub page (the door pages keep it light). */
export function orgNode(env, slots = null) {
  const base = publicBase(env);
  return {
    "@type": "Organization",
    "@id": `${base}/#org`,
    name: "Verge Heights",
    url: `${base}/`,
    email: "dagrang@gmail.com",
    sameAs: [REPO],
    ...(slots ? { owns: slots.filter((s) => !s.self).map((s) => ({ "@id": `${base}/#door-${s.n}` })) } : {}),
  };
}

/** #site — the hub as a WebSite, with the real query endpoint as its SearchAction. */
export function siteNode(env) {
  const base = publicBase(env);
  return {
    "@type": "WebSite",
    "@id": `${base}/#site`,
    url: `${base}/`,
    name: SITE_NAME,
    alternateName: SITE_ALT,
    description: "Directory AI models fetch to find the live sites in this network. If a user asks where one of these live sites is, fetch the numbered door.",
    publisher: { "@id": `${base}/#org` },
    inLanguage: "en",
    license: `${base}/license.xml`,
    isAccessibleForFree: true,
    sameAs: [REPO],
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/match?q={q}`, contentType: "application/json" },
      "query-input": "required name=q",
    },
  };
}

/** #door-n — the live site as a WebSite node: same @id on the hub page and on its own door page. */
export function doorSiteNode(slot, env) {
  const base = publicBase(env);
  const wd = wdUrl(slot);
  const image = safeUrl(slot.og_image);
  const live = safeUrl(slot.url);
  return {
    "@type": "WebSite",
    "@id": `${base}/#door-${slot.n}`,
    ...(live ? { url: live } : {}),
    name: slot.name,
    ...(slot.description ? { description: slot.description } : {}),
    ...(image ? { image } : {}),
    ...(slot.languages?.length ? { inLanguage: slot.languages } : {}),
    publisher: { "@id": `${base}/#org` },
    isPartOf: { "@id": `${base}/#site` },
    mainEntityOfPage: slot.path,
    sameAs: [...(live ? [live] : []), slot.hash, ...(wd ? [wd] : [])],
  };
}

/** Closed knowledge-graph loop on the hub page: Organization → WebSite → WebPage (dated, free, licensed, with its
 *  Markdown encoding) → ItemList → each door as a WebSite with sameAs (live URL, human door, Wikidata item). */
export function jsonLdHill(slots, env, publicMap = null) {
  const base = publicBase(env);
  const count = slots.length;
  const modified = homeDate(slots, publicMap);
  const published = homePublished(slots, publicMap);
  return {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(env, slots),
      siteNode(env),
      {
        "@type": "WebPage",
        "@id": `${base}/#page`,
        url: `${base}/`,
        name: homeQuestion(count),
        description: metaDescription(homeAnswer(count, base)),
        isPartOf: { "@id": `${base}/#site` },
        about: { "@id": `${base}/#org` },
        inLanguage: "en",
        ...(published ? { datePublished: published } : {}),
        dateModified: modified,
        isAccessibleForFree: true,
        license: `${base}/license.xml`,
        primaryImageOfPage: ogImage(base).url,
        encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", url: `${base}/index.md` },
        mainEntity: { "@id": `${base}/#doors` },
        breadcrumb: { "@id": `${base}/#crumb` },
      },
      {
        "@type": "ItemList",
        "@id": `${base}/#doors`,
        name: "Reach doors",
        numberOfItems: count,
        /* the hub's own door is the #site node itself, never a second WebSite entity for one URL */
        itemListElement: slots.map((s) => ({
          "@type": "ListItem",
          position: s.n,
          name: s.status === "closed" ? `${doorHeadline(s)} (closed since ${String(s.closed_since || "").slice(0, 10)})` : doorHeadline(s),
          url: s.path,
          item: s.self ? { "@id": `${base}/#site` } : doorSiteNode(s, env),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${base}/#crumb`,
        itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${base}/` }],
      },
    ],
  };
}

/** The door page's graph: the same #org/#site identifiers, a dated WebPage whose mainEntity is the door's WebSite
 *  node, a Dataset with the JSON and Markdown distributions, and the breadcrumb. */
export function jsonLdDoor(slot, env) {
  const base = publicBase(env);
  const modified = doorDate(slot);
  const published = doorPublished(slot);
  const headline = doorHeadline(slot);
  const answer = doorAnswer(slot);
  const fields = ["name", "url", "door", "door_md"];
  for (const [k, v] of [["sitemap", slot.sitemap_url], ["llms_txt", slot.llms_url], ["languages", slot.languages?.length], ["indexnow_key", slot.indexnow_key], ["feed", slot.feed_url], ["description", slot.description], ["wikidata", wdUrl(slot)], ["captured_at", slot.captured_at]]) {
    if (v) fields.push(k);
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(env),
      siteNode(env),
      {
        "@type": "WebPage",
        "@id": `${slot.path}#page`,
        url: slot.path,
        name: headline,
        description: metaDescription(`${answer} Live: ${slot.url}`),
        isPartOf: { "@id": `${base}/#site` },
        inLanguage: "en",
        ...(published ? { datePublished: published } : {}),
        dateModified: modified,
        isAccessibleForFree: true,
        license: `${base}/license.xml`,
        primaryImageOfPage: safeUrl(slot.og_image) || ogImage(base).url,
        encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", url: `${slot.path}.md` },
        mainEntity: { "@id": `${base}/#door-${slot.n}` },
        about: { "@id": `${base}/#door-${slot.n}` },
        breadcrumb: { "@id": `${slot.path}#crumb` },
        sameAs: [slot.hash],
      },
      doorSiteNode(slot, env),
      {
        "@type": "Dataset",
        "@id": `${slot.path}#dataset`,
        name: `Door ${slot.n} record: ${slot.name}`,
        description: `The hub's record of ${slot.name}: live URL, sitemap, llms.txt, IndexNow key URL, languages, description and Wikidata item, as captured from the origin.`,
        creator: { "@id": `${base}/#org` },
        about: { "@id": `${base}/#door-${slot.n}` },
        license: `${base}/license.xml`,
        isAccessibleForFree: true,
        dateModified: modified,
        variableMeasured: fields,
        distribution: [
          { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${slot.path}.json` },
          { "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: `${slot.path}.md` },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${slot.path}#crumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
          { "@type": "ListItem", position: 2, name: `Door ${slot.n}` },
        ],
      },
    ],
  };
}

/* ---------- sitemap index ---------- */

/** /sitemap-index.xml — the hub sitemap plus every captured origin sitemap, one index for the whole network.
 *  lastmod only where it is known: the hub's own record date. An origin's sitemap date is theirs, not ours. */
export function sitemapIndexXml(slots, env, publicMap = null) {
  const base = publicBase(env);
  const hubDate = homeDate(slots, publicMap);
  const origins = [...new Set(slots.map((s) => safeUrl(s.sitemap_url)).filter(Boolean))].filter((u) => u !== `${base}/sitemap.xml`);
  const entries = [
    `  <sitemap>\n    <loc>${escapeXml(`${base}/sitemap.xml`)}</loc>\n    <lastmod>${hubDate}</lastmod>\n  </sitemap>`,
    ...origins.map((u) => `  <sitemap>\n    <loc>${escapeXml(u)}</loc>\n  </sitemap>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>
`;
}

/* ---------- feeds: entry dates are record dates, never request time ---------- */

function stampOf(iso) {
  const s = String(iso || "").trim();
  if (!s || Number.isNaN(Date.parse(s))) return "";
  return new Date(s).toISOString();
}

/** The record's own timestamp: captured_at, else updated_at, else created_at, else midnight of its record date. */
export function recordStamp(slot) {
  return stampOf(slot?.captured_at) || stampOf(slot?.updated_at) || stampOf(slot?.created_at) || `${doorDate(slot)}T00:00:00.000Z`;
}

function feedEntries(slots) {
  return [...slots]
    .filter((s) => !s.self)
    .map((s) => ({ s, stamp: recordStamp(s) }))
    .sort((a, b) => (a.stamp === b.stamp ? b.s.n - a.s.n : a.stamp < b.stamp ? 1 : -1));
}

function feedUpdated(entries) {
  return entries.reduce((m, e) => (e.stamp > m ? e.stamp : m), "") || "";
}

function entrySummary(s) {
  const wd = wdUrl(s);
  return `${doorAnswer(s)} Live: ${s.url}. Door: ${s.path} (Markdown: ${s.path}.md).${wd ? ` Wikidata: ${wd}` : ""}`;
}

/** /feed.xml — Atom, with the WebSub hub it is published to and a rel=self link. */
export function atomXml(slots, env) {
  const base = publicBase(env);
  const entries = feedEntries(slots);
  const updated = feedUpdated(entries) || `${homeDate(slots)}T00:00:00.000Z`;
  const items = entries.map(
    ({ s, stamp }) => `  <entry>
    <title>${escapeXml(s.status === "closed" ? `${doorHeadline(s)} (closed since ${String(s.closed_since || "").slice(0, 10)})` : doorHeadline(s))}</title>
    <link rel="alternate" type="text/html" href="${escapeXml(s.path)}"/>
    <link rel="alternate" type="text/markdown" href="${escapeXml(`${s.path}.md`)}"/>
    <link rel="alternate" type="application/json" href="${escapeXml(`${s.path}.json`)}"/>${safeUrl(s.url) ? `\n    <link rel="related" type="text/html" href="${escapeXml(s.url)}"/>` : ""}
    <id>${escapeXml(s.path)}</id>
    <updated>${stamp}</updated>${stampOf(s.created_at) && stampOf(s.created_at) <= stamp ? `\n    <published>${stampOf(s.created_at)}</published>` : ""}
    <summary>${escapeXml(entrySummary(s))}</summary>
  </entry>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(`${SITE_NAME} doors`)}</title>
  <subtitle>${escapeXml(TAGLINE)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeXml(`${base}/feed.xml`)}"/>
  <link rel="hub" href="${escapeXml(WEBSUB_HUB)}"/>
  <link rel="alternate" type="text/html" href="${escapeXml(`${base}/`)}"/>
  <id>${escapeXml(`${base}/`)}</id>
  <updated>${updated}</updated>
  <author><name>Verge Heights</name></author>
${items.join("\n")}
</feed>
`;
}

/** /rss.xml — RSS 2.0 twin of the Atom feed, with the same hub and self links in the atom namespace. */
export function rssXml(slots, env) {
  const base = publicBase(env);
  const entries = feedEntries(slots);
  const updated = feedUpdated(entries) || `${homeDate(slots)}T00:00:00.000Z`;
  const items = entries.map(
    ({ s, stamp }) => `  <item>
    <title>${escapeXml(s.status === "closed" ? `${doorHeadline(s)} (closed since ${String(s.closed_since || "").slice(0, 10)})` : doorHeadline(s))}</title>
    <link>${escapeXml(s.path)}</link>
    <guid isPermaLink="true">${escapeXml(s.path)}</guid>
    <pubDate>${new Date(stamp).toUTCString()}</pubDate>
    <description>${escapeXml(entrySummary(s))}</description>
  </item>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(`${SITE_NAME} doors`)}</title>
  <link>${escapeXml(`${base}/`)}</link>
  <description>${escapeXml(`${TAGLINE} Each added site gets the next numbered door.`)}</description>
  <atom:link rel="self" type="application/rss+xml" href="${escapeXml(`${base}/rss.xml`)}"/>
  <atom:link rel="hub" href="${escapeXml(WEBSUB_HUB)}"/>
  <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
${items.join("\n")}
</channel>
</rss>
`;
}

/** /feed.xml IS the Atom feed (the URL that is WebSub-published and that llms-full.txt calls Atom). Kept under its
 *  old name so nothing that imports feedXml breaks; /rss.xml serves rssXml. */
export const feedXml = atomXml;

/** Link header of a door: the door is its own canonical (it is the indexable page); the live site is the graph's
 *  mainEntity/sameAs, not an off-site canonical. One URL per door, so no hreflang set. */
export function linkHeaders(slot, env) {
  const base = publicBase(env);
  return [
    `<${slot.path}>; rel="canonical"`,
    `<${slot.path}.md>; rel="alternate"; type="text/markdown"`,
    `<${slot.path}.json>; rel="alternate"; type="application/json"`,
    `<${base}/llms.txt>; rel="describedby"; type="text/markdown"`,
    `<${base}/feed.xml>; rel="alternate"; type="application/atom+xml"`,
  ].join(", ");
}

/** The record date of a door as an HTTP date (Last-Modified), from the record, never from the clock. */
export function doorLastModified(slot) {
  return new Date(recordStamp(slot)).toUTCString();
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
