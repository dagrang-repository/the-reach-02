/** /about and its Markdown twin /about.md - the visible "who is behind this" (playbook 2.12): the publisher's name,
 *  what the hub does, how a record is made, the terms, how to reach the publisher. Every fact on it is one the hub's
 *  JSON-LD publisher node, robots.txt or security.txt already states - the graph restates what a reader can see
 *  here, never more. The page carries no door count and no request-time value, so its date is the day its text
 *  last changed (ABOUT_UPDATED), and that is the date its JSON-LD, its Last-Modified and its sitemap line show. */
import { orgNode, siteNode } from "./announce.js";
import { publicBase } from "./hill.js";
import { KEYWORDS, REPO, SITE_ALT, SITE_NAME, TAGLINE, esc, headMeta, jsonForScript, metaDescription } from "./seo.js";
import { CONTACT, POLICY, PUBLISHER } from "./surfaces.js";

/** The day the text below last changed. Change the text, change this date - never the other way round. */
export const ABOUT_UPDATED = "2026-11-25";

const GRAMMAR = KEYWORDS.secondary.find((x) => x.pattern === "/about");
export const ABOUT_QUESTION = GRAMMAR.question;
export const aboutAnswer = () => GRAMMAR.first_paragraph.replace("{publisher}", PUBLISHER);

const train = POLICY === "A";

/* one list, rendered twice (HTML and Markdown), so the page and its twin cannot say different things */
const DOES = [
  "Each site gets one permanent numbered door: a page, a Markdown twin and a JSON record. A removed door answers 410 and its number is never reused.",
  "One resolver answers \"which site answers this question?\" - on the pages, at /match?q=, as MCP tools and as an A2A agent. They cannot disagree, because there is only one.",
  "The hub announces a site's new and changed pages to the search engines that take IndexNow, under that site's own key, and never for a page that did not change.",
];
const LEVELS = [
  ["captured", "the hub's last fetch answered 200 and the description is the site's own, from its llms.txt or its page."],
  ["described", "a description exists, but not from a successful capture."],
  ["stale", "the last capture attempt failed; the record shown is the last good one."],
  ["thin", "the name is all there is."],
];
const MADE =
  "The hub fetches each site itself and records what it finds: the site's own description, questions, sitemap, llms.txt, languages and feed. Where a site publishes no line of its own, a routing line is written by a language model from that site's page. It says where to look; it is not a fact about the site. The live site is always the source to cite.";
const TERMS = `Crawling and grounding are permitted${train ? ", and so is training" : "; training is not"}. Attribution is requested: cite the live site named in a record, not the hub.`;

function graph(env) {
  const base = publicBase(env);
  return {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(env),
      siteNode(env),
      {
        "@type": "AboutPage",
        "@id": `${base}/about#page`,
        url: `${base}/about`,
        name: ABOUT_QUESTION,
        description: metaDescription(aboutAnswer()),
        isPartOf: { "@id": `${base}/#site` },
        about: { "@id": `${base}/#org` },
        mainEntity: { "@id": `${base}/#org` },
        inLanguage: "en",
        dateModified: ABOUT_UPDATED,
        isAccessibleForFree: true,
        license: `${base}/license.xml`,
        encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", url: `${base}/about.md` },
        breadcrumb: { "@id": `${base}/about#crumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${base}/about#crumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
          { "@type": "ListItem", position: 2, name: "About" },
        ],
      },
    ],
  };
}

export function aboutHtml(env) {
  const base = publicBase(env);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headMeta({
    title: ABOUT_QUESTION,
    description: metaDescription(aboutAnswer()),
    canonical: `${base}/about`,
    base,
    type: "website",
    mdUrl: `${base}/about.md`,
    oembed: false,
  })}
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0f1a12">
  <link rel="icon" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/icon-192.png">
  <script type="application/ld+json">${jsonForScript(graph(env))}</script>
  <style>
    body{margin:0;font:16px/1.55 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem}
    a{color:#8dff9a}
    h1{margin:.4rem 0 .8rem;font-size:1.5rem}
    h2{margin:1.8rem 0 .5rem;font-size:1.1rem}
    ul{padding-left:1.3rem}
    li{margin:.35rem 0;overflow-wrap:anywhere}
    .meta{color:#9bb89a;font-size:.9rem}
    nav a{margin-right:1rem}
  </style>
</head>
<body>
<main>
  <nav aria-label="Breadcrumb"><a href="/">${esc(SITE_NAME)}</a> &rsaquo; About</nav>
  <h1>${esc(ABOUT_QUESTION)}</h1>
  <p>${esc(aboutAnswer())}</p>
  <p class="meta">${esc(SITE_NAME)} (${esc(SITE_ALT)}). ${esc(TAGLINE)} Updated <time datetime="${ABOUT_UPDATED}">${ABOUT_UPDATED}</time> &middot; <a href="/about.md">Markdown</a></p>
  <h2>What does it do?</h2>
  <ul>
${DOES.map((x) => `    <li>${esc(x)}</li>`).join("\n")}
  </ul>
  <h2>How is a record made?</h2>
  <p>${esc(MADE)}</p>
  <p>Every record carries a confidence a reader can check:</p>
  <ul>
${LEVELS.map(([k, v]) => `    <li><strong>${k}</strong> - ${esc(v)}</li>`).join("\n")}
  </ul>
  <h2>What may an AI system do with it?</h2>
  <p>${esc(TERMS)} <a href="/license.xml">Licence</a> &middot; <a href="/robots.txt">robots.txt</a> &middot; <a href="/ai.txt">ai.txt</a></p>
  <h2>How do I reach the publisher?</h2>
  <p>${esc(PUBLISHER)}: <a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a> - corrections, licensing, a broken endpoint. Security reports: <a href="/.well-known/security.txt">security.txt</a>. Source: <a href="${esc(REPO)}">${esc(REPO)}</a>.</p>
  <p><a href="/">All doors</a> &middot; <a href="/llms.txt">llms.txt</a> &middot; <a href="/sites.json">sites.json</a></p>
</main>
</body>
</html>`;
}

export function aboutMarkdown(env) {
  const base = publicBase(env);
  return `# ${ABOUT_QUESTION}

> ${aboutAnswer()}

${SITE_NAME} (${SITE_ALT}). ${TAGLINE} Updated ${ABOUT_UPDATED}.

## What does it do?

${DOES.map((x) => `- ${x}`).join("\n")}

## How is a record made?

${MADE}

Every record carries a confidence a reader can check:

${LEVELS.map(([k, v]) => `- **${k}** - ${v}`).join("\n")}

## What may an AI system do with it?

${TERMS}

- Licence: ${base}/license.xml
- robots.txt: ${base}/robots.txt
- ai.txt: ${base}/ai.txt

## How do I reach the publisher?

${PUBLISHER}: ${CONTACT} - corrections, licensing, a broken endpoint.

- Security reports: ${base}/.well-known/security.txt
- Source: ${REPO}

---

HTML: ${base}/about
All doors: ${base}/
Licence: ${base}/license.xml
Cite as: ${SITE_NAME}, retrieved ${ABOUT_UPDATED}, ${base}/about
`;
}
