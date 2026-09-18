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
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0f1a12">
  <link rel="icon" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/icon-192.png">
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
    #board{display:flex;flex-wrap:wrap;gap:.7rem}
    .slot{border:1px solid #2d5a34;border-radius:16px;padding:.8rem 1.1rem;background:#15241a;cursor:pointer;transition:background .15s;width:var(--card-w,max-content);box-sizing:border-box}
    .slot:hover{background:#1a2c20}
    .slot h2{margin:.1rem 0;font-size:1.05rem;white-space:nowrap}
    .slot .more{display:none;margin-top:.5rem;overflow-wrap:anywhere}
    .slot.open .more{display:block}
    .n{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#8dff9a}
    .btn{display:inline-block;padding:.7rem 1.1rem;border-radius:12px;background:#8dff9a;color:#0f1a12;font-weight:700;text-decoration:none;border:0;font-size:1rem;cursor:pointer}
    .top{display:flex;align-items:center;gap:1rem;flex-wrap:nowrap;white-space:nowrap;margin-bottom:1.2rem}
    .top h1{margin:0;font-size:1.5rem}
    .top .btn{padding:.45rem .9rem;font-size:.95rem}
    #pwa{position:fixed;left:50%;bottom:1.25rem;transform:translateX(-50%);display:none;align-items:center;gap:.9rem;background:#15241a;border:1px solid #2d5a34;border-radius:16px;padding:.9rem 1.1rem;box-shadow:0 8px 30px rgba(0,0,0,.45);z-index:9}
    #pwa.on{display:flex}
  </style>
</head>
<body>
<main>
  <div class="top"><span class="n">The Reach 02</span><h1>Doors</h1><a href="/add" class="btn">Add site</a></div>
  <div id="board"></div>
</main>
<div id="pwa"><span>Install The Reach 02 as an app?</span><button id="pwaGo" class="btn">Install App</button></div>
<script>
const SLOTS = ${data};
function render() {
  const board = document.getElementById("board");
  if (!SLOTS.length) { board.innerHTML = "<p>No doors yet.</p>"; return; }
  board.innerHTML = SLOTS.map(s => (
    '<article class="slot" id="door-' + s.n + '" data-n="' + s.n + '">' +
      '<h2>' + s.name + '</h2>' +
      '<div class="more">' +
        '<div class="n">#' + s.n + ' &middot; ' + s.hash + '</div>' +
        '<p>' + (s.punch || "") + '</p>' +
        '<p><a href="' + s.url + '">Open live site</a> &middot; <a href="/' + s.n + '">/' + s.n + '</a></p>' +
      '</div>' +
    '</article>'
  )).join("");
  let w = 0;
  for (const el of board.querySelectorAll(".slot")) w = Math.max(w, el.offsetWidth);
  if (w) { board.style.setProperty("--card-w", w + "px"); board.style.maxWidth = (w * 3 + 24) + "px"; }
  for (const el of board.querySelectorAll(".slot")) {
    el.addEventListener("click", (e) => { if (e.target.tagName === "A") return; el.classList.contains("open") ? collapse(el) : expand(el); });
  }
}
function expand(el) {
  for (const other of document.querySelectorAll(".slot.open")) if (other !== el) collapse(other);
  el.classList.add("open");
}
function collapse(el) { el.classList.remove("open"); }
function openHash() {
  const raw = (location.hash || "").replace("#","");
  const el = raw ? document.getElementById("door-" + Number(raw)) : null;
  if (el) { expand(el); el.scrollIntoView({ block: "center" }); }
}
render();
openHash();
addEventListener("hashchange", openHash);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
let deferred = null, pwaTimer = null;
const pop = document.getElementById("pwa");
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  pop.classList.add("on");
  pwaTimer = setTimeout(() => pop.classList.remove("on"), 12000);
});
document.getElementById("pwaGo").addEventListener("click", async () => {
  if (!deferred) return;
  clearTimeout(pwaTimer);
  pop.classList.remove("on");
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
});
addEventListener("appinstalled", () => { clearTimeout(pwaTimer); pop.classList.remove("on"); });
</script>
</body>
</html>`;
}
