# Merge Queue (GitHub native)

`main` merges through GitHub's native merge queue. The live repository variable
is `MERGE_QUEUE_BACKEND=native`, and ruleset `Main Branch Protection`
(`10512119`) owns queue admission and combined-head validation. Native GitHub is
also the supported stack-construction path: dependent PRs may temporarily target
their immediate parent, then are retargeted and rebased onto `main` after that
parent lands. Graphite is not required and there is no second landing transport.

## How a PR lands

1. Open a root PR against `main`. A dependent child may instead target its
   immediate parent while both are open, but it must remain draft and must not
   receive `merge-queue` while that parent base is live.
2. After the parent lands, retarget the child to `main`, rebase it from the
   recorded parent tip, prove its exact remote head lease and semantic ancestry,
   then mark it ready and apply `merge-queue`. Automation normally does this;
   humans can use `gh pr edit <pr> --add-label merge-queue` only after that proof.
3. Before labeling, the operator must verify the child targets `main` and that
   its exact head is the rebased SHA. `merge-queue-autoenroll.yml` then
   revalidates the PR's current state, hard-gate labels, terminal checks, and
   exact head SHA. It enrolls through `scripts/merge-queue-backend.mjs` and
   proves authoritative queue state after mutation. The label remains intent/
   audit evidence, never queue truth.
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
| `PR Ready` | Path selection, risk classification, `ci-fast` (including the portable iOS contract), diff secret scan, Golden Path Lock | Path selection, risk classification, `ci-fast`, five affected unit shards, one hosted build + layout workspace, path-selected hosted Xcode build/test, diff secret scan, Golden Path Lock |
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
- Minimum entries to merge: `5` (typed cohort; GitHub waits for this size or the bounded timeout)
- Minimum entries wait: `10` minutes (low-traffic timeout so a partial cohort can still land)
- Maximum entries per merge: `10`
- Maximum entries building concurrently: `3` (measured starting point after concurrent prefix waves inflated unit matrices from ~1–2 minutes to ~5–7 minutes)
- Check response timeout: `60` minutes
- Stale exact-production: `hold-intake` preserves the admitted cohort and continues isolated implementation. It must not freeze enroll of CLEAN unrelated PRs. `jovie-fleet-queue-hold/v1` is a bounded recovery selector (default 12m TTL) and must expire, succeed, or fail with a terminal reason — never sit pending.
- Live ruleset `10512119` remains `min_entries_to_merge=1` / wait `0` until the post-merge apply. Source and preflight readback already describe the 5/10 cohort; auto-enroll stays up during that pending cutover.
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
  or legacy vendor label-cycle loop in the native path.
- Queue enrollment is serialized by `merge-queue-drain-mutex`; it does not
  race another controller instance.
- An above-target count of eligible PRs is queue-pressure telemetry, not a
  promotion blocker. Closing admission at that threshold would set native
  capacity to zero and deadlock the only controller that can drain the
  backlog. New issue intake pauses until the count returns to target, while
  existing implementation and the native drain continue. Unknown or malformed
  queue evidence still fails closed.
- Front-item churn guard (JOV-5030): every native group build runs on
  `gh-readonly-queue/main/pr-<front>-<exactBaseSha>`, so recent `merge_group`
  CI runs identify which PR fronted each failed attempt and against which
  exact main base. The drain refuses to re-enroll — and actively dequeues — a
  PR whose unchanged head already fronted a failed attempt on the exact
  current main base, because the rebuilt group would deterministically fail
  again and force every follower through a duplicate full merge-group CI run.
  The guard lifts when the head moves or main advances, and never acts on
  missing evidence (`unknown` → no dequeue, pre-guard enrollment behavior).
  The pipeline scoreboard measures real `merge_group` attempts from the
  Actions API and alarms on `merge_queue_churn` (≥3 attempts at ≥2 attempts
  per merge).

## Typed queue deferral (`jovie-queue-deferral/v1`)

`queue-deferred` is a mechanical hold placed at a draft's birth (Symphony) or
under queue pressure (agent-pipeline). The label alone has no provenance, so
every deferral posts a typed receipt — one upserted PR comment with the
`<!-- bot-comment:queue-deferral -->` marker — recording the exact head, a
typed reason (`symphony-birth-hold` or `queue-pressure`), its reason-bound
source, and the deferral time. Only comments authored by the canonical Jovie
bot or repository owner are authority. `scripts/lib/queue-deferral-receipt.mjs`
is the canonical reader/writer; public comments cannot create release authority.

`queue-deferred-release.yml` runs after PR CI, successful production-controller
completion, and the existing five-minute fleet-receipt refresh. That upstream
durability tick means a PR checked during AMBER self-heals after GREEN even when
the repository is otherwise idle. It runs `scripts/release-queue-deferred.sh`:

- **Report pass** — prints age and reason for every `queue-deferred` PR
  (not only agent-branch PRs) and raises a warning once a hold exceeds the
  12-minute SLA. A missing or malformed receipt reports as
  `untyped-ready-hold` and is released automatically when the live PR is
  ready, mergeable, exact-head green, and a fresh GREEN fleet receipt
  agrees. Human-policy labels (`needs:taste`, `net-new`, `outbound`,
  `needs-human`, …) report as `human-policy-hold:<label>` and stay held.
- **Release pass** — only under a fresh (≤10-minute) `GREEN` fleet receipt
  with `promotionAdmission.allowed`, and only when the live PR is non-draft,
  mergeable, same-repo/main, no human-policy hold labels are present, and
  required checks are green: removes `queue-deferred`. Typed mechanical
  receipts (`symphony-birth-hold`, `queue-pressure`) still bind reason to
  source. Untyped ready holds are dropped rather than waiting for a human.
  The `unlabeled` event re-enters the normal admission path above, which
  independently revalidates the exact head before enrollment. Under
  AMBER/RED/stale fleet state no mutation happens — the hold stays in place.
  `queue-pressure` holds additionally re-run the canonical live queue-depth
  policy and remain held while pressure is still above its threshold.

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

Small visual-only PRs may use `ui`, `fast-track-ui`, and `fast` only when the
repo policy classifies them as eligible and the PR includes the required visual
and verification evidence. Auth, billing, DB/migrations, API routes,
entitlements, data writes, security/CSP, infra, routing, package manifests, CI,
and broad refactors fail closed out of this lane. The policy lives in
`scripts/lib/merge-queue-guard.mjs`.

## Production-red isolated admission

The canonical fleet gate separates source-main health from production health.
There is one deliberately narrow exception to the normal `GREEN` promotion
requirement:

- If source `main` is explicitly green, production is explicitly red, the
  controller/integrity/queue evidence is fresh and unambiguous, the existing
  native queue may hold at most one semantically isolated UI/docs PR.
- Production deployment and promotion remain frozen. Landing the source does
  not assert, imply, or initiate a deployment.
- If `main` is red, source merge and deployment are frozen. UI/docs work may be
  preserved only as a draft. Unknown, stale, malformed, severe-integrity, or
  mixed failure evidence admits nothing.

Eligibility is computed by `scripts/lib/isolated-ui-docs-policy.mjs` inside the
existing `merge-queue-autoenroll` controller. It is never inferred from labels
or path matches alone. Each admission pins the exact PR number, current `main`
base SHA, published head SHA, complete paginated file manifest, blob SHAs, and a
deterministic diff digest. Every file must be in the small docs/assets/styles/
UI-atom allowlist; semantic source inspection rejects auth, identity, data,
database, API, billing, entitlement, runtime, dependency, configuration,
server-action, network, storage, routing, and control-plane behavior. Deletes,
renames, broad refactors, escaping imports, or ambiguity fail closed.

UI changes additionally require an additive focused test delta, before/after
visual evidence, focused-test, typecheck, and lint/Biome receipts. Docs-only
changes require rendered-docs proof. The four live branch-protection contexts
must be successful on the exact head. The controller re-evaluates the complete
receipt immediately before and after native enrollment and compensates by
dequeueing if mutable evidence changes during the operation. Ordinary queued
PRs are held outside the native queue until production returns green; no second
queue, alternate transport, label authority, or CI bypass exists. Before a
fleet-driven dequeue in `isolated-only`, the controller writes a pending
`jovie-fleet-queue-hold/v1` commit status on that exact head with an explicit
expiry. Waiting lanes (`hold-intake`, `draft-only` / main-not-green, and
blocked-unknown) must not stamp an unbounded pending hold or strip enroll from
CLEAN unrelated PRs. A later successful `Production Controller` completion
under a fresh normal `GREEN` gate may still consume remaining receipts and
re-enroll the still-current heads through the same native preflight and
postcondition checks. Any pending hold that outlives `FLEET_HOLD_TTL_SECONDS`
(default 12 minutes) is closed to success or failure with a terminal reason.
The recovery signal binds the stable workflow path (including GitHub's optional
`@ref` suffix), not the controller's dynamic run title. Main-push and
untargeted manual runs cannot perform this recovery.

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
- Emergency response: pause auto-enrollment, drain or dequeue native entries
  through the controller, repair the native ruleset/workflow, and prove one
  canary before resuming. Do not introduce a second landing transport.

## Signed commits

Commit signing remains an audit signal, but live ruleset `10512119` does not
currently require signatures. Keep agent signing enabled where supported and
use `commit-signature-check` on `main`; do not claim this as an admission gate
until an explicit ruleset cutover is verified against native squash commits.
