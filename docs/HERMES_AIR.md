# Hermes-Air Operator Runbook

Day-to-day operations for the always-on Hermes gateway running on the dedicated 16 GB MacBook Air. For the operating contract and invariants, read `.claude/rules/hermes-air.md`.

## What This Machine Is

A single-purpose orchestration node. It accepts Telegram brain dumps, persists shared company context to gbrain, routes admitted engineering work to **GitHub Issues** (Linear mirror optional via `TRACKER_GITHUB_ONLY`), and routes ops tasks to sub-agents. The selected Voice Memos path is a disabled private shadow architecture: raw audio, transcripts, classifications, and proposals do not enter shared gbrain or any outbound system. The Hermes scanner code does **zero coding** itself. The opt-in codex issue shipper can start a separate `JOVIE_AGENT_PROFILE=coder` child session for eligible open GitHub issues.

> **Voice activation state: disabled.** Do not load the legacy voice-memo launchd unit, process a real memo, or treat this maintenance window as activation approval. Activation requires synthetic canaries, a reviewed manual shadow run, a production local Whisper model, and separate user authorization.

## First-Time Setup

The current `scripts/hermes/bootstrap-air.sh` bootstraps every rendered Hermes launchd unit, including the legacy voice-memo watcher. Therefore the all-in-one bootstrap is blocked while private voice activation is disabled. Do not run it unless the legacy unit has first been excluded from the rendered launchd set. If the unit exists from an earlier installation, keep it unloaded:

```bash
launchctl bootout gui/$(id -u)/co.jovie.hermes.voice-memo-watcher 2>/dev/null || true
```

Once that exclusion is verified, the bootstrap script is idempotent. It will:

1. Verify Node 22 / pnpm 9.15.4.
2. Install (if missing): Hermes (`hermes-agent-rs`), gbrain CLI, Doppler, Tailscale, Ollama.
3. Pull the Ollama fallback model (`qwen3:4b-q4_K_M`).
4. Render `~/.hermes/config.yaml` from `scripts/hermes/config.air.template.yaml` + Doppler secrets.
5. Render `~/.hermes/.env` from Doppler (and `chmod 600`).
6. Install and bootstrap the remaining Hermes launchd plists into `~/Library/LaunchAgents/`. The legacy `co.jovie.hermes.voice-memo-watcher` must be absent from this set.
7. Pause for the non-voice manual GUI steps (see below).
8. Run a verification checklist and print results.

## Manual GUI Steps Required

These cannot be scripted; bootstrap will pause and instruct.

### 1. Full Disk Access for Voice Memo shadow review (deferred)

Do not grant a watcher Full Disk Access while voice activation is disabled. During a separately authorized manual shadow review, grant access only to the exact reviewed private adapter/interpreter, then revoke it if activation is not approved.

The reviewed adapter may read `~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/` and the Apple Voice Memos database only for the selected synthetic fixture or explicitly approved shadow input.

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

Then send the bot any message from your iPhone and read the latest private chat ID:

```bash
doppler run --project jovie-web --config dev -- \
  sh -c 'curl -fsS "https://api.telegram.org/bot${HERMES_TELEGRAM_BOT_TOKEN}/getUpdates" | jq -r ".result[-1].message.chat.id"'
```

After you know the private chat ID, save it too:

```bash
doppler secrets set HERMES_TELEGRAM_CHAT_ID="<telegram-chat-id>" \
  --project jovie-web --config dev
```

## Required Secrets (Doppler `jovie-web/dev`)

| Secret | Purpose | Set by |
|---|---|---|
| `HERMES_TELEGRAM_BOT_TOKEN` | Telegram gateway authentication | manual (BotFather) |
| `OPENROUTER_API_KEY` | Free-model router authentication | already provisioned |
| `GITHUB_TOKEN` | Filing issues + PR-stuck / CI-failure monitors | already provisioned |
| `GH_REPO` | Target repo for `gh issue create` (defaults to authenticated default) | optional |
| `LINEAR_API_KEY` | Optional Linear mirror while `TRACKER_GITHUB_ONLY` is unset | already provisioned |
| `AIRTABLE_API_KEY` | Founder-OS profile (fundraising base) | already provisioned |
| `SENTRY_AUTH_TOKEN` | Optional: ship Hermes errors to Sentry `hermes-air` env | already provisioned |
| `HERMES_TELEGRAM_CHAT_ID` | Optional: Telegram private-chat allowlist + outbound target | manual after first bot message |
| `HERMES_VOICE_ENABLE_GROQ` | Voice transcription opt-in; absent or not `1` keeps Groq disabled | manual, only after explicit approval |
| `GROQ_API_KEY` | Used only when `HERMES_VOICE_ENABLE_GROQ=1` | optional; must not be exposed to local-only voice runs |

