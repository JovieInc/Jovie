# Hermes-Air launchd Units

Templates for the Jovie-owned launchd unit files installed by `scripts/hermes/bootstrap-air.sh`.

Each `.plist.template` uses `{{HOME}}`, `{{JOVIE_REPO}}`, `{{HERMES_BIN}}`, `{{GBRAIN_BIN}}`, `{{TSX_BIN}}`, `{{NODE_BIN_DIR}}`, and `{{TAILSCALE_IP}}` placeholders. The bootstrap script substitutes these at install time (via Python so values containing shell-special characters render safely) before copying to `~/Library/LaunchAgents/`.

The Hermes gateway itself is managed by the installed Hermes CLI as `ai.hermes.gateway`; these templates manage the Air-specific watchdog, gbrain server, and cron jobs around it.

**Supabase pool budget:** Hermes-Air's `gbrain serve` uses PGLite and does not need Postgres pool env vars. If you run a Supabase-backed gbrain on the MacBook Pro (serve/autopilot/cron), export the clamp documented in `docs/GBRAIN_POOL_BUDGET.md` in every long-lived wrapper — Codex hooks already source `scripts/lib/gbrain-pool-env.sh`.

## Units

| File | Schedule | Purpose |
|---|---|---|
| `co.jovie.hermes.watchdog.plist.template` | every 60s | Start the Hermes gateway if `hermes gateway status` fails |
| `co.jovie.hermes.gbrain-server.plist.template` | RunAtLoad + KeepAlive | `gbrain serve --http` on the Tailscale interface |
| `co.jovie.hermes.voice-memo-watcher.plist.template` | WatchPaths | New voice memo → ingest |
| `co.jovie.hermes.cron-hud.plist.template` | every 5 min | Refresh HUD snapshot |
| `co.jovie.hermes.cron-pr-monitor.plist.template` | every 10 min | Detect stuck PRs |
| `co.jovie.hermes.cron-ci-monitor.plist.template` | every 10 min | Detect CI failures on main |
| `co.jovie.hermes.cron-codex-issue-shipper.plist.template` | load/crash recovery only | Manual fallback for the event-driven GitHub/Symphony admission lanes; never polls for work |
| `co.jovie.hermes.delivery-liveness-watchdog.plist.template` | every 120s | Validate durable delivery receipts; retry/reassign active leases and reclaim Linear In Progress items after five minutes without a matching accepted-owner machine receipt |

Linear active leases are accepted only from a comment containing a
`<!-- jovie-active-lease:v1 -->` JSON envelope with `owner`, `leaseId`,
`observedAt`, and `evidence`, closed by `<!-- /jovie-active-lease -->`. The
owner must match the current assignee or delegate, and `observedAt` must be less
than five minutes old. Ordinary comments and issue `updatedAt` never refresh a
lease.

The delivery watchdog stores critical revenue/auth/runtime decision packets in
`~/.hermes/state/summer-notification-outbox/`. It never sends them. A packet is
marked `ready` only when both `HERMES_SUMMER_NOTIFICATION_DESTINATION` and
`HERMES_SUMMER_NOTIFICATION_AUTHORITY` are configured; otherwise it remains
`queued_unconfigured`.
| `co.jovie.hermes.cron-pipeline-scoreboard.plist.template` | every 60 min | Write daily pipeline scoreboard to local state + gbrain, and alert on 12h shipper stalls |
| `co.jovie.hermes.cron-gbrain-health-summary.plist.template` | 07:15 local daily | Probe the Tailscale HTTP endpoint, source freshness, and server count; write the latest health summary back to gbrain and notify ops |
| `co.jovie.hermes.cron-agent-config-health.plist.template` | every 15 min | Detect invalid Hermes/OpenClaw agent config before gateway churn |
| `co.jovie.hermes.cron-cost-monitor.plist.template` | every 60 min | Cost kill switch |
| `co.jovie.hermes.cron-daily-briefing.plist.template` | 07:00 daily | Morning briefing to Telegram |
| `co.jovie.hermes.cron-deterministic-tracker.plist.template` | 03:00 daily | Self-improvement clustering |
| `co.jovie.hermes.cron-free-model-health.plist.template` | 02:00 daily | Free-model rankings refresh |
| `co.jovie.hermes.cron-gstack-upgrade.plist.template` | 03:30 daily | Out-of-band gstack upgrade (backup/restore); agent runs stay pinned (JOV-4184) |

## Houston (MacBook Pro) units

Coder/shipping loops run on Houston, not Hermes-Air. Pro-only templates live in `pro/` and are installed by `scripts/hermes/bootstrap-pro-launchd.sh` (not `bootstrap-air.sh`).

| File | Schedule | Purpose |
|---|---|---|
| `pro/co.jovie.hermes.cron-codex-kanban-ship.plist.template` | every 15 min | Launch `scripts/hermes/ship-loop.sh` → `~/.hermes/scripts/codex-kanban-ship.py` (PAUSE + gbrain gated) |
| `co.jovie.hermes.cron-codex-issue-shipper.plist.template` | load/crash recovery only | `~/.hermes/scripts/shipper-gated-entrypoint.py` → fail-closed gbrain/selected-provider/checkout gate → `codex-issue-shipper.ts`; no periodic admit tick |

Install on the Pro:

```bash
./scripts/hermes/bootstrap-pro-launchd.sh
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-kanban-ship
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
tail -f ~/.hermes/logs/launchd/cron-codex-kanban-ship.log ~/.hermes/logs/ship-loop.log ~/.hermes/logs/launchd/cron-codex-issue-shipper.log
```

`bootstrap-pro-launchd.sh` copies `scripts/hermes/shipper-gated-entrypoint.py` to `~/.hermes/scripts/` on every install/reconfigure. The entrypoint refuses to exec the TypeScript shipper unless the primary `~/Jovie` checkout is clean `main` at `origin/main` (after fetch); stale ticks log `stale_checkout_abort` and notify Telegram/Slack.

Symphony admission is driven by `.github/workflows/fleet-gate-refresh.yml` on
CI completion, main movement, and PR eligibility/hold changes. The workflow
serializes events, bounds each admission attempt to four minutes, and writes
`symphony-event-admission-heartbeat.json`. The launchd unit has no
`StartInterval`; `ThrottleInterval` only backs off load/crash recovery and does
not create work.

Ship outcomes append to `~/.hermes/events/events.jsonl` from `codex-kanban-ship.py`.

## Logs

Every unit writes stdout/stderr to `~/.hermes/logs/launchd/<label>.log` so failures are diagnosable without `launchctl print`.

## Operating

Boot a unit:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
```

Stop a unit:

```bash
launchctl bootout gui/$(id -u)/<label>
```

Force re-run:

```bash
launchctl kickstart -k gui/$(id -u)/<label>
```

Check status:

```bash
launchctl print gui/$(id -u)/<label>
```
