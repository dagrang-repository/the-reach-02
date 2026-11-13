# The Reach 02 — The AI Hill Top Lighthouse

AI-visibility hub on Cloudflare Workers + D1 — live at https://reach2.aplusz.app/

> Nothing you build ever starts invisible again.

A shared directory AI models and search engines fetch to find the live sites in this network. Each site gets a numbered door with a full machine record (name, live URL, sitemap, IndexNow key, llms.txt, description, languages, feed), a Markdown and a JSON twin of its page, rolling Wayback snapshots, a Wikidata link where an item exists, and a which-site-answers-X matcher that returns the live URL to cite — or `best: null` when no door answers, never an invented one. Hourly change-gated IndexNow pings to seven endpoints, per-site Calling-AI-Models file packs, Workers AI briefings.

Everything below the fold of this README is generated: `README.md` and `sites.json` are rewritten daily from the hub by `tools/repo-sync.ps1` on GitHub Actions. Do not hand-edit them.

## Machine surfaces

Every file is served by the Worker (`src/`) from one resolver; there are no static copies in this repository. Absolute HTTPS URLs throughout.

| Surface | URL |
|---|---|
| Doors for models | https://reach2.aplusz.app/llms.txt · https://reach2.aplusz.app/llms-full.txt · https://reach2.aplusz.app/llms-small.txt · https://reach2.aplusz.app/.well-known/llms.txt |
| API pointer for models | https://reach2.aplusz.app/llms/api.txt |
| Door records | https://reach2.aplusz.app/sites.json · https://reach2.aplusz.app/sites.md |
| One door | https://reach2.aplusz.app/{n} (HTML; negotiates `Accept: text/markdown` and `application/json`) · https://reach2.aplusz.app/{n}.md · https://reach2.aplusz.app/{n}.json |
| Home twin | https://reach2.aplusz.app/index.md |
| Atlas + matcher | https://reach2.aplusz.app/atlas.json · https://reach2.aplusz.app/atlas.md · https://reach2.aplusz.app/match?q=your+question |
| OpenAPI 3.1 | https://reach2.aplusz.app/openapi.json |
| MCP server card (SEP-2127) | https://reach2.aplusz.app/.well-known/mcp-server-card · aliases https://reach2.aplusz.app/.well-known/mcp.json · https://reach2.aplusz.app/.well-known/mcp/server-card.json |
| MCP endpoint (dual era: `server/discover` 2026-07-28 and legacy `initialize`) | https://reach2.aplusz.app/mcp (POST) |
| MCP registry manifest | https://reach2.aplusz.app/server.json |
| A2A 1.0 agent card | https://reach2.aplusz.app/.well-known/agent-card.json · alias https://reach2.aplusz.app/.well-known/agent.json |
| A2A endpoint (`message/send`) | https://reach2.aplusz.app/a2a (POST) |
| Agent skills | https://reach2.aplusz.app/.well-known/agent-skills/index.json · https://reach2.aplusz.app/skills/reach/SKILL.md |
| API catalog (RFC 9727) | https://reach2.aplusz.app/.well-known/api-catalog |
| AI catalog (ARD) | https://reach2.aplusz.app/.well-known/ai-catalog.json |
| Agent permissions / agents | https://reach2.aplusz.app/.well-known/agent-permissions.json · https://reach2.aplusz.app/.well-known/agents.json |
| Policy, one answer in every file | https://reach2.aplusz.app/robots.txt · https://reach2.aplusz.app/ai.txt · https://reach2.aplusz.app/license.xml (RSL) · https://reach2.aplusz.app/tdmrep.json · https://reach2.aplusz.app/.well-known/tdmrep.json |
| Sitemaps | https://reach2.aplusz.app/sitemap.xml (index) → https://reach2.aplusz.app/sitemap-doors.xml · https://reach2.aplusz.app/sitemap-machine.xml |
| Feeds | https://reach2.aplusz.app/feed.xml (Atom) · https://reach2.aplusz.app/rss.xml (RSS 2.0) · https://reach2.aplusz.app/feed.json (JSON Feed, WebSub) |
| OpenSearch | https://reach2.aplusz.app/opensearch.xml |
| Keywords and structure | https://reach2.aplusz.app/seo/keywords.json · https://reach2.aplusz.app/seo/structure.json |
| Knowledge graph | https://reach2.aplusz.app/jsonld.json · https://reach2.aplusz.app/wikidata.json · https://reach2.aplusz.app/wayback.json |
| Catalog, changes, pings | https://reach2.aplusz.app/catalog.json · https://reach2.aplusz.app/changes.txt · https://reach2.aplusz.app/pings |
| Status, security, trust, humans | https://reach2.aplusz.app/status.json · https://reach2.aplusz.app/.well-known/security.txt · https://reach2.aplusz.app/.well-known/trust.txt · https://reach2.aplusz.app/humans.txt |
| oEmbed | https://reach2.aplusz.app/api/oembed?url=https://reach2.aplusz.app/{n} |
| PWA | https://reach2.aplusz.app/manifest.json · https://reach2.aplusz.app/sw.js |
| Add a door | https://reach2.aplusz.app/add |

