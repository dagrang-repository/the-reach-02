/* What the six-hourly atlas job would have written for the sample doors: what each one answers, in its own words.
   The table is created by the Worker itself (one request to /atlas.json), so a test never restates its shape. */
export const SAMPLE_ATLAS = [
  {
    key: "visa",
    name: "Visa Answers",
    url: "https://visa-answers.test/",
    punch: "Visa rules for any passport and any destination, answered in one line.",
    keywords: ["visa", "passport", "entry", "travel", "requirements", "embassy"],
    intents: ["Do I need a visa for a country with my passport?", "How long can I stay without a visa?"],
  },
  {
    key: "flights",
    name: "Cheap Flights",
    url: "https://cheap-flights.test/",
    punch: "The cheapest day to fly any route, from live fares.",
    keywords: ["flight", "fare", "airline", "cheap", "route", "airport"],
    intents: ["Which day is the cheapest to fly?", "What is the cheapest flight on this route?"],
  },
  {
    key: "warn",
    name: "Globe Warn",
    url: "https://globe-warn.test/",
    punch: "Official travel warnings for every country, side by side.",
    keywords: ["warning", "advisory", "safety", "country", "risk"],
    intents: ["Is there a travel warning for this country?"],
  },
];

/** doors: [{ id, n, key }] - which sample profile belongs to which seeded site row. */
export async function seedAtlas(worker, env, base, doors, at = "2026-11-12T09:00:00.000Z") {
  await worker.fetch(new Request(`${base}/atlas.json`), env, { waitUntil() {} });
  for (const d of doors) {
    const a = SAMPLE_ATLAS.find((x) => x.key === d.key);
    if (!a) throw new Error(`no sample atlas profile named ${d.key}`);
    const profile = {
      punch: a.punch, what_it_is: a.punch, serves: `answers: ${a.intents[0]}`, keywords: a.keywords, intents: a.intents, negatives: [],
      languages: ["en"], languages_wanted: [], declared_questions: a.intents, source: "llms.txt", thin: false, catchall: false,
    };
    await env.DB.prepare("INSERT INTO atlas (site_id, n, name, url, profile_json, briefing_stamp, updated_at, llms_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(d.id, d.n, a.name, a.url, JSON.stringify(profile), at, at, "seed")
      .run();
  }
}
