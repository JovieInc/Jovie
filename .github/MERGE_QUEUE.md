# Merge Queue (GitHub native)

`main` merges through GitHub's native merge queue. The live repository variable
is `MERGE_QUEUE_BACKEND=native`, and ruleset `Main Branch Protection`
(`10512119`) owns queue admission and combined-head validation. Graphite is a
rollback transport only; never run both transports concurrently.

## How a PR lands

1. Open a PR against `main`. Source CI emits the required aggregate contexts.
2. Apply `merge-queue` when the PR is ready. Automation normally does this;
   humans can use `gh pr edit <pr> --add-label merge-queue`.
3. `merge-queue-autoenroll.yml` revalidates the PR's current state, hard-gate
   labels, terminal checks, and exact head SHA. It enrolls through
   `scripts/merge-queue-backend.mjs` and proves authoritative queue state after
   mutation. The label remains intent/audit evidence, never queue truth.
4. GitHub creates a synthetic `merge_group` head against current `main` and
   waits for the same required contexts on that exact combined SHA.
5. GitHub squash-merges the green queue entry. `linear-sync-on-merge.yml`
   transitions its Linear issue to `Done`.

Do not manually merge queue-eligible PRs or use a second transport. The normal
operator action is the intent label; the controller owns exact-head enrollment,
dequeue compensation, and postcondition checks.

## Required contexts and CI stages

Branch protection pins aggregate contexts only—never individual CI jobs.

| Context | Source PR | Native `merge_group` |
| --- | --- | --- |
| `PR Ready` | Path selection, risk classification, `ci-fast` (including the portable iOS contract), diff secret scan | Path selection, risk classification, `ci-fast`, five affected unit shards, one hosted build + layout workspace, path-selected hosted Xcode build/test, diff secret scan |
| `Migration Guard` | Path-gated migration policy | Re-emitted and evaluated on the combined head |
| `Fork PR Gate` | Human approval policy for external forks | Revalidates every exact group member before emitting the combined-head context |
| `PR Size Guard` | Source-diff size policy | Revalidates every exact group member before emitting the combined-head context |

Preview, Neon, E2E, Lighthouse, a11y, Storybook, golden-path, and extended-smoke
lanes are hosted manual, scheduled, repository-event, or post-merge work. They
never start from the source-PR event and are not required source `PR Ready`
leaves. No PR label fans out CI. Full security and CodeQL scans remain
post-merge/nightly;
the fast diff secret scan gates source and combined heads.

## Canonical native configuration

Checked-in source: `.github/rulesets/branch-protection.yml`.

- Backend: `native`
- Ruleset id: `10512119`
- Bypass actors: none
- Required status checks are non-strict on source PRs; the combined head owns
  latest-`main` validation.
- Merge method: `SQUASH`
- Grouping strategy: `ALLGREEN`
- Minimum entries to merge: `1`
- Maximum entries per merge: `10`
- Maximum entries building concurrently: `2`
- Check response timeout: `60` minutes
- Signed-commit and non-fast-forward rules: dormant/not applied. The checked-in
  payload intentionally matches live ruleset `10512119`; enabling either is a
  separate reviewed cutover, not an implicit source reapply.

Verify source and live state:

```bash
pnpm ci:merge-queue:check
pnpm ci:merge-queue:verify
gh api repos/JovieInc/Jovie/rulesets/10512119 \
  --jq '{bypass_actors, rules: [.rules[] | select(.type == "merge_queue" or .type == "required_status_checks")]}'
```

Bare local controller/check commands default to `native`, matching the live
repository variable. Unknown backends fail closed. Native enrollment/dequeue
mutations additionally require the dedicated controller authorization, so a
bare local command cannot mutate queue state accidentally.

## Reconciliation and loop prevention

`drain-pr-queue.sh` reads GitHub's GraphQL queue state once per bounded drain.
It fails closed if an open PR is missing from that authoritative snapshot.

- Enrollment refreshes PR metadata immediately before mutation and binds the
  request to a full 40-character head SHA.
- Enrollment and dequeue prove their postconditions; failed mutations are
  reconciled from fresh state rather than blindly retried.
- `needs-human`, `hold`, `gated`, `queue-deferred`, conflicts, and terminal-red
  checks remove native queue membership and the audit label.
- Pending, queued, and cancelled checks are not terminal red. This prevents
  cancellation churn from becoming a dequeue/re-enroll loop.
- Main movement triggers event-driven reconciliation and bounded mechanical
  update-branch/rebase repair for agent branches. There is no polling watchdog
  or Graphite label-cycle loop in the native path.
- Queue enrollment is serialized by `merge-queue-drain-mutex`; it does not
  race another controller instance.

## Guarded UI fast lane

Small visual-only PRs may use `ui`, `fast-track-ui`, and `fast` only when the
repo policy classifies them as eligible and the PR includes the required visual
and verification evidence. Auth, billing, DB/migrations, API routes,
entitlements, data writes, security/CSP, infra, routing, package manifests, CI,
and broad refactors fail closed out of this lane. The policy lives in
`scripts/lib/merge-queue-guard.mjs`.

## Monitoring and troubleshooting

- Queue state: GitHub's repository merge queue UI or
  `node scripts/merge-queue-backend.mjs list-state` with authenticated `gh`.
- PR not entering: check draft/mergeability, hard-gate labels, required check
  conclusions, controller App credentials, and the auto-enroll run.
- Combined head red: repair the failing source PR, update its branch through the
  controller flow, and let GitHub rebuild the queue group. Do not force a stale
  combined head through production.
- Queue controller refuses mutation: confirm the repository variable is exactly
  `native`; a missing/non-native value intentionally fails the workflow closed.
- Emergency rollback: first drain native entries, explicitly set the backend to
  `graphite`, restore the reviewed Graphite bypass/config, and prove a canary.
  This is an incident procedure, not a normal throughput lever.

## Signed commits

Commit signing remains an audit signal, but live ruleset `10512119` does not
currently require signatures. Keep agent signing enabled where supported and
use `commit-signature-check` on `main`; do not claim this as an admission gate
until an explicit ruleset cutover is verified against native squash commits.
