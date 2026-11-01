---
name: throughput-diagnosis
description: "Find why shipping throughput stalled (no lane pushes, merges or releases); follow the work item."
---

# Throughput diagnosis

Throughput collapses here through *silent* failure: a gate fails closed with a vague reason, a limit is outgrown, a check is misclassified. Guessing at symptoms ("CI is slow", "restart the service", "re-run it") loops for days. This method finds the exact cause in under an hour.

## 1. Measure before touching anything
Per repo, per hour, today: merges to main (real vs bot), lane runs started, lane runs followed by a push, merge-queue depth, merge-group job created→started wait, production lease hold, merge→production minutes. Find the **first stage whose output went to ~zero while its input stayed > 0**. That stage is the bottleneck; everything downstream is a symptom.

## 2. Read the stage's own exit reason — the real one
- Lanes (gem `~/.local/state/jovie-lanes/`): `worker-idle.json` (reason per provider), `tick.json`, `autoscale.json` (effective vs running, blockers), `capacity-limit.json` (hold), `doctor.json`, `runs/`, `journalctl --user -u jovie-lanes.service`.
- Merge queue: queue entries + `jovie-queue-failure-hold/v1` status `class=…;run=…;try=…`, merge_group run annotations (`release self-test failure:` lines name lanes test causes).
- Releases: Production Controller jobs/steps timing; `production-mutation` lease queue.
A generic reason ("unknown-or-stale", "unclassified", "host-pressure", "repair-active") is a lead, not an answer.

## 3. Re-run the deciding gate with live inputs
Import the installed code and call the exact predicate that refused the work (e.g. `repair_inventory_valid(capture_repair_inventory("codex"), "codex")`), printing **each clause separately**. The false clause is the cause. Don't reason about what the code "probably" does.

## 4. Reproduce deterministically, then fix the cause
Make the failure happen on purpose (widen a race window, oversize a file, feed the exact annotation shape). A fix without a deterministic repro is a guess. Fix the cause in the owning code; never weaken an assertion, skip a check, allowlist past a guard, or re-push hoping it passes.

## 5. Leave a guard behind
Every fix ships with: a regression test that fails on the old code (prove it by swapping the old code back), a specific diagnosable reason for the failure mode, and — if the cause was a limit that grows with backlog/time — an alarm at 70% headroom.

## 6. Verify the outcome, not the merge
The fix is done when the stalled stage's output recovers in production (e.g. a real worker claims and pushes; a real release completes with every gate), measured against step 1.

## Worked examples (2026-10-24)
| Symptom | Generic signal | Real cause | Found by |
|---|---|---|---|
| 0 lane repairs 07:00–19:09Z | idle `repair-inventory-unknown-or-stale`; watchdog "zero-worker", restarts | PR inventory cache 1.6 MB > `maintenance_json` 1 MiB cap → `sourceAt=None` | per-clause eval of `repair_inventory_valid` (#23019) |
| PR ejected from queue | `deterministic-source` hold | SIGTERM test signalled on pid-file *existence* before content | deterministic repro by delaying the write |
| 6 merge groups failed | `UpdateTest` red | #22870 imported a module missing from `RELEASE_EXTRAS` | `release self-test failure:` lines (#23020) |
| PR ejected 4× | `repair-active` in staged self-test | new test called real `claimed_elsewhere` (non-hermetic) | `env -i` staged run |
| PRs held as source defects | admission "Fork PR Gate failure" | GitHub 503s on PR Size Guard → derived missing verdict | classify every failed check (#23037) |
| 0 merges in 45 min, queue 34 | "CI slow" | 10 merge groups × ~60 jobs vs 120 hosted runners | job created→started waits by event |
