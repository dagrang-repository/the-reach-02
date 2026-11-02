/** door-page.js — one door, three renderings of the same record: HTML (/{n}), Markdown twin (/{n}.md) and JSON
 *  (/{n}.json). Same facts, same question, same date in all three. Nothing is invented: a field the record lacks is
 *  omitted, not filled. Wired by index.js (owner B):
 *    GET /{n}        → doorHtml(slot, env, slots)      text/html;      Vary: Accept
 *    GET /{n}.md     → doorMarkdown(slot, env, slots)  text/markdown
 *    GET /{n}.json   → doorJson(slot, env, slots)      application/json
 *  with Last-Modified = doorLastModified(slot) (announce.js) and Link = linkHeaders(slot, env).
 */
import { captureView } from "./capture.js";
import { publicBase } from "./hill.js";
import { jsonLdDoor } from "./announce.js";
import { nowIso } from "./util.js";
import {
  SITE_NAME,
  SITE_ALT,
  TAGLINE,
  esc,
  jsonForScript,
  headMeta,
  doorDate as recordDate,
  doorPublished,
  doorHeadline,
  doorQuestion,
  doorAnswer,
  doorImage,
  metaDescription,
  safeUrl,
  clip,
  doorAsks,
  today,
  confidenceOf,
  TITLE_MAX,
} from "./seo.js";

export { doorHeadline, doorQuestion, doorAnswer };

/** 'YYYY-MM-DD' record date (captured_at, else updated_at, else today) — the one date all three renderings print. */
export function doorDate(slot) {
  return recordDate(slot);
}

/** How much of the record came from the origin: captured (a capture pass ran), briefed (only a punch line from the
 *  briefing/atlas), thin (the name is all there is). */
export function doorConfidence(slot) {
  return slot?.confidence || confidenceOf(slot);
}

/** The status sentence every rendering prints (from door_status via the slot; nothing inferred). */
function statusLine(slot) {
  const st = slot?.status || "unverified";
  if (st === "closed") {
    const since = slot.closed_since ? ` since ${String(slot.closed_since).slice(0, 10)}` : "";
    const ok = slot.last_ok_at ? ` Last seen live ${String(slot.last_ok_at).slice(0, 10)}; do not cite as live.` : " Do not cite as live.";
    return `Closed${since}${slot.http_status ? ` (HTTP ${slot.http_status})` : ""}.${ok}`;
  }
  const stale = slot?.stale_since ? ` The last capture failed (stale since ${String(slot.stale_since).slice(0, 10)}); the record below is the last good one.` : "";
  if (st === "live") return `Live${slot.last_verified ? `, verified ${String(slot.last_verified).slice(0, 10)}` : ""}.${stale}`;
  return `Not yet verified by the hub's sweep.${stale}`;
}

/** The sections the origin itself supplies, as [id, heading, intro, items[] | text]. Only fields the slot carries. */
function sections(slot) {
  const out = [];
  const asks = doorAsks(slot);
  if (asks.length) out.push(["answers", `Questions ${slot.name} answers`, "Declared by the site in its llms.txt:", asks]);
  if (slot.what_it_is) out.push(["what", "What it is", "", String(slot.what_it_is)]);
  if (slot.who_for) out.push(["who", "Who it is for", "", String(slot.who_for)]);
  const neg = Array.isArray(slot.negatives) ? slot.negatives.filter((x) => typeof x === "string" && x.trim()) : [];
  if (neg.length) out.push(["not", "Does not answer", "", neg]);
  const langs = Array.isArray(slot.languages) ? slot.languages : [];
  if (langs.length || slot.languages_declared) {
    const verified = langs.length ? `Verified: ${langs.length} (${langs.join(", ")}).` : "Verified: none yet.";
    const declared = slot.languages_declared ? ` Declared by the site: ${slot.languages_declared}.` : "";
    out.push(["languages", "Languages", "", verified + declared]);
  }
  out.push(["status", "Status", "", statusLine(slot)]);
  return out;
}

function neighbours(slot, slots) {
  const list = Array.isArray(slots) ? [...slots].sort((a, b) => a.n - b.n) : [];
  const i = list.findIndex((s) => s.n === slot.n);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}

function wikidataUrl(record) {
  return safeUrl(record?.wikidata || "");
}

/** The record as [label, value, isUrl] rows — only the fields the record carries. */
function recordRows(slot, record) {
  const rows = [
    ["Live URL", safeUrl(record.url), true],
    ["Sitemap", safeUrl(record.sitemap), true],
    ["llms.txt", safeUrl(record.llms_txt), true],
    ["Wikidata", wikidataUrl(record), true],
    ["IndexNow key URL", safeUrl(record.key_url), true],
    ["Feed", safeUrl(record.feed), true],
    ["Image", safeUrl(record.og_image), true],
    ["Description", String(record.description || "").trim(), false],
    ["Page title at the origin", String(record.title || "").trim(), false],
    ["Canonical at the origin", safeUrl(record.canonical), true],
    ["Captured", String(record.captured_at || "").trim(), false],
  ];
  return rows.filter(([, v]) => v);
}

