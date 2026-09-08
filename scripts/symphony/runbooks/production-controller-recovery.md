# Production controller recovery runbook

**Subsystem:** `.github/workflows/production-controller.yml` +
`.github/workflows/production-controller-health.yml` +
`.github/workflows/production-marker-recovery.yml` +
`.github/workflows/production-release.yml` +
`scripts/lib/production-lane-range.mjs` +
`.github/scripts/production-marker-state.mjs`

**Severity:** P0 when a successful main CI generation cannot be promoted
because the controller is interrupted, superseded, or its marker classifier
returns `manual` or `recovery_available`.

**Owner:** Shipping-Control / on-call operator with repo admin and GitHub Actions
write access.

## Entry criteria

Enter this runbook when any of the following are true:

- `.github/scripts/production-marker-state.mjs` reports `state: "manual"` or
  `state: "recovery_available"` for the current main SHA.
- The `Production Controller` workflow is failing, stalled, or produced an
  interrupted primary marker.
- A green `main` CI run has not resulted in a production promotion within the
  expected bounded window.
- `Fleet Gate Refresh` reports a controller degradation that blocks the release
  FIFO.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- Current main has a verified production marker (`state: "verified"`) or a
  bounded recovery lease has been consumed and a verified marker exists.
- `.github/workflows/production-controller-health.yml` latest run exits cleanly
  and reports `needs_manual=false`.
- No active `production-mutation` concurrency group is stuck on a failed or
  failed-closed run.
- The latest `Production Controller` run for current main completed successfully
  or was correctly superseded by a newer generation.

## 1. Safe stop / kill switch

Cancel the stuck controller run only if it is actively mutating production or
about to do so:

```bash
gh run cancel <production-controller-run-id> --repo JovieInc/Jovie
```

Do not cancel a run that is already inside `promote-production` mid-mutation
unless the rollout is actively harming users; prefer to let the centralized
rollback path in `.github/workflows/production-release.yml` handle gate
failures.

If production is currently unhealthy and the cause is the latest deploy, see
`scripts/symphony/runbooks/release-marker-recovery.md` for the marker-recovery
path and `docs/ON_CALL_PROCESS.md` for incident escalation.

## 2. Inspect current state and blast radius

Resolve current main and the live production bind:

```bash
cd "$JOVIE_REPO"
current_sha=$(gh api repos/JovieInc/Jovie/commits/main --jq '.sha')
echo "$current_sha"
node .github/scripts/assert-live-production-bind.mjs --main-sha "$current_sha"
```

Classify the marker state for the generation:

```bash
controller_id=$(gh api repos/JovieInc/Jovie/actions/workflows/production-controller.yml --jq '.id')
node .github/scripts/production-marker-state.mjs \
  --sha "$current_sha" \
  --repo JovieInc/Jovie \
  --controller-workflow-id "$controller_id"
```

Check recent controller and health runs:

```bash
gh run list --workflow=production-controller.yml --branch=main --repo JovieInc/Jovie --limit 5
gh run list --workflow=production-controller-health.yml --branch=main --repo JovieInc/Jovie --limit 5
gh run view <run-id> --repo JovieInc/Jovie
```

Inspect the release lineage and lane range receipts:

```bash
gh run download <production-controller-run-id> --name production-lane-range-<sha>-<attempt>
```

Interpret the classifier output:

| Marker state | Likely impact |
|---|---|
| `verified` | The generation is already authoritative. If shipping is still stalled, the controller is not the cause. |
| `pending` | Marker is still materializing; wait for the `Production Verified` job and artifact upload. |
| `recovery_available` | The primary marker was interrupted; one bounded rerun or marker recovery is authorized. |
| `manual` | The state is contradictory or unsafe to recover automatically; investigate before any rerun. |
| `none` | No marker exists and no recovery lease is visible; the controller may not have started for this SHA. |

## 3. Quarantine harmful work

Until the controller is healthy again:

- Do not land new product PRs if the release FIFO is blocked.
- Do not run manual `vercel promote` or `vercel alias` outside the workflow.
- Do not delete artifacts from the production controller run.
- Hold any deployment-touching changes until the current main marker is
  `verified`.

## 4. Replay or resume safe work

If the classifier shows `recovery_available` with
`reason: "one_interrupted_marker_safe_to_rerun"`, request one full rerun of the
exact controller run:

```bash
gh run rerun <original-controller-run-id> --repo JovieInc/Jovie
```

