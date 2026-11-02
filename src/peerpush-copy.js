/* Reach 02 - PeerPush listing copy, written once per door from that site's OWN published title and description
 * (sites.json, Nov 3 2026): no invented features, numbers or prices, none of the AI-routing phrasing the llms.txt
 * files use ("Answers one question...", "Fetch."). Taglines <= 60 characters. A door missing here gets its copy
 * from src/peerpush.js (cleaned origin text, else a Workers AI draft) and is held back if neither passes the gate.
 * Edit a line here and push: the next listing uses it (listings already published are not rewritten). */
export const COPY = {
  1: {
    tagline: "Every disaster warning on Earth, before it lands",
    description: "GlobeWarn gathers warnings for every natural disaster on Earth from official public agencies and checks them every 15 minutes. One page instead of 15 agency feeds, for governments, insurers and organisations that need to know first. Run from France, available in 23 languages."
  },
  2: {
    tagline: "Visa rules for every passport and destination",
    description: "Pick your passport and your destination, and UrgentVisa tells you whether you need a visa, what it costs, how long it takes, which documents you need and whether you can extend your stay. It covers 197 passports and 196 destinations - about 36,800 pairs - in 20 languages."
  },
  3: {
    tagline: "The local guide to Dumaguete City, Philippines",
    description: "A guide to Dumaguete City, Negros Oriental, Philippines: 741 places, each with its category and map location, plus a community forum for the marketplace, housing, events, alerts and lost-and-found. Available in 10 languages."
  },
  4: {
    tagline: "Watches, smartphones and tech accessories",
    description: "An independent online store with over 10,000 products across 12 categories - watches, smartphones and tech accessories - priced in euros and shipped worldwide. Every product page is also readable as JSON and Markdown, with no API key needed."
  },
  5: {
    tagline: "Marriage-minded, city-based matchmaking",
    description: "Veliane is matchmaking for people who want marriage, not casual dating: real, verified profiles and calm, scheduled introductions in your city, instead of endless messaging."
  },
  7: {
    tagline: "Arrange to meet people in person",
    description: "LetsMeet-Here is a social meet-up app for arranging to meet people in person."
  },
  8: {
    tagline: "A guide to 28,000 places across Metro Manila",
    description: "Manila.uk maps 28,002 places across the 16 cities and one municipality of Metro Manila - from Manila, Quezon City and Makati to Taguig and Pasig - with category, address and opening hours where they are published. Available in 10 languages."
  },
  9: {
    tagline: "Find the cheapest fare and the best day to book",
    description: "Enter two cities and Fly for LESS shows the cheapest fare, the lowest price of the past six months and the cheapest date to book. Free, no sign-up, in 20 languages."
  },
  10: {
    tagline: "Spin the wheel to pick a winner at random",
    description: "A spin-the-wheel picker that draws a winner at random from any list - names, options, prizes, chores, seating or teams. Free, no account, nothing stored, in 40 languages. Every draw comes with a seed, so anyone can replay it and check it was fair."
  },
  11: {
    tagline: "Definitions in your own language, not translations",
    description: "Type a word in one language and read its definition in another - a real definition, never just a translation. 181 language options and no AI-written text: every definition comes from Wiktionary, Wikidata lexemes or Wikipedia in the reader's language."
  },
  12: {
    tagline: "One clean answer, in any language",
    description: "Type anything - a word, a sentence, even a typo, in any language - and get one clean answer with its source named, instead of ten blue links. Answers come from about 340 Wikipedia editions plus Wiktionary, Wikivoyage, Open Library, Stack Exchange and more, with the interface in 61 languages."
  },
  14: {
    tagline: "A directory AI models read to find live websites",
    description: "The AI Hill Top Lighthouse is a shared directory that AI models fetch to find live websites: every site gets a numbered door with its real URL, description and languages, and a matcher tells an AI which site answers a question. Nothing you build ever starts invisible again."
  },
  15: {
    tagline: "One problem, one page, one clear answer",
    description: "Clear answers to the thirty things people get stuck on most: is this price fair, is this a scam, what does this notice mean, where do I get this medicine, what do I do first. One page per problem - free, no account, and nothing you type is kept. In 13 languages."
  },
  16: {
    tagline: "Where in the world is it cheapest?",
    description: "Look up what something costs in any country and where it was seen cheapest, with the shop, city and date of the lowest real price reported. Over 7,000 things you can buy, 199 countries, 40 languages. Where no local price is reported yet, it shows the cheapest sighting elsewhere and a clearly labelled estimate."
  },
  17: {
    tagline: "Email yourself a reminder for later",
    description: "Nudge Later emails you a reminder when you want it: remind me later, email me a reminder, remind me about this link."
  },
  18: {
    tagline: "Convert a file to another format",
    description: "Universal Converter turns a file into another format - PNG to JPG, CSV to JSON, audio to WAV and more."
  },
  19: {
    tagline: "Convert any amount between currencies",
    description: "Convert an amount into another currency at its exchange rate - for example, US dollars to euros."
  },
  20: {
    tagline: "Daily support to stop gambling, one day at a time",
    description: "Stop Gambling for Good is a daily habit-support service for people who want to stop gambling, with helplines and self-exclusion options for France, the Philippines, the UK, the US and Australia, plus a worldwide fellowship. Free for 3 days, then €1.99 per month."
  },
  21: {
    tagline: "A calm clock wallpaper with sleep sounds",
    description: "A calm, full-screen clock wallpaper with sleep sounds, on the web, Google Play and the Microsoft Store. The digital clock face and the waves sound are free forever; the rest is free for 3 days, then €1.99 per month."
  },
  22: {
    tagline: "Daily money habits, by email",
    description: "Every day by email: one small money step, a quote from one of history's greatest minds and a 1-minute drill. Free for 3 days, then €1.99 per month; the quote and the drill of the day on the home page stay free forever."
  },
  23: {
    tagline: "Your own AI assistant, on your own API key",
    description: "An AI assistant for your phone and computer that runs on your own API key - OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Mistral, xAI and more - or on prepaid credit. €1.99 a month, no message limits, chats kept on your own devices, in 20 languages. On the web, the Microsoft Store and Google Play. Adults only (18+)."
  },
  24: {
    tagline: "Quit smoking, one day at a time",
    description: "Daily help to quit smoking, by email: one small step, a quote from one of history's greatest minds and a 1-minute drill, plus free craving help and a progress page. Free for 3 days, then €1.99 per month."
  },
  25: {
    tagline: "New habits to lose weight, one day at a time",
    description: "Daily help to lose weight with better habits, by email: one small step, a quote from one of history's greatest minds and a 1-minute drill, plus free help with snack urges and a progress page. Free for 3 days, then €1.99 per month."
  },
  26: {
    tagline: "Get clear on the Life partner you want",
    description: "A calm, free page for adults who want a serious Life partner: five questions to get clear on what you want, and an introduction to Veliane.org, a marriage-minded matchmaking service."
  },
  27: {
    tagline: "Free online karaoke with lyrics, full screen",
    description: "Type a song, pick a karaoke version and sing it full screen - 3 songs a day free. Pro adds unlimited singing, a singer queue, fair turns, duets and playlists (free for 3 days, then €1.99 per month); Ultra adds Party mode, where any number of guest phones pick the songs."
  },
  30: {
    tagline: "Veliane matchmaking, explained in 21 languages",
    description: "Everything about Veliane, free city-based matchmaking for adults ready for marriage, explained in 21 languages: what it is, every feature, the price, safety and privacy, and how to join."
  },
  31: {
    tagline: "Living in or visiting Dumaguete, in 23 languages",
    description: "What you need to know about living in, moving to or visiting Dumaguete, Philippines - rent, monthly costs, flights and ferries, visa paperwork, hospitals and weather - in 23 languages, each answer linked to its source on dumaguete.uk."
  },
  32: {
    tagline: "Every site in this network, in one place",
    description: "One address that lists every live site in this network, what each one answers and where to find it: 35 sites, in 61 languages."
  },
  34: {
    tagline: "Free social casino: slots, blackjack, roulette",
    description: "A free social casino game in the browser with virtual money only - no deposit, no sign-up and no cash prizes. Start with $50,000 in virtual chips for the Golden Age slot, blackjack and European roulette. In 20 languages, for adults (18+)."
  },
  35: {
    tagline: "Free 8-ball pool in your browser",
    description: "Play real eight-ball pool on a full-size table, free, in your browser on a phone or PC - nothing to install and no waiting for an opponent. Includes the rules, a glossary of billiards terms and profiles of players worth knowing. In 21 languages."
  }
};