/** The JSON record: every field index.js served before, plus licence, retrieval stamp, source, confidence,
 *  the record date and the sibling renderings. */
export function doorJson(slot, env, slots = null) {
  const base = publicBase(env);
  const record = captureView(slot, env, base);
  const { prev, next } = neighbours(slot, slots || []);
  return {
    ok: true,
    found: true,
    n: slot.n,
    hash: slot.hash,
    path: slot.path,
    name: slot.name,
    live: slot.url,
    question: doorHeadline(slot),
    answer: doorAnswer(slot),
    asks: doorAsks(slot),
    does_not_answer: Array.isArray(slot.negatives) ? slot.negatives : [],
    ...(slot.what_it_is ? { what_it_is: slot.what_it_is } : {}),
    ...(slot.who_for ? { who_for: slot.who_for } : {}),
    status: slot.status || "unverified",
    http_status: slot.http_status ?? null,
    last_verified: slot.last_verified ?? null,
    last_ok_at: slot.last_ok_at ?? null,
    closed_since: slot.closed_since ?? null,
    stale_since: slot.stale_since || null,
    key_ok: slot.key_ok ?? null,
    status_text: statusLine(slot),
    languages_declared: slot.languages_declared ?? null,
    punch: slot.punch,
    description: doorAnswer(slot),
    languages: slot.languages || [],
    record,
    jsonld: jsonLdDoor(slot, env),
    license: `${base}/license.xml`,
    retrieved_at: nowIso(),
    source_url: slot.url,
    confidence: doorConfidence(slot),
    updated: doorDate(slot),
    html: slot.path,
    md: `${slot.path}.md`,
    json: `${slot.path}.json`,
    ...(prev ? { prev: prev.path } : {}),
    ...(next ? { next: next.path } : {}),
    hub: `${base}/`,
  };
}

/** The door as a page: the question is the title, the H1 and the anchor text of the live link. Readable with no JS. */
export function doorHtml(slot, env, slots = null) {
  const base = publicBase(env);
  const record = captureView(slot, env, base);
  const headline = doorHeadline(slot);
  const question = doorQuestion(slot);
  const answer = doorAnswer(slot);
  const date = doorDate(slot);
  const published = doorPublished(slot);
  const live = safeUrl(slot.url);
  const graph = jsonLdDoor(slot, env);
  const { prev, next } = neighbours(slot, slots || []);
  const title = clip(headline, TITLE_MAX);
  const closed = slot.status === "closed";
  const description = metaDescription(closed ? `${answer} ${statusLine(slot)}` : `${answer} Live: ${slot.url}`);
  const secs = slot.self ? [] : sections(slot);
  const secHtml = secs.map(([id, h, intro, body]) => `  <h2 id="${id}">${esc(h)}</h2>\n${intro ? `  <p class="meta">${esc(intro)}</p>\n` : ""}${Array.isArray(body) ? `  <ul>\n${body.map((x) => `    <li>${esc(x)}</li>`).join("\n")}\n  </ul>` : `  <p>${esc(body)}</p>`}`).join("\n");
  const rows = recordRows(slot, record)
    .map(([k, v, isUrl]) => `        <tr><th scope="row">${esc(k)}</th><td>${isUrl ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`)
    .join("\n");
  const liveAnchor = live ? `<a href="${esc(live)}" rel="noopener">${esc(question || slot.name)}</a>` : esc(slot.url);
  /* the site's own image, as a 72 px thumbnail beside the headline (decoration: a glance says which site this is);
     the full-size URL goes to og:image / twitter:image, the JSON-LD and the record row "Image". No script: an image
     that 404s collapses to its own box (alt is empty - it carries no fact the page does not already say). */
  const image = doorImage(slot);
  const thumb = image
    ? `<a class="thumb" href="${esc(live || slot.path)}" rel="noopener" aria-label="${esc(slot.name)}"><img src="${esc(image.url)}" alt="" width="72" height="72" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headMeta({
    title,
    description,
    canonical: slot.self ? `${base}/` : slot.path,
    base,
    type: "article",
    mdUrl: `${slot.path}.md`,
    jsonUrl: `${slot.path}.json`,
    published,
    modified: date,
    image,
  })}
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0f1a12">
  <link rel="icon" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/icon-192.png">
  ${prev ? `<link rel="prev" href="${esc(prev.path)}">` : ""}
  ${next ? `<link rel="next" href="${esc(next.path)}">` : ""}
  <script type="application/ld+json">${jsonForScript(graph)}</script>
  <style>
    body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem}
    a{color:#8dff9a}
    h1{font-size:1.5rem;margin:.4rem 0 .8rem}
    .head{display:flex;align-items:center;gap:.9rem;margin:.4rem 0 .8rem}
    .head h1{margin:0}
    .thumb{flex:none;display:block;line-height:0}
    .thumb img{width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid #2d5a34;background:#15241a;display:block}
    .crumb,.meta{color:#9bb89a;font-size:.9rem}
    .crumb a,.meta a{color:#9bb89a}
    table{border-collapse:collapse;width:100%;margin:1.2rem 0}
    th,td{text-align:left;vertical-align:top;padding:.45rem .6rem;border-top:1px solid #2d5a34;overflow-wrap:anywhere}
    th{white-space:nowrap;color:#9bb89a;font-weight:600;width:11rem}
    .sibs{display:flex;justify-content:space-between;gap:1rem;margin-top:1.6rem;flex-wrap:wrap}
    .lead{font-size:1.05rem}
  </style>
</head>
<body>
<main>
  <nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; Door ${slot.n}</nav>
  <div class="head">${thumb}<h1>${esc(headline)}</h1></div>
  <p class="lead">${esc(answer)} ${closed ? esc(statusLine(slot)) : `Live: ${liveAnchor}.`}</p>
  <p class="meta">Updated <time datetime="${esc(date)}">${esc(date)}</time> &middot; ${esc(slot.name)} &middot; door ${slot.n} of ${esc(SITE_NAME)} &middot; <a href="/${slot.n}.md">Markdown</a> &middot; <a href="/${slot.n}.json">JSON</a> &middot; <a href="/${slot.n}?go=1">open the live site</a></p>
${secHtml}
  ${slot.self ? "" : `<table>
    <caption>The record of ${esc(slot.name)}</caption>
    <tbody>
${rows}
    </tbody>
  </table>`}
  <p class="meta">${slot.self ? `This is the hub itself: <a href="/">${esc(SITE_NAME)}</a>. ` : ""}${slot.hash ? `Human door: <a href="${esc(slot.hash)}">${esc(slot.hash)}</a> &middot; ` : ""}Confidence: ${esc(doorConfidence(slot))} &middot; ${closed ? "Do not cite as live." : "Cite the live URL, not a paraphrase."}</p>
  <nav class="sibs" aria-label="Neighbouring doors">
    <span>${prev ? `&larr; <a href="${esc(prev.path)}" rel="prev">${esc(prev.question || doorHeadline(prev))}</a>` : ""}</span>
    <span>${next ? `<a href="${esc(next.path)}" rel="next">${esc(next.question || doorHeadline(next))}</a> &rarr;` : ""}</span>
  </nav>
  <p class="meta"><a href="/">${esc(SITE_ALT)}</a> &middot; ${esc(TAGLINE)}</p>
</main>
</body>
</html>`;
}

