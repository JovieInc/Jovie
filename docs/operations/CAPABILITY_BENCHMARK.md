# External capability benchmark loop

Issue: JOV-2966
Registry: `scripts/capability-benchmark/capability-benchmark-registry.json`
Harness: `scripts/capability-benchmark/capability-benchmark.mjs`

This loop keeps consequential internal capabilities at or above external
state of the art without a calendar sweep and without letting discoveries
steal first-revenue capacity. It owns the **benchmark-and-decision
lifecycle**, not a research store: Idea Radar, competitor monitoring,
`/last30days`, GitHub/release watchers, papers, vendor announcements, and
founder/customer observations are evidence producers into the canonical
evidence lifecycle (JOV-5916). No second ledger or Slack-only authority is
created.

## Triggers

`classifyTriggerEvent` admits only material events: an external capability
discovered or materially changed, an internal capability/workload/failure or
cost change, a customer/founder-reported gap, a pending high-value decision,
or expired benchmark evidence. Clock-class events (`clock-sweep`,
`periodic-review`, `calendar-cadence`) are rejected; anything else with a
semantic signature accumulates until expected value crosses threshold.

## Benchmark object

Each domain defines before testing: capability and user outcome (not brand
name), a versioned task suite with adversarial cases and ground truth or an
independent rubric, internal and external candidates with pinned versions and
provenance, and a metrics list covering quality, false-positive cost,
latency, reliability, maintenance burden, security, and economics. Marketing
claims prioritize investigation but never count as proof. Named external
systems only count once `identityVerified` is true at `run-complete`.

## Decisions

Every sourcing decision records one bounded state: `build`, `adopt`, `buy`,
`integrate`, `adapt`, `distill-learn`, `open-source`, `productize-license`,
`retain-internal-only`, or `retire` — scoped to a capability and use case,
with expected economics, dependency risk, reversibility, a re-evaluation
trigger, and an expiration. `isDecisionStale` supersedes expired or replaced
decisions explicitly.

Only founder-judgment scopes (`portfolio-allocation-change`,
`new-product-or-company`, `credential-or-billing-boundary`) reach the Unified
Ovi Certification Inbox; routine adoption inside existing authority proceeds
autonomously with an outcome receipt.

An internal superiority signal feeds JOV-5945 as an asset hypothesis and any
portfolio-changing recommendation feeds JOV-5949; an internal win is not
automatically a new company.

## First domain: code review / implementation verification

The registry's `code-review-verification` domain pins the required metric
minimum (real bugs caught pre-merge, false-positive burden, review-depth
coverage, time/cost to actionable review, duplicate noise, learning from
accepted/rejected findings, exact-head runtime verification) and requires at
least one internal candidate plus one external or open-source challenger on
the same versioned cohort. `validateShadowReplayReceipt` rejects receipts
that compare only the selected route — the certified job outcome must be
compared.

## Capacity

The lane is preemptible. `validateCapacityReceipt` requires a receipt proving
no eligible JOV-5911/JOV-5912 blocker was displaced.

## Run

```
node --test scripts/capability-benchmark/capability-benchmark.test.mjs
```
