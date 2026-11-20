---
id: 2026-10-31-review-deadline-queue-stall
status: draft
severity: sev2
detected: 2026-10-31T06:30Z
repaired: 2026-10-31T07:58Z
failure_classes: [unowned-incident, evidence-forgery-or-staleness, non-convergent-control-loop]
detectable_before_human: true
detection_gaps: [warning-annotation-unread, stale-evidence-collector, jump-deferred-while-all-groups-doomed]
replay_corpus: [https://github.com/JovieInc/Jovie/actions/runs/41176329364]
founder_rescues: 0
incident_issue: JOV-10086
actions: [JOV-10086]
gbrain: ops/postmortems/2026-10-31-review-deadline-queue-stall
---

# A missed review deadline failed every merge group for about seven hours

Author: CI throughput agent (Claude Opus 5.5 session, 2026-10-31). Review: Summer. Process: [README](README.md).

## Summary

The public-profile alias graduation receipt (JOV-8737) was due for review on
2026-10-28T01:06Z. Its 72h grace ended at 2026-10-31T01:06Z, and from then on
`production-release-supersession.test.mjs` failed in ci-fast structural on every
merge group, so nothing merged. Refreshing the receipt surfaced a second defect:
the evidence collector still assumed 5 samples per route, while the guard has
taken 20 since #22656, so every measurement after 2026-10-22 parsed as invalid.

## Impact

| Measure | Value |
| --- | --- |
| Start (first bad event) | 2026-10-31T01:06Z (grace expiry) |
| Time to detect (first machine or human signal) | about 5h 24m (06:30Z, CI throughput agent's ejection-cause breakdown) |
| Time to own (first incident record with an owner) | about 6h (JOV-10086 and #23959) |
| Time to repair (user-facing recovery) | 6h 52m (01:06Z to 07:58Z merge of #23959) |
| What was blocked | Every merge to `main`: 0 merges from 05:49Z; 24h merge-group failure rate rose from 0.375 to 0.453 with 108 cancelled collateral runs; queue depth 9 to 18 |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| 2026-10-21 | Receipt refreshed with `nextReviewAt` 2026-10-28T01:06Z (JOV-8737) | #22419 |
| 2026-10-22 | Guard raises alias samples from 5 to 20 (`ALIAS_TAIL_RUNS`); collector not updated | #22656 |
| 2026-10-28T01:06Z | Review due; each merge group emits a `review-deadline-overdue` warning nobody reads | `scripts/lib/review-deadline.mjs` |
| 2026-10-31T01:06Z | Grace ends; ci-fast structural command 41/61 fails on every merge group | run 41176329364 |
| 05:49Z | Last merge (#23932) | `main` history |
| 06:30Z | Ejection breakdown: 34 of 48 merge-group failures are this one test | measurement script |
| 06:55Z | Collector refresh returns 0/14 on both surfaces; logs show 20 samples per route | job 124441088711 |
| 07:08Z | #23959 pushed: collector reads N from logs; receipt refreshed (14/14 both surfaces) | #23959 |
| 07:42Z | #23959 green (34 min push to green); jump requested but queued at position 18 | GraphQL `enqueuePullRequest` |
| 07:58Z | #23959 merged; queue resumes | #23959 |
| 08:01Z | `MERGE_GATE_POOL=fixed`: merge-gate jobs moved to 5 idle Gem runners (183 runs queued against 38 running hosted jobs) | repo variable |

## Root cause

A wall-clock assertion (`assertReviewDeadline`) runs inside a merge-group-required
test, so an unrefreshed dated receipt fails every unrelated PR. That forcing
function is intentional. The control that should have discharged it before expiry
(a refresh by the owner of JOV-8737) did not run, and the 72h grace only produced
a CI annotation.

## Contributing causes

- The refresh path was broken but nobody knew: `parseAliasSamples` hard-coded
  `sample i/5` and `max == summary`, so a refresh after #22656 would have
  recorded 0/14 and could not have been landed honestly without a code fix.
- The green-enroll jump policy defers a compounding jump while any group has been
  building for more than 300s. During a queue-wide failure every building group is
  doomed, so the fix was queued behind them.
- Push to green for a source PR took 34 minutes because Source Validation runs
  three times in sequence for one push.

## Failure classes and invariants violated

| Class | Invariant that should hold | Where else this class can occur |
| --- | --- | --- |
| `unowned-incident` | A dated review that can fail the queue has an automated refresh before its deadline, not only a warning | Any receipt with `nextReviewAt` (authenticated performance graduation, future graduations) |
| `evidence-forgery-or-staleness` | An evidence collector reads its measurement shape from the producer, and a test fails when the producer's shape changes | Every log-parsing collector (authenticated graduation, CI timing, turbo hit rate) |
| `non-convergent-control-loop` | When every building merge group fails on the same cause, a fix for that cause jumps the queue | `merge-queue-green-enroll.yml` jump policy |

## Why detection failed

The only signal during the 72h grace was a `::warning` annotation on merge-group
runs, which no monitor reads. After expiry the failures were attributed per PR
(each ejected PR's own lane saw red), not as one shared cause, so no lane
recognised a queue-wide outage. Gap type: signal exists but is unrouted.

## Instance fix

- #23959: collector reads the per-route sample count from the log and checks the
  nearest-rank p95; receipt refreshed 2026-10-27T06Z to 2026-10-31T06Z (production
  14/14, staging 14/14); production alias gate graduates to blocking as the
  receipt policy declared; next review 2026-11-07T06:00Z.

## Systemic controls

- JOV-10086: scheduled pre-deadline receipt refresh that opens the refresh PR 48h
  before `nextReviewAt`.
- Regression test in `production-release-supersession.test.mjs`: 20-sample logs,
  mismatched sample counts and max-as-summary are rejected.
- Proposed: merge-group ejection breakdown by root failing job, alarmed when one
  cause exceeds 50% of failures in a rolling hour (queue-wide outage detector), and
  a jump exception when that alarm names the PR's own fix.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-10086 | Pre-deadline automated receipt refresh | `unowned-incident` | open | none yet |

## Open questions and unverified claims

- The production alias gate is now blocking post-promote. If jov.ie tail latency
  regresses, release-result goes red; re-check the first five production releases
  after #23959.
