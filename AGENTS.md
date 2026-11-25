# AGENTS.md

Crawlers read llms.txt. You, a coding agent in this repository, read this.

## What this project is

The Reach 02 (The AI Hill Top Lighthouse): a Cloudflare Worker + D1 hub at https://reach2.aplusz.app that lists
live sites as numbered doors so AI models and search engines find and cite them. One atlas
resolver (src/atlas.js) answers "which site answers X?"; the pages, the Markdown twins,
/match, /openapi.json, /mcp and /a2a all call it.

## File layout

| Path                  | Role                                                     |
|-----------------------|----------------------------------------------------------|
| src/index.js          | the router: one origin, preflight, the header layer      |
| src/surfaces.js       | every hub discovery file, absolute URLs from publicBase  |
| src/playbook.js       | the agent list, the policy and card builders, the pack   |
| src/mcp.js            | the MCP tool server, dual era                            |
| src/a2a.js            | the A2A endpoint: SendMessage (1.0), message/send (0.3)  |
| src/atlas.js          | THE resolver: /match, atlas.json, atlas.md               |
| src/door-page.js      | /{n} as HTML, Markdown and JSON                          |
| src/map.js            | llms.txt and the sitemap partitions                      |
| src/seo.js            | the question grammar, the noindex list, the head block   |
| src/crawlers.js       | verified crawler visits: IP ranges, Web Bot Auth         |
| test/                 | node --test: policy agreement, card and catalog shapes   |
| tools/                | the sweep and the pack installer (PowerShell)            |
| wrangler.jsonc        | one custom domain, workers_dev off                       |

## Non-negotiable rules

1. Never add a second resolution path. The pages, the twins, /match, MCP and A2A call one resolver.
2. Never advertise an endpoint before it answers. A card, a catalog entry or a sitemap line ships in the same
   change as, or after, the thing it points at.
3. Absolute HTTPS URLs built from publicBase(env) in every discovery file.
4. ONE policy value (POLICY in src/surfaces.js) writes robots.txt (every Content-Signal line, Content-Usage and the
   __usage_ai-training group), ai.txt, license.xml, tdmrep.json, agent-permissions.json, the llms.txt terms and the
   Content-Signal header. Never hand-edit one of them.
5. An unknown door or a missing twin is a real 404, never a soft 200. A removed door number is 410 and never reused.
6. The MCP route answers BOTH server/discover (2026-07-28) AND initialize (legacy). The card lists only versions
   the route speaks, and says what server/discover says.
7. The MCP server card lives at /mcp/server-card; the three /.well-known/ copies are the same bytes. The catalog is
   one document at /.well-known/ard.json and /.well-known/ai-catalog.json: same bytes.
8. The noindex list is seo.js STRUCTURE.noindex_patterns - the WHOLE list. Nothing on it is in a sitemap; nothing
   off it carries noindex.
9. A date moves only when the record moved. No "updated" stamp from a cron run.
10. Titles and first sentences come from the question grammar in src/seo.js. Never hand-edit a title.

## Check before you hand back

    npm test

## Deploy (the owner's call, never yours)

    npx wrangler deploy
