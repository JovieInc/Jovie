# Hermes-Air launchd Units

Templates for the launchd unit files installed by `scripts/hermes/bootstrap-air.sh`.

Each `.plist.template` uses `{{HOME}}`, `{{JOVIE_REPO}}`, `{{HERMES_BIN}}`, `{{GBRAIN_BIN}}`, `{{TSX_BIN}}`, and `{{TAILSCALE_IP}}` placeholders. The bootstrap script substitutes these at install time (via Python so values containing shell-special characters render safely) before copying to `~/Library/LaunchAgents/`.

## Units

| File | Schedule | Purpose |
|---|---|---|
| `co.jovie.hermes.daemon.plist.template` | RunAtLoad + KeepAlive | The Hermes serve daemon (gateway + sub-agents) |
| `co.jovie.hermes.watchdog.plist.template` | every 60s | Restart daemon if `/health` fails |
| `co.jovie.hermes.gbrain-server.plist.template` | RunAtLoad + KeepAlive | gbrain serve on Tailscale interface |
| `co.jovie.hermes.voice-memo-watcher.plist.template` | WatchPaths | New voice memo → ingest |
| `co.jovie.hermes.cron-hud.plist.template` | every 5 min | Refresh HUD snapshot |
| `co.jovie.hermes.cron-pr-monitor.plist.template` | every 10 min | Detect stuck PRs |
| `co.jovie.hermes.cron-ci-monitor.plist.template` | every 10 min | Detect CI failures on main |
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
