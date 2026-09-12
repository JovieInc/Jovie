# Control-plane liveness watchdog recovery runbook

**Subsystem:** `scripts/symphony/jobs/control-plane-liveness-watchdog.ts` +
`scripts/symphony/lib/controller-liveness.ts` +
`scripts/symphony/launchd/co.jovie.hermes.control-plane-liveness-watchdog.plist.template`

**Severity:** P0 when the receipt is `dark` and the recovery lane is authorized,
because the autonomous shipping control plane may be stalled.

**Owner:** on-call operator (Mac/Hermes-Air host access) and the independent
control-plane recovery lane.

## Entry criteria

Enter this runbook when any of the following are true:

- `~/.hermes/state/controller-liveness-latest.json` reports `status: "dark"`.
- The `control-plane-liveness-watchdog` launchd unit is failing or not running.
- Autonomous shipping has stopped dispatching useful work and the cause appears to
  be a dark Mac ship-owner lock or a dark Gem HUD activation attestation.
- The watchdog logs a `recovery_lane_authorized` event.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- `controller-liveness-latest.json` reports `status: "healthy"` with zero
  `violations`.
- `recoveryLane.authorized` is `false`.
- The `control-plane-liveness-watchdog` launchd unit is loaded and has no
  recent crash cycles.
- Any action taken to clear a stale lock/attestation is confirmed idempotent
  (re-running the watchdog does not re-create a violation).
- The independent recovery lane has not admitted any product, credential, or
  migration work outside its bounded scope.

## 1. Safe stop / kill switch

Stop the watchdog first if you are about to inspect or mutate the checkin files
it reads. The watchdog is read-only, but stopping it prevents a concurrent
classification from confusing your inspection.

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.control-plane-liveness-watchdog
```

To stop the broader control-plane admission path (do not use this to bypass CI
or merge gates):

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.cron-codex-kanban-ship
```

Use the `bootout` only when the watchdog or shipper is actively causing harm.
The watchdog itself never mutates PRs, the merge queue, Linear, or deployments.

## 2. Inspect current state and blast radius

Read the latest receipt:

```bash
cat ~/.hermes/state/controller-liveness-latest.json
```

Check the watchdog log:

```bash
tail -n 200 ~/.hermes/logs/launchd/control-plane-liveness-watchdog.log
```

Check launchd status:

```bash
launchctl print gui/$(id -u)/co.jovie.hermes.control-plane-liveness-watchdog
```

Inspect the raw checkin files:

```bash
cat ~/.hermes/state/ship-owner.lock
cat ~/.local/state/gem-checkin-hud/gem-ship-hud-attestation.json
```

Use the library helpers to classify the controllers in the exact runtime:

```bash
cd "$JOVIE_REPO"
tsx scripts/symphony/jobs/control-plane-liveness-watchdog.ts
```

Interpret the blast radius:

| Controller dark | Likely impact |
|---|---|
| `mac` | The local ship loop (`cron-codex-kanban-ship`) may not own an active ship-owner lock. |
| `gem` | The fleet HUD (`gem-checkin-hud`) may not be reporting an active activation attestation. |
| `mac,gem` | Both local shipping and fleet visibility are dark; the control plane is not dispatching useful work. |

## 3. Quarantine harmful work

The watchdog is read-only, but its `recovery_lane_authorized` signal may admit a
bounded control-plane recovery PR. During recovery:

- Do **not** restart product shipping loops or merge product PRs until the
  receipt is healthy.
- Do **not** use the recovery lane to bypass credential, security, migration,
  or consent gates.
- Scope the recovery lane to the exact control-plane fix that restores the
  watchdog or the controller it depends on.
- If a fleet hold is blocking the fix, the fix is the only work that may be
  admitted through the independent recovery lane; hold ordinary product intake.
- Flag any in-flight autonomous PRs as `on-hold` until the control plane is
  healthy again.

## 4. Replay or resume safe work

If the controller is missing or stale because its checkin file is old and the
actual process is stopped, clear the stale artifact and restart the writer
service.

