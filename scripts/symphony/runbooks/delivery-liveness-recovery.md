# Delivery-liveness watchdog recovery runbook

**Subsystem:** `scripts/symphony/jobs/delivery-liveness-watchdog.ts` +
`scripts/symphony/lib/delivery-liveness.ts` +
`scripts/symphony/launchd/co.jovie.hermes.delivery-liveness-watchdog.plist.template`

**Severity:** P0 when a delivery lease is stuck in `awaiting_verification` or
`remediating` for longer than the liveness thresholds, because an autonomous
issue may be stalled or retrying indefinitely.

**Owner:** on-call operator and the issue owner assigned by the delivery
controller.

## Entry criteria

Enter this runbook when any of the following are true:

- `~/.hermes/state/delivery-liveness/*.json` contains a lease whose status is
  not `complete` and whose `lastReceiptAt` is older than five minutes.
- The `delivery-liveness-watchdog` launchd unit is failing or not running.
- `~/.hermes/state/triage-liveness-latest.json` reports `status: "blocked"`.
- `~/.hermes/state/linear-in-progress-liveness-latest.json` reports a non-zero
  `reclaimed` count.
- The watchdog logs a `retry_reassign_failed` or `receipt_refresh_failed` event
  for the same issue repeatedly.
- A delivery lease is `blocked` and awaiting an external authority decision.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- All delivery leases in `~/.hermes/state/delivery-liveness/` are either
  `complete` or have a fresh receipt within the last five minutes.
- `triage-liveness-latest.json` reports `status: "healthy"` with zero
  `violations`.
- `linear-in-progress-liveness-latest.json` reports `reclaimed` as empty.
- The `delivery-liveness-watchdog` launchd unit is loaded and has no recent
  crash cycles.
- Any retry/reassign action is confirmed idempotent (re-running the watchdog
  does not re-create the same stale lease).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the stalled issue.

## 1. Safe stop / kill switch

Stop the watchdog first if you are about to inspect or mutate delivery leases.
Stopping it prevents a concurrent classification from conflicting with your
inspection or manual remediation.

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.delivery-liveness-watchdog
```

To stop the broader issue-shipping admission path (do not use this to bypass CI
or merge gates):

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
```

Use the `bootout` only when the watchdog or shipper is actively causing harm.
The watchdog may mutate GitHub issue labels and comments during retry/reassign,
but it does not force-merge PRs, bypass the merge queue, or deploy.

## 2. Inspect current state and blast radius

Read the latest delivery leases:

```bash
ls ~/.hermes/state/delivery-liveness/
cat ~/.hermes/state/delivery-liveness/<repo>--<issue>.json
```

Read the triage liveness receipt:

```bash
cat ~/.hermes/state/triage-liveness-latest.json
```

Read the Linear In Progress liveness receipt:

```bash
cat ~/.hermes/state/linear-in-progress-liveness-latest.json
```

Check the watchdog log:

```bash
tail -n 200 ~/.hermes/logs/launchd/delivery-liveness-watchdog.log
```

Check launchd status:

```bash
launchctl print gui/$(id -u)/co.jovie.hermes.delivery-liveness-watchdog
```

Use the library helpers to classify a lease in the exact runtime:

```bash
cd "$JOVIE_REPO"
tsx -e "
import { readDeliveryLease, watchdogDecision } from './scripts/symphony/lib/delivery-liveness.ts';
const lease = readDeliveryLease(process.argv[1]);
if (!lease) { console.error('missing lease'); process.exit(1); }
console.log(JSON.stringify(watchdogDecision(lease), null, 2));
" ~/.hermes/state/delivery-liveness/<repo>--<issue>.json
```

Interpret the blast radius:

| Lease status | Likely impact |
|---|---|
| `awaiting_verification` | A PR is open but missing CI, merge, deploy, or runtime proof. |
| `remediating` | A previous verification attempt failed; the issue is retrying. |
| `blocked` | The issue needs an external authority (credential, account 2FA, payment, legal, founder decision, irreversible side effect). |
| `complete` | No action needed; the lease is fully evidenced. |

If the `triage-liveness` receipt is `blocked`, agent-ready issues are not being
picked up. If the `linear-in-progress-liveness` receipt shows `reclaimed`, stale
In Progress assignments were already cleared by the watchdog.

## 3. Quarantine harmful work

The watchdog may reassign or retry a stale lease. During recovery:

- Do **not** force-merge the associated PR or bypass the merge queue.
- Do **not** manually close the Linear issue unless the issue is truly done.
- Do **not** use the recovery lane to bypass credential, security, migration,
  or consent gates.
- If a lease is `blocked`, wait for the external authority decision; do not
  fabricate the missing receipt.
- If the lease is `awaiting_verification` because CI is failing, treat the CI
  failure as the primary incident and follow the CI failure runbook first.
- Flag any in-flight autonomous PRs as `on-hold` until the delivery controller is
  healthy again.

## 4. Replay or resume safe work

