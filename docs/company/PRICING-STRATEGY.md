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
  dated Tim receipt. The executable field contract is below. Unapproved numeric
  strategy stays in the private document and is not copied here.

## API pricing schema — proposal (JOV-4875)

Free to start, then scale with successful use, inside the existing artist API
work. This section indexes the executable proposal in
`apps/web/lib/config/api-usage-pricing-proposal.ts`. That module admits unpaid
free work, counts a new logical operation once even on a fresh cache hit,
replays the same operation for no extra unit, and refuses stale cached truth.
Paid opt-in cannot charge or open checkout while amounts are unapproved.

| Field | Contract recorded in the proposal module |
|---|---|
| `approval` | Policy stays `unverified` until a dated Tim receipt |
| `billable_unit` | One completed customer-visible operation; failures, replays, and internal retries count zero |
| `billing_period` | Account-wide included units, shared across keys and API/MCP/CLI, once a period is approved |
| `cache_hits` | A new logical operation consumes one included unit on a fresh hit and does not call upstream again |
| `free_allowance` | Hard stop when the allowance is missing, unresolved, or below one unit |
| `limits` | Numeric burst, concurrency, and abuse limits stay unapproved |
| `overage` | Explicit opt-in only, and still disabled until a unit rate is approved |
| `spend_cap` | Default paid authority is zero |
| `subsidy_exit` | Exhaustion offers no automatic upgrade, debt, or charge |

`admitApiWork` and `settleApiWork` are the admission and settlement rules.
Account signup, durable ledgers, and live cache leases remain JOV-4073,
JOV-4075, JOV-7831, and JOV-8746. Consumer API principals receive no operator,
admin, publication, or payment authority.
