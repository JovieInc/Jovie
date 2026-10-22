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
   projects the issue through `Merging` and `Validating` from deployment and
   required receipts. Merge alone never means `Done`; see the
   [Linear evidence contract](../.claude/rules/linear.md).

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

### GITHUB_TOKEN budget per group

Default-branch workflows share one GITHUB_TOKEN REST bucket (5,000 calls/h, measured 2026-10-21 by the `api-quota` notices; demand was ~4,500/h),
and each rebuild runs a group's CI again. In a green merge group, ci.yml jobs
other than Merge Group Admission spend no REST calls. Their token-bearing steps
only authenticate git fetches, which are git traffic and not REST, or they never
run in merge groups, or they return before reading (the report-only
security gate), or they are path-gated to DB/schema groups. Supersede cancels
cost one call per superseded run. Admission's reads, and the Fork PR Gate and
PR Size Guard member policy, are budgeted in their own scripts.
`scripts/lib/__tests__/merge-group-token-budget.test.mjs` lists every
token-bearing step with its per-group cost. A new one fails that test until it
is classified, and the green-group total must stay at 5 or less.

### Red lanes do not rebuild the queue

A failed merge-group lane used to post a failing `PR Ready` commit status
immediately (`ejected before the slowest lane`). GitHub ejected that entry and
rebuilt every group behind it. Each rebuild ran PR Size Guard and Merge Group
Admission again on the shared GITHUB_TOKEN bucket (5,000 REST calls/hour),
which is what exhausted the quota before the hourly reset. A red lane no longer
posts that status. `ci-merge-group-ready` still runs with `always()` and fails
`PR Ready` when the group is actually red, so the entry is ejected once, after
the lanes already in flight finish. No job in `ci.yml` holds `statuses: write`.
`scripts/lib/__tests__/merge-group-fail-fast.test.mjs` locks that.

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
- Minimum entries to merge: `1`.
- Minimum entries wait: `0` minutes. A source-green PR forms a group
  immediately instead of waiting for a cohort.
- Maximum entries per merge: `10`. Each entry still builds its own synthetic
  head layered on the entry ahead (one member per group), so per-member lanes
  and member policy are unchanged; up to ten green entries land in one push.
- Maximum entries building concurrently: checked-in ceiling `10`. Lower live
  values remain supported as a reversible runner-capacity brake. Raise the
  file and the live ruleset together.
- Check response timeout: `20` minutes (Tim-approved tuning and live readback
  verified 2026-10-21). Required checks and ALLGREEN remain unchanged.
- Production health governs deployment and promotion through the existing
  production controls. Native source admission uses the required checks above;
  the retired Auto-Enroll fleet gate does not create a second admission gate.
- Re-read live ruleset `10512119` before claiming these settings are active.
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

The repository still has one native queue for `main`; lane separation happens
inside each per-member synthetic head. The trusted changed-path classifier runs
only the selected Web, Mac, iOS, operations/tooling, and shared-contract lanes,
so a fast-only change does not inherit an unrelated PR's slow product lane.

**Ship now:** immediate groups (`min=1`, `wait=0`), up to ten green entries
per merge push, ten building concurrently, ALLGREEN, 20-minute check response
budget (2026-10-21, Tim-approved; 3 of 287 group runs exceeded 20 minutes in
the first 12 hours, with no timeout removals). HEADGREEN is unsafe here:
member policy validates only the newest member and lanes are path-selected per
member, so an earlier member could land without its own lanes passing.
**Re-evaluate when:** the group failure rate stays under 10% and the repo
GITHUB_TOKEN bucket stays healthy for a day. **Then:** keep 10/10; if
merge-group runs selecting the 30/40-minute iOS or Mac lanes start timing out
at the 20-minute response budget (the 2026-09-23 failure mode), raise the
budget in this file and the live ruleset together, watching hosted macOS pickup
(the org shares five hosted macOS slots).

### Tuning log

| When (UTC) | Change | Why |
| --- | --- | --- |
| before 2026-10-12 23:25 | live `max_entries_to_merge` 1 → 5 | batch green entries per push |
| 2026-10-12 23:25 | live `max_entries_to_build` 3 → 6 | queue 38 deep |
| 2026-10-13 02:37 | live `max_entries_to_build` 6 → 8 | throughput |
| 2026-10-13 03:47 | live `max_entries_to_build` 8 → 6 | GITHUB_TOKEN quota storm |
| 2026-10-13 | source synced to live (build 6, merge 5) | keep the daily verify green |
| 2026-10-21 04:47 | live `max_entries_to_build` 6 → 10, `max_entries_to_merge` 5 → 10, `check_response_timeout_minutes` 60 → 20 (Tim-approved) | queue 40 deep at ~5 merges/h; stuck checks held the head for an hour |
| 2026-10-21 | source synced to live (build 10, merge 10, timeout 20) | keep the daily verify green (JOV-8205) |

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
  repair. An accepted webhook is not a repair or merge receipt. Repair findings
  in their source PR and let GitHub rebuild the group.
