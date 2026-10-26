# Pricing-decision contract

Tim White, 2026-10-26: "Pricing decisions need to model for the future. If you model out the best case scenario and it's not a very large number, there's no point moving forward with that price."

Any pricing decision (a gbrain `decisions/` page, or a repo change to prices, plans or entitlements) links a model file in `docs/pricing-models/` containing:

- `bar`: best-case year-3 ARR of at least $30M with at least 2x year-3 growth (implies $100M+ ARR by year 5). A model may not declare a lower bar.
- `assumptions`: each with a value and a source or "assumption".
- `options`: every option considered with a 3-year ARR array (end of year 1, 2, 3) for `worst`, `base` and `best`.
- `chosen`: the option being proposed. Its best case must clear the bar.

CI (PR Fleet Rules) fails a PR that touches `apps/web/lib/config/plan-prices.ts`, `pricing.ts`, `apps/web/lib/entitlements/registry.ts`, `apps/web/lib/billing/offer-truth.ts`, `apps/web/data/marketingPricingPlans.ts`, the marketing pricing route or `api/stripe/pricing-options` unless the PR body has `pricing-model: docs/pricing-models/<name>.json` and that file passes. gbrain decision pages carry `pricing-model:` in frontmatter.

Example: `docs/pricing-models/2026-10-26-usage-led-ladder.json`.
