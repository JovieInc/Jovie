# Pricing comparison certification — JOV-10350

Mission: keep every pricing comparison label readable and the next action reachable.
Audience: prospective buyers comparing Free and Artist Presence on phones and tablets.

Observed on 2026-11-02 against a local Next server. This is source certification,
not a production deployment receipt. Base: `8144a408faf0e140a583ae587f098eeb6e02061e`.
The exact owner fingerprint is recorded in the pricing row of `surfaceCensus.json`.

Untouched main failed both motion variants at 320px: the full Artist Presence
heading painted outside its cell. Equal mobile column widths preserve the whole
heading. At 768px, the long release-notification feature label also overflowed;
allowing desktop feature labels to wrap preserves its full text and both plan columns.
Desktop and mobile feature rows carry the existing explicit `data-wrap="feature-label"`
contract; the locked one-line column-heading detector remains unchanged and passes.
No plan values, claims, colors, typography or offer destinations changed.

The existing keyboard assertions still expected a Free closing CTA removed by
merged #23606. They now require the current single paid closing CTA to receive
focus and lead to `/claim?plan=pro`. Forward/reverse Tab, native select keyboard
input, selected-plan content, ink containment and all width assertions remain.

Validation:

- `BASE_URL=http://localhost:3218 PLAYWRIGHT_WORKERS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/pricing.spec.ts --project=chromium --reporter=line`: **11 passed**, 1.8m on the final row-contract source. Both motion modes cover 320,375,390,430,720,767,768,1024,1440px; responsive footer and chart accessibility pass.
- Real Vitest config: MarketingPricingPlans, PricingComparisonChart, PricingRecipeBody and copy-rendered-verification: **33 passed**. V8 comparison coverage: **100% lines/statements/functions, 90% branches**.
- The unchanged locked column-heading detector also passes both tests (35 unit/contract tests total).
- Web typecheck and full apps/web Biome pass; no formatting fixes were needed.
- `comparison-320.jpg` and `comparison-768.jpg` show the actual repaired local comparison. Page scroll width equals viewport width at both widths.

Existing strict browser assertions reproduced the regressions before the repair;
no skipped tests, softened assertions or automatic certification refresh were added.
