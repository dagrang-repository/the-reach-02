/** Only keys verified on the live origin. */
export const KNOWN_ORIGIN_KEYS = [
  { host: "globewarn.com", key: "b8b386fdfd487b440ccfc6054ac911b2" },
];

function bare(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

export function keyForHost(host) {
  const h = bare(host);
  const row = KNOWN_ORIGIN_KEYS.find((r) => bare(r.host) === h);
  return row ? row.key : "";
}

export function keyForUrl(url) {
  try {
    return keyForHost(new URL(url).host);
  } catch {
    return "";
  }
}
