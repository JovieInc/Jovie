# PR Preparation Canary Receipt
## Architecture decision
**Compose/extend.** Reuse `scripts/lib/github-update-branch.mjs` for exact-head, exact-base, semantic-tree, deadline, and post-update proof; compose it with a
four-slot manual matrix. Build only the trusted-plan and receipt boundary.
Rejected: fleet handlers and a new queue writer compete with the three-build
queue; Graphite labels never authorize this canary.
## Safety and operation
The live-`main` plan expires within 24 hours and pins at most four PR numbers, authors, same-repository owners, refs, and head OIDs. Apply requires its SHA-256.
Every PR is rechecked as open, ready, exact-base/head, internal, unqueued,
unheld, mergeable, clean-behind, and source-green; behind alone is insufficient.
The update helper repeats exact base/head and semantic proof at mutation time,
then fail-closes with an unknown head when application cannot be proven.
There is no force-push, label, auto-merge, enqueue/dequeue, queue-order, runner,
ruleset, or repository-setting operation. Each item writes a pre-read receipt;
signals write a cancellation outcome. Reruns and stale/ineligible inputs no-op.
Rollout: land via normal CI without dispatching. The manual workflow is
evidence-only, read-only, bounded to ten minutes, and never holds the native
auto-enroll mutex. It cannot mint or read the Jovie Bot signing key. Apply stays
disabled until a separate trusted-main endpoint or required-reviewer environment
owns an environment-only credential and locks only its final mutation job. That
future path must consume a prior exact-head dry-run receipt and confirmation
bound to its receipt hash, plan hash, and trusted controller/default-main SHA.
Native auto-enrollment remains the only queue admission path.
Rollback: stop dispatching or revert; the disabled plan is already an empty
no-op. No queue, runner, settings, or history restoration is required.