The bootstrap script verifies every required secret is present before continuing.

## Daily Operation

Once installed, you should never need to interact with the Air directly. All control is through Telegram and GitHub Issues.

| To do this | Do this |
|---|---|
| Brain-dump an idea | Telegram the bot. You may record a Voice Memo on iPhone, but it remains in Apple Voice Memos while ingest is disabled. |
| File a bug | Type it to the Telegram bot. Voice memos cannot directly create issues. |
| Queue CI agent dispatch | Add the GitHub issue label `agent-ready` |
| Queue local coding work | Leave issue open for the codex issue shipper (or add `codex` for explicit routing) |
| Ask a strategic question | Telegram the bot; the chief profile routes |
| Get a daily summary | Wait for the 07:00 briefing, or Telegram "brief me" |
| Push back rate-limited | Hermes will respond with which model it used |

## Status Checks

```bash
# All Hermes services
launchctl list | grep -E "(co.jovie.hermes|ai.hermes.gateway)"

# Hermes gateway health
hermes gateway status

# gbrain health
TAILSCALE_IP="$(tailscale ip -4 | head -1)"
curl -sf "http://${TAILSCALE_IP}:7801/health" && echo "OK" || echo "DOWN"
gbrain doctor --fast --json | jq .health_score

# Resident memory of all Hermes-related processes
ps -axm -o rss,command | awk '/hermes|gbrain|ollama|whisper/ { sum+=$1; print } END { printf "TOTAL: %.1f MB\n", sum/1024 }'

# Recent dispatch log
tail -50 ~/.hermes/logs/dispatch.jsonl | jq .

# Codex issue shipper logs
tail -50 ~/.hermes/logs/launchd/cron-codex-issue-shipper.log
tail -50 ~/.hermes/logs/codex-issue-shipper/*.log 2>/dev/null  # after a non-dry-run agent dispatch

# Hermes/OpenClaw agent config health
tsx scripts/hermes/jobs/agent-config-health.ts
tail -50 ~/.hermes/logs/launchd/cron-agent-config-health.err.log

# Latest gbrain health summary written by Hermes
gbrain search "ops/gbrain-health/latest" --limit 3
tail -50 ~/.hermes/logs/launchd/cron-gbrain-health-summary.log \
  ~/.hermes/logs/launchd/cron-gbrain-health-summary.err.log

# Free-model rankings
cat ~/.hermes/state/model-router-rankings.json | jq .

# Voice watcher must remain absent while activation is disabled
if launchctl print gui/$(id -u)/co.jovie.hermes.voice-memo-watcher >/dev/null 2>&1; then
  echo "STOP_VOICE_WATCHER"
else
  echo "VOICE_DISABLED"
fi
```

## Common Operations

### Restart the gateway

```bash
hermes gateway restart --all
```

### Stop all Hermes services (without disabling)

```bash
hermes gateway stop --all
for s in $(launchctl list | grep co.jovie.hermes | awk '{print $3}'); do
  launchctl bootout gui/$(id -u)/$s
done
```

### Re-enable after stop

```bash
hermes gateway start --all
for plist in ~/Library/LaunchAgents/co.jovie.hermes.*.plist; do
  [[ "$plist" == *voice-memo-watcher* ]] && continue
  launchctl bootstrap gui/$(id -u) "$plist"
done
```

### Tail logs