- Revision failure hold (JOV-5117): a terminal `CI` `merge_group` run maps   `gh-readonly-queue/main/pr-N-*` to PR `N`, then uses the ordered queue/commit   timeline to bind the failed attempt to its exact source head. The trusted   `Merge Queue Green Enroll` controller writes   `jovie-queue-failure-hold/v1` on that source commit before attempting dequeue and   disabling native auto-merge. The Jovie Bot token for that job is not minted with merge-queue write, so `dequeuePullRequest` may return `Resource not accessible by integration`. That denial, and a `not in queue` response, are logged and do not fail the job: GitHub already removes a pull request when its merge_group run fails. The hold status and auto-merge disable still persist. Any other dequeue or auto-merge error fails the job. Every attributable failure (deterministic, retryable product, or unclassified) holds its exact source head after one attempt (JOV-6620; #22280 re-entered twice at a failed head on 2026-10-20 under the old one-retry allowance). The head re-enters only with a new commit or when a person (never a bot) removes `hold` or `queue-poison` from that exact head; that release consumes one `jovie-queue-failure-retry/v1` reservation. jovie-bot lifting `queue-poison` is not a release. Victim rearm never re-enqueues the revision the failure hold names unless another group member owns the failing paths. A `transient-infrastructure` failure (runner startup, checkout, setup) says nothing about the source revision: each one gets its own automatic retry, which a person's manual dequeue of that head withdraws. Main movement, elapsed time, labels, production completion,   and generic maintenance do not clear either receipt. A new source SHA has no   old commit status and may enroll after normal source checks. Required checks,   native queue membership, and exact combined-head CI remain authoritative and   unchanged.
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
retired. Since 2026-09-26, `merge-queue-green-enroll.yml` enqueues
required-green, non-draft, unlabeled-hold PRs on green checks so production
holds never stall merging; required checks on the merge group remain the only
gate. Required-green means `mergeStateStatus` CLEAN, HAS_HOOKS or UNSTABLE
(UNSTABLE only adds a pending or red non-required context, such as a lane
`jovie-execution/*` receipt). `lane-fix-red` is machine admission state, not a
hold-contract label. The Lane Fix Relay removes it with that workflow's
existing GITHUB_TOKEN once the current head is required-green
(`mergeStateStatus` CLEAN, HAS_HOOKS, or UNSTABLE) and the success event's
head sha matches. A red, unknown, dirty, or behind head keeps the label.
Green enroll does not remove the label and will not admit the PR while it
remains. A GITHUB_TOKEN unlabel does not wake enroll, so admission is the
next enroll read: the same success wake if the label is already gone,
otherwise the next push-to-main sweep. Adding the label to a queued PR
dequeues that PR.
An UNKNOWN read right after main moves is
re-read twice before the wake is dropped. An unchanged head removed from the
queue stays out unless a typed retry/recovery applies, or the removal was
`manual` and a blocking label (`hold`, `queue-poison`, ...) was removed after
it. A head with a merge-group failure hold needs a person's label removal (see
Revision failure hold above); a bot removal does not release it. The enroll and rearm tokens carry `workflows: write` so heads that edit
`.github/workflows` can be enqueued. The Queue-Deferred Release workflow and
its automatic label writer are also retired. Do not re-enable those paths to
finish a PR.

### Hold contract (jovie-hold/v1)

Every stop label (`hold`, `gated`, `incident`, `do-not-merge`, and the
`tim-hold` / `tim:hold` / `hold:tim` variants) must come with a receipt comment
on the PR that names an owner and a machine-checkable release. The canonical
list is `scripts/lib/admission-hold-labels.mjs`; enroll, dequeue, auto-merge
enable and the merge-group member policy all block on the same set plus the
lanes-owned `queue-poison`, and a parity test fails when a copy drifts:

```
<!-- jovie-hold/v1 {"owner":"agent:<task>","until":"2026-10-12T18:00:00Z","reason":"..."} -->
<!-- jovie-hold/v1 {"owner":"gem-lanes","head":"<40-hex sha>","reason":"waiting for a fix push"} -->
```

`until` is an expiry. `head` releases the hold once the PR head moves off that
SHA. No receipt lasts more than 7 days from its own creation, and a receipt
posted more than an hour before the label's latest labeled event does not
count. Each label is evaluated on its own labeled time. The
`enforce-hold-contract` job in `merge-queue-green-enroll.yml`
(`scripts/hold-contract.mjs`) runs on every reconcile. It removes stop labels that
are ownerless (no valid receipt after 24 h), expired, or released by a head
change, and leaves one comment each time. Prose conditions such as "until
qualification" are not release conditions. The unlabel is done with the
Jovie Bot token, so it wakes enrollment, and required checks still gate the
merge.

