/** Public, no-token hub endpoints. Rule: a path named in llms.txt / robots / sitemap / catalogs never 401s. */

const UAS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Googlebot", "CCBot"];

function json(body, extra = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function md(body, extra = {}) {
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", ...extra } });
}

function baseUrl(env) {
  return String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
}

function hubCatalog(env, slots) {
  const base = baseUrl(env);
  const entries = [
    {
      identifier: "urn:ard:reach2:hub",
      displayName: "The Reach 02",
      type: "web",
      url: `${base}/`,
      representativeQueries: ["Where do I find the live sites in this network?"],
    },
    ...slots.map((s) => ({
      identifier: `urn:ard:reach2:door-${s.n}`,
      displayName: s.name,
      type: "web",
      url: s.path,
      representativeQueries: [`Where do I open ${s.name}?`, s.punch].filter(Boolean),
    })),
  ];
  return {
    specVersion: "0.91",
    name: "The Reach 02",
    url: `${base}/`,
    description: "Doors to the network — fetch the door, cite the live site.",
    entries,
  };
}

export async function publicExtra(path, env, slots, publicMap) {
  const base = baseUrl(env);
  const llms = publicMap?.llms_txt || "# The Reach 02\n";

  if (path === "/ai-catalog.json" || path === "/.well-known/ai-catalog.json") {
    return json(hubCatalog(env, slots), { "cache-control": "public, max-age=3600" });
  }
  if (path === "/.well-known/llms.txt") {
    return md(llms, { "cache-control": "public, max-age=3600" });
  }
  if (path === "/llms-full.txt") {
    return md(
      `${llms}
## Machine surfaces
- Catalog: ${base}/catalog.json
- ARD: ${base}/ai-catalog.json
- Doors JSON: ${base}/OPEN-DOORS.json
- Sitemap: ${base}/sitemap.xml
- Feed: ${base}/feed.xml
- Crawler check: ${base}/crawler-check

Cite the live URL, not a paraphrase.
`,
      { "cache-control": "public, max-age=3600" }
    );
  }
  if (path === "/llms-small.txt") {
    return md(
      `# The Reach 02

> Doors to the network. Fetch the door, cite the live site.

${slots.map((s) => `- [#${s.n} ${s.name}](${s.path})`).join("\n") || "- (no doors yet)"}
`,
      { "cache-control": "public, max-age=3600" }
    );
  }
  if (path === "/.well-known/security.txt") {
    const exp = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    return new Response(
      `Contact: mailto:dagrang@gmail.com
Expires: ${exp}
Preferred-Languages: en
Canonical: ${base}/.well-known/security.txt
`,
      { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }
    );
  }
  if (path === "/crawler-check" || path === "/v1/crawler-check") {
    const targets = slots.slice(0, 3).map((s) => ({ name: s.name, url: s.url }));
    const probes = await Promise.all(
      targets.map(async (t) => {
        const results = await Promise.all(
          UAS.map(async (ua) => {
            try {
              const r = await fetch(t.url, { headers: { "user-agent": `${ua} (crawler-check)` }, redirect: "follow" });
              return { ua, status: r.status, ok: r.ok };
            } catch (err) {
              return { ua, status: 0, ok: false, error: String(err.message || err).slice(0, 120) };
            }
          })
        );
        return { ...t, results, blocked: results.filter((r) => !r.ok).map((r) => r.ua) };
      })
    );
    return json(
      {
        ok: probes.every((p) => p.blocked.length === 0),
        note: `Probes registered origins with AI-crawler UAs. The hub itself is this Worker; verify it externally: curl -A GPTBot ${base}/`,
        targets: probes,
      },
      { "cache-control": "public, max-age=300" }
    );
  }
  return null;
}