```bash
# Gateway stdout
tail -f ~/.hermes/logs/gateway.log

# Gateway stderr
tail -f ~/.hermes/logs/gateway.error.log

# All cron job runs
tail -f ~/.hermes/logs/jobs.jsonl

# Private voice shadow receipts (only after an authorized synthetic/manual run)
find ~/.hermes/private/voice-ingest -maxdepth 2 -type f -print 2>/dev/null
```

### Re-render config from updated Doppler

The current `--reconfigure` path can load every rendered plist, including the legacy voice watcher. Do not use it while voice activation is disabled. Update only the intended rendered non-voice configuration, then restart that explicit service. Before and after the restart, run the voice-disabled status check above.

### Run the codex issue shipper once

```bash
HERMES_CODEX_SHIPPER_DRY_RUN=1 tsx scripts/hermes/jobs/codex-issue-shipper.ts
tsx scripts/hermes/jobs/codex-issue-shipper.ts
```

The job watches open GitHub issues and filters out hard-skip labels (`no-auto`, `invalid`, `type:epic`, `human-review-required`, already-claimed, or blocked). Empty runs only call GitHub, write a JSONL event, and exit. No gbrain query, model call, subagent, or CodeRabbit review starts until an eligible issue exists. Before the shipper claims a selected issue or prepares a worktree, it must complete the gbrain coordination preflight: fetch `gbrain:agent-org-chart` when available, check `shared-skills/coordination-basics/SKILL.md` when present, query for existing work/ownership, delegate through the coordination inbox if another agent owns the area, and stop with a `system-blocker` if gbrain is unreachable.

Only one shipper run may own the queue at a time. A new cron invocation takes a non-blocking singleton lock check; if another shipper is still active, the new invocation logs `singleton_active_skip` and exits. The active run keeps draining the queue in batches until no eligible issues remain, the machine is under too much pressure to launch another agent, or all remaining issues are blocked or human-gated.

UI/UX, design, taste, token, and visual-polish issues get an additional coder prompt block that loads `design-taste-frontend`, requires the design-read statement, dials, before/after evidence, narrow checks, and the checklist pass/fail in the PR body. For existing product/dashboard UI, agents use the skill's audit/checklist portions only; they must not force landing-page patterns into product UI.

Restore the external design skill in a fresh worktree only after confirming the
reviewed upstream commit. The required headless install command is intentionally
guarded so mutable upstream instructions cannot be installed silently:

```bash
test "$(git ls-remote https://github.com/Leonxlnx/taste-skill.git HEAD | awk '{print $1}')" = "06d6028b5c623016c59ce8536f578e5a1127b499" && DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 npx --yes skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" -y
```

Safe UI-only fixes can use the guarded Graphite UI fast lane from JOV-3895 only when the diff stays inside the allowed visual UI paths in `.github/MERGE_QUEUE.md`. The PR must carry `ui`, `fast-track-ui`, `fast`, and `merge-queue`, plus a `## Fast-track UI eligibility` section with `Why eligible`, `Before`, `After`, and `Checks run` evidence. The merge-queue guard fails closed for API routes, auth, billing, DB/migrations, security/CSP, infra/cron, routing behavior, package manifests, CI, and broad refactors.

Config variables:

