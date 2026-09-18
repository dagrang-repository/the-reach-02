const BASE = "https://reach2.aplusz.app";

export function publicBase(env) {
  return String(env?.REACH_PUBLIC_URL || BASE).replace(/\/+$/, "");
}

export async function numberedSites(env, allFn) {
  const rows = await allFn(
    env,
    `SELECT s.id, s.name, s.url, s.indexnow_key, s.languages_wanted, b.punch_line, b.summary, b.who_for
     FROM sites s
     LEFT JOIN briefings b ON b.site_id = s.id
     WHERE s.active = 1
     ORDER BY s.created_at ASC`
  );
  return rows.map((s, i) => {
    const n = i + 1;
    return {
      n,
      hash: `${publicBase(env)}/#${n}`,
      path: `${publicBase(env)}/${n}`,
      id: s.id,
      name: s.name,
      url: s.url,
      punch: s.punch_line || s.name,
      summary: s.summary || "",
      who_for: s.who_for || "",
      languages: JSON.parse(s.languages_wanted || "[]"),
    };
  });
}

export function hillHtml(slots) {
  const data = JSON.stringify(slots);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Reach 02</title>
  <link rel="canonical" href="${BASE}/">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
  <link rel="alternate" type="text/markdown" href="/llms.txt">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "The Reach 02 doors",
    itemListElement: slots.map((s) => ({ "@type": "ListItem", position: s.n, url: s.path, name: s.name })),
  })}</script>
  <style>
    body{margin:0;font:16px/1.45 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem}
    a{color:#8dff9a}
    .slot{border:1px solid #2d5a34;border-radius:16px;padding:1.25rem 1.4rem;margin:1rem 0;background:#15241a}
    .n{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#8dff9a}
  </style>
</head>
<body>
<main>
  <p class="n">The Reach 02</p>
  <h1>Doors</h1>
  <p><a href="/add" style="display:inline-block;padding:.7rem 1.1rem;border-radius:12px;background:#8dff9a;color:#0f1a12;font-weight:700;text-decoration:none">Add site</a></p>
  <p>Each added site gets the next number. Humans use #1 #2 #3. Crawlers use /1 /2 /3.</p>
  <div id="board"></div>
</main>
<script>
const SLOTS = ${data};
function show() {
  const raw = (location.hash || "").replace("#","");
  const n = raw ? Number(raw) : 0;
  const board = document.getElementById("board");
  const list = n ? SLOTS.filter(s => s.n === n) : SLOTS;
  if (!list.length) {
    board.innerHTML = "<p>No door at #" + raw + ".</p>";
    return;
  }
  board.innerHTML = list.map(s => (
    '<article class="slot">' +
      '<div class="n">#' + s.n + ' · ' + s.hash + '</div>' +
      '<h2>' + s.name + '</h2>' +
      '<p>' + (s.punch || "") + '</p>' +
      '<p><a href="' + s.url + '">Open live site</a> · <a href="/' + s.n + '">/' + s.n + '</a></p>' +
    '</article>'
  )).join("");
}
show();
addEventListener("hashchange", show);
</script>
</body>
</html>`;
}
