# Jev artist-inbox triage evaluation (JOV-6421)

Deferred follow-on to the JOV-6420 release-task pilot: evaluate whether Jev
improves bounded category/priority decisions for inbound artist email.
Shadow evaluation harness only — it changes no production decision.

The incumbent path is `apps/web/lib/inbox/classifier.ts`: one Haiku
`generateObject` call writes category, priority, summary, extraction and a
self-reported confidence only to `suggested*` columns on `email_threads`.
The artist confirms before any routing; failure leaves it uncategorized —
untouched.

## Decision boundary

- Jev may only choose `category` from the existing ten-value enum plus
  `uncategorized`, and `priority` from `high|medium|low` plus
  `uncategorized`. `jev-inbox-triage.mjs` builds one bounded request
  carrying two `choice` questions through the shared
  `prepareJevChoiceRequest` / `runPreparedJevEvaluation` seam — no second
  adapter, credential store, router, retry controller or evaluation store.
- Summary, territory, dates, budget and organization extraction stay on the
  existing text-generation call, so the honest cost model counts **both**
  calls per email: `estimatedWholeWorkflowCostUsd` is null (never zero)
  until `pricingEstimate.incumbentCostPerEmailUsd` is filled from recorded
  baseline usage.
- `decideInboxTriage` emits `suggest`/`review`/`abstain` only — a
  suggestion for the artist to confirm; it cannot send, forward, delete,
  archive, mark spam, route externally or change access.

## Data policy and confidence semantics

Sender content is untrusted evidence fenced inside `<<< >>>` markers. The
request serializes the sender display name and domain — never the raw
address — and redacts residual `local@domain` patterns before the inherited
16 KB bound and secret/PII screen. On invalid output, timeout, cancellation,
missing credentials or an unavailable evaluator the seam returns a
non-evaluated receipt whose decision abstains; `maxRetries: 0`, so there are
no hidden paid retries.

Haiku returns a self-reported `confidence` scalar; Jev returns bounded
labels plus answer-distribution concentration. `validateInboxTriageThresholds`
rejects the legacy 0.6/0.7 values; the `suggest`/`review` cutoffs in
`buildPilotConfig` are predeclared priors — tuning-split calibration is a
follow-up and release-task thresholds are not inherited.

## Corpus, materiality and disposition

`inbox-triage-corpus.gen.mjs` is the corpus of record (203 synthetic
examples: 122 tuning / 81 holdout) and emits the predeclared
`buildPilotConfig` hash-pinned to it. `loadInboxCorpus` rejects out-of-enum
labels and duplicate text; `corpusIntegrityReport` enforces split
separation, per-axis floors and the required tag set. `jev-inbox-pilot.mjs`
reports per-class precision/recall on both axes, `falseSuggestionRate`,
`highValueMissRate`, `spamOvercaptureRate`, `uncategorizedRecall`,
correction rate, abstention, p50/p95 latency and whole-workflow cost, and
emits the `jev-inbox-pilot-disposition/v1` receipt.

## Current disposition: `inconclusive`

All evidence so far is fixture/shadow; zero executed comparisons exist
(issue creation does not authorize paid API use, no recorded Haiku baseline
was supplied, incumbent per-email cost unrecorded). Live evaluation
additionally requires the JOV-6420 pilot's positive disposition plus
workload admission, and any production canary needs the JOV-6414 admission
controls, monitoring, rollback proof and funding.

Run: `pnpm run-outcome:check` covers the triage and pilot modules; a shadow
run calls `classifyInboxEmail` per corpus example under an authorized
approval envelope and feeds recorded receipts to `summarizeOutcomes` /
`buildPilotReceipt`.