| Variable | Default | Purpose | Update path |
|---|---:|---|---|
| `HERMES_CODEX_SHIPPER_MAX_ISSUES_PER_RUN` | `3` | Max Codex issues selected per drain batch; also caps parallel agent fan-out | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_MAX_PARALLEL_AGENTS` | `3` | Absolute cap for concurrent coder agents inside the singleton shipper run | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_MIN_FREE_MEMORY_MB` | `4096` | Below this free-memory floor, launch at most one new coder; below half this floor, launch none | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_MAX_LOAD_PER_CPU` | `1.5` | Above this one-minute load-per-CPU threshold, launch at most one new coder; above 1.5x this threshold, launch none | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_SINGLETON_LOCK_STALE_MS` | `28800000` | Long-running shipper lock TTL; new crons skip while the owning process is alive | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_INTEGRATION_THRESHOLD` | `4` | Eligible queue depth that routes trainable issues through `integration/codex-queue` | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |
| `HERMES_CODEX_SHIPPER_AGENT` | `claude` | Local coding agent binary; `claude` keeps subagent support, `codex` is available as an explicit override | Rendered non-voice plist env, then restart only `co.jovie.hermes.cron-codex-issue-shipper` |

Control labels:

| Label | Meaning |
|---|---|
| `codex` | Eligible source queue |
| `codex-in-progress` | Claimed by the local shipper |
| `codex-blocked` | Real blocker; the shipper will not retry automatically |
| `invalid` | Confirmed misroute; the shipper will not claim or retry |
| `human-review-required` | Hard skip |
| `integration-branch` | Batch trainable issues through the integration branch |

Ship now / Re-evaluate when / Then:

| Decision | Trigger | Action |
|---|---|---|
| Ship now | Default `HERMES_CODEX_SHIPPER_MAX_ISSUES_PER_RUN=3` and `HERMES_CODEX_SHIPPER_MAX_PARALLEL_AGENTS=3`, because one singleton run can keep the queue hot without duplicate cron owners | Keep up to three coder lanes active while free memory stays above 4096MB and load stays below 1.5 per CPU |
| Re-evaluate when | Cost per shipped issue rises above the weekly unit target: CI minutes x runner cost plus agent minutes x model cost, or local pressure repeatedly logs `capacity_throttled` | Lower `HERMES_CODEX_SHIPPER_MAX_PARALLEL_AGENTS`, raise machine capacity, or route more trainable issues through `integration-branch` labels |
| Then | CI minutes x runner cost plus agent minutes x model cost stay within the weekly agent budget | Keep three lanes; otherwise reduce the cap until the queue drain cost is back inside target |

## Recovery Procedures

### Gateway won't start

1. Check launchd state: `launchctl print gui/$(id -u)/ai.hermes.gateway | grep -A 3 "last exit"`
2. Tail gateway log: `tail -100 ~/.hermes/logs/gateway.error.log`
3. Run the config sentinel: `tsx scripts/hermes/jobs/agent-config-health.ts`
4. Confirm the supported Hermes gateway command works: `hermes gateway status`
5. Restart the gateway with `hermes gateway restart --all`.
6. Do not use bootstrap or `--reconfigure` as recovery while voice activation is disabled; both can load the legacy watcher. Restore a known-good `~/.hermes/config.yaml`, then start only the explicit non-voice units using the guarded loop under "Re-enable after stop."

### Agents keep failing after Telegram dispatch

Run the config sentinel before changing models or restarting services:

```bash
tsx scripts/hermes/jobs/agent-config-health.ts
tail -20 ~/.hermes/logs/jobs.jsonl | jq 'select(.job == "agent-config-health")'
```

It fails on the recurring local-agent patterns that caused OpenClaw/Hermes churn:
schema-clobbered `memorySearch` blocks in `~/.openclaw/openclaw.json`, Vercel AI Gateway embedding model names without the `openai/` prefix, and stale Hermes fallbacks such as `nex-agi/nex-n2-pro`.

### Voice memo ingest stopped working

Voice ingest is intentionally disabled. Do not restart the legacy watcher or run `scripts/hermes/jobs/voice-memo-ingest.ts` manually.

Before activation can be considered:

1. Confirm all private roots resolve beneath a non-symlinked `~/.hermes/private/`, with `0700` directories and `0600` files.
2. Confirm the dedicated store is `~/.hermes/private/voice-brain/`, embeddings are disabled, and the adapter runs from a neutral private working directory. Its gbrain subprocess environment must remove `GBRAIN_DATABASE_URL`, `DATABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_DATABASE_URL`, `GBRAIN_SOURCE`, `GBRAIN_REPO`, `GBRAIN_REPO_PATH`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `VOYAGE_API_KEY`, `ZEROENTROPY_API_KEY`, `COHERE_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, and `GROQ_API_KEY` before adding only the dedicated private configuration.
3. Confirm the pre-write gbrain repo-path check is empty and the post-write receipt is exactly `written: false, skipped: no_repo_configured`.
4. Confirm the read-only/query-only Apple database chain checks `CloudRecordings.db` in the recordings directory and then its parent, unless `HERMES_VOICE_MEMOS_DB` supplies the reviewed path. It must query `ZCLOUDRECORDING` by exact `ZPATH`, read `ZUNIQUEID` and `ZTRANSCRIPTION`, accept one row only, confine the source to the recordings root, and require source-to-staged SHA-256 equality. Missing database, schema, transcript, or row may fall back; ambiguity, path escape, or hash mismatch must fail closed.
5. Confirm local Ollama classification uses a literal loopback endpoint (`http://127.0.0.1:11434/api/chat` by default) and the locally installed `gemma3:4b` model by default. Failure must produce `mixed`, `highly_sensitive`, and zero proposals.
6. Confirm local Whisper is installed and is the default fallback. Groq must remain unavailable unless both `HERMES_VOICE_ENABLE_GROQ=1` and its key are deliberately supplied.
7. Run synthetic canaries, then one explicitly approved manual shadow input. Verify no raw shared gbrain, GitHub, Telegram, dispatch, repository, or executor output.
8. Present the receipts for user review. Only separate activation authorization may install or load a watcher.

