# Network Support Matrix

A quick reference for what we do on each high-traffic platform. Detection = link parsing, normalization, and correct platform categorization. Scraping = pulling remote profile/link data. Recursive crawl = following discovered links for additional fetches.

| Platform | Detection & Normalization | Scraping / Ingestion | Recursive Crawl | Notes |
| --- | --- | --- | --- | --- |
| Linktree | ✅ Supported | ✅ Single-page scrape via `lib/ingestion/strategies/linktree.ts` | 🚫 Not enabled | HTML-only fetch; stays on profile page. |
| Beacons | ✅ Supported | ✅ Single-page scrape via `lib/ingestion/strategies/beacons.ts` | 🚫 Not enabled | Skips internal Beacons hosts; profile-only fetch. |
| Laylo | ✅ Supported | ✅ Single-page scrape via `lib/ingestion/strategies/laylo.ts` | 🚫 Not enabled | Uses public profile fetch; no secondary requests. |
| YouTube | ✅ Supported | ✅ About-page scrape via `lib/ingestion/strategies/youtube.ts` | 🚫 Not enabled | Channel/about fetch only; no playlist/video crawling. |
| Stan (stan.store) | ⚠️ Fallback only | 🚫 Not available | 🚫 Not available | No dedicated detection/ingestion yet; treated as generic website. |
| Twitch | ✅ Detection & normalization only | 🚫 Not available (policy) | 🚫 Not available (policy) | Bot-protected; keep to detection-classification for now. |
| OnlyFans | ✅ Detection & normalization only | 🚫 Not available (policy) | 🚫 Not available (policy) | Auth/bot-protected; detection-only to avoid scraping. |

## Policy: Twitch & OnlyFans are detection-only

- We normalize, categorize, and surface Twitch and OnlyFans links in the UI/DB, but we **do not** scrape or crawl them by default.
- Any future scraper would require an explicit product decision, bot-detection risk review, and feature flag (Statsig) before shipping.
- The ingestion entry point (`lib/ingestion/strategies/index.ts`) intentionally excludes Twitch and OnlyFans; adding them should stay detection-only unless the above safeguards are in place.
