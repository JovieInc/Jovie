# Merge-queue / fleet-gate recovery runbook

**Subsystem:** `scripts/symphony/evaluate-fleet-gate.sh` +
`scripts/symphony/gem-priority-gate.py` +
`scripts/symphony/fleet_admission_receipt.py` +
`.github/workflows/fleet-gate-refresh.yml` +
`.github/workflows/merge-queue-autoenroll.yml` +
`.github/workflows/queue-deferred-release.yml` +
`.github/actions/evaluate-fleet-gate/action.yml` +
`scripts/drain-pr-queue.sh` +
`scripts/lib/queue-deferred-release-admission.mjs`

**Severity:** P0 when the fleet gate blocks promotion or the native merge queue
stops admitting clean PRs, because autonomous shipping stalls.

**Owner:** on-call operator and the Gem fleet-gate controller; merge-queue
admissions are owned by GitHub's native queue plus
`.github/workflows/merge-queue-autoenroll.yml`.

## Entry criteria

Enter this runbook when any of the following are true:

- `~/.hermes/state/gem-priority-gate/latest.json` reports `state: "RED"` or
  `promotionMode` is `blocked`, `draft-only`, `hold-intake`, or `isolated-only`
  for more than five minutes.
- The native merge queue is not landing eligible clean PRs despite a GREEN fleet
  gate.
- The `Fleet Gate Refresh` or `Merge Queue Auto-Enroll` workflow is failing or
  looping.
- `scripts/drain-pr-queue.sh` logs repeated `queue-noop` or terminal failures.
- `queue-deferred` PRs are older than the 12-minute alarm threshold.
- The production release checkpoint is unavailable and no new admissions are
  allowed.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- The fleet gate receipt shows `state: "GREEN"` and `promotionMode: "normal"`.
- The native merge queue is admitting eligible clean PRs, or the queue is empty
  with no eligible PRs.
- `queue-deferred` PRs are either released or have a fresh reason.
- The `Fleet Gate Refresh` and `Merge Queue Auto-Enroll` workflows are not
  failing or looping.
- Any recovery action is confirmed idempotent (re-running the fleet gate does
  not flip a healthy state).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the incident.

## 1. Safe stop / kill switch

Cancel any looping GitHub Actions runs before inspecting or mutating queue
state. Stopping them prevents concurrent admission attempts from conflicting with
your inspection or manual remediation.

```bash
gh run list --workflow=fleet-gate-refresh.yml --status=in_progress --limit 20 --json databaseId \
  --jq '.[].databaseId' | xargs -I{} gh run cancel {}
gh run list --workflow=merge-queue-autoenroll.yml --status=in_progress --limit 20 --json databaseId \
  --jq '.[].databaseId' | xargs -I{} gh run cancel {}
```

To stop the broader issue-shipping admission path (do not use this to bypass CI
or merge gates):

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
```

Use the cancellations and `bootout` only when the gate or shipper is actively
causing harm. The fleet gate never mutates PRs, the merge queue, or deployments
directly; it only emits a typed admission receipt.

## 2. Inspect current state and blast radius

Read the canonical fleet gate receipt:

```bash
cat ~/.hermes/state/gem-priority-gate/latest.json
```

Read the supporting signals on the Gem host:

```bash
cat ~/.hermes/state/integrity.json
cat ~/.hermes/state/concurrency.json
cat ~/.hermes/state/controller-snapshot.json
cat ~/.hermes/state/queue-snapshot.json
cat ~/.hermes/state/independent-review.json
```

Check the recent GitHub Actions runs:

```bash
gh run list --workflow=fleet-gate-refresh.yml --limit 5
gh run view <run-id> --log
gh run list --workflow=merge-queue-autoenroll.yml --limit 5
gh run view <run-id> --log
gh run list --workflow=queue-deferred-release.yml --limit 5
```

Check the native merge queue and deferred PRs:

```bash
gh pr list --repo JovieInc/Jovie --search "is:open label:queue-deferred" --limit 50
gh pr list --repo JovieInc/Jovie --search "is:open is:queued" --limit 50
```

Evaluate the fleet gate locally with a dry run:

```bash
cd "$JOVIE_REPO"
GH_TOKEN=$(gh auth token) FLEET_GATE_DRY_RUN=1 FLEET_GATE_CONSUMER=fleet \
  bash scripts/symphony/evaluate-fleet-gate.sh
```

Interpret the blast radius:

| `promotionMode` | Likely impact |
|---|---|
| `normal` | Queue should admit eligible clean PRs. |
| `isolated-only` | Only one semantically isolated UI/docs PR may be promoted. |
| `hold-intake` | Already admitted cohort is preserved; no new issue leases. |
| `draft-only` | No merge-queue admissions; only safe draft work. |
| `blocked` | No new intake, no promotion, no merge-queue admissions. |

If `integrity.status` is `active`, the gate is RED because of a severe incident.
If `controller.status` is not `green`, the Symphony admission controller is not
reachable. If `main.status` or `production.status` is not `green`, promotion is
frozen.

## 3. Quarantine harmful work

During recovery:

- Do **not** force-merge PRs or bypass the native merge queue.
- Do **not** manually add or remove `queue-deferred` labels; the
  `queue-deferred-release` controller owns those transitions.
- Do **not** hand-edit the fleet gate receipt or the Gem host snapshots.
- Do **not** use the recovery lane to bypass credential, security, migration,
  or consent gates.
- Flag any in-flight autonomous PRs as `on-hold` until the fleet gate is healthy
  again.

## 4. Replay or resume safe work

If the gate is RED because of an active integrity incident, resolve the incident
and set the integrity receipt to `resolved` or remove it:

```bash
# Only after the incident is resolved
cat ~/.hermes/state/integrity.json
# Update through the approved incident path, then refresh the gate
```

If the Symphony controller snapshot is stale, restart the Symphony service and
wait for a fresh green snapshot.

If the queue snapshot or GitHub API blip caused the hold, re-run the fleet gate
refresh:

```bash
gh workflow run fleet-gate-refresh.yml --ref main
```

After the fleet gate is GREEN, re-run the merge-queue autoenroll controller:

```bash
gh workflow run merge-queue-autoenroll.yml --ref main
```

If a PR is stuck with `queue-deferred` but the fleet gate is `normal`, run the
queue-deferred release controller:

```bash
gh workflow run queue-deferred-release.yml --ref main
```

To inspect the drain path in dry-run mode without mutating the queue:

```bash
cd "$JOVIE_REPO"
DRY_RUN=1 bash scripts/drain-pr-queue.sh
```

If the issue shipper was stopped, restart it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.cron-codex-issue-shipper.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
```

