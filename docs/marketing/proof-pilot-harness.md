# Proof pilot harness

Status: spec only. Recruiting has not started. Refs JOV-7750, epic JOV-7244.

Gate (Tim, 2026-10-04): recruiting waits until the funnel passes the persona
scorer (`scripts/funnel-judge`, JOV-7753 pass bar). Keep the harness ready;
do not recruit before then. Tracked in JOV-7793.

The proof system has three admissible evidence classes for an outcome claim:
computed, dogfood and pilot (`apps/web/data/product-truth/evidence.ts`).
Computed and dogfood proof ship first. This document specifies the pilot
generator, which measures a before and after for 5 to 10 real users and turns
the result into `pilot` metric proof.

## Why pilots

The funnel persona judge (JOV-7753) rejected the golden path in three rounds
because nothing showed that Jovie gets results for someone like the buyer.
Dogfood receipts prove the product works for Jovie. Only pilots prove it works
for a stranger. Until a pilot lands, `upgrade.paid-outcome` and
`pricing.paid-outcome` stay open in `golden-path-proof-baseline.json`.

## Cohort

- 5 to 10 users who claimed a profile through `/start` and use it as their
  primary public link.
- Mixed creator types. The main pages stay ICP-agnostic, so no single
  vertical may exceed half the cohort.
- Excluded: Jovie staff, founders' own profiles (those are dogfood), and
  accounts on comped or 100% coupons for the pricing claim (they did not pay).

## Consent

Before any measurement, each pilot user gives written consent covering:

1. Which metrics are read, from which tables, over which window.
2. Whether their name, handle or role may appear next to a result.
3. How long the consent lasts (`validUntil`, at most 12 months).

Consent is stored as a `QuoteConsentRecord`-shaped record
(`recordId`, `grantedAt`). No consent means no proof item, even if the
numbers are good.

## Measurement

Baseline window: the 28 days before the user's Jovie profile went live, read
from what they can export from their previous link page. If no export
exists, the baseline is "no owned audience", recorded as 0 with that label.

Treatment window: the first 28 days after the Jovie profile went live.

Metrics, each one read-only `select count(*)` against production through
`scripts/db/prod-read.mjs`, scoped to the pilot user's `creator_profiles.id`:

| Metric | Source | Claim it can back |
|---|---|---|
| Human link clicks | `click_events`, `is_bot = false` | traffic reaches the person's work |
| Known contacts | `audience_members`, `type = 'email'` | visitors become an owned audience |
| Active subscribers | `notification_subscriptions`, `unsubscribed_at is null` | people asked to hear from them |
| Payments received | `tips` | the profile earns money |

Each metric becomes one `MetricProof` with `evidence: 'pilot'`,
`reproducingQuery` (the exact SQL), `measuredAt`, `sample.size` (the
cohort size, not the event count), and `sample.population` naming the
cohort and window. Medians only; no averages across a cohort this small,
and no claim built on fewer than 5 users.

## Admission rules

- A pilot claim states the median and the cohort size, for example
  "Median of N pilot users: X known contacts in their first 28 days".
- No extrapolation, no percentages computed from a baseline of 0, and no
  "up to" phrasing.
- Proof expires 90 days after `measuredAt`. The golden-path audit treats an
  expired item as a gap, and the funnel judge fails on it.
- A negative or flat result is recorded, not discarded. It informs what the
  product fixes next and is never rendered as proof.

## Loop

1. `golden-path-claims.ts` audit emits a ProofRequest with
   `generator: 'pilot'` for each gap only pilots can fill.
2. The pilot generator script (not built) reads the consented cohort, runs
   the queries, and writes `pilot-receipts.gen.json` beside the dogfood
   receipts.
3. `proof.ts` loads pilot receipts into `PROOF_REGISTRY`.
   `findProofReadyPages` reports the pages whose requests are now filled.
4. The factory rework loop (JOV-7765) re-renders those pages from the proof
   stage, and the funnel judge reruns.

## Out of scope

Recruiting, incentives and outreach copy. Those need Tim's call and are
tracked in Linear, not here.
