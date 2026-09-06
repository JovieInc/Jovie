# Hermes gateway recovery runbook

**Subsystem:** `scripts/symphony/launchd/co.jovie.hermes.watchdog.plist.template` +
`scripts/symphony/bootstrap-air.sh` + the installed Hermes CLI (`ai.hermes.gateway`)

**Severity:** P0 when the gateway is unresponsive, because the Hermes-Air host
stops accepting Telegram intake, gbrain recall/ingest, and Linear/Symphony
routing.

**Owner:** on-call operator with access to the Hermes-Air Mac host and the
`co.jovie.hermes.*` launchd units.

## Entry criteria

Enter this runbook when any of the following are true:

- `hermes gateway status` fails or returns no healthy gateways.
- The `co.jovie.hermes.watchdog` launchd unit is failing, crashing, or not loaded.
- Telegram messages, gbrain queries, or Linear/Symphony cron jobs are not
  responding and the failure is on the Air host.
- `~/.hermes/logs/daemon.log` shows repeated gateway connect or auth errors.
- Bootstrap verification (`scripts/symphony/bootstrap-air.sh`) fails the gateway
  status check.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- `hermes gateway status` reports healthy gateways.
- The `co.jovie.hermes.watchdog` launchd unit is loaded and has no recent crash
  cycles.
- A simple gbrain recall or Telegram test succeeds through the gateway.
- Any restart action is confirmed idempotent (re-running the watchdog does not
  re-break a healthy gateway).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the incident.

## 1. Safe stop / kill switch

Stop the watchdog first if you are about to inspect or mutate the gateway. The
watchdog will otherwise try to restart the gateway while you are diagnosing it.

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.watchdog
```

To stop the gateway itself (do not use this to bypass auth or intake gates):

```bash
hermes gateway stop --all
```

Use the `bootout` and `stop` only when the gateway or watchdog is actively
causing harm. The watchdog only runs `hermes gateway status` and
`hermes gateway start --all`; it does not force-merge PRs, bypass the merge
queue, or deploy.

## 2. Inspect current state and blast radius

Read the gateway status and logs:

```bash
hermes gateway status
hermes gateway list
tail -n 200 ~/.hermes/logs/daemon.log
tail -n 200 ~/.hermes/logs/launchd/watchdog.log
tail -n 200 ~/.hermes/logs/launchd/watchdog.err.log
```

Check launchd status:

```bash
launchctl print gui/$(id -u)/co.jovie.hermes.watchdog
```

Check the rendered Hermes config and environment:

```bash
cat ~/.hermes/config.yaml
cat ~/.hermes/.env
```

Inspect the rendered watchdog plist to confirm the commands it runs:

```bash
cat ~/Library/LaunchAgents/co.jovie.hermes.watchdog.plist
plutil -lint ~/Library/LaunchAgents/co.jovie.hermes.watchdog.plist
```

Interpret the blast radius:

| Symptom | Likely impact |
|---|---|
| `hermes gateway status` fails | All intake, gbrain, and routing through Hermes is down. |
| Watchdog log shows repeated `start` attempts | Gateway is crashing on start; check daemon.log for the root cause. |
| Only some gateways are dark | Partial outage; the watchdog will restart only the missing ones. |
| Config or `.env` is missing | Bootstrap or Doppler rendering failed; the gateway cannot authenticate. |

## 3. Quarantine harmful work

The gateway itself does not mutate code, PRs, or deployments. During recovery:

- Do **not** use the gateway outage as a reason to bypass CI, merge gates, or
  auth checks.
- Do **not** hand-edit `~/.hermes/config.yaml` or `~/.hermes/.env` except through
  the approved bootstrap path.
- Do **not** restart the gateway without first checking `daemon.log` for an
  actionable root cause.
- Flag any in-flight autonomous PRs as `on-hold` until the gateway is healthy
  again.

## 4. Replay or resume safe work

If the gateway was stopped or the watchdog lost its unit, restart in order:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.watchdog.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.watchdog
sleep 5
hermes gateway status
```

If the gateway is still not running, start it explicitly:

```bash
hermes gateway start --all
sleep 5
hermes gateway status
```

