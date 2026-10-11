# Internal asset registry + emergent product discovery

Issue: JOV-5945
Registry: `scripts/company-assets/company-assets-registry.json`
Harness: `scripts/company-assets/company-assets.mjs`

Every meaningful internal capability, workflow, data asset, distribution
advantage, product primitive, and combination of primitives is a company
asset with measurable internal value and external option value. This
registry is a **versioned projection** over the existing capability,
benchmark, and commissioning registries — never a second source of truth.

## Canonical CompanyAsset

Each asset records stable identity, owner, source registry pointer, version,
dependencies, maturity, asset class (capability, workflow, model-router,
skill, dataset, graph, distribution-channel, brand-audience, integration,
interface, operational-process, feature-combination), distinct **internal
value** and **external option value** estimates with explicit certainty,
and allowed monetization forms. Unknown values stay explicit (`unknown`),
and model-generated valuations are marked `hypothesis: true`.
`projectCompanyAsset` lifts an existing capability/benchmark record into
the canonical shape without copying mutable state.

## Signals

Product-discovery signals normalize into the JOV-5916 canonical evidence
lifecycle via `normalizeSignal`: provenance, class, observed timestamp, and
a SHA-derived **semantic signature**. Eleven signal classes carry different
evidentiary weights (`SIGNAL_WEIGHTS`): payment attempts outrank retention,
which outranks workarounds; `founder-observation` is a high-weight
*hypothesis* (`founderHypothesisOnly: true`), never automatic admission.
Unexpected use is evidence, not noise.

`matchSignal` deduplicates: a normalized signal whose signature is already
claimed by a live opportunity attaches as additional evidence; one
observation cannot create backlog spam. Registry validation rejects two
opportunities claiming the same signature.

## Feature combinations

Candidate products are combinations of existing assets, not only net-new
features. `featureCombinations` records components, the candidate product,
the **minimum missing capability** that blocks sale, and whether
relabeling/packaging alone can test demand. Seeded fixtures:

- `programmatic-attribution`: smart-links + identity + analytics
- `affiliate-sponsorship-surface`: creator-profile + commerce + brand-matching
- `model-routing-b2b`: symphony-model-routing + certification-receipts

## Opportunity lifecycle

`signal → asset-match → hypothesis → cheapest-validation →
paid-or-behavioral-evidence → bounded-allocation → delivery-model-test →
certified-outcome → scale/pause/kill/hold`.

Every admitted opportunity carries a buyer/problem hypothesis, a cheapest
valid test (`VALIDATION_TESTS`, ordered by cost), and explicit capacity
caps: success threshold, spend cap, WIP cap, and kill criteria
(`canAllocateStandaloneCapacity`). Killed and paused opportunities must
record `rejectionReason` so rejections calibrate future scoring.

## Strategic flexibility gates

Recommendations cover reuse-in-current-product through spinout-or-pivot
(`RECOMMENDATION_TYPES`). High-consequence types (new-product-line,
icp-or-packaging-change, open-source, spinout-or-pivot) pass through
`requiresGovernedCertification`, and `canEnactRecommendation` returns true
only at `certified-outcome` with comparable expected value, downside,
reversibility, capacity impact, **and** a certified outcome receipt. The
registry recommends; it cannot enact a pivot from novelty or a single
model forecast. No opportunity may preempt a declared revenue blocker
(`revenuePathBlockers`, currently JOV-5911) without an explicit
`challengerAllocation` record.

## Seeded opportunities

- `opp-model-routing-b2b` — inside-out assessment of Symphony routing +
  certification receipts as a B2B model-routing capability, linked to the
  JOV-2966 benchmark domain. Cheapest test: customer conversations; zero
  spend; no engineering allocation.
- `opp-smart-link-attribution` — observed attribution-system misuse of
  smart links produces a bounded packaging-test hypothesis rather than
  being discarded or auto-built.

## Ovi projection

`oviProjection` surfaces only decision-worthy opportunities — those where
founder judgment has higher expected value than another autonomous
evidence-gathering step (explicit founder decision required,
high-consequence recommendation, or bounded-allocation stage). Each card
carries asset, observed signal, internal value, external hypothesis,
expected economics, confidence, cheapest test, capacity requested,
cannibalization risk, recommendation, and the action set: certify-test,
reject, modify, hold-as-option, request-more-evidence.

## Boundaries

Composes JOV-5916 (evidence), JOV-2905 (signal production), JOV-2966
(benchmarks), JOV-5927 (cost/value), JOV-5840 (economic invariants), and
JOV-5924 (decision-value ranking). No separate strategy dashboard, weekly
idea ritual, second ledger (`secondLedger: false`), or automatic build
queue (`autoBuildQueue: false`).
