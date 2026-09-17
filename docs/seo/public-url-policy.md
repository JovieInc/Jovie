# Public URL policy

Source of truth: `apps/web/lib/seo/public-url-policy.ts`.

This table is the GSC recovery contract for known public roots. Do not invent
marketing pages here. `#17453` is unrelated Symphony capacity work and stays
untouched.

| URL | Action | Destination | Why |
| --- | --- | --- | --- |
| `/privacy` | 308 | `/legal/privacy` | Existing permanent alias. Sitemap already lists the canonical. |
| `/terms` | 308 | `/legal/terms` | Existing permanent alias. |
| `/cookies` | 308 | `/legal/cookies` | Existing permanent alias. |
| `/sign-up` | 308 | `/signup` | Existing hyphenated auth alias. |
| `/sign-in` | 308 | `/signin` | Existing hyphenated auth alias. |
| `/login` | 308 | `/signin` | Proxy-owned legacy alias. |
| `/request-access` | 308 | `/start` | Proxy-owned legacy alias. |
| `/tips` | 308 | `/pay` | Retired tipping landing page. |
| `/product` | shipping | — | DESIGN_READY 2026-09-17 ~12:10 PT. Drive is shipping the real marketing route (`bc-3b4d93ba`). Hero lock: Be found. Be understood. + `jov.ie/you` claim card. Do not 410 or reserve. |
| `/music` | 410 | — | Root only. Profile mode is `/{username}/music`. |
| `/shows` | 410 | — | Root only. Profile shows/events stay at `/{username}/shows` (#17942). |
| `/you` | hold | — | Locked claim-card target. Keep claimable. Not reserved. Not 410. |

Robots stay unchanged: Google must recrawl aliases and 410s. Do not Disallow
these roots.

## Summer-owned follow-up classes

These are out of this PR. Track each class in Linear before closing.

| Class | Evidence | Decision needed |
| --- | --- | --- |
| `/you` claim-card profile | Live `https://jov.ie/you` is 404. Marketing copy uses `jov.ie/you` as the locked proof handle. | Seed/claim the profile, or later 410 if the handle is abandoned. Do not reserve it as a system username. |
| Reserved-username 404s | Live `/features`, `/help`, `/contact`, `/listen` already 404 at the edge (JOV-3054). This class can explain most of the ~208 GSC 404s. | Per-slug 410 vs real page vs leave as reserved 404. |
| Username collisions | Next treats unknown single segments as profiles. `/solutions` is a current 404 of this shape. | Inventory GSC 404s that are missing handles vs retired marketing roots. |
| Legacy blog / editorial | Sitemap lists current posts only. Older slugs may still be indexed. | 301 to a live post, 410, or restore. |
| Redirect inventory beyond this table | www→apex plus `/privacy` is a two-hop chain. `/press` is a 307. Many `/app/dashboard/*` aliases exist but should stay noindex. | Collapse host+path hops in Vercel if GSC still counts www aliases after this lands. |
| `/product` marketing page | Tim locked DESIGN_READY ~12:10 PT. Drive PR incoming (`bc-3b4d93ba`). | Do not 410. Add the real route and sitemap entry on Drive's PR. |
