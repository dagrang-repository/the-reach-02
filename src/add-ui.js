export function addSiteHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Add a site &mdash; The Reach 02</title>
  <style>
    body{margin:0;font:16px/1.45 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem}
    label{display:block;margin:1rem 0 .35rem;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;color:#8dff9a}
    input{width:100%;box-sizing:border-box;padding:.7rem .8rem;border:1px solid #2d5a34;border-radius:12px;background:#15241a;color:#e8f6e4}
    button{margin-top:1.25rem;width:100%;padding:.85rem;border:0;border-radius:12px;background:#8dff9a;color:#0f1a12;font-weight:700;cursor:pointer}
    .hint{color:#9bb89a;font-size:.9rem}
    #out{margin-top:1rem;white-space:pre-wrap}
    #done{display:none;border:1px solid #2d5a34;border-radius:16px;background:#15241a;padding:1.25rem 1.4rem;margin-top:1rem}
    #done h2{margin:.2rem 0 .6rem;color:#8dff9a}
    a{color:#8dff9a}
  </style>
</head>
<body>
<main>
  <p><a href="/">&larr; doors</a></p>
  <h1>Add a site</h1>
  <p class="hint" id="intro">Name and URL. Key is optional &mdash; paste only the key string.</p>
  <form id="f">
    <label for="name">Name</label>
    <input id="name" name="name" required placeholder="Globe Warn">
    <label for="url">URL</label>
    <input id="url" name="url" required placeholder="https://globewarn.com/">
    <label for="key">Origin key (optional)</label>
    <input id="key" name="key" placeholder="paste key only">
    <label for="token">Admin</label>
    <input id="token" name="token" required placeholder="your admin email">
    <button type="submit">Add</button>
  </form>
  <div id="done">
    <h2 id="doneTitle"></h2>
    <p id="doneKey"></p>
    <p id="doneLinks"></p>
  </div>
  <div id="out" class="hint"></div>
</main>
<script>
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const url = document.getElementById("url").value.trim();
  const key = document.getElementById("key").value.trim();
  const token = document.getElementById("token").value.trim();
  const body = { name, url };
  if (key) body.key = key;
  const out = document.getElementById("out");
  out.textContent = "Saving...";
  try {
    const res = await fetch("/v1/sites", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) { out.textContent = data.error || "failed"; return; }
    const n = (data.map && data.map.sites) || 0;
    const keyOk = !!(data.key_check && data.key_check.ok);
    document.getElementById("f").style.display = "none";
    document.getElementById("intro").style.display = "none";
    out.textContent = "";
    document.getElementById("doneTitle").textContent = (keyOk ? "Key green. " : "") + data.site.name + " successfully added" + (n ? " as door #" + n : "");
    document.getElementById("doneKey").textContent = keyOk ? "Origin key file is live (200)." : "Key not green yet - origin key file did not answer 200.";
    document.getElementById("doneLinks").innerHTML = (n ? '<a href="/#' + n + '">Open door #' + n + '</a> &middot; ' : '') + '<a href="/add">Add another site</a>';
    document.getElementById("done").style.display = "block";
  } catch (err) {
    out.textContent = String(err.message || err);
  }
});
</script>
</body>
</html>`;
}
