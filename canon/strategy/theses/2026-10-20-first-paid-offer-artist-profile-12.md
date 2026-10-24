---
thesis_id: STRAT-2026-10-20-01
status: active
effective: 2026-10-20
confidence: founder-direction
source: Tim White, 2026-10-20 (relayed by the revenue coordinator); no Linear issue — ad-hoc
supersedes: []
---

# First paid offer: $12/month self-serve artist profile

EVENT: Tim, 2026-10-20. Jovie has $0 MRR and under three months of runway.
The first paid offer is a **$12/month self-serve artist profile**, bought
through Stripe Checkout and live this week. The wedge is musicians: the artist
profile plus the release/YouTube loop, sold founder-led.

## Decision

- One canonical price: `ARTIST_VISIBILITY_OFFER.pro.monthlyUsd = 12` in
  `apps/web/lib/config/plan-prices.ts`. Pricing page, checkout price contract,
  entitlements and startup checks derive from it.
- The $199/month "Artist Presence, limited access" tier is retired for new
  purchases; its Stripe prices stay mapped as legacy for existing subscribers.
  The $39/$149 table in `docs/company/PRICING-STRATEGY.md` is historical.
- The paid path is `/claim` → sign-in → Stripe Checkout → webhook →
  entitlement → success state. It reuses the existing claim proof, onboarding
  and checkout code.
- Identity safety outranks conversion: payment never grants verification, and
  high-profile artists cannot be claimed self-serve.
- The funnel visit → pricing → claim start → sign-in → checkout → paid →
  profile live is measured with p50/p95 timings and step conversion.

## Re-evaluate

Ship now at $12/month with existing Pro entitlements. Re-evaluate when 30 paid
users have two active weeks, or p90 AI cost per paid user exceeds $6/month;
then lower the AI allowance or raise the price.