If the classifier shows `recovery_available` with
`reason: "current_recovery_attempt_requires_lease"`, the recovery lease
artifact `production-generation-recovery-<sha>` exists. Confirm the lease and
then follow `scripts/symphony/runbooks/release-marker-recovery.md` to consume
it.

If the classifier shows `manual` for any reason, open
`scripts/symphony/runbooks/release-marker-recovery.md` and resolve the
underlying contradiction before authorizing any recovery.

If the source `CI` event was not delivered to the controller, the health
workflow may replay the exact successful CI once. Find the missing successful
CI run and rerun it:

```bash
gh run list --workflow=ci.yml --branch=main --event=push --repo JovieInc/Jovie --limit 5
gh run rerun <ci-run-id> --repo JovieInc/Jovie
```

## 5. Reconcile ambiguous external effects

If the controller output says `superseded` but `main` has not visibly moved,
the run was racing a newer generation. Yield and let the newer generation
proceed.

If the classifier returns `manual` due to `multiple_markers` or
`recovery_evidence_after_verified_primary`, there are conflicting artifacts.
Inspect them:

```bash
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-verified-$current_sha&per_page=100
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-verified-recovery-$current_sha&per_page=100
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-recovery-$current_sha&per_page=100
```

Delete expired or contradictory same-name artifacts only after confirming they
have no downloadable bytes. Then re-run the appropriate recovery path.

## 6. Restore / recover data

This subsystem does not hold persistent user data; it holds durable release
artifacts. To preserve evidence before mutating any artifact:

```bash
mkdir -p /tmp/jovie-controller-evidence
gh api repos/JovieInc/Jovie/actions/runs/<run-id> > /tmp/jovie-controller-evidence/run.json
gh api repos/JovieInc/Jovie/actions/runs/<run-id>/attempts/1/jobs > /tmp/jovie-controller-evidence/jobs.json
```

The authoritative release state is the set of artifacts plus the current
Vercel production deployment. Do not attempt to reconstruct a marker from logs
or write one by hand.

## 7. Verify recovery completion

After the rerun or marker recovery:

```bash
node .github/scripts/production-marker-state.mjs \
  --sha "$current_sha" \
  --repo JovieInc/Jovie \
  --controller-workflow-id "$controller_id"
```

Confirm all of the following:

- `state` is `"verified"`.
- `controllerAttempt` matches the rerun attempt (`1` or `2`).
- `deploymentId` is a valid `dpl_...` identifier, or `not-applicable` with a
  correct base SHA and no Web lane.
- `production-controller-health.yml` latest run exits cleanly and reports
  `needs_manual=false`.

Also verify the live production bind:

```bash
node .github/scripts/assert-live-production-bind.mjs --main-sha "$current_sha"
```

## 8. Communicate affected-user scope

If the controller was blocked, the impact is typically shipping delay or a
potentially un-shipped fix. If production was promoted with an unverified
marker, the impact may be an outage. Post in `#alerts-critical` using the format
from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Production controller interrupted: <reason>
Status: Investigating | Mitigating | Monitoring | Resolved
Impact: Autonomous shipping delayed / possible stale production alias
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/production-controller-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** Shipping-Control owners and operators with repo
  admin and GitHub Actions write access.
- **Audit:** retain shell history and workflow run logs. The controller writes
  step summaries with the release lineage and lane range receipts.
- **Break-glass:** if the GitHub API is unavailable, the production mutation
  cannot be performed safely by this runbook. Escalate to the owner of the
  GitHub organization and Vercel account.
- **Safety invariant:** never promote a SHA that does not have an exact
  successful `ci.yml` push run and a fresh current-main check.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/production-controller-recovery.test.ts`. The
test checks that the runbook contains the required recovery sections and that
every repo-relative path it references exists.

When you change the following files, update this runbook and the test together
in the same PR:

- `.github/workflows/production-controller.yml`
- `.github/workflows/production-controller-health.yml`
- `.github/workflows/production-marker-recovery.yml`
- `.github/workflows/production-release.yml`
- `.github/scripts/production-marker-state.mjs`
- `scripts/lib/production-lane-range.mjs`
- `.github/scripts/assert-live-production-bind.mjs`
- `.github/scripts/verify-production-alias.sh`
- `.github/scripts/promote-production-deployment.sh`
- `scripts/symphony/runbooks/release-marker-recovery.md`
- `docs/ON_CALL_PROCESS.md`
