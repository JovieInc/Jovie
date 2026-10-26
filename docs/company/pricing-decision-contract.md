# Pricing-decision contract

Tim White, 2026-10-26: "Pricing decisions need to model for the future. If you model out the best case scenario and it's not a very large number, there's no point moving forward with that price."

Any pricing decision (a gbrain `decisions/` page, or a repo change to prices, plans or entitlements) links a model file in `docs/pricing-models/` containing:

- `bar`: `best_arr_usd` of at least $100M reached by `by_year` 5 in the chosen option's best case (Tim confirmed $100M, 2026-10-26). A model may not declare a lower bar or a later year.
- `assumptions`: each with a value and a source or "assumption".
- `options`: every option considered with a ARR array for years 1 to 5 (end of year) for `worst`, `base` and `best`.
- `chosen`: the option being proposed. Its best case must clear the bar.

CI (PR Fleet Rules) fails a PR that touches `apps/web/lib/config/plan-prices.ts`, `pricing.ts`, `apps/web/lib/entitlements/registry.ts`, `apps/web/lib/billing/offer-truth.ts`, `apps/web/data/marketingPricingPlans.ts`, the marketing pricing route or `api/stripe/pricing-options` unless the PR body has `pricing-model: docs/pricing-models/<name>.json` and that file passes. gbrain decision pages carry `pricing-model:` in frontmatter.

Example: `docs/pricing-models/2026-10-26-usage-led-ladder.json`.
