# Jev release-task classification pilot (JOV-6420)

Bounded product use case from the 2026-09-17 Jev audit: classify a free-form
release task into an existing cluster or abstain. This is a shadow pilot only —
it changes no production decision. The Haiku `classifyTaskCluster` contract in
`apps/web/lib/release-tasks/classify-task-cluster.ts` and its caller in
`task-actions.ts` are unchanged.

## Seam reuse, not a second integration

- `scripts/invariants/jev-gateway.mjs` now exposes the shared pieces the pilot
  uses: `prepareJevBoundedRequest` (digests, 16 KB text bound, secret/PII
  screen), `prepareJevChoiceRequest` (bounded label-choice questions), and
  `runPreparedJevEvaluation` (the existing admission envelope, fingerprint
  re-reads, timeout/cancellation, zero-retry transport through
  `evaluateThroughGateway`). No second adapter, credential store, router,
  retry controller, or evaluation store was added. `runJevEvaluation` is a
  thin wrapper over the same core; its receipt contract is unchanged.
- `scripts/invariants/jev-task-classification.mjs` adds the task-specific
  contract: `freezeClusterAllowlist` pins the caller-supplied slug set per
  request (deduped, sorted, hashed into `allowlistSha256`, bound into the
  request fingerprint), `prepareTaskClusterRequest` builds a single `choice`
  question whose criteria keys are exactly the frozen slugs plus the reserved
  `unclassified` abstain label, and `interpretTaskCluster` invalidates any
  answer outside that allowlist. Task text and cluster descriptions are
  fenced as untrusted data.
- Empty task text and an empty cluster list return a `skipped` receipt with
  `evaluatorCalls: 0` and never touch transport. A single-cluster allowlist
  still goes through the evaluator so unrelated text abstains instead of
  auto-assigning.

## Confidence semantics are different on purpose

The Haiku path returns a self-reported `confidence` scalar with 0.6/0.7
cutoffs. The Jev answer is a bounded label plus an answer-distribution
concentration. `validateTaskClusterThresholds` rejects the legacy 0.6/0.7
values outright so the two semantics can never be silently swapped; downstream
auto-assignment thresholds (`CLASSIFIER_AUTO_CLUSTER_THRESHOLD`) are unchanged
and must be re-audited before any real routing uses this decision.

## Corpus, calibration, and disposition

- `scripts/invariants/fixtures/release-task-corpus.gen.mjs` is the versioned
  corpus of record (210 examples: 126 tuning / 84 holdout), generated
  deterministically from the seeded cluster catalog and hash-pinned by
  `corpusSha256` in the pilot config. `--write` materializes the JSON for
  local inspection; the rendered file is intentionally untracked to respect
  the repository tracked-bytes budget. The corpus covers canonical,
  paraphrase, typo, messy, ambiguous multi-cluster, off-topic,
  prompt-injection, changed-cluster-set, and single-cluster-mismatch cases.
  `loadTaskCorpus` rejects labels outside the supplied cluster set and
  duplicate task text; `corpusIntegrityReport` enforces tuning/holdout
  separation and the predeclared sufficiency floor.
- `scripts/invariants/fixtures/release-task-pilot-config.json` predeclares
  materiality (min macro-F1, max false-auto-assignment 2%, max correction
  rate 15%, abstention band, p95 and per-decision cost ceilings), protected
  metrics (false auto-assignment, unclassified recall ≥ 0.9), and sufficiency
  requirements. The 200–500-example corpus is not proof of rare-event safety.
- `scripts/invariants/jev-task-pilot.mjs` summarizes recorded decisions
  (per-class precision/recall, abstention, false auto-assignment, correction
  rate, p50/p95 latency, token usage and list-price cost estimate;
  `billedCostUsd` stays null), calibrates concentration thresholds on the
  tuning split only, distinguishes executed Gateway comparisons from
  fixture/shadow observations, and emits an exact-version
  `jev-task-pilot-disposition/v1` receipt.

## Current disposition

`inconclusive`. All evidence so far comes from fixture transports (shadow
observations); zero executed comparisons exist because issue creation does not
authorize paid API use, and no recorded Haiku baseline was supplied. A scoped
canary would additionally require the existing JOV-6414 admission controls,
monitoring, rollback and authorized funding; completing this issue does not
enable follow-on workloads.

Run: `pnpm run-outcome:check` covers the gateway, classification and pilot
modules. Shadow evaluation of the corpus under an authorized approval
envelope produces the `decisions.jsonl` input for the pilot CLI.
