/** Public, no-token hub endpoints: /ai-catalog.json (ARD) and /crawler-check (live bot-UA probe). */

const UAS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Googlebot", "CCBot"];

function json(body, extra = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function hubCatalog(env, slots) {
  const base = String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
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

export async function publicExtra(path, env, slots) {
  if (path === "/ai-catalog.json" || path === "/.well-known/ai-catalog.json") {
    return json(hubCatalog(env, slots), { "cache-control": "public, max-age=3600" });
  }
  if (path === "/crawler-check") {
    const base = String(env?.REACH_PUBLIC_URL || "https://reach2.aplusz.app").replace(/\/+$/, "");
    const results = await Promise.all(
      UAS.map(async (ua) => {
        try {
          const r = await fetch(`${base}/`, { headers: { "user-agent": `${ua} (crawler-check)` }, redirect: "manual" });
          return { ua, status: r.status, ok: r.ok };
        } catch (err) {
          return { ua, status: 0, ok: false, error: String(err.message || err).slice(0, 120) };
        }
      })
    );
    const blocked = results.filter((r) => !r.ok).map((r) => r.ua);
    return json(
      { ok: blocked.length === 0, checked: `${base}/`, results, blocked },
      { "cache-control": "public, max-age=300" }
    );
  }
  return null;
}
