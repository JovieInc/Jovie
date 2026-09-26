# Merge Queue (GitHub native)

`main` merges through GitHub's native merge queue. The live repository variable
is `MERGE_QUEUE_BACKEND=native`, and ruleset `Main Branch Protection`
(`10512119`) owns queue admission and combined-head validation. Native GitHub is
also the supported stack-construction path: dependent PRs may temporarily target
their immediate parent, then are retargeted and rebased onto `main` after that
parent lands. There is no second landing transport.

## How a PR lands

1. Open a root PR against `main`. A dependent child may instead target its
   immediate parent while both are open, but it must remain draft and must not
   be enrolled while that parent base is live. Do not add `merge-queue`.
2. After the parent lands, retarget the child to `main`, rebase it from the
   recorded parent tip, and prove its exact remote head lease and semantic
   ancestry. Mark the child ready and request GitHub's normal Merge when ready
   for its checked head. Do not use `--admin` or add `merge-queue`.
3. GitHub validates required source checks and admits the PR to its native
   merge queue. `ready_for_review` never launches a second source CI flight.
4. GitHub creates a synthetic `merge_group` head against current `main` and
   waits for the same required contexts on that exact combined SHA.
5. GitHub squash-merges the green queue entry. `linear-sync-on-merge.yml`
   transitions its Linear issue to `Done` when no linked PR is still open or
   draft and the issue is not a commissioning or parent issue.

Do not directly merge queue-eligible PRs or use a second transport. GitHub's
normal Merge when ready records intent and owns admission.

## Required contexts and CI stages

Branch protection pins aggregate contexts only—never individual CI jobs.

