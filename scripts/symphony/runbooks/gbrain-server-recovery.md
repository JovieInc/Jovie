# gbrain server recovery runbook

**Subsystem:** `scripts/symphony/launchd/co.jovie.hermes.gbrain-server.plist.template` +
`scripts/symphony/jobs/gbrain-health-summary.ts` +
`scripts/symphony/lib/gbrain.ts` +
`scripts/symphony/bootstrap-air.sh` +
`docs/GBRAIN_POOL_BUDGET.md`

**Severity:** P0 when the gbrain HTTP server is down or degraded, because every
Hermes cron job loses durable recall/ingest and autonomous shipping loses its
shared memory layer.

**Owner:** on-call operator with access to the Hermes-Air Mac host and the
`co.jovie.hermes.gbrain-server` launchd unit.

## Entry criteria

Enter this runbook when any of the following are true:

- `curl http://<TAILSCALE_IP>:7801/health` does not return a 200 `ok` or
  `healthy` response.
- `gbrain doctor --fast` reports a failure or a health score below 0.8.
- The `gbrain-health-summary` job reports `status: "down"` or `status: "degraded"`.
- The `co.jovie.hermes.gbrain-server` launchd unit is crashing, not loaded, or
  has multiple concurrent `gbrain serve` processes.
- Hermes cron jobs repeatedly log empty recall results or failed `gbrain learn`
  calls.
- Bootstrap verification (`scripts/symphony/bootstrap-air.sh`) fails the gbrain
  health check.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- The `/health` endpoint returns `ok` or `healthy`.
- `gbrain doctor --fast` reports healthy or a score >= 0.8.
- Exactly one `gbrain serve` process is running on the expected bind/port.
- The `gbrain-health-summary` job reports `status: "healthy"`.
- A test recall and ingest round-trip succeeds.
- Any restart action is confirmed idempotent (re-running the health check does
  not re-break the server).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the incident.

## 1. Safe stop / kill switch

Stop the gbrain server launchd unit first if you are about to inspect or mutate
its state. Stopping it prevents a concurrent restart from conflicting with your
inspection.

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.gbrain-server
```

If the server is stuck or there are multiple processes, terminate all
`gbrain serve` processes:

```bash
pkill -f 'gbrain.*serve'
```

Use the `bootout` and `pkill` only when the server is actively causing harm or
is unresponsive. The gbrain server never mutates PRs, the merge queue, Linear,
or deployments.

## 2. Inspect current state and blast radius

Read the health endpoint and the doctor output:

```bash
TAILSCALE_IP="$(tailscale ip -4 | head -1)"
curl -fsS --max-time 5 "http://${TAILSCALE_IP}:7801/health"
gbrain doctor --fast
```

Check the launchd unit and logs:

```bash
launchctl print gui/$(id -u)/co.jovie.hermes.gbrain-server
tail -n 200 ~/.hermes/logs/launchd/gbrain.log
tail -n 200 ~/.hermes/logs/launchd/gbrain.err.log
```

Check the process count and bind:

```bash
pgrep -fl 'gbrain.*serve'
netstat -an | grep 7801 || lsof -i :7801
```

Run the gbrain health summary job locally:

```bash
cd "$JOVIE_REPO"
tsx scripts/symphony/jobs/gbrain-health-summary.ts
```

Read the latest persisted summary from gbrain:

```bash
gbrain get ops/gbrain-health/latest
```

Interpret the blast radius:

| Symptom | Likely impact |
|---|---|
| `/health` timeout | All gbrain clients (cron jobs, Codex hooks, Pro queries) cannot read or write memory. |
| `doctor` fails | Database/index corruption, missing migrations, or pool exhaustion. |
| Multiple `gbrain serve` processes | Port 7801 conflict; the launchd KeepAlive may be spawning duplicates. |
| `source-freshness` stale | Sync jobs are failing; memory may be outdated but not lost. |
| Pool budget exhausted | New connections rejected; see `docs/GBRAIN_POOL_BUDGET.md`. |

## 3. Quarantine harmful work

The gbrain server is a memory layer, not a code or deployment system. During
recovery:

- Do **not** use gbrain being down as a reason to bypass CI, merge gates, or
  auth checks.
- Do **not** delete the gbrain database files unless you have a verified backup
  and the data loss is authorized.
- Do **not** increase the Postgres pool size beyond the budget in
  `docs/GBRAIN_POOL_BUDGET.md` without a capacity review.
- Do **not** promote any product PR that depends on a fresh gbrain page until the
  server is healthy.
- Flag any in-flight autonomous PRs as `on-hold` until the memory layer is
  healthy again.

## 4. Replay or resume safe work

If the server was stopped or the launchd unit is missing, restart in order:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/co.jovie.hermes.gbrain-server.plist
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.gbrain-server
sleep 5
curl -fsS --max-time 5 "http://$(tailscale ip -4 | head -1):7801/health"
```

If the health endpoint still fails, check the gbrain config and environment:

```bash
cat ~/.gbrain/config.json
gbrain doctor
gbrain sources list
```

If the launchd plist is missing or corrupted, re-render it from the repo and
reinstall the launchd units:

