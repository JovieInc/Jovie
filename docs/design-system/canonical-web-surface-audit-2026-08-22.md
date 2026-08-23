# Canonical web-surface conformance audit — 2026-08-22

Linear: [JOV-5304](https://linear.app/jovie/issue/JOV-5304/canonical-web-surfaces-rapid-conformance-audit-and-drift-guard)

## Scope

This rapid lane covers the four launch surfaces named in the delegation:
homepage, public profile, release landing, and dashboard releases. The current
route registry also contains five dashboard/settings surfaces; they are not
marketing surfaces and were not pulled into this bounded pass. Redirect-only
routes `/ai` and `/investors` remain excluded.

No canonical atom or molecule was edited. Corrections are limited to the
canonical route registry, existing release organisms, shared URL/date helpers,
demo adapters, tests, and owned screenshot artifacts.

## Surface results

| Surface | Review evidence | Result | Deterministic action |
| --- | --- | --- | --- |
| Homepage (`/`) | `marketing-home-desktop` | Corrected | Registry ownership pointed at detached `HomePageNarrative` instead of the mounted `HomePage`. The embedded dashboard proof also inherited a localhost smart-link origin. Registry metadata now names the mounted route composition, and the refreshed proof consumes the corrected canonical dashboard export. |
| Public profile (`/demo/showcase/public-profile`) | `public-profile-desktop`, `public-profile-mobile` | Conformant | The live route composes `StaticArtistPage` by reference. Desktop/mobile captures preserved content order, responsive behavior, and the existing founder fixture; no high-confidence correction was warranted. |
| Release landing (`/demo/showcase/release-landing`) | `release-landing-desktop`, `release-landing-mobile` | Conformant | The review route consumes `ReleaseLandingPage`/`SmartLinkShell`. Existing artwork, provider, accessibility, and mobile composition were preserved; no canonical owner or taste change was made. |
| Dashboard releases (`/demo`) | Four dashboard release scenarios | Corrected | Public release/track links used the local/preview app origin across release organisms, copy actions, and CSV export. They now use the canonical public-domain helper. Static demo dates also compared the real server clock to Playwright's fixed browser clock, producing a React hydration mismatch (`1y ago` versus `251d ago`); demo SSR and hydration now share the fixture reference instant. |

## Drift prevention

- `getSmartLinkUrl()` is the single canonical public smart-link URL builder.
- The dashboard demo adapter carries a stable ISO reference clock through the
  existing release organism; live dashboards continue using the real clock.
- The composition guard reads the four route owners and requires their
  canonical organism/shell references.
- Deliberate-red cases prove the guard rejects both a route-local token file
  and a route that drops its canonical organism reference.
- The homepage registry test prevents detached owner metadata from returning.
- Screenshot capture dependencies refresh the dashboard export before the
  homepage that embeds it, preventing a one-run stale marketing proof.
- Public navigation points Compare at the concrete `/compare/linktree` route.
  The route-contract guard deliberately rejects `/compare`, because the
  canonical manifest declares only `/compare/*`; `/ai` remains outside the
  visual-review scope.

## Verification receipt

- Focused behavior and contract tests: 58 assertions passed.
- Web TypeScript gate: passed.
- Canonical Playwright screenshot lane: 9/9 scenarios passed after the fix;
  the prior dashboard hydration mismatch did not recur.
- Production recheck on 2026-08-23: `/ai` returned 200 but still rendered
  `href="/compare"`; `/compare` returned 404, while `/compare/linktree`
  returned 200. This proves the currently deployed build remains affected and
  identifies the post-admission production assertion; no production-fix claim
  is made before merge and deployment.
- Layout-shift risk: no geometry, atom, molecule, shell, token, or responsive
  breakpoint changed. Smart-link rows retain their existing fixed-height,
  truncating container semantics.

The screenshot server still emitted pre-existing local Redis cache degradation
warnings and reported Node 26 inside the Doppler child despite the workspace
running the required Node 22 toolchain. Neither warning affected the 9/9 result,
but neither is claimed as resolved by this lane.
