# Design-system certification progress — November 13, 2026

Local source baseline: `f49eba8f9d676ff24ec6fa36035e2f9862ddcfbb`, measured
at `2026-11-14T01:15:37.273Z` (November 13 in America/Los_Angeles).
This report follows the [component certificate contract](COMPONENT_CERTIFICATE.md).
No Linear issue — ad-hoc; `gbrain-unavailable`, so findings use repository evidence.

## Whole-tree baseline

Command: `node scripts/component-certificate.mjs --all --out /tmp/ds-cert-current-main.json --summary --sha f49eba8f9d`.
No CI capture or mutation-state inputs were supplied. Missing receipts stay
unknown; these counts do not establish remote certification or deployed status.

| Criterion | Pass | Fail | Unknown | Not applicable |
| --- | ---: | ---: | ---: | ---: |
| ds-owner | 1,116 | 255 | 0 | 0 |
| tokens | 1,184 | 187 | 0 | 0 |
| states | 442 | 929 | 0 | 0 |
| tests | 795 | 576 | 0 | 0 |
| a11y | 411 | 0 | 960 | 0 |
| frontend-rules | 1,226 | 145 | 0 | 0 |
| forced-caps | 1,337 | 34 | 0 | 0 |
| mutation | 0 | 0 | 1,371 | 0 |
| visual | 0 | 0 | 1,371 | 0 |
| journeys | 0 | 0 | 0 | 1,371 |
| benchmark | 36 | 2 | 1,333 | 0 |

The inventory contains 1,371 components. Before this slice, 385 cleared all seven
source/unit criteria; all 47 `packages/ui` components cleared those criteria.
Zero full certificates were produced with the inputs above. The journey map is
empty, so its not-applicable totals do not prove golden-path journey coverage.

## Verified slice

`AppSegmentControl` now has axe coverage for both radio surfaces before/after
selection, focus retention, and the RTL tablist with a disabled option.
`LogoIcon` now has named-image and axe coverage for all three tones. Runtime
component and story sources are unchanged. Exact-path registry gates enforce
all seven source/unit criteria for both components: the local clean count rises
from 385 to 387; mutation, visual and benchmark receipts remain outstanding.

```sh
pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts components/atoms/AppSegmentControl.test.tsx components/atoms/LogoIcon.test.tsx --coverage --coverage.include=components/atoms/AppSegmentControl.tsx --coverage.include=components/atoms/LogoIcon.tsx
node scripts/component-certificate.mjs --gate
pnpm exec biome check apps/web/components/atoms/AppSegmentControl.test.tsx apps/web/components/atoms/LogoIcon.test.tsx docs/design-system/component-certification.json
```

Results: 10 tests passed in 2.76 seconds; both wrappers had 100% statement,
branch, function and line coverage. All 60 gated components and all 10 enrolled
screen gates passed; screen debt remains grandfathered where declared, so a
passing screen gate does not mean every component on that screen is certified.
Biome and `git diff --check` passed. These are local receipts, not CI or merge proof.

## Remaining scope

The current surface census reports 223 routes: 1 canonical, 52 migrating and
170 holdouts, with 39 fixtures excluded. Story coverage is 1,227/1,324 (92.67%)
across web components, leaving 97 without adjacent stories; narrower shared
roots have 100% story coverage. A story file alone is not a rendered certificate.

**Ship now:** land measured certification improvements and these two enforced
source/unit completions. **Re-evaluate when:** current source-bound browser and
mutation receipts are restored. **Then:** prioritize remaining golden-path
screen debt and open benchmark gaps using the same fail-closed criteria.