| Context           | Source PR                                                                                                                | Native `merge_group`                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PR Ready`        | Path selection, risk classification, `ci-fast` (including the portable iOS contract), diff secret scan, Golden Path Lock | Path selection, risk classification, `ci-fast`, ten affected unit shards, one hosted build + layout workspace, path-selected iOS unit + coverage, diff secret scan, Golden Path Lock |
| `Migration Guard` | Path-gated migration policy                                                                                              | Re-emitted and evaluated on the combined head                                                                                                                                        |
| `Fork PR Gate`    | Human approval policy for external forks                                                                                 | Revalidates every exact group member before emitting the combined-head context                                                                                                       |
| `PR Size Guard`   | Source-diff size policy                                                                                                  | Revalidates every exact group member before emitting the combined-head context                                                                                                       |

Preview, Neon, E2E, Lighthouse, a11y, Storybook, golden-path, and extended-smoke
lanes are hosted manual, scheduled, repository-event, or post-merge work. They
never start from the source-PR event and are not required source `PR Ready`
leaves. No PR label fans out CI. Full security and CodeQL scans remain
post-merge/nightly;
the fast diff secret scan gates source and combined heads.
The full iOS simulator UI and screenshot regression runs only for an authorized
iOS TestFlight generation and must pass before upload.

## Canonical native configuration

Checked-in source: `.github/rulesets/branch-protection.yml`.

- Backend: `native`
- Ruleset id: `10512119`
- Bypass actors: none
- Required status checks are non-strict on source PRs; the combined head owns
  latest-`main` validation.
- Merge method: `SQUASH`
- Grouping strategy: `ALLGREEN`
- Minimum entries to merge: live `1`; checked-in target `5` remains unapplied.
- Minimum entries wait: live `0` minutes; checked-in target `10` remains
  unapplied (live readback 2026-09-24). Do not apply the cohort target as part
  of documentation or controller retirement.
- Maximum entries per merge: `5` (synced to the live ruleset 10512119 readback on 2026-09-04, JOV-5867)
- Maximum entries building concurrently: `2` — the live ruleset builds up to
  two combined heads at a time (live readback 2026-09-20, JOV-6107; the 1→2
  apply is complete; do not restore the superseded 2026-08-15 three-prefix
  canary value)
- Check response timeout: `60` minutes (source-first cutover and live readback
  verified 2026-09-24). Required checks and ALLGREEN remain unchanged.
- Production health governs deployment and promotion through the existing
  production controls. Native source admission uses the required checks above;
  the retired Auto-Enroll fleet gate does not create a second admission gate.
- Re-read live ruleset `10512119` before claiming the source cohort settings are active; the custom Auto-Enroll workflow is retired.
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

`ci:merge-queue:check` (repo YAML only) already runs in `ci-fast`.
`ci:merge-queue:verify` (live ruleset `10512119` via `gh api`) runs in
`.github/workflows/merge-queue-ruleset-verify.yml` on a daily schedule, on
`main` pushes that touch the ruleset/check sources, and on `workflow_dispatch`.
It is not a source `PR Ready` context. Failures notify Slack. Always inspect
differences between checked-in intent and the current live ruleset before any
policy change; a documentation value is not an apply receipt.

Bare local controller/check commands default to `native`, matching the live
repository variable. Unknown backends fail closed. Native enrollment/dequeue
mutations additionally require the dedicated controller authorization, so a
bare local command cannot mutate queue state accidentally.

## Reconciliation and loop prevention

The finishing agent requests GitHub Merge when ready against the exact PR head.
GitHub owns queue membership, combined-head checks, and merge ordering. A
one-shot `gh pr merge --auto --match-head-commit` request is not a queue receipt;
read `mergeQueueEntry` before claiming admission.

`drain-pr-queue.sh` remains a guarded manual maintenance tool. Its legacy
source-admission and rebase path has no automatic caller. Hard-gate labels block
the agent finishing request; required GitHub checks govern landing. Pending,
queued, and cancelled checks do not imply a terminal source failure.

- Hosted FX remediation: `rolling-ci-dispatch.yml` consumes completed source-PR
  CI events. The workflow remains disabled, and both
  `FX_HOSTED_REMEDIATION_ENABLED` and `FX_HOSTED_REMEDIATION_CANARY_PR` are
  unset at the 2026-09-24 live readback. Its bounded lane admits modified source
  with immutable ordinary test companions, validates actual behavioral tests
  and coverage, and uses a separate trusted writer to compare-and-swap the
  current PR head. Source landing does not prove activation or a successful
  repair. Existing Hyperagent delivery handles merge-group failures; an
  accepted webhook is not a repair or merge receipt. Repair findings in their
  source PR and let GitHub rebuild the group. No new queue controller is needed.
- Pre-land CHANGELOG prohibition (JOV-5291 / JOV-5378): GitHub's server merge
  ignores local union drivers, so two Unreleased `CHANGELOG.md` edits in one
  group park the later entry. Implementation PRs never edit `CHANGELOG.md`.
  Source CI rejects the diff (`scripts/lib/pre-land-changelog.mjs` +
  `scripts/version-fanout-guard.mjs`), native admission independently skips any
  legacy candidate that still touches the file, and queued members are drained
  without bypassing CI. Stamp/release heads still serialize against a queued
  CHANGELOG member. User-visible changes earn exactly one What's New bullet
  only after land/runtime proof through the release/UI path. This is a
  classified skip, not an `enroll` product failure (it must not mark the PR
  UNSTABLE).
- Cancellation diagnosis: read the queue timeline's actor and reason, the
  exact combined SHA, and the matching CI run before attributing a dequeue.
  Native supersession, real failed checks, merge conflicts, and bot-driven
  removals are different outcomes. Missing or incomplete run inventory is
  unknown evidence and must not authorize a dequeue.

## Retired admission automation

`merge-queue-autoenroll.yml`, its heartbeat dispatch, and its fleet gate are
retired. Since 2026-09-26, `merge-queue-green-enroll.yml` enqueues CLEAN,
non-draft, unlabeled-hold PRs every 10 minutes so production holds never stall
merging; required checks on the merge group remain the only gate. The Queue-Deferred Release workflow and its automatic
label writer are also retired. Do not re-enable those paths to finish a PR.

`queue-deferred`, `needs-rebase`, and `needs-conflict-resolution` are historical
machine annotations, not native admission authority. Actual conflicts, failed
required checks, draft state, and explicit human `hold`, `gated`, or `incident`
labels still block the finishing request. Shared receipt and fleet helpers
remain for their other callers and historical records; their presence does
not make a retired workflow active.

### Update Branch convergence

Update Branch can advance the branch Git ref before the PR database, timeline,
webhook payload, and Actions event base converge. Record and inspect those
planes separately. Accept the API rebase only with exact live-base/head
ancestry and semantic-tree proof.

Use one absolute controller timeout; every `gh`/`git` child gets only the
remaining time and must be killed and reaped before releasing the mutex. If a
proven rebase remains stuck in stale PR metadata long enough to block checks,
make exactly one signed empty child with the same tree and ordinary
fast-forward push it. Never force-push or retry Update Branch. Continue only
after Git ref, REST, GraphQL, and Actions source identities all equal that child.

Secret Scan anchors the range to immutable merge parent1, never the stale event
base or a later live tip. It requires ordered parent1/exact-source identity,
event-base ancestry into parent1, parent1 ancestry into the current base ref,
an exact `merge-tree` reconstruction equal to the event tree, and source/base
TOCTOU rechecks. Behind/diverged sources remain valid; missing proof fails
closed. Checked-in built-in merge attributes are supported; server-only merge
drivers or renormalization differences remain fail-closed.

## Guarded UI fast lane

Small visual-only PRs may use `ui` and `fast` only when the
repo policy classifies them as eligible and the PR includes the required visual
and verification evidence. Auth, billing, DB/migrations, API routes,
entitlements, data writes, security/CSP, infra, routing, package manifests, CI,
and broad refactors fail closed out of this lane. The policy lives in
`scripts/lib/merge-queue-guard.mjs`.

## Source landing and production

The Auto-Enroll isolated UI/docs exception is retired with that controller.
Finishing agents request native Merge when ready after exact-head checks and
human holds are verified. GitHub validates the current combined head before
merging. Existing production health, deployment, budget, and promotion controls
retain their own authority. A native source merge does not prove deployment,
runtime behavior, or Summer commissioning.

## Monitoring and troubleshooting

- Queue state: GitHub's repository merge queue UI or
  `node scripts/merge-queue-backend.mjs list-state` with authenticated `gh`.
- PR not entering: inspect the exact-head Merge when ready request, current
  draft/mergeability state, hard-gate labels, and required GitHub checks.
- Combined head red: repair the source PR and let GitHub rebuild the queue
  group. Do not force a stale combined head through production.
- Emergency response: inspect the native ruleset and exact queue entry,
  repair the source or required check, and prove a fresh native canary.

## Signed commits

Commit signing remains an audit signal, but live ruleset `10512119` does not
currently require signatures. Keep agent signing enabled where supported and
use `commit-signature-check` on `main`; do not claim this as an admission gate
until an explicit ruleset cutover is verified against native squash commits.