If the watchdog is stopped but the associated issue is still valid, restart the
watchdog and let it refresh receipts and decide whether the lease needs retry or
reassignment:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.delivery-liveness-watchdog.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.delivery-liveness-watchdog
sleep 5
cat ~/.hermes/state/delivery-liveness/<repo>--<issue>.json
```

If the lease is stale because the PR was closed or merged without the watchdog
seeing it, manually clear the lease only after confirming the issue is
resolved or no longer being shipped:

```bash
rm ~/.hermes/state/delivery-liveness/<repo>--<issue>.json
```

If the issue needs a fresh retry (for example, the original PR failed a
verification tier and the owner wants a new attempt), the issue shipper will
write a new lease on the next admission cycle. Re-run the issue shipper only
after confirming the prior lease is removed or marked `complete`:

```bash
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
```

## 5. Reconcile ambiguous external effects

If the receipt says `healthy` but shipping is still stalled, the delivery
liveness subsystem is not the cause. Move to the runbooks for:

- `scripts/symphony/jobs/control-plane-liveness-watchdog.ts` (Mac/Gem control plane dark)
- `scripts/symphony/jobs/pipeline-scoreboard.ts` (shipper stalls)
- `.github/workflows/merge-queue-autoenroll.yml` (queue ordering stalls)

If the watchdog logs `receipt_refresh_failed` for a lease but the PR actually
exists and is healthy, check for these common ambiguous states:

- The local `gh` CLI token is stale or missing `repo` scope; the lease cannot be
  refreshed.
- The PR was transferred to a different repository; the lease `repo` field is
  stale.
- The GitHub API rate limit is exhausted; the watchdog will retry on the next
  tick.
- A `Linear active lease` comment was edited manually; the receipt parser no
  longer recognizes the envelope.

## 6. Restore / recover data

Delivery leases are durable files in `~/.hermes/state/delivery-liveness/`. If a
lease is deleted or corrupted, the issue shipper can recreate it on the next
admission cycle, but only if the issue is still eligible to ship. If you need to
preserve evidence, copy the lease before clearing state:

```bash
cp ~/.hermes/state/delivery-liveness/<repo>--<issue>.json \
   ~/.hermes/state/delivery-liveness/<repo>--<issue>.$(date +%Y%m%d-%H%M%S).json
```

The triage and Linear In Progress receipts are transient; the watchdog
regenerates them on the next run. Preserve them the same way if needed.

## 7. Verify recovery completion

After any restart or state change, verify the exact runtime:

```bash
cd "$JOVIE_REPO"
tsx scripts/symphony/jobs/delivery-liveness-watchdog.ts
ls ~/.hermes/state/delivery-liveness/
cat ~/.hermes/state/delivery-liveness/<repo>--<issue>.json
```

Confirm all of the following:

- The lease status is `complete`, or `lastReceiptAt` is within the last five
  minutes.
- `triage-liveness-latest.json` reports `status: "healthy"`.
- `linear-in-progress-liveness-latest.json` reports `reclaimed` as empty.
- The launchd log shows no new `retry_reassign_failed` or
  `receipt_refresh_failed` events for 5 minutes.
- The `verificationDeadlineAt` is in the future for any active lease.

## 8. Communicate affected-user scope

The watchdog has no direct user-facing surface, but stalled delivery leases may
delay shipped features or fixes. Post in `#alerts-critical` using the format from
`docs/ON_CALL_PROCESS.md`:

```text
[P0] Delivery liveness stalled: <issue identifier>
Status: Monitoring | Resolved
Impact: Autonomous issue shipping delayed for <issue>; no direct user outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/delivery-liveness-recovery.md
Next update: <time>
```

If a `blocked` lease was routed to an external authority (for example, `summer`),
confirm the notification packet in `~/.hermes/state/summer-notification-outbox/`
has been delivered or that the authority was notified through the correct
channel.

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with access to the Hermes-Air host and
  the `co.jovie.hermes.*` launchd units, plus the GitHub issue owner.
- **Audit:** keep shell history and the launchd logs in
  `~/.hermes/logs/launchd/`. The watchdog emits `lease_checked`,
  `retry_or_reassign`, `external_authority`, and fatal events to
  `~/.hermes/logs/jobs.jsonl`.
- **Break-glass:** if the host is unreachable, the watchdog cannot reconcile
  leases. Escalate to the owner of the Hermes-Air host. Do not run these
  commands from a non-Hermes-Air machine; the paths are host-local.
- **Safety invariant:** the watchdog does not force-merge PRs, bypass the merge
  queue, or deploy. Any process claiming to be the recovery lane that asks for
  a force-merge, credential, or schema migration is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/delivery-liveness-recovery.test.ts`. The test
checks that the runbook contains the required recovery sections and that every
repo-relative path it references exists. If a command or path changes, update the
runbook and the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/symphony/jobs/delivery-liveness-watchdog.ts`
- `scripts/symphony/lib/delivery-liveness.ts`
- `scripts/symphony/launchd/co.jovie.hermes.delivery-liveness-watchdog.plist.template`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`
