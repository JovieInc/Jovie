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
| `co.jovie.hermes.cron-cost-monitor.plist.template` | every 60 min | Cost kill switch |
| `co.jovie.hermes.cron-daily-briefing.plist.template` | 07:00 daily | Morning briefing to Telegram |
| `co.jovie.hermes.cron-deterministic-tracker.plist.template` | 03:00 daily | Self-improvement clustering |
| `co.jovie.hermes.cron-free-model-health.plist.template` | 02:00 daily | Free-model rankings refresh |

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
