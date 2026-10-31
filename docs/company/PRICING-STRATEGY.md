# Jovie pricing (public summary)

The full pricing strategy (packaging history, AI cost model, overage and API
pricing proposals, margin gates, experiments and kill switches) is private and
lives in the `JovieInc/Ops` repo under `jovie-private/docs/company/PRICING-STRATEGY.md`.
It was removed from this public repo on 2026-10-28. Read it before changing
anything price-related; see [strategy canon](../../canon/strategy/README.md) for
how to read private material (`$JOVIE_PRIVATE_DIR`, default `~/Ops/jovie-private`).

## What is public

- Current subscription prices come from `apps/web/lib/config/plan-prices.ts`
  (`ARTIST_VISIBILITY_OFFER.pro.monthlyUsd`). The pricing page, checkout price
  contract, entitlements registry and Stripe startup checks all derive from it.
- The first paid offer (2026-10-20) is a $12/month self-serve artist profile
  (plan id `pro`, display name Artist Presence), bought through `/claim`,
  sign-in and Stripe Checkout. Monthly only; Enterprise is contact sales.
- Payment never grants verification. High-profile artists (at least 100k
  Spotify followers) cannot be claimed self-serve; they need manual verification.
- Retired Stripe prices stay mapped to `pro` so existing subscribers keep their
  entitlements; they are no longer offered at checkout.
- Customers see one AI meter, weekly messages. Internal model calls, tool steps,
  retries and tokens are not customer units.
- API pricing is a proposal only (JOV-4875): no numeric API offer is approved,
  and no price, Stripe meter, invoice or billing configuration changes without a
  dated Tim receipt. The private document holds the proposal schema.
