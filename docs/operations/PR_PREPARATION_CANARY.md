# PR Preparation Canary Receipt
## Architecture decision
**Compose/extend.** Reuse `scripts/lib/github-update-branch.mjs` for exact-head,
exact-base, semantic-tree, deadline, and post-update proof. Compose it with
GitHub's manual dispatch, matrix `max-parallel: 4`, isolated failures, and
artifacts. Build only the missing trusted-plan and receipt boundary.

Rejected: fleet-wide handlers can scan/label many PRs; a new queue writer would
compete with the three-build queue. Graphite labels never authorize this canary.

## Safety and operation
The live-`main` plan expires within 24 hours and pins at most four PR numbers,
authors, same-repository owners, refs, and head OIDs. Apply requires its SHA-256.
Every PR is rechecked as open, ready, exact-base/head, internal, unqueued,
unheld, mergeable, clean-behind, and source-green; behind alone is insufficient.
The update helper repeats exact base/head and semantic proof at mutation time.
There is no force-push, label, auto-merge, enqueue/dequeue, queue-order, runner,
ruleset, or repository-setting operation. Each item writes a pre-read receipt;
signals write a cancellation outcome. Reruns and stale/ineligible inputs no-op.

Rollout: land via normal CI without dispatching; use a separate plan PR for one
exact head. Dry-run and verify `eligible_dry_run`, then apply with its exact hash.
Verify the receipt and fresh source CI before increasing to at most four.
Native auto-enrollment remains the only queue admission path. Never burst 35 PRs.

Rollback: stop dispatching, land a plan-only disable (`enabled: false`, empty
entries), cancel if needed, or revert. No queue, runner, settings, or history
restoration is required. Cost is at most four jobs/CI runs; dry-run never mutates.