```bash
cd "$JOVIE_REPO"
./scripts/symphony/bootstrap-air.sh --reconfigure
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.gbrain-server
```

All `kickstart`, `bootstrap`, and `curl` commands are idempotent when run in
order.

## 5. Reconcile ambiguous external effects

If `/health` returns healthy but cron jobs still fail to recall, the gbrain
server is not the cause. Move to the runbooks for:

- `scripts/symphony/runbooks/hermes-gateway-recovery.md` (gateway or auth failure)
- `scripts/symphony/jobs/control-plane-liveness-watchdog.ts` (control plane dark)
- `scripts/symphony/jobs/delivery-liveness-watchdog.ts` (stalled delivery leases)

If the server is healthy but `doctor` reports source staleness, check these
common ambiguous states:

- The upstream sync job is failing; run `gbrain sources list` and inspect the
  stale source IDs.
- The Postgres pool is at the configured budget; see `docs/GBRAIN_POOL_BUDGET.md`
  and do not raise the cap without a review.
- The gbrain binary was upgraded and the launchd plist still references an old
  path; reinstall with `bootstrap-air.sh`.
- Tailscale is down on the Air or the Pro; clients cannot reach the Tailscale IP.

## 6. Restore / recover data

gbrain is the durable source of truth for its own pages; there is no separate
restore step for a down server. If the database files are corrupted, follow the
gbrain backup/PITR documentation before replacing them. Preserve evidence first
if needed:

```bash
cp ~/.hermes/logs/launchd/gbrain.log \
   ~/.hermes/logs/launchd/gbrain.$(date +%Y%m%d-%H%M%S).log
cp ~/Library/LaunchAgents/co.jovie.hermes.gbrain-server.plist \
   ~/Library/LaunchAgents/co.jovie.hermes.gbrain-server.$(date +%Y%m%d-%H%M%S).plist
```

If the server index is damaged but the source data is intact, a gbrain rebuild
may be required. Do not rebuild during active autonomous shipping without
pausing the shipping loops first.

## 7. Verify recovery completion

After any restart or state change, verify the exact runtime:

```bash
cd "$JOVIE_REPO"
TAILSCALE_IP="$(tailscale ip -4 | head -1)"
pgrep -fl 'gbrain.*serve'
curl -fsS --max-time 5 "http://${TAILSCALE_IP}:7801/health"
tsx scripts/symphony/jobs/gbrain-health-summary.ts
```

Confirm all of the following:

- The `/health` endpoint returns `ok` or `healthy`.
- `gbrain doctor --fast` reports healthy or a score >= 0.8.
- Exactly one `gbrain serve` process is bound to the expected Tailscale IP and
  port 7801.
- The health summary job reports `status: "healthy"` with zero required-check
  failures.
- A test recall returns a non-error result (empty is acceptable if the query has
  no matches):

```bash
gbrain search "symphony health" --limit 1
```

- A test ingest or `gbrain learn` round-trip succeeds:

```bash
gbrain put ops/gbrain-recovery-test/latest <<'EOF'
---
title: gbrain recovery test
type: test
---
Recovery verification.
EOF
```

## 8. Communicate affected-user scope

The gbrain server outage has no direct user-facing web surface, but it blocks
all autonomous memory recall and learning. Post in `#alerts-critical` using the
format from `docs/ON_CALL_PROCESS.md`:

```text
[P0] gbrain server down/degraded: <host>
Status: Monitoring | Resolved
Impact: Autonomous memory/recall delayed; no direct web outage
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/gbrain-server-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** operators with access to the Hermes-Air Mac host
  and the `co.jovie.hermes.gbrain-server` launchd unit, plus the gbrain CLI and
  Tailscale network on that host.
- **Audit:** keep shell history and the launchd logs in
  `~/.hermes/logs/launchd/`. The `gbrain-health-summary` job writes the latest
  summary to gbrain under `ops/gbrain-health/latest` and logs to
  `~/.hermes/logs/jobs.jsonl`.
- **Break-glass:** if the Air host or Tailscale is unreachable, the server cannot
  be recovered remotely. Escalate to the owner of the Hermes-Air host. Do not
  run these commands from a non-Hermes-Air machine; the gbrain config and
  Tailscale paths are host-local.
- **Safety invariant:** the gbrain server and health-summary job never mutate
  Linear, PRs, the merge queue, or deployments. Any process claiming to be the
  recovery lane that asks for a credential, a force-merge, or a schema migration
  is an imposter.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/gbrain-server-recovery.test.ts`. The test checks
that the runbook contains the required recovery sections and that every
repo-relative `scripts/symphony/` path it references exists. If a command or
path changes, update the runbook and the test together in the same PR.

When you change the following files, update this runbook before merging:

- `scripts/symphony/launchd/co.jovie.hermes.gbrain-server.plist.template`
- `scripts/symphony/jobs/gbrain-health-summary.ts`
- `scripts/symphony/lib/gbrain.ts`
- `scripts/symphony/bootstrap-air.sh`
- `docs/GBRAIN_POOL_BUDGET.md`
- `scripts/symphony/launchd/README.md`
- `docs/ON_CALL_PROCESS.md`
