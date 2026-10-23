# Pricing certification renewal for PR #22838

Observed 2026-10-23T20:44:07.579Z against this worktree's local public route,
`http://localhost:33138/pricing`, with Node 24.22.1, Next 16.4.1 and Chromium.
Pricing owner source digest: `127c0cfad9c8c1c69b3335dcf21c043db9c3f4fc93967f9d073ee2f948fac7ad`.
The checked-out application source was commit
`ccd1dafc54551d3268eac5659c4db826100dd9c2`; this repair changes certification
metadata and the DESIGN section checksum, with no production component changes.
This is local source/browser evidence.

The shared `ArtistProfileLandingPage.css` owner changed for the launch hero.
Its changed selectors match no elements on `/pricing`. The existing pricing
certification still required renewal because it fingerprints that shared owner.
This renews the earlier observation: PR 22831 single-container renewal: header, hero and footer share one .public-container edge on /pricing (x 71-1369 at 1440, 24-366 at 390, no horizontal overflow), measured with a Playwright run against the dev build of the PR source (merge base of main a4eb75a8627); full-page captures at 1440 and 390; prior JOV-8097 interaction states unchanged

The existing pricing Playwright suite passed **10/10 tests**, including:

- Comparison geometry and Free/Artist Presence selection from 320 to 1440px,
  with both motion preferences and keyboard operation.
- WCAG accessibility scans, footer focus order, one expanded footer and one main.
- Offer labels and CTA destinations, legacy campaign redirect attribution, and
  absence of unsupported distribution-logo proof.
- Stable footer geometry after fonts and hydration.

Command from the repository root:

```sh
BASE_URL=http://localhost:33138 E2E_SKIP_WEB_SERVER=1 E2E_SKIP_SEED=1 E2E_SKIP_WARMUP=1 PUBLIC_NOAUTH_SMOKE=1 pnpm --filter @jovie/web exec playwright test tests/e2e/pricing.spec.ts --config=playwright.config.noauth.ts --project=chromium --workers=1 --reporter=line
```

Fresh full-page captures:

| Width | Capture | Shared header/main/footer container | Overflow / layout |
| --- | --- | --- | --- |
| 320 | [320px](pricing-320.png) | x=24, width=272 | None; stable |
| 390 | [390px](pricing-390.png) | x=24, width=342 | None; stable |
| 768 | [768px](pricing-768.png) | x=32, width=704 | None; stable |
| 1440 | [1440px](pricing-1440.png) | x=71, width=1298 | None; stable |

Playwright measured matching container edges, zero horizontal overflow and equal
main/footer heights across two animation frames after fonts at all four widths.
The 320px and 1440px captures were visually reviewed: complete headings, readable
comparison, three existing plan actions and one expanded footer. No UI surface,
control, route or interaction was added or removed. JOV-8101 retains ownership
of continuous pricing refinement.
