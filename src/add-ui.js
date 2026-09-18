export function addSiteHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Add a site — The Reach 02</title>
  <style>
    body{margin:0;font:16px/1.45 system-ui,sans-serif;background:#0f1a12;color:#e8f6e4}
    main{max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem}
    label{display:block;margin:1rem 0 .35rem;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;color:#8dff9a}
    input{width:100%;box-sizing:border-box;padding:.7rem .8rem;border:1px solid #2d5a34;border-radius:12px;background:#15241a;color:#e8f6e4}
    button{margin-top:1.25rem;width:100%;padding:.85rem;border:0;border-radius:12px;background:#8dff9a;color:#0f1a12;font-weight:700;cursor:pointer}
    .hint{color:#9bb89a;font-size:.9rem}
    #out{margin-top:1rem;white-space:pre-wrap}
    a{color:#8dff9a}
  </style>
</head>
<body>
<main>
  <p><a href="/">← doors</a></p>
  <h1>Add a site</h1>
  <p class="hint">Name and URL. Key is optional — paste only the key string.</p>
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
  out.textContent = "Saving…";
  try {
    const res = await fetch("/v1/sites", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) { out.textContent = data.error || "failed"; return; }
    const n = (data.map && data.map.sites) || "";
    out.textContent = data.site.name + " added." + (data.key_check && data.key_check.ok ? " Key green." : " Key not green yet.");
  } catch (err) {
    out.textContent = String(err.message || err);
  }
});
</script>
</body>
</html>`;
}