### Cost monitor killed everything

This is intentional. Something escalated to a paid model. Investigate:

```bash
cat ~/.hermes/logs/cost.jsonl | jq 'select(.cost > 0)' | tail -20
```

Once you understand the cause, fix it (likely in `free-model-router.ts` rankings), then resume only the non-voice services:

```bash
hermes gateway start --all
for plist in ~/Library/LaunchAgents/co.jovie.hermes.*.plist; do
  [[ "$plist" == *voice-memo-watcher* ]] && continue
  launchctl bootstrap gui/$(id -u) "$plist"
done
```

### gbrain unreachable from Pro

1. On Air: `tailscale ip -4` — confirm Tailscale IP.
2. On Air: `lsof -i :<gbrain-port>` — confirm `gbrain serve --http --bind <tailscale-ip>` is listening.
3. On Pro: update MCP config to point at `http://<air-tailscale-ip>:<port>`.

### Supabase connection exhaustion (Pro-hosted company brain)

Hermes-Air runs gbrain on **PGLite** — no Postgres pool budget needed on the Air.
The shared Supabase company brain on the MacBook Pro is different: each gbrain
process multiplies pools unless clamped. See [`docs/GBRAIN_POOL_BUDGET.md`](./GBRAIN_POOL_BUDGET.md)
for `GBRAIN_POOL_SIZE`, `GBRAIN_MAX_CONNECTIONS`, and verification steps.
Codex hooks already source `scripts/lib/gbrain-pool-env.sh`; long-lived Pro
cron/launchd wrappers must export the same env.

### Air rebooted

launchd handles this. All services come back automatically because `RunAtLoad: true` is set on every plist. Confirm with status checks above.

## Resource Monitoring

Target steady-state memory budget (per `.claude/plans/system-instruction-you-are-working-polished-gadget.md`):

| Process | Resident (idle) |
|---|---|
| Hermes gateway | 300–600 MB |
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
| `~/.hermes/config.yaml` | Hermes gateway config (rendered from Doppler) | regenerable |
| `~/.hermes/.env` | Secrets (chmod 600) | regenerable |
| `~/.hermes/logs/` | All Hermes logs | rotate weekly via launchd |
| `~/.hermes/logs/codex-issue-shipper/` | Coder prompts and run logs for `codex` issue dispatches | operator-managed; prune if large |
| `~/.hermes/private/voice-ingest/` | Content-addressed audio, chunks, transcripts, classifications, proposals, and receipts | private backup only; never shared gbrain or repo |
| `~/.hermes/private/voice-brain/` | Dedicated no-embedding PGlite store for private voice records | private backup only; never shared gbrain or repo |
| `~/.hermes/state/heavy-job.lock` | Semaphore for Ollama vs whisper | ephemeral |
| `~/.hermes/state/model-router-rankings.json` | Free-model rankings | regenerable nightly |
| `~/.gbrain/data/*.pglite` | gbrain durable store | **back up nightly** (rsync to Pro) |
| `~/Library/LaunchAgents/co.jovie.hermes.*.plist` | launchd units | regenerable via bootstrap |

Back up shared gbrain and, only under the user's private-data policy, the private voice roots. Never copy private voice backups into the repository, shared gbrain, GitHub, Telegram, or general company backup paths.
