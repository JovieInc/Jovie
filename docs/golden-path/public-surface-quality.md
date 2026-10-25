# Public-surface quality suite

Checks every public profile and release template, at PR time and as a prod canary.

- Pure checks: `apps/web/lib/quality/public-surface-checks.ts`
- Unit tests (deliberate-red per rule): `apps/web/tests/unit/lib/quality/public-surface-checks.test.ts`
- Browser spec: `apps/web/tests/e2e/public-surface-quality.spec.ts` (390x844, honours `BASE_URL`)
- Throttled-mobile perf gate: `apps/web/scripts/public-surface-perf-gate.ts` (reads Lighthouse JSON)
- Ratchet baseline: `apps/web/public-surface-quality.baseline.json`

## Findings to tests

The audit (`tim-profile-audit.md`) names 5 findings plus one axe violation. Its 12-item `index.html` is not on disk, so the remaining items are marked as missing rather than guessed.

| # | Finding | Test that fails on it |
|---|---------|-----------------------|
| 1 | Play is a preview; the DSP is 2 taps away | `findDirectDspLinkAboveFold` unit red case; spec "layout, content and metadata invariants" on release templates (direct DSP anchor inside 844px). Profile-page equivalent: **gap**, no stable selector for the profile primary Play control. |
| 2 | Cookie card in first fold | `checkCookieCardFold` unit red case; spec invariants test (`[data-testid="cookie-banner"]` may cover at most 20% of the fold) |
| 3a | LCP 5449/1919/5667ms | `evaluatePerfBudget` red cases; `public-surface-perf-gate.ts` on Lighthouse output; ratchet unit tests (lock_down 4000, target 2500, only lowered) |
| 3b | JS about 1.0MB, 102 requests | `evaluatePerfBudget` red case (1.05MB, 102 requests); perf gate |
| 3c | CLS | `evaluatePerfBudget` CLS red case; spec collects CLS per template |
| 4 | Release page text over art | `findTextOverCoverArt` red/green; spec invariants test on all templates |
| 5 | About tab TBF twice | `findPlaceholderText` + `findDuplicateContactRoles` red cases; spec About/Contact tab tests |
| 6 | axe `label-content-name-mismatch` (serious) | `findBlockingAxeViolations` red case; spec "axe: zero serious/critical" per template |
| R2 | Tap targets under 44px | `findTapTargetViolations`; spec invariants test |
| R4 | TBD / lorem / "Jovie Technology Inc" as contact | `findPlaceholderText` (contact scope) |
| R6 | Service dial missing with 2+ services | `checkServiceDial`; spec on `release-2plus-services` |
| R7 | OG/Twitter/canonical, og:image type, alt text | `checkSocialMeta`, `checkOgImageContentType`, `isRealAltText`/`findBadAltText`; spec og:image test |
| R9 | Fixture matrix drift | `pendingFixtures` shrink-only unit tests |
| 7-12 | Remaining items of the 12 | evidence missing: ask lead |

Six of the 12 items are unidentified (assuming the axe violation is one of the 12 named ones; if it is a 13th item, seven are).

## Template matrix and fixtures

| Template | Fixture (apps/web/tests/seed-test-data.ts) |
|----------|---------------------------------------------|
| profile-empty | `edgecase-empty` |
| profile-single-release | `edgecase-long` (one extreme release, also has tour dates) |
| profile-many-release | `dualipa` (7 releases) |
| profile-no-events | `testartist` (no tour dates, also no releases) |
| release-1-service | `dualipa/midnight-drive` (Spotify only) |
| release-2plus-services | `dualipa/neon-skyline` (Spotify, Apple Music, sound providers) |
| release-no-services | **pending**: no seeded release without provider links |

`pendingFixtures` in the baseline is shrink-only; a unit test fails if a template is added to it. A release with releases but no events and a release with no services are the two real fixture gaps (the seed is not extended here to keep that change small and separate).

## Running

PR lane (local seeded server, default `BASE_URL=http://localhost:3100`):

    pnpm --filter=@jovie/web run e2e:public-surface-quality

Prod canary (read-only GETs):

    BASE_URL=https://jov.ie PUBLIC_SURFACE_QUALITY_PROD_RELEASE=<handle>/<slug> pnpm --filter=@jovie/web run e2e:public-surface-quality

On prod only the many-release profile (default handle `tim`) and an optional release run; seeded handles do not exist there.

Perf gate on Lighthouse mobile output:

    pnpm --filter=@jovie/web exec tsx scripts/public-surface-perf-gate.ts <lhr.json> ...

## Gaps

- `lighthouse-entry-gate.ts` and `performance-entry-budgets.json` (conversion worker) are not on this branch. The gate here consumes Lighthouse JSON and shares the pure checks; fold it into the entry gate when that lands.
- Not registered in `tests/e2e/smoke-manifest.ts` or `synthetic-monitoring.yml`: the spec has not been run against a seeded server in this change and the audited defects are expected to fail it, so adding it to the merge gate or the 6-hourly canary needs a deliberate step (one line in `DESKTOP_SMOKE_SPECS`; one `playwright test` step in the synthetic workflow).
- JS bytes (1,000,000) and request count (100) budgets are set just under the audit baseline; their `target` values (600,000 / 60) are proposed and need confirmation.
- The "can only be lowered" test compares the baseline to in-code ceilings, not to the base branch.
- The text-over-art check currently flags any text overlapping a 120px+ image, including the release hero title overlay.