Stop the writer first (idempotent; safe to repeat):

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.cron-codex-kanban-ship
```

Remove the stale Mac ship-owner lock only after confirming the shipper is
stopped and the lock is not owned by a live process:

```bash
rm ~/.hermes/state/ship-owner.lock
```

Remove the stale Gem HUD attestation only after confirming the Gem HUD service
is stopped:

```bash
rm ~/.local/state/gem-checkin-hud/gem-ship-hud-attestation.json
```

Restart the writer service:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.cron-codex-kanban-ship.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-kanban-ship
```

Restart the watchdog and re-run the classification:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.control-plane-liveness-watchdog.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.control-plane-liveness-watchdog
sleep 5
cat ~/.hermes/state/controller-liveness-latest.json
```

All file-removal and kickstart steps are idempotent when run in order. The
watchdog re-creates the receipt; it does not replay old actions.

## 5. Reconcile ambiguous external effects

If the receipt says `healthy` but shipping is still stalled, the control-plane
liveness subsystem is not the cause. Move to the runbooks for:

- `scripts/symphony/jobs/delivery-liveness-watchdog.ts` (lease/retry stalls)
- `scripts/symphony/jobs/pipeline-scoreboard.ts` (shipper stalls)
- `.github/workflows/merge-queue-autoenroll.yml` (queue ordering stalls)

If the receipt says `dead` but the PID is alive, check for these common
ambiguous states:

- The shipper ran under a different user; `process.kill(pid, 0)` is performed
  by the watchdog owner.
- Clock skew on the host made the checkin timestamp appear in the future; the
  receipt will flag `status: "stale"` with reason `future`.
- The attestation file has been replaced by a stale copy; compare its
  `observedAt` with the actual service start time.

## 6. Restore / recover data

This subsystem has no persistent data to restore. The receipt is a transient
classification; if it is deleted or corrupted, the watchdog regenerates it on the
next run. If you need to preserve evidence, copy the receipt before clearing
state:

```bash
cp ~/.hermes/state/controller-liveness-latest.json \
   ~/.hermes/state/controller-liveness-latest.$(date +%Y%m%d-%H%M%S).json
```

## 7. Verify recovery completion

After any restart or state change, verify the exact runtime:

```bash
cd "$JOVIE_REPO"
tsx scripts/symphony/jobs/control-plane-liveness-watchdog.ts
cat ~/.hermes/state/controller-liveness-latest.json
```

Confirm all of the following:

- `status` is `"healthy"`.
- `violations` is empty.
- `recoveryLane.authorized` is `false`.
- Both `controllers` entries are present and have recent `observedAt`
  timestamps.
- The launchd log shows no new `recovery_lane_authorized` events for 5 minutes.

## 8. Communicate affected-user scope

The watchdog itself has no direct user-facing surface. If the control plane was
dark, the impact is internal shipping delay. Post in `#alerts-critical` using the
format from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Control-plane liveness dark: <mac|gem|both>
Status: Monitoring | Resolved
Impact: Autonomous shipping delayed; no user-facing outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/control-plane-liveness-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with access to the Hermes-Air Mac host
  and the `co.jovie.hermes.*` launchd units.
- **Audit:** keep shell history and the launchd logs in
  `~/.hermes/logs/launchd/`. The watchdog emits `controller_liveness_checked`
  and `recovery_lane_authorized` events to `~/.hermes/logs/jobs.jsonl`.
- **Break-glass:** if the Mac host is unreachable, the recovery lane cannot
  operate. Escalate to the owner of the Hermes-Air host. Do not run these
  commands from a non-Hermes-Air machine; the paths are host-local.
- **Safety invariant:** the watchdog job never mutates Linear, PRs, the merge
  queue, or deployments. Any process claiming to be the recovery lane that asks
  for a credential, a force-merge, or a schema migration is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/control-plane-liveness-recovery.test.ts`. The
test checks that the runbook contains the required recovery sections and that
every repo-relative path it references exists. If a command or path changes,
update the runbook and the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/symphony/jobs/control-plane-liveness-watchdog.ts`
- `scripts/symphony/lib/controller-liveness.ts`
- `scripts/symphony/launchd/co.jovie.hermes.control-plane-liveness-watchdog.plist.template`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`

