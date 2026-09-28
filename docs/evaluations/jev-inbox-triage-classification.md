# Jev artist-inbox triage evaluation (JOV-6421)

Deferred follow-on to the JOV-6420 release-task pilot: evaluate whether Jev
improves the bounded category and priority decisions for inbound artist email.
This is a shadow evaluation harness only — it changes no production decision,
and the gating conditions below are unchanged by landing it.

The incumbent path is `apps/web/lib/inbox/classifier.ts`: one Haiku
`generateObject` call returns category, priority, territory, summary,
extracted details and a self-reported confidence, written only to
`suggested*` columns on `email_threads` by the Resend inbound webhook. The
artist confirms before any routing; classification failure leaves the thread
uncategorized. That contract is untouched.

## Decision boundary

- Jev may only choose `category` from the existing ten-value enum plus
  `uncategorized`, and `priority` from `high|medium|low` plus
  `uncategorized`. `scripts/invariants/jev-inbox-triage.mjs` builds one
  bounded request carrying two `choice` questions through the shared
  `prepareJevChoiceRequest` / `runPreparedJevEvaluation` seam in
  `jev-gateway.mjs`. No second adapter, credential store, router, retry
  controller or evaluation store was added.
- Summary, territory, proposed dates, budget and organization extraction are
  free-form output and stay on the existing text-generation call. Jev cannot
  replace them, so the honest cost model counts **both** calls per email:
  `estimatedWholeWorkflowCostUsd` in the pilot summary is null (never zero)
  until `pricingEstimate.incumbentCostPerEmailUsd` is filled from recorded
  baseline usage.
- A Jev prediction is only ever a suggestion for the artist to confirm. It
  cannot send, forward, delete, archive, mark spam, route externally or
  change access; `decideInboxTriage` emits `suggest`/`review`/`abstain` and
  performs no side effects.

## Data policy

Sender content is untrusted evidence fenced inside `<<< >>>` markers. The
request serializes the sender display name and domain — never the raw
address — and redacts residual `local@domain` patterns in subject and body
before the inherited 16 KB bound and secret/PII screen in
`prepareJevBoundedRequest`. Raw messages and signatures stay out of general
telemetry. On invalid output, timeout, cancellation, missing credentials or
an unavailable evaluator the seam returns a non-evaluated receipt whose
decision abstains, preserving the existing uncategorized fallback; the
transport runs `maxRetries: 0`, so there are no hidden paid retries.

## Confidence semantics are different on purpose

The Haiku classifier returns a self-reported `confidence` scalar. Jev returns
bounded labels plus an answer-distribution concentration.
`validateInboxTriageThresholds` rejects the legacy 0.6/0.7 values outright and
`calibrateConcentrationThresholds` derives `suggest`/`review` cutoffs from
this task's tuning split only — release-task thresholds are not inherited.

## Corpus, materiality and disposition

- `scripts/invariants/fixtures/inbox-triage-corpus.gen.mjs` is the corpus of
  record (203 synthetic examples: 122 tuning / 81 holdout), hash-pinned by
  `corpusSha256` in `inbox-triage-pilot-config.json`. It covers canonical
  inquiries per category plus time-sensitive bookings, mixed inquiries, fan
  mail, forwarded threads, quoted instructions, ambiguous-priority mail,
  legitimate mail resembling spam, and prompt-injection bodies.
  `loadInboxCorpus` rejects labels outside the fixed enums and duplicate
  text; `corpusIntegrityReport` enforces split separation, per-category and
  per-priority floors, and the required tag set.
- `scripts/invariants/jev-inbox-pilot.mjs` reports per-class
  precision/recall on both axes, `falseSuggestionRate`,
  `highValueMissRate` (expected-`high` examples not suggested `high`),
  `spamOvercaptureRate`, `uncategorizedRecall`, correction rate, abstention,
  p50/p95 latency and whole-workflow cost, and emits the exact-version
  `jev-inbox-pilot-disposition/v1` receipt.

## Current disposition

`inconclusive`. All evidence so far is fixture/shadow; zero executed
comparisons exist because issue creation does not authorize paid API use, no
recorded Haiku baseline was supplied, and the incumbent per-email cost is
unrecorded. Live evaluation additionally requires the JOV-6420 pilot to land
an evidence-backed positive disposition plus explicit workload admission —
closing that blocker as inconclusive or retain-incumbent does not authorize
activation — and any production canary still needs the existing JOV-6414
admission controls, monitoring, rollback proof and authorized funding.

Run: `pnpm run-outcome:check` covers the gateway, classification, triage and
pilot modules. Shadow evaluation of the corpus under an authorized approval
envelope produces the `decisions.jsonl` input for
`node scripts/invariants/jev-inbox-pilot.mjs --corpus ... --config ... --decisions ... [--baseline haiku.jsonl]`.