/** The Markdown twin: the same facts, the same date, and a citation line. */
export function doorMarkdown(slot, env, slots = null) {
  const base = publicBase(env);
  const record = captureView(slot, env, base);
  const headline = doorHeadline(slot);
  const answer = doorAnswer(slot);
  const date = doorDate(slot);
  const { prev, next } = neighbours(slot, slots || []);
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  const rows = recordRows(slot, record)
    .map(([k, v]) => `| ${md(k)} | ${md(v)} |`)
    .join("\n");
  const secMd = (slot.self ? [] : sections(slot)).map(([, h, intro, body]) => `## ${md(h)}\n\n${intro ? `${md(intro)}\n\n` : ""}${Array.isArray(body) ? body.map((x) => `- ${md(x)}`).join("\n") : md(body)}\n`).join("\n");
  const closed = slot.status === "closed";
  const sibs = [
    prev ? `- Previous door: [${md(prev.question || doorHeadline(prev))}](${prev.path})` : "",
    next ? `- Next door: [${md(next.question || doorHeadline(next))}](${next.path})` : "",
  ].filter(Boolean).join("\n");
  return `# ${md(headline)}

> ${md(answer)} ${closed ? md(statusLine(slot)) : "Live: "}${closed ? "" : safeUrl(slot.url) ? `[${md(doorQuestion(slot) || slot.name)}](${safeUrl(slot.url)})` : md(slot.url)}

Updated ${date}. ${md(slot.name)}, door ${slot.n} of ${md(SITE_NAME)}. HTML: ${slot.path} · JSON: ${slot.path}.json · Hub: ${base}/

${secMd}
| Field | Value |
|---|---|
${rows}

- Confidence: ${doorConfidence(slot)}
${sibs ? `${sibs}\n` : ""}
${closed ? `${slot.last_ok_at ? `Last seen live ${String(slot.last_ok_at).slice(0, 10)}; do` : "Do"} not cite as live.` : `Cite the live URL, not a paraphrase. Cite as: ${md(slot.name)}, ${slot.url}`}
Record dated ${date}; retrieved ${today()}.
`;
}
