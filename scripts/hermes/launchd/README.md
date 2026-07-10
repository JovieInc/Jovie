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
| `co.jovie.hermes.cron-codex-issue-shipper.plist.template` | every 15 min | Claim one open GitHub issue labeled `codex` and dispatch a coder-profile agent |
| `co.jovie.hermes.cron-pipeline-scoreboard.plist.template` | every 60 min | Write daily pipeline scoreboard to local state + gbrain, and alert on 12h shipper stalls |
| `co.jovie.hermes.cron-gbrain-health-summary.plist.template` | 07:15 local daily | Probe gbrain, write latest health summary back to gbrain, and notify ops |
| `co.jovie.hermes.cron-agent-config-health.plist.template` | every 15 min | Detect invalid Hermes/OpenClaw agent config before gateway churn |
| `co.jovie.hermes.cron-cost-monitor.plist.template` | every 60 min | Cost kill switch |
| `co.jovie.hermes.cron-daily-briefing.plist.template` | 07:00 daily | Morning briefing to Telegram |
| `co.jovie.hermes.cron-deterministic-tracker.plist.template` | 03:00 daily | Self-improvement clustering |
| `co.jovie.hermes.cron-free-model-health.plist.template` | 02:00 daily | Free-model rankings refresh |
| `co.jovie.hermes.cron-gstack-nightly-refresh.plist.template` | 03:30 daily | Refresh gstack out of band; restore the prior install and alert #product on failure |

## Houston (MacBook Pro) units

Coder/shipping loops run on Houston, not Hermes-Air. Pro-only templates live in `pro/` and are installed by `scripts/hermes/bootstrap-pro-launchd.sh` (not `bootstrap-air.sh`).

| File | Schedule | Purpose |
|---|---|---|
| `pro/co.jovie.hermes.cron-codex-kanban-ship.plist.template` | every 15 min | Launch `scripts/hermes/ship-loop.sh` → `~/.hermes/scripts/codex-kanban-ship.py` (PAUSE + gbrain gated) |
| `co.jovie.hermes.cron-codex-issue-shipper.plist.template` | every 15 min | `~/.hermes/scripts/shipper-gated-entrypoint.py` → fail-closed gbrain/grok/checkout gate → `codex-issue-shipper.ts` |

Install on the Pro:

```bash
./scripts/hermes/bootstrap-pro-launchd.sh
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-kanban-ship
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.cron-codex-issue-shipper
tail -f ~/.hermes/logs/launchd/cron-codex-kanban-ship.log ~/.hermes/logs/ship-loop.log ~/.hermes/logs/launchd/cron-codex-issue-shipper.log
```

`bootstrap-pro-launchd.sh` copies `scripts/hermes/shipper-gated-entrypoint.py` to `~/.hermes/scripts/` on every install/reconfigure. The entrypoint refuses to exec the TypeScript shipper unless the primary `~/Jovie` checkout is clean `main` at `origin/main` (after fetch); stale ticks log `stale_checkout_abort` and notify Telegram/Slack.

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
