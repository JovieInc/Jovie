# Native merge-when-ready acceptance

Extend the existing GitHub queue and CI control tests with independent revision-bound
evidence for inventory, admission, combined checks, merges and recurrence.

```sh
node scripts/native-queue-eval.mjs collect .context/native-queue-eval/acceptance.json <evaluator-source-sha>
node scripts/native-queue-eval.mjs evaluate .context/native-queue-eval/acceptance.json
pnpm ci:control:test
```

The optional evaluator SHA binds hosted CI, attempt, structural job and actual
selector/coverage output. Pending or missing validation remains BLOCKED. Successful
structural output persists in the job log beyond the artifact's short excerpt.

Collection is read-only. FAIL/BLOCKED exits nonzero; raw receipts and adjacent
`.result.json` dispositions persist. `ELIGIBLE` covers configured GitHub checks and
reviews; resolve known source/coverage blockers before owner release. Preserve
failed attempts; each new bundle independently needs all merge/cycle evidence.

Required acceptance:

- Bind repository, exact PR/source/base/combined revisions, policy and times. Missing,
  stale, skipped, mismatched or API-error evidence is non-green. Give every open PR
  a typed disposition; re-read all identities after collection and reject drift.
- Prove positioned Bot-owned native admission and two distinct consecutive real
  merges (#16237 if eligible), exact combined required checks and selected suites,
  reviews/policy, native merge events and main reachability. CLEAN is insufficient.
- Capture at least three distinct actual controller cycles within the source-bound
  diagnostic deadline. Stranded eligible heads, admission errors and entry churn fail.
- Exercise missing/failed checks, conflicts, review failures, changed heads and false
  success evidence with isolated tests in the real CI selector and current coverage.
  Never alter live PRs to manufacture cases or weaken holds, actors or branch rules.
- Report source/coverage, hosted CI, admission, merges and recurrence separately.
  Labels, enrollment responses, an empty queue or a single merge cannot pass.

The event-driven controller's diagnostic window uses the pinned policy-job
timeout plus `DRAIN_MAX_SECONDS` (currently 5 + 15 minutes). Verify GitHub blob
hashes and actual run/entry times. This qualifies the observed cohort, not a future
SLA; pending-run replacement or slow API calls can exceed and fail the window.

Current Bot-owned native entry/head is authoritative. Latest Bot events corroborate
ownership; reject earlier, future, removed or wrong-actor evidence. GitHub promises
neither equal timestamps nor unique operation-to-entry identity; same-second and
delayed-event ambiguity remain explicit limitations.

After correctness, measure and trial throughput with the sole queue owner. Baseline
2026-09-09: build concurrency 2, group min1/max5, ALLGREEN, 20-minute check timeout.
Measure runner capacity/utilization, duration, waits, merges/hour, rebuilds,
cancellations and cost. Keep trials reversible within proven headroom and report
workload limits; preserve required checks, reviews and failure isolation.

Ship now: bounded evaluator and demonstrated controller fixes. Re-evaluate when:
three-cycle correctness and capacity evidence are complete. Then: measured native
settings trials; no claim of a universal optimum from one workload.