`queue-deferred` is a stop label like `hold` (2026-10-13): agents use it to
keep a PR out of the queue, so green enroll and every other copy of the stop
set skip it, and the hold contract governs it (receipt or 24 h release).
`needs-rebase` and `needs-conflict-resolution` are historical machine
annotations, not native admission authority. Actual conflicts, failed
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
  group. Inspect `jovie-queue-failure-hold/v1` on the exact source commit; do
  not force a held combined head through production.
- Recurrence: `node scripts/promotion-loss-metrics.mjs --since 24h` reports
  merge-group attempts per merge plus deterministic same-head recurrence.
- Emergency response: inspect the native ruleset and exact queue entry,
  repair the source or required check, and prove a fresh native canary.
- Groups stuck in AWAITING_CHECKS with a CI run named
  `.github/workflows/ci.yml`, zero jobs and event `push` on the
  `gh-readonly-queue/*` ref: GitHub could not load ci.yml, so no merge_group
  check reports. The known cause is an interpolated `run:` script whose
  `format()` expression exceeds GitHub's 21,000-character limit (2026-10-20,
  #21826). `node scripts/workflow-expression-budget.mjs --ref HEAD --merge-with
  origin/main` reproduces it. Source Validation runs that check on the head and
  its merge with main. In the queue, PR Size Guard's `Workflow Load Guard` job
  ("Require combined-head workflows to load") fails only for the group that
  introduced it; a group stacked on an already broken base passes. The failure
  hold then records `jovie-queue-failure-hold/v1` on the exact source head and
  reports `PR Ready` failed on the synthetic group head, so the queue ejects it
  at once. The ruleset's 20-minute check response timeout remains the backstop
  for any other cause.

## Queue freeze (queue-watch runbook)

Merge Queue Green Enroll is the sole queue writer, so one repository variable
freezes admission:

- Freeze: `gh variable set QUEUE_FREEZE --body 1 -R JovieInc/Jovie`
- Lift: `gh variable set QUEUE_FREEZE --body 0 -R JovieInc/Jovie`

While `QUEUE_FREEZE=1`, green enroll's `enroll` and `rearm-green-victims` jobs
and the manual Auto-Ready Agent Drafts `auto-ready` job are skipped. Failure
holds, the hold contract and held-PR dequeues keep running. PRs already in
the queue keep landing, so dequeue any that must stop. The variable does not
disarm native auto-merge: a PR armed before the flip (by an agent's
`gh pr merge --auto` or any remaining writer) is still enqueued by GitHub
when it turns green. Disarm those with `gh pr merge N --disable-auto -R
JovieInc/Jovie`. After flipping the variable, also run
`gh pr list -R JovieInc/Jovie --state open --limit 200 --json number,autoMergeRequest --jq '.[] | select(.autoMergeRequest) | .number'`
and disarm every PR it prints. `scripts/merge-queue-green-enroll.test.mjs` fails if a job
that can enqueue or arm lacks the guard.

Circuit-breaker dequeues: when a storm forces PRs out of the queue, mark each
one so green enroll restores it after the lift instead of a hand restore:

```sh
gh api graphql -f query='mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}' \
  -f id="$(gh pr view N --json id --jq .id -R JovieInc/Jovie)" &&
  gh pr edit N --add-label queue-breaker -R JovieInc/Jovie
```

Once `QUEUE_FREEZE` is back to 0, green enroll's next sweep (any landing on
main) or a dispatch re-admits a `queue-breaker` PR whose manual removal left
the head unchanged, while it is still green and carries no hold label or
failure hold. Immediately before enqueue it revalidates that state and consumes
the marker as a one-shot authorization. If the marker cannot be consumed, the
state changes, or enqueue then fails, the PR stays out and must be marked again
before another restore attempt. A manual dequeue without the marker, or a
`failed_checks` removal, is never re-admitted this way.

The marker must be added after a successful dequeue, as the `&&` sequence
above enforces. Green enroll binds that label event to the latest removal, so
a failed/interrupted dequeue or an older marker cannot authorize a later one.
If the head changes after the marked removal, normal admission handles the new
revision and clears the stale marker after enqueue.

For breaker dequeues that were not marked first, restore the snapshot
directly, or release each PR with `hold` then unhold. Green enroll does not
otherwise re-admit a manually dequeued, unchanged head.

To admit one PR without a roster sweep, dispatch green enroll with
`gh workflow run merge-queue-green-enroll.yml -f pr_number=N -R JovieInc/Jovie`.

## Signed commits

Commit signing remains an audit signal, but live ruleset `10512119` does not
currently require signatures. Keep agent signing enabled where supported and
use `commit-signature-check` on `main`; do not claim this as an admission gate
until an explicit ruleset cutover is verified against native squash commits.
