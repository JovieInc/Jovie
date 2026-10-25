# Public-surface quality suite

Checks every public profile and release template, at PR time and as a prod canary.

- Pure checks: `apps/web/lib/quality/public-surface-checks.ts`
- Unit tests (deliberate-red per rule): `apps/web/tests/unit/lib/quality/public-surface-checks.test.ts`
- Browser spec: `apps/web/tests/e2e/public-surface-quality.spec.ts` (390x844, honours `BASE_URL`)
- Throttled-mobile perf gate: `apps/web/scripts/public-surface-perf-gate.ts` (reads Lighthouse JSON)
- Ratchet baseline: `apps/web/public-surface-quality.baseline.json`

## Findings to tests

All 12 findings from `tim-audit/index.html` map below. "Unit" = deliberate-red case in `public-surface-checks.test.ts`; "spec" = assertion in `public-surface-quality.spec.ts`.

| # | Audited finding | Test that fails on it |
|---|-----------------|-----------------------|
| 1 | Play is a preview, DSP 2-3 taps away | Unit `checkTapsToDsp`, `findDirectDspLinkAboveFold`. Spec: a visible Spotify/Apple anchor on `profile-many-release` (<= 1 tap) and above the fold on release pages. Product call (what Play should do) stays a **dogfood mission**; the objective sub-check is enforced. |
| 2 | Three-button cookie card in first screen, sub-44pt buttons | Unit `checkConsentCard` (buttons >= 44, no overlap with Claim bar/dock fixed rects), `checkCookieCardFold` (<= 20% of fold). Spec invariants test. |
| 3 | Slow/heavy: LCP 5.4s, ~1.0MB JS, 102 requests | Unit `evaluatePerfBudget` + ratchet tests; `public-surface-perf-gate.ts` on Lighthouse mobile JSON. Ceilings (approved): LCP 4000ms (target 2500), JS 600,000 B (target 400,000), 60 requests; CLS 0.05 in spec. |
| 4 | Release text over cover, cropped hero, no dial | Unit `findTextOverCoverArt`, `checkHeroNotCropped`, `checkServiceDial`; spec on release templates (`[data-testid="action-dial"]` for 2+ services). |
| 5 | About tab duplicate Brand partnerships + TBF | Unit `findDuplicateContactRoles`, `findPlaceholderText`; spec About/Contact tab tests. |
| 6 | OG image lacks cover art; og:image:alt "Public profile preview"; generic description; no MusicRecording/MusicAlbum JSON-LD | Unit `checkOgQuality` (generic alt, "Music by ..." description, release JSON-LD), `checkSocialMeta`, `checkOgImageContentType`; spec reads `og:image:alt`, description and `application/ld+json`. **Gap:** "og:image shows cover art" is pixel content; needs image diff or a dogfood check. |
| 7 | Get Updates understated; sheet promises music/shows/merch while Events empty and no merch | Unit `checkSheetPromises`; spec opens the updates sheet (button named get updates/notify/subscribe; skipped if absent) and compares copy with the fixture's `hasEvents`/`hasMerch`. "Understated" prominence is taste: **dogfood mission**. |
| 8 | Tap targets < 44pt + axe `label-content-name-mismatch` | Unit `findTapTargetViolations`, `findBlockingAxeViolations`; spec tap-target and axe tests per template. |
| 9 | Home hides catalogue; stuck grey loader under card | Unit `checkNoStuckLoader`; spec fails if a `progressbar`/`aria-busy`/`.animate-spin` is visible after networkidle. "Hides catalogue" is IA: **dogfood mission**. |
| 10 | Empty Events tab is a dead end | Unit `checkEmptyEventsTab`; spec asserts no Events/Shows/Tour tab on `profile-empty` and `profile-no-events`. |
| 11 | Share buried 3 taps, menu sheet mostly empty | Unit `checkShareDepth`; spec requires a visible share control on home. Sheet content quality is taste: **dogfood mission**. |
| 12 | Desktop phone frame | **Gap (post-launch, note only)**: no assertion; spec is mobile-only. |
| R4 | TBD / lorem / "Jovie Technology Inc" as contact | Unit `findPlaceholderText` (contact scope) |
| R7 | OG/Twitter/canonical, og:image content type, alt text | Unit `checkSocialMeta`, `checkOgImageContentType`, `isRealAltText`; spec og:image test |
| R9 | Fixture matrix drift | Unit `pendingFixtures` shrink-only tests |

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
- JS 600,000 B and 60 requests are the approved starting ceilings; the 400,000 B and 40-request targets are proposed.
- The "can only be lowered" test compares the baseline to in-code ceilings, not to the base branch.
- The text-over-art check currently flags any text overlapping a 120px+ image, including the release hero title overlay.