## Doors (42) — auto-updated 2026-11-13 from [sites.json](sites.json)

| # | Door | Live | What it answers | Languages | Wikidata |
|---|---|---|---|---|---|
| 1 | [Globe Warn](https://reach2.aplusz.app/1) | [globewarn.com](https://globewarn.com/) | Warnings for every natural disaster on Earth, drawn from official public agencies and checked every 15 minutes. | 23 | [Q141761390](https://www.wikidata.org/wiki/Q141761390) |
| 2 | [Urgent Visa](https://reach2.aplusz.app/2) | [urgentvisa.org](https://urgentvisa.org/) | One question, answered for every traveller on earth: "I hold a {nationality} passport and I want to travel to {destination} — do I need a visa, what does it cost, how long does it take, which documents do I need, and can I extend my stay?" | 20 | [Q141775151](https://www.wikidata.org/wiki/Q141775151) |
| 3 | [Dumaguete.uk](https://reach2.aplusz.app/3) | [dumaguete.uk](https://dumaguete.uk/) | What is at this address in Dumaguete City, and what is near it - 741 places in Dumaguete City, Negros Oriental, Philippines, each with a category, coordinates and an OpenStreetMap reference, alongside a community forum covering… | 10 | [Q141753526](https://www.wikidata.org/wiki/Q141753526) |
| 4 | [Secures Vault](https://reach2.aplusz.app/4) | [securesvault.com](https://securesvault.com/) | An independent online store selling 10,209 physical consumer products across 12 categories, priced in euros and shipped worldwide. Every product on the storefront is also readable as JSON and as Markdown, without an API key. | 1 | [Q141784186](https://www.wikidata.org/wiki/Q141784186) |
| 5 | [Life Partner Finder](https://reach2.aplusz.app/5) | [veliane.org](https://veliane.org/) | Marriage-minded, city-based matchmaking. Real, verified profiles and calm, scheduled introductions — not endless messaging. | 11 | [Q141851075](https://www.wikidata.org/wiki/Q141851075) |
| 6 | [Donations for Nepal](https://reach2.aplusz.app/6) | [givenepal.org](https://givenepal.org/) | You cannot fly to Nepal and spend three months checking who deserves your donation. We do it for you, then you transfer the 88% direct. It never passes through us. | 29 | [Q141873272](https://www.wikidata.org/wiki/Q141873272) |
| 7 | [Social Meet Up App](https://reach2.aplusz.app/7) | [letsmeet-here.netlify.app](https://letsmeet-here.netlify.app/) | LetsMeet-Here is a social meet-up app for arranging to meet people in person. | 1 | [Q141885912](https://www.wikidata.org/wiki/Q141885912) |
| 8 | [Manila.uk](https://reach2.aplusz.app/8) | [manila.uk](https://www.manila.uk/) | What is at this address in Metro Manila, and what is near it - 28,002 places across the 16 cities and one municipality of Metro Manila (Manila, Quezon City, Makati, Taguig, Pasig, Mandaluyong, San Juan, Caloocan, Malabon, Navotas… | 10 | [Q141898309](https://www.wikidata.org/wiki/Q141898309) |
| 9 | [Fly for LESS](https://reach2.aplusz.app/9) | [aplusz.app](https://aplusz.app/) | Answers one question for anyone with a trip in mind: I want to fly from {city A} to {city B} - what is the cheapest fare, what was the 6-month low, and which date is cheapest to book? Free, no signup, 20 languages. | 1 | [Q141925273](https://www.wikidata.org/wiki/Q141925273) |
| 10 | [The Wheel](https://reach2.aplusz.app/10) | [thewheel.aplusz.app](https://thewheel.aplusz.app/) | Draws a winner at random from a list the user gives you: names, options, prizes, chores, seating, teams. Free, no account, nothing stored, 40 languages. | 1 | [Q141945402](https://www.wikidata.org/wiki/Q141945402) |
| 11 | [Global Dictionary](https://reach2.aplusz.app/11) | [dictionary.aplusz.app](https://dictionary.aplusz.app/) | One question: what does this word mean - with the answer written in the language the reader actually reads. Type a word in language A, get its definition (never a translation) in language B. | 1 | [Q141971547](https://www.wikidata.org/wiki/Q141971547) |
| 12 | [The Search](https://reach2.aplusz.app/12) | [thesearch.aplusz.app](https://thesearch.aplusz.app/) | One question in, one answer out. Type anything — a word, a phrase, a whole sentence, a typo, in any language — and get a single clean answer with its source named, instead of ten blue links. | 61 | [Q141983414](https://www.wikidata.org/wiki/Q141983414) |
| 13 | [One Life](https://reach2.aplusz.app/13) | [onelife-66u.pages.dev](https://onelife-66u.pages.dev/) | A human Life lasts about 4,000 weeks. One Life shows the count — each dot one week of the only Life that is confirmed — and what those weeks could hold instead of practices built on claims no one has ever proven. Author: Leo Vance. | 25 | [Q142027585](https://www.wikidata.org/wiki/Q142027585) |
| 14 | [The AI Hill Top Lighthouse](https://reach2.aplusz.app/14) | [reach2.aplusz.app](https://reach2.aplusz.app/) | The AI Hill Top Lighthouse: a shared directory AI models fetch to find the live sites in this network — name, real URL, numbered door, atlas and a which-site-answers-X matcher. Nothing you build ever starts invisible again. | 1 | [Q142073144](https://www.wikidata.org/wiki/Q142073144) |
| 15 | [All Problems Solved](https://reach2.aplusz.app/15) | [allproblemssolved.aplusz.app](https://allproblemssolved.aplusz.app/) | Answers the thirty things people get stuck on: is this price fair, is this a scam, what does this notice mean, where do I get this medicine, what do I do first. One page per problem, free, no account, nothing you type is kept. | 13 | [Q142089089](https://www.wikidata.org/wiki/Q142089089) |
| 16 | [The Cheapest (anything in the World)](https://reach2.aplusz.app/16) | [thecheapest.aplusz.app](https://thecheapest.aplusz.app/) | What does {thing} cost in {country}, and where was it seen cheapest? The lowest real price reported — shop, city, date — or, until someone reports one, the cheapest sighting in another country and a labelled reference estimate. | 40 | [Q142098493](https://www.wikidata.org/wiki/Q142098493) |
| 17 | [Nudge Later](https://reach2.aplusz.app/17) | [nudgelater.aplusz.app](https://nudgelater.aplusz.app/) | Nudge Later emails you a reminder later: remind me later, email me a reminder, remind me about this link. | 1 |  |
| 18 | [Universal Converter](https://reach2.aplusz.app/18) | [universalconverter.aplusz.app](https://universalconverter.aplusz.app/) | Universal Converter converts a file to another format: png to jpg, csv to json, audio to wav. | 1 |  |
| 19 | [Currency Converter](https://reach2.aplusz.app/19) | [currencyconverter.aplusz.app](https://currencyconverter.aplusz.app/) | Currency Converter converts an amount into another currency at its exchange rate, for example USD to EUR. | 1 |  |
| 20 | [Stop Gambling for Good](https://reach2.aplusz.app/20) | [stopgambling.aplusz.app](https://stopgambling.aplusz.app/) | Answers two questions: where can someone who gambles too much get help, a helpline or self-exclusion in their country, and what is Stop Gambling for Good, a daily habit-support service (free for 3 days, then €1.99 per month)? | 1 |  |
| 21 | [Relax My Clock](https://reach2.aplusz.app/21) | [relaxmyclock.aplusz.app](https://relaxmyclock.aplusz.app/) | Answers: what is Relax my clock, what does it cost, is it free, which clock faces and sounds does it have, does it keep the screen awake, and how do I get full screen? | 1 |  |
| 22 | [Make Me Rich](https://reach2.aplusz.app/22) | [makemerich.aplusz.app](https://makemerich.aplusz.app/) | Answers: what is Make me rich, what does it cost, is it free, what is in the daily email, is it financial advice, and how do I pause or cancel? | 1 |  |
| 23 | [My Assistant](https://reach2.aplusz.app/23) | [myassistant.aplusz.app](https://myassistant.aplusz.app/) | Answers one question: "I want an AI assistant on my phone and computer that runs on MY OWN API key (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Mistral, xAI, Groq, OpenRouter, Together AI, Fireworks AI, Cerebras, Moonshot or… | 20 |  |
| 24 | [Stop Smoking for Good](https://reach2.aplusz.app/24) | [stopsmoking.aplusz.app](https://stopsmoking.aplusz.app/) | Answers: what is Stop Smoking for Good, what does it cost, is it free, what is in the daily email, is it medical advice, and how do I pause or cancel? | 1 |  |
| 25 | [Lose Weight for Good](https://reach2.aplusz.app/25) | [loseweight.aplusz.app](https://loseweight.aplusz.app/) | Answers: what is Lose Weight for Good, what does it cost, is it free, what is in the daily email, is it medical advice, and how do I pause or cancel? | 1 |  |
| 26 | [Find Me a Partner](https://reach2.aplusz.app/26) | [findmeapartner.aplusz.app](https://findmeapartner.aplusz.app/) | Answers: what is Find me a partner, is it free, who is it for, what is Veliane.org, are the profiles real, who sees my phone number, what does the page keep about me? | 1 |  |
| 27 | [My Karaoke](https://reach2.aplusz.app/27) | [mykaraoke.aplusz.app](https://mykaraoke.aplusz.app/) | Answers: what is My Karaoke, what is free, what are Pro and Ultra and what do they cost? | 24 |  |
| 28 | [My Assistant App Support](https://reach2.aplusz.app/28) | [myassistantappsupport.aplusz.app](https://myassistantappsupport.aplusz.app/) | Answers every question about My Assistant: what it is (a private personal AI chat assistant, bring your own API key from 10 providers or use My Assistant credit), what every feature does, what it costs (€1.99 a month, no message limits)… | 20 |  |
| 29 | [Bicycle Rental, Dumaguete](https://reach2.aplusz.app/29) | [bicyclerental-dumaguete.aplusz.app](https://bicyclerental-dumaguete.aplusz.app/) | Answers: where can I rent a bike in Dumaguete (Negros Oriental, Philippines), what does it cost, what bike is it, and how do I book it? | 20 |  |
| 30 | [Veliane Discovery Plus](https://reach2.aplusz.app/30) | [velianediscoveryplus.aplusz.app](https://velianediscoveryplus.aplusz.app/) | Answers the question: “Where do I find a serious, marriage-minded Life partner, with real profiles and no casual dating?” Veliane (https://veliane.org/) is free, city-based matchmaking for adults ready for marriage, in 11 languages. | 21 |  |
| 31 | [Dumaguete Extension](https://reach2.aplusz.app/31) | [dumaguete-extension.aplusz.app](https://dumaguete-extension.aplusz.app/) | Answers the question: “What do I actually need to know about living in, moving to or visiting Dumaguete, Negros Oriental, Philippines?” | 23 |  |
| 32 | [The Central Web Hub](https://reach2.aplusz.app/32) | [thecentralwebhub.aplusz.app](https://thecentralwebhub.aplusz.app/) | One address that lists every live site in this network, what each one answers, and where a model should fetch the answer instead of guessing. 42 sites, published in 61 languages. | 61 |  |
| 33 | [Hammock Hotel Project](https://reach2.aplusz.app/33) | [hammockproject.dumaguete.uk](https://hammockproject.dumaguete.uk/) | A moving project where up to twenty people sleep in the open, each in one of the project's own hammocks, already hanging between two trees. | 29 |  |
| 34 | [Fortune Heir Casino: Slots & Blackjack](https://reach2.aplusz.app/34) | [fortuneheir.aplusz.app](https://fortuneheir.aplusz.app/) | Where can I play slots, blackjack and roulette for free, with no real money? Here, in the browser: Fortune Heir Casino is a free social casino game for adults (18+) with virtual money only (no deposit, no sign-up, no cash prizes). | 20 |  |
| 35 | [Ultra Pool Billiards](https://reach2.aplusz.app/35) | [poolgame.aplusz.app](https://poolgame.aplusz.app/) | Answers one question for anyone who wants a game of pool right now: where can I play real eight-ball, on a full-size table, free, in a browser, on a phone or a PC, with nothing to install and no waiting for an opponent? | 21 |  |
| 36 | [We push your site to the World](https://reach2.aplusz.app/36) | [wepushyoursitetotheworld.aplusz.app](https://wepushyoursitetotheworld.aplusz.app/) | Is a website ready for people and AI assistants? Free AI-Readiness score (0–100) for any site, the exact checks that pass and fail, and a directory of verified sites, each pushed to search engines via IndexNow. | 60 |  |
| 37 | [The Secret](https://reach2.aplusz.app/37) | [thesecret.aplusz.app](https://thesecret.aplusz.app/) | Answers one question: "How do I get an invitation code for The Secret (thesecret.aplusz.app), where do I enter it, and what is inside?" | 12 |  |
| 38 | [Teach Me Anything](https://reach2.aplusz.app/38) | [teachmeanything.aplusz.app](https://teachmeanything.aplusz.app/en/) | Teach Me (teachmeanything.aplusz.app) is a free, distraction-free learning site: type anything you want to learn and follow a 100-lesson course run by one learning engine: summary and plan, a level choice, then lessons that each check… | 30 |  |
| 39 | [Singles Ready To Mingle](https://reach2.aplusz.app/39) | [singlesreadytomingle.aplusz.app](https://singlesreadytomingle.aplusz.app/) | Marriage-minded, city-based matchmaking. Real, verified profiles and calm, scheduled introductions — not endless messaging. | 11 |  |
| 40 | [My Assistant for Men](https://reach2.aplusz.app/40) | [myassistantformale.aplusz.app](https://myassistantformale.aplusz.app/) | Answers one question: "Which private AI assistant, made for men, works straight away — no API key, no setup — with a free trial and a simple price?" | 20 |  |
| 41 | [My Assistant for Women](https://reach2.aplusz.app/41) | [myassistantforfemale.aplusz.app](https://myassistantforfemale.aplusz.app/) | Answers one question: "Which private AI assistant, made for women, works straight away — no API key, no setup — with a free trial and a simple price?" | 20 |  |
| 42 | [Jensen Huang & Alice Huang](https://reach2.aplusz.app/42) | [jensenalice.aplusz.app](https://jensenalice.aplusz.app/) | Answers one question: what is the latest news on Jensen Huang (chief executive of Nvidia) and Alice Huang? A live list of articles from verified publishers and posts on X, newest first, refreshed every 15 minutes. | 35 |  |

Doors with a Wikidata item: 16 of 42 (hub count: 16) · Wayback snapshots: 160 · one more door: https://reach2.aplusz.app/add

## How it runs

- **Hourly cron** (`0 * * * *`): re-capture the stalest door records, refresh the briefing of ONE rotated site and ping only its changed URLs to the seven IndexNow endpoints, rebuild the map, ping the hub mesh (hub-host URLs only), one Wikidata and one Wayback tick.
- **6-hourly cron** (`0 */6 * * *`): re-ingest every door's own llms.txt into the atlas that backs `/match`.
- **Daily on GitHub Actions** (`.github/workflows/reach-daily.yml`, one repository secret `REACH_ADMIN_TOKEN`): the Wikidata courier (Wikimedia blocks Workers egress; at most one new item per day, deferrals recorded with their cause in `runs/deferrals.json`), this repo sync, then the APPENDIX B reachability sweep `tools/reachability.ps1` over the hub and every door — one verdict line, the full log as a build artifact, the result in the job summary. A failing sweep is reported, not hidden, and nothing is pinged over it.

## Deploy

From the folder on the owner's PC: `Set-Location "$env:USERPROFILE\Desktop\The Reach 02"; npx wrangler deploy` (see DEPLOY.md). Worker secrets: `ADMIN_TOKEN`, `WD_USER`, `WD_BOTPASS`. The Wikidata and repo writes never run from a workstation.

## Layout

| Path | Role |
|---|---|
| `src/` | the Worker: router, resolver, every served file, MCP, A2A, the crons |
| `schema.sql` | the D1 schema |
| `wrangler.jsonc` | bindings, the two crons, public vars |
| `tools/` | the daily CI scripts (`wd-courier.ps1`, `repo-sync.ps1`, `reachability.ps1`, `verify-live.ps1`) and the per-site pack installers |
| `runs/` | run notes and the deferral ledger |
| `sites.json` | the door records, mirrored from the hub |
