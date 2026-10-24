# Network Support Matrix

A quick reference for what we do on each high-traffic platform. Detection = link parsing, normalization, and correct platform categorization. Scraping = pulling remote profile/link data. Recursive crawl = following discovered links for additional fetches.

| Platform | Detection & Normalization | Scraping / Ingestion | Recursive Crawl | Notes |
| --- | --- | --- | --- | --- |
| Linktree | ✅ Supported | 🚫 Unavailable | 🚫 Disabled | Core HTML fetch and import jobs removed; an official API integration is required. |
| Beacons | ✅ Supported | 🚫 Unavailable | 🚫 Disabled | Core HTML reads of `beacons.ai` and `beacons.page` fail closed; isolated provider required. |
| Laylo | ✅ Supported | ✅ Public JSON scrape via `lib/ingestion/strategies/laylo.ts` | 🚫 Not enabled | Fetches profile and user JSON from Laylo's allowlisted CloudFront distributions (JOV-8466); no recursive crawl. |
| YouTube | ✅ Supported | 🚫 HTML unavailable | 🚫 Disabled | Core HTML reads of `youtube.com` and `youtu.be` fail closed; use official APIs or an isolated provider. |
| Stan (stan.store) | ⚠️ Fallback only | 🚫 Not available | 🚫 Not available | No dedicated detection/ingestion yet; treated as generic website. |
| Twitch | ✅ Detection & normalization only | 🚫 Not available (policy) | 🚫 Not available (policy) | Bot-protected; keep to detection-classification for now. |
| OnlyFans | ✅ Detection & normalization only | 🚫 Not available (policy) | 🚫 Not available (policy) | Auth/bot-protected; detection-only to avoid scraping. |

Linktree and Instagram URLs remain valid social links. Core ingestion does not fetch their HTML or derive profile metadata from it; legacy imports fail explicitly, and discovered links do not schedule these imports. Shared scraper configuration tables retain other providers and historical rows.

## Policy: no core YouTube or Beacons HTML

`lib/ingestion/social-html-policy.ts` blocks YouTube and Beacons page hosts in both `fetchDocument` and `safeFetchPublicHtml`, including redirect targets. `fetchYouTubeAboutDocument` and `fetchBeaconsDocument` reject valid profile URLs with `SOCIAL_HTML_DISABLED` before any network request. Discovered links do not schedule YouTube or Beacons HTML imports. URL detection, normalization, and parsing of supplied HTML remain available.

`FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER` never permits direct core scraping: both flag states fail closed until a provider is wired (JOV-8463). Official YouTube Data API calls on Google API hosts remain allowed (JOV-5138). For top-level profile fields, Google SERP evidence can be used when sufficient; full-page reads require an isolated third-party provider.

EVENT: Tim's 2026-10-15 decision prohibits YouTube and Beacons HTML scraping from Jovie IPs. This extends the core social HTML retirement from JOV-7621; neither platform has a core HTML exception (JOV-8465).

## Policy: Twitch & OnlyFans are detection-only

- We normalize, categorize, and surface Twitch and OnlyFans links in the UI/DB, but we **do not** scrape or crawl them by default.
- Any future scraper would require an explicit product decision, bot-detection risk review, and feature flag (Statsig) before shipping.
- The ingestion entry point (`lib/ingestion/strategies/index.ts`) intentionally excludes Twitch and OnlyFans; adding them should stay detection-only unless the above safeguards are in place.
