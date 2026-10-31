# Pricing certification renewal for PR #23570 (MVP pricing promise audit)

Owner fingerprint at 2026-10-29T08:57:42.000Z: `70f0464228ad3563807be5b4d1ed710b975459b963c69b3003590daff02dfd9b`, source commit `c7c448a07581f9987466824408a7ffa86042cb32` (branch merged with origin/main).

Why renewal: `PricingComparisonChart.tsx` (a /pricing owner) changed its public row filter. The false row
"Contact / subscriber capture: Free up to 100" was replaced by true, certified rows. Fan email capture is
uncapped on every plan, and the Pro-gated release notifications and pre-release pages are shown. Layout,
container and components are unchanged.

Observed against this worktree's local route `http://localhost:33571/pricing` (Next dev, Chromium). This is
local source/browser evidence, not production:

- `tests/e2e/pricing.spec.ts`, chromium project: **11/11 passed**. Covers comparison geometry and plan
  selection from 320 to 1440px, accessibility, offer labels and CTA destinations, and the new row
  assertions.
- Full-page captures: `pricing-1440.jpg` (captured at 1440, stored downscaled to 960 wide) and `pricing-390.jpg`, both compressed to fit the repo byte budget. There is no horizontal overflow at either width.
- Rendered comparison rows at both widths: Pre-release & countdown pages, Public Jovie profile page, Fan
  email capture, Release notifications (email to fans).