If the watchdog plist is missing or corrupted, re-render it from the repo and
reinstall the launchd units:

```bash
cd "$JOVIE_REPO"
./scripts/symphony/bootstrap-air.sh --reconfigure
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.watchdog
```

All `kickstart`, `start`, and `bootstrap` commands are idempotent when run in
order.

## 5. Reconcile ambiguous external effects

If `hermes gateway status` reports healthy but intake is still missing, the
gateway is not the cause. Move to the runbooks for:

- `scripts/symphony/runbooks/gbrain-server-recovery.md` (gbrain health down)
- `scripts/symphony/jobs/control-plane-liveness-watchdog.ts` (control plane dark)
- `scripts/symphony/jobs/delivery-liveness-watchdog.ts` (stalled delivery leases)
- `scripts/symphony/runbooks/merge-queue-fleet-gate-recovery.md` (fleet gate
  blocked)

If the gateway status is healthy but Telegram still fails, check these common
ambiguous states:

- The Telegram bot token or chat ID changed in Doppler but `~/.hermes/.env` was
  not re-rendered; run `bootstrap-air.sh --reconfigure`.
- Tailscale is down on the Air or the Pro; the gateway may bind to the wrong
  interface.
- The Hermes binary was upgraded and the launchd plist still references an old
  path; reinstall with `bootstrap-air.sh`.
- A macOS upgrade removed Full Disk Access or disabled the launchd agent; check
  System Settings → Login Items.

## 6. Restore / recover data

This subsystem has no persistent data to restore. The gateway is a stateless
process managed by the Hermes CLI. If the plist or config is corrupted, delete
or re-render them and restart the watchdog. Preserve evidence first if needed:

```bash
cp ~/.hermes/logs/daemon.log \
   ~/.hermes/logs/daemon.$(date +%Y%m%d-%H%M%S).log
cp ~/Library/LaunchAgents/co.jovie.hermes.watchdog.plist \
   ~/Library/LaunchAgents/co.jovie.hermes.watchdog.$(date +%Y%m%d-%H%M%S).plist
```

## 7. Verify recovery completion

After any restart or state change, verify the exact runtime:

```bash
hermes gateway status
hermes gateway list
launchctl print gui/$(id -u)/co.jovie.hermes.watchdog
```

Confirm all of the following:

- `hermes gateway status` returns at least one healthy gateway.
- The watchdog log shows no new crash cycles for 5 minutes.
- A simple gbrain recall works (if gbrain is healthy):

```bash
gbrain search "symphony health" --limit 1
```

- A simple Telegram outbound test works (if the chat ID is configured):

```bash
# Use the Hermes CLI or the Telegram bot directly; expect a delivered message
```

## 8. Communicate affected-user scope

The gateway outage has no direct user-facing web surface, but it blocks
founder/ops intake and autonomous routing. Post in `#alerts-critical` using the
format from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Hermes gateway unresponsive: <host>
Status: Monitoring | Resolved
Impact: Telegram/gbrain/Symphony intake delayed; no direct web outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/hermes-gateway-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with access to the Hermes-Air Mac host
  and the `co.jovie.hermes.*` launchd units, plus the Hermes CLI installed on
  that host.
- **Audit:** keep shell history and the launchd logs in
  `~/.hermes/logs/launchd/`. The Hermes CLI writes gateway state to
  `~/.hermes/logs/daemon.log`.
- **Break-glass:** if the Air host is unreachable, the gateway cannot be
  recovered remotely. Escalate to the owner of the Hermes-Air host. Do not run
  these commands from a non-Hermes-Air machine; the launchd paths and Hermes
  config are host-local.
- **Safety invariant:** the gateway and watchdog never mutate Linear, PRs, the
  merge queue, or deployments. Any process claiming to be the recovery lane that
  asks for a credential, a force-merge, or a schema migration is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/hermes-gateway-recovery.test.ts`. The test
checks that the runbook contains the required recovery sections and that every
repo-relative `scripts/symphony/` path it references exists. If a command or
path changes, update the runbook and the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/symphony/launchd/co.jovie.hermes.watchdog.plist.template`
- `scripts/symphony/bootstrap-air.sh`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`
