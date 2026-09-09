# Native merge-when-ready acceptance

Owner: task 01a083db-82ae-7de1-9f01-bccb7e59c1bc. No Linear issue — ad-hoc.

The existing native GitHub queue is the maintained substrate. Extend its current
backend and CI control test path; do not create another queue or mutation owner.
The differentiating requirement is an independent, revision-bound acceptance
report spanning inventory, admission, combined checks, merges and recurrence.

Before further controller repair, collect a baseline:

```sh
node scripts/native-queue-eval.mjs collect .context/native-queue-eval/acceptance.json <evaluator-source-sha>
node scripts/native-queue-eval.mjs evaluate .context/native-queue-eval/acceptance.json
pnpm ci:control:test
```

The optional evaluator SHA pins the hosted CI run, attempt, structural job, and
actual test/coverage output used to qualify the evaluator itself. Pending or
missing validation remains BLOCKED. Successful structural output is retained
in the GitHub job log, beyond the lane artifact's short excerpt.

The collector only queries GitHub. Nonzero exit means FAIL/BLOCKED, including
incomplete collection. Raw receipts persist in the bundle; typed dispositions and
unmet requirements persist in its adjacent `.result.json`. `ELIGIBLE` means the
configured GitHub source checks and review policy; any known source-review or
coverage blocker must also be resolved before the queue owner releases admission.
Keep failed collection attempts intact. A new qualification window uses a new
bundle and must independently satisfy all recurrence and merge requirements. Collect fresh complete
inventories across at least three distinct completed controller cycles. A cycle
receipt never substitutes for admission or merge proof.

Required acceptance:

- Bind repository, PR, exact source/base and merge-group revisions, policy digest
  and observation times. Missing, stale, skipped, mismatched or API-error evidence
  is non-green. Every open PR needs an exact disposition and unmet requirements.
- Eligible heads must show durable native intent and a positioned native queue
  entry, or an actual merge with previously captured admission. CLEAN is insufficient.
- Failed, pending or missing required checks, conflicts, required-review failure
  and head changes must fail isolated adversarial tests. Never alter real PRs to
  manufacture an adverse case. Preserve holds, actor authority and branch rules.
- Prove two distinct consecutive real PRs, including #16237 if eligible: native
  admission, exact combined-head required-check success, applicable selected suites
  and review/policy gates at merge, native merge event, and main reachability.
- Repeat inventory across three controller cycles within a deadline derived from
  actual scheduler settings. Unexplained stranded heads, repeated controller
  admission errors and dequeue/re-enqueue churn cannot pass. A source timer file
  is not proof of a running scheduler. Capture actual native controller-run evidence.
- Run the repository's real CI control selector with changed-behavior regression
  coverage and evaluator self-tests. Missing receipts, wrong revisions, failed
  checks and false controller-success evidence must not produce green.
- Report source/tests/coverage, hosted CI, native admission, actual merges and
  recurrence separately. Empty queue, enrollment response, labels or one merge
  never establishes completion.

The active native controller is event-driven. The diagnostic admission window is
derived from its exact policy-job timeout plus `DRAIN_MAX_SECONDS` in the pinned
drain source (currently 5 + 15 minutes). Store and verify GitHub content blob
hashes, event-run timestamps, and actual entry times. This tests whether the
observed cohort met that window; it does not claim a guaranteed future SLA.
Pending-run replacement and an in-flight API call can exceed the window and
must then fail this evaluation. An unrelated saved desktop heartbeat or Gem
timer never substitutes for native controller execution.

Current exact native entry/head ownership by the canonical Bot is authoritative.
The latest Bot event corroborates ownership; reject earlier, future, removed, or
wrong-actor evidence. GitHub does not promise equal entry/event timestamps or a
unique operation-to-entry join; same-second and delayed-event ambiguity must not
be described as proof of that stronger identity.

After correctness passes, measure throughput before tuning. Baseline live rules
on 2026-09-09: build concurrency 2; merge group minimum 1, maximum 5; ALLGREEN;
20-minute check timeout. These are separate controls. Inspect runner capacity,
utilization, durations, wait time, merges/hour, rebuild/cancellation amplification
and cost. Trial supported reversible settings within proven headroom, retain or
restore the best-supported setting, and state workload/evidence limits. Never
weaken required checks, reviews, or failure isolation to improve the measurement.

Ship now: bounded evaluator and demonstrated controller fixes. Re-evaluate when:
three-cycle correctness and capacity evidence are complete. Then: measured native
settings trials; no claim of a universal optimum from one workload.
