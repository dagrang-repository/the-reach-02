/* Fixtures for the pack and policy tests. Hosts end in .test (RFC 6761): nothing here is a real site. */
const HOST = "visa-answers.test";
const ORIGIN = `https://${HOST}`;

export const site = () => ({
  id: "site_fixture",
  name: "Visa Answers",
  url: `${ORIGIN}/`,
  indexnow_key: "0123456789abcdef0123456789abcdef",
  sitemap_url: "",
  og_image: "",
});

export const intel = () => ({
  punch_line: "Do I need a visa for a country with my passport?",
  summary: "Visa rules for 197 passports and 196 destinations, one page per pair.",
  who_for: "Travellers checking entry rules before they book.",
  services: ["Visa lookup", "Document checklist"],
  languages_present: ["en", "fr"],
  url_grammar: "/{lang}/visa/{passport}/{destination}",
  asker_queries: [
    "Do I need a visa for Japan with a Philippine passport?",
    "How long can a French passport stay in Thailand?",
    "What documents does a German passport need for India?",
  ],
  angles: [
    { label: "cost", hook: "How much does a visa for Vietnam cost?" },
    { label: "brand", hook: "Visa Answers" },
  ],
});

export const keywords = () => ({
  core_terms_from_site: ["visa", "requirements", "passport"],
  demand: [{ term: "visa", score: 3 }],
  search_intent: [
    { query: "Which countries can a French passport enter without a visa?", intent: "informational" },
    { query: "apply for a Japan visa online", intent: "transactional" },
  ],
  do_not_target: ["visa credit card"],
});

export const backlinks = () => ({
  inbound_declared: ["https://github.com/visa-answers", "https://www.wikidata.org/wiki/Q1"],
});

const get = (path, open, status = open ? 200 : 404) => ({ path, url: `${ORIGIN}${path}`, status, open });

/** A probe row set. `opts.open` lists the GET paths that answered; mcp / a2a are the versions each endpoint spoke. */
export function probe({ open = [], mcp = null, a2a = null, paths = [] } = {}) {
  const rows = [...new Set([...paths, ...open])].map((p) => get(p, open.includes(p)));
  const mv = mcp || [];
  rows.push({
    path: "/mcp", method: "POST", url: `${ORIGIN}/mcp`, status: mv.length ? 200 : 404, open: mv.length > 0,
    mcp: { versions: mv, modern: mv.filter((v) => v >= "2026"), legacy: mv.filter((v) => v < "2026") },
  });
  const av = a2a || [];
  rows.push({ path: "/a2a", method: "POST", url: `${ORIGIN}/a2a`, status: av.length ? 200 : 404, open: av.includes("1.0"), a2a: { versions: av } });
  return rows;
}

export const door = () => ({
  n: 7,
  hub: "https://hub.test",
  path: "https://hub.test/7",
  hash: "https://hub.test/#7",
  qid: "Q4242",
  hubSite: "https://hub.test/#site",
  hubOrg: "https://hub.test/#org",
});

export { HOST, ORIGIN };
