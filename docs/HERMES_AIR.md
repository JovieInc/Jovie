# Hermes-Air Operator Runbook

Day-to-day operations for the always-on Hermes daemon running on the dedicated 16 GB MacBook Air. For the operating contract and invariants, read `.claude/rules/hermes-air.md`.

## What This Machine Is

A single-purpose orchestration node. It listens for brain dumps (Telegram + Voice Memos), persists them to gbrain, routes engineering work to Linear (the Pro's existing runner consumes it), and routes ops tasks to sub-agents. It does **zero coding**.

## First-Time Setup

```bash
# On the Air, from a clone of this repo:
./scripts/hermes/bootstrap-air.sh
```

The bootstrap script is idempotent. It will:

1. Verify Node 22 / pnpm 9.15.4.
2. Install (if missing): Hermes (`hermes-agent-rs`), gbrain CLI, Doppler, Tailscale, Ollama.
3. Pull the Ollama fallback model (`qwen3:4b-q4_K_M`).
4. Render `~/.hermes/config.yaml` from `scripts/hermes/config.air.template.yaml` + Doppler secrets.
5. Render `~/.hermes/.env` from Doppler (and `chmod 600`).
6. Install all launchd plists into `~/Library/LaunchAgents/` and bootstrap them.
7. Pause for the manual GUI step (see below).
8. Run a verification checklist and print results.

## Manual GUI Steps Required

These cannot be scripted; bootstrap will pause and instruct.

### 1. Full Disk Access for Voice Memo watcher

System Settings → Privacy & Security → Full Disk Access → enable the `tsx` binary at `~/.hermes/bin/tsx` (or whichever interpreter the launchd plist references).

Without this, the voice-memo watcher cannot read `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/`.

### 2. Tailscale auth

`sudo tailscale up` and complete the browser login. Confirm the Pro is also in the tailnet:

```bash
tailscale status | grep -E "(macbook-pro|hermes)"
```

### 3. Telegram bot creation

In Telegram, chat with `@BotFather`:

```text
/newbot
<name>: Hermes (jovie)
<username>: jovie_hermes_bot   # must be unique, ends in _bot
```

Save the token to Doppler:

```bash
TELEGRAM_TOKEN='paste-token-from-BotFather'
doppler secrets set HERMES_TELEGRAM_BOT_TOKEN="$TELEGRAM_TOKEN" \
  --project jovie-web --config dev
```

Then send the bot any message from your iPhone so it can capture your chat ID. The bootstrap script will surface the chat ID and write it to `~/.hermes/state/telegram-chat-id`.

## Required Secrets (Doppler `jovie-web/dev`)

| Secret | Purpose | Set by |
|---|---|---|
| `HERMES_TELEGRAM_BOT_TOKEN` | Telegram gateway authentication | manual (BotFather) |
| `OPENROUTER_API_KEY` | Free-model router authentication | already provisioned |
| `LINEAR_API_KEY` | Filing issues from voice/Telegram intake | already provisioned |
| `GITHUB_TOKEN` | PR-stuck / CI-failure monitors | already provisioned |
| `AIRTABLE_API_KEY` | Founder-OS profile (fundraising base) | already provisioned |
| `SENTRY_AUTH_TOKEN` | Optional: ship Hermes errors to Sentry `hermes-air` env | already provisioned |

The bootstrap script verifies every required secret is present before continuing.

## Daily Operation

Once installed, you should never need to interact with the Air directly. All control is through Telegram and Linear.

| To do this | Do this |
|---|---|
| Brain-dump an idea | Telegram the bot, or record a Voice Memo on iPhone |
| File a bug | Voice-memo "Hermes, file a Linear issue for ..." or type it |
| Ask a strategic question | Telegram the bot; the chief profile routes |
| Get a daily summary | Wait for the 07:00 briefing, or Telegram "brief me" |
| Push back rate-limited | Hermes will respond with which model it used |

## Status Checks

```bash
# All Hermes services
launchctl list | grep co.jovie.hermes

# Daemon health
curl -sf http://localhost:7800/health && echo "OK" || echo "DOWN"

# gbrain health
gbrain doctor --fast --json | jq .health

# Resident memory of all Hermes-related processes
ps -axm -o rss,command | awk '/hermes|gbrain|ollama|whisper/ { sum+=$1; print } END { printf "TOTAL: %.1f MB\n", sum/1024 }'

# Recent dispatch log
tail -50 ~/.hermes/logs/dispatch.jsonl | jq .

# Free-model rankings
cat ~/.hermes/state/model-router-rankings.json | jq .
```

## Common Operations

### Restart the daemon

```bash
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.daemon
```

### Stop all Hermes services (without disabling)

```bash
for s in $(launchctl list | grep co.jovie.hermes | awk '{print $3}'); do
  launchctl bootout gui/$(id -u)/$s
done
```

### Re-enable after stop

```bash
for plist in ~/Library/LaunchAgents/co.jovie.hermes.*.plist; do
  launchctl bootstrap gui/$(id -u) "$plist"
done
```

### Tail logs

```bash
# Daemon stdout
tail -f ~/.hermes/logs/daemon.log

# All cron job runs
tail -f ~/.hermes/logs/jobs.jsonl

# Voice memo ingest events
tail -f ~/.hermes/logs/voice-memo.jsonl
```

### Re-render config from updated Doppler

```bash
./scripts/hermes/bootstrap-air.sh --reconfigure
# then:
launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.daemon
```

## Recovery Procedures

### Daemon won't start

1. Check launchd error: `launchctl print gui/$(id -u)/co.jovie.hermes.daemon | grep -A 3 "last exit"`
2. Tail daemon log: `tail -100 ~/.hermes/logs/daemon.log`
3. Re-run bootstrap: `./scripts/hermes/bootstrap-air.sh` (idempotent)
4. If config is corrupt: `mv ~/.hermes/config.yaml ~/.hermes/config.yaml.bak && ./scripts/hermes/bootstrap-air.sh --reconfigure`

### Voice memo ingest stopped working

1. Verify Full Disk Access in System Settings → Privacy & Security (re-grant if you upgraded macOS).
2. Check the dedupe ledger isn't claiming the file: `grep <uuid> ~/.hermes/state/voice-memos-seen.json`.
3. Run the handler manually with the file: `tsx scripts/hermes/jobs/voice-memo-ingest.ts --file <path>`.

### Cost monitor killed everything

This is intentional. Something escalated to a paid model. Investigate:

```bash
cat ~/.hermes/logs/cost.jsonl | jq 'select(.cost > 0)' | tail -20
```

Once you understand the cause, fix it (likely in `free-model-router.ts` rankings), then resume:

```bash
./scripts/hermes/bootstrap-air.sh --resume-after-cost-kill
```

### gbrain unreachable from Pro

1. On Air: `tailscale ip -4` — confirm Tailscale IP.
2. On Air: `lsof -i :<gbrain-port>` — confirm `gbrain serve` is listening.
3. On Pro: update MCP config to point at `http://<air-tailscale-ip>:<port>`.

### Air rebooted

launchd handles this. All services come back automatically because `RunAtLoad: true` is set on every plist. Confirm with status checks above.

## Resource Monitoring

Target steady-state memory budget (per `.claude/plans/system-instruction-you-are-working-polished-gadget.md`):

| Process | Resident (idle) |
|---|---|
| Hermes daemon | 300–600 MB |
| gbrain serve (PGLite) | 300–600 MB |
| ruflo MCP | <100 MB |
| Ollama (model unloaded between calls) | ~0 MB idle |
| macOS baseline | ~3 GB |
| **Total idle target** | **~4–5 GB** |

If steady-state exceeds 6 GB, investigate before adding new jobs.

## Tearing Down (Hand This Machine Back)

```bash
./scripts/hermes/bootstrap-air.sh --uninstall
```

Removes all launchd plists, drops `~/.hermes/`, leaves Doppler and Tailscale alone.

## Where State Lives

| Path | What | Backup? |
|---|---|---|
| `~/.hermes/config.yaml` | Hermes daemon config (rendered from Doppler) | regenerable |
| `~/.hermes/.env` | Secrets (chmod 600) | regenerable |
| `~/.hermes/logs/` | All Hermes logs | rotate weekly via launchd |
| `~/.hermes/state/voice-memos-seen.json` | Dedupe ledger | rebuildable (worst case: re-ingest 1 day) |
| `~/.hermes/state/heavy-job.lock` | Semaphore for Ollama vs whisper | ephemeral |
| `~/.hermes/state/model-router-rankings.json` | Free-model rankings | regenerable nightly |
| `~/.gbrain/data/*.pglite` | gbrain durable store | **back up nightly** (rsync to Pro) |
| `~/Library/LaunchAgents/co.jovie.hermes.*.plist` | launchd units | regenerable via bootstrap |

The only thing worth backing up is gbrain. Everything else is regenerable from this repo + Doppler.
