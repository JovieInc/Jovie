# Merge Queue Steward Playbook

Status: Canon
Inherits: [`ENGINEERING.md`](./ENGINEERING.md)
Owner: Summer
Last updated: 2026-10-31
Source: merge-queue steward session 2026-10-31 (gbrain `ops/merge-queue-steward-2026-10-31`)

The merge queue is Jovie's shipping bottleneck when merge groups fail, not when CI is slow.
On 2026-10-31, time in the queue was p50 61 min and p95 590 min, against PR CI at p50 15 min,
and 77% of merge-group runner-minutes went to failed or cancelled groups. Removing failure
classes took group success from 39% to 90% and merges from 4.0 to 10.5 per hour without
weakening a single check. This playbook is how any agent, or the ejector, keeps it there.

Mechanics (rulesets, hold contract, tuning log) live in [`.github/MERGE_QUEUE.md`](../.github/MERGE_QUEUE.md).
This file owns the steward's decisions.

## Targets

| Metric | Target | How it is measured |
|---|---|---|
| Merge-group CI success | >= 80% of the last 16 completed `CI` merge_group runs, cancelled excluded | `gh run list --event merge_group --workflow CI --limit 40` |
| Merges | >= 8 per hour | `gh pr list --state merged --search "merged:<from>..<to> base:main"` (plain `--state merged` undercounts) |
| Queue head | never stuck > 45 min | GraphQL `mergeQueue.entries` position 1 |

`max_entries_to_build` stays at 4. The binding limit is hosted runner concurrency (about 60 jobs;
a group runs about 47). Raising it starves groups. It is not a tuning knob (#24003).

## Invariants

1. **Never jump the queue.** Re-enqueue only at the back.
2. **Dequeue only a proven culprit.** Proof means a reproduction: the failing signal passes on
   `origin/main` and fails on `origin/main` plus the candidate PR, in a scratch worktree. Log
   similarity is not proof.
3. **Every dequeue gets a comment** with the failing signal, the run IDs, the two-sided
   reproduction and the fix or hand-back.
4. **A signal that also failed in a group without the PR is not that PR's culprit.** Treat it
   as a flake or base-branch class: re-enqueue the PR at the back and fix the signal.
5. **Owner boundaries hold.** If a culprit belongs to another agent's lane, comment and stop.

## Culprit triage (within 15 minutes of a group failure)

1. List the failed jobs of the group run. Aggregators (`ci-fast`, `Product Lane Receipt`,
   `PR Ready`) only repeat a lower failure; read `ci-fast (remaining)` or the failing shard.
2. Extract the failing signal: test file and line, structural command number, guard id.
   Error-path log lines from tests that mock failures (for example
   `Request failed due to a temporary server issue` from mocked `global.fetch`) are not signals.
3. Bracket the culprit: list every group that hit the same signal. The first group to include
   a PR, and every group after it, failing on the signal points at that PR. A failing group that
   does not contain the PR clears it (invariant 4).
4. Reproduce both sides (invariant 2). Run heavy suites on gem with the repo-pinned Node on
   `PATH`. macOS `/tmp` is a symlink and breaks path-safety tests on old branches.
5. Decide:
   - Culprit, fix clear: dequeue, comment, push the fix to the PR branch (`pnpm preflight:changed`
     first, never `--no-verify`), and let the ejector re-enroll it once green.
   - Culprit, fix unclear or another owner's lane: dequeue (unless owner-reserved), comment, hand back.
   - Not a culprit: re-enqueue at the back with a comment and open a fix for the signal.

## Failure class to guard

Every culprit or flake is a class until a guard makes it impossible to reach the queue again.

| Class | Guard home | Example (2026-10-31) |
|---|---|---|
| Main-dependent drift (baseline, census, ratchet, registry) | `scripts/lib/queue-drift-guards.json`, run by the pre-enroll drift precheck | `postmortem-class-actions` added after #23978 |
| PR-level check that only ran in the queue | Move the check onto the PR (path-scoped) | #24057 runs the staged-release proof on PRs that change a release test |
| Pre-push parity gap | `scripts/lib/source-validation-manifest.mjs`, run by pre-push | #24046 |
| Load-sensitive timeout | Per-test timeout or cheaper fixture, assertions unchanged | #24077 (ci-fast-lanes Mac discovery) |
| Staged bundle reads an unshipped file | Self-contained test or `RELEASE_EXTRAS` | #23706 fix 048709a4 |

A new class needs, in one PR: the guard, a test that fails without it, and a row in this table.
Check first whether `queue-drift-guards.json` already covers the signal; the precheck test fails
when a baseline-class script is neither listed nor exempt with a reason.

## Automation

What the machines already do, so the steward does not repeat it:

- `merge-group-failure-hold` classifies each failed group (`deterministic-source`,
  `retryable-product`, `transient-infrastructure`, `base-branch`, `unclassified`), holds
  culprits, retries bounded infrastructure failures once, and uses ahead-run attribution.
- `main-red-eject` dequeues a failing head when main is green; victim re-arm and green-head
  re-enrollment put non-culprits back.
- The pre-enroll drift precheck holds PRs whose drift guards fail against latest main.

Still on the steward until automated: two-sided reproduction, fixing the culprit, and writing
the new guard.

## Changelog

- 2026-10-31: created from the merge-queue steward session (Summer owns).