All workflow dispatches and `kickstart` commands are idempotent.

## 5. Reconcile ambiguous external effects

If the fleet gate receipt says `healthy` but shipping is still stalled, the fleet
gate is not the cause. Move to the runbooks for:

- `scripts/symphony/jobs/control-plane-liveness-watchdog.ts` (Mac/Gem control plane dark)
- `scripts/symphony/jobs/delivery-liveness-watchdog.ts` (stalled delivery leases)
- `scripts/symphony/jobs/pipeline-scoreboard.ts` (shipper stalls)

If the gate is RED but no incident is visible, check for these common ambiguous
states:

- The GitHub API rate limit is exhausted; the queue snapshot will fall back to
  the last known good snapshot for up to 10 minutes.
- The Symphony controller was briefly unreachable; the controller snapshot will
  fall back to the last known green snapshot for up to 10 minutes.
- `Main Release Ready` actually failed on `main`.
- The integrity receipt is stale or malformed.
- The production release checkpoint is unavailable because the production
  controller has not yet verified the current `main` deployment.

## 6. Restore / recover data

The canonical fleet gate receipt and the Gem host snapshots are transient. The
`Fleet Gate Refresh` workflow regenerates them on the next run. If you need to
preserve evidence, copy the files before clearing state:

```bash
cp ~/.hermes/state/gem-priority-gate/latest.json \
   ~/.hermes/state/gem-priority-gate/latest.$(date +%Y%m%d-%H%M%S).json
cp ~/.hermes/state/integrity.json \
   ~/.hermes/state/integrity.$(date +%Y%m%d-%H%M%S).json
```

If a snapshot is corrupted, delete it; the next refresh will recreate it. Do not
delete `latest.json` while the `Merge Queue Auto-Enroll` workflow is running.

## 7. Verify recovery completion

After any restart or state change, verify the exact runtime:

```bash
cd "$JOVIE_REPO"
GH_TOKEN=$(gh auth token) FLEET_GATE_DRY_RUN=1 FLEET_GATE_CONSUMER=fleet \
  bash scripts/symphony/evaluate-fleet-gate.sh
```

Confirm all of the following:

- `state` is `"GREEN"` and `promotionMode` is `"normal"`.
- `signals.integrity.status` is `"clear"` or `"resolved"`.
- `signals.controller.status` is `"green"`.
- `signals.main.status` is `"green"` and the SHA is the expected main head.
- `signals.production.status` is `"green"` and `deployedSha` matches `main.sha`.
- The queue snapshot shows `eligiblePrs` and `greenReadyPrs` below the target.
- The `Fleet Gate Refresh` and `Merge Queue Auto-Enroll` workflows complete
  without terminal failures.
- The native merge queue admits a clean PR within 5 minutes, or no eligible
  PRs are waiting.
- No `queue-deferred` PR is older than 12 minutes.

## 8. Communicate affected-user scope

The fleet gate has no direct user-facing surface, but a stalled merge queue
delays shipped features and fixes. Post in `#alerts-critical` using the format
from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Merge-queue / fleet-gate stalled: <promotionMode>
Status: Monitoring | Resolved
Impact: Autonomous shipping delayed; no direct user outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/merge-queue-fleet-gate-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with GitHub `repo` scope, access to the
  Gem host `~/.hermes/state/gem-priority-gate/` directory, and the
  `co.jovie.hermes.*` launchd units on the Hermes-Air host.
- **Audit:** keep shell history, GitHub Actions run logs, and the Gem host state
  files. The fleet gate refresh workflow emits its receipt and bounded admission
  projection to the workflow logs.
- **Break-glass:** if the Gem host or GitHub Actions is unreachable, the recovery
  lane cannot operate. Escalate to the owner of the Gem host and the GitHub
  org admin. Do not run these commands from a non-trusted machine; the GitHub
  token and host paths are privileged.
- **Safety invariant:** the fleet gate and the merge queue never force-merge PRs
  or bypass the native merge queue. Any process claiming to be the recovery lane
  that asks for a force-merge, credential, or schema migration is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/merge-queue-fleet-gate-recovery.test.ts`. The
test checks that the runbook contains the required recovery sections and that
every repo-relative `scripts/symphony/` path it references exists. If a command
or path changes, update the runbook and the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/symphony/evaluate-fleet-gate.sh`
- `scripts/symphony/gem-priority-gate.py`
- `scripts/symphony/fleet_admission_receipt.py`
- `.github/workflows/fleet-gate-refresh.yml`
- `.github/workflows/merge-queue-autoenroll.yml`
- `.github/workflows/queue-deferred-release.yml`
- `.github/actions/evaluate-fleet-gate/action.yml`
- `scripts/drain-pr-queue.sh`
- `scripts/lib/queue-deferred-release-admission.mjs`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`
