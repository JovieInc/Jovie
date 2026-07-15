# Hermes on the MacBook Air (Always-On Orchestration Node)

Operating contract for the always-on Hermes gateway running on the dedicated 16 GB MacBook Air. This file is the canonical reference; the operator runbook lives at `docs/HERMES_AIR.md`.

## What Hermes-Air IS

A dedicated orchestration node that:

- Ingests Telegram brain dumps into the shared company workflows.
- Retains a selected, private macOS Voice Memos shadow architecture for later activation. The watcher is disabled and must not process real memos until the activation gate below passes.
- Persists shared company context to gbrain (Air-as-server, PGLite backend, exposed over Tailscale as a remote-MCP HTTP server). Raw Voice Memo audio and transcripts are excluded from that shared store.
- Segments dumps into `memory` (gbrain only), `issue` (GitHub Issues), and `task` (sub-agent dispatch).
- Files GitHub issues for engineering/product/ops work using the canonical follow-up shape from `.claude/rules/linear.md` via `scripts/hermes/lib/tracker-client.ts` (`gh issue create`). Linear mirrors behind `TRACKER_GITHUB_ONLY` during the parallel-run window.
- Routes non-engineering tasks (calendar moves, Airtable updates, emails) to the right sub-agent which calls the appropriate MCP.
- Runs deterministic cron jobs: PR-stuck monitor, CI failure triage, HUD refresh, daily briefing, cost monitor, deterministic-tracker (self-improvement), free-model health.

## What Hermes-Air IS NOT

- **NOT a code editor.** No Claude Code sessions, no `pnpm` builds, no Conductor worktrees, no `git` commits, no PR merges from this node.
- **NOT a dispatcher for engineering work over `repository_dispatch`.** Engineering intake files GitHub issues; CI (`github-ai-orchestrator.yml`) and the Pro codex issue shipper consume them.
- **NOT a hot path for product traffic.** Vercel still runs all product crons. Hermes-Air owns ops crons only.
- **NOT a single source of truth.** Linear, GitHub, Airtable, Calendar, and gbrain are durable systems of record; Hermes-Air is a router and watcher.

## Hard Invariants

| Invariant | Enforced by |
|---|---|
| Hermes-Air never edits code or merges PRs | Profile gate (`JOVIE_AGENT_PROFILE!=coder`); `orchestrator-boundary-check.sh` hook on any Claude Code session that ever runs on Air (should be zero) |
| All admitted engineering follow-ups go through GitHub Issues | Telegram intake handlers file via `tracker-client.ts` (`gh issue create`); no `repository_dispatch` from Air. Private voice proposals require Summer admission and sanitization first. |
| Inference cost is $0 unless user explicitly opts in | `free-model-router.ts` only selects `:free` OpenRouter variants; `cost-monitor.ts` kills non-watchdog jobs if any paid spend exceeds $0 in 24h |
| gbrain stays local (Air-hosted, Tailscale-bound) | `gbrain serve --http --bind <tailscale-ip>` binds to the Tailscale interface only; no public exposure |
| Voice memo source material stays private on the Air | Audio, raw transcripts, classifications, and proposals live only under non-symlinked `~/.hermes/private/` roots with `0700` directories and `0600` files. No raw shared gbrain, GitHub, Telegram, dispatch log, or repository write. |
| Voice storage is isolated from company gbrain | A dedicated no-embedding PGLite store lives at `~/.hermes/private/voice-brain/`. The adapter scrubs ambient database, Supabase, repository, sync, provider, and source variables, runs from a neutral private working directory, and requires gbrain repo write-through to report `no_repo_configured`. |
| Voice analysis is local by default | Apple transcripts are accepted only after exact database binding. Missing transcripts fall back to local Whisper. Classification uses literal-loopback Ollama. Groq transcription is disabled unless the operator explicitly sets `HERMES_VOICE_ENABLE_GROQ=1` and provides its key. |
| Voice activation fails closed | No launchd watcher or cron may run until synthetic canaries and a manual shadow review pass, a production local Whisper model is installed, and the user separately authorizes activation. A maintenance window alone does not authorize activation or processing a real memo. |
| Single heavy-job semaphore | Ollama inference and `whisper-cli` cannot run concurrently; protected by `~/.hermes/state/heavy-job.lock` |
| Telegram bot token never logged | `~/.hermes/.env` only; `bootstrap-air.sh` verifies `.env` is `chmod 600` and never copied into logs |

## Sub-Agent Profiles

Profiles are defined in `~/.hermes/config.yaml` (template at `scripts/hermes/config.air.template.yaml`). Each profile is a Hermes sub-agent with a scoped skill loadout and MCP allowlist. Profiles never escalate; the chief profile routes incoming intent to the right one.

| Profile | Scope | MCPs allowed | Cannot do |
|---|---|---|---|
| `chief` | default routing, clarification questions, status replies | Linear, gbrain | edit code, spend money |
| `cfo` | finance/spend/runway questions; cost monitor escalations | gbrain, Doppler (read-only), OpenRouter usage | edit code, move money, call Stripe |
| `founder-os` | fundraising, GTM, company-state, warm network recall | Airtable (fundraising base), Gmail (read+draft, not send), Calendar, gbrain | edit code, send emails without confirmation |
| `code-orchestrator` | PR triage, CI failure classification, file GitHub repair issues | GitHub (read/write issues), gbrain | edit code, merge PRs, push branches |

## Private Voice Shadow Architecture (Selected, Disabled)

This is the selected architecture, not an active service contract:

1. Wait for the Apple recording to remain unchanged across two observations, then copy it into a content-addressed inbox under `~/.hermes/private/voice-ingest/` with restrictive permissions.
2. Read `CloudRecordings.db` in read-only/query-only mode from the recordings directory, then its parent, unless `HERMES_VOICE_MEMOS_DB` supplies the reviewed path. Query `ZCLOUDRECORDING` by exact `ZPATH` filename and read `ZUNIQUEID` plus `ZTRANSCRIPTION`. Accept exactly one row only when the resolved recording stays inside Apple's recordings root and the source audio SHA-256 equals the staged object's SHA-256. Missing database, schema, transcript, or row means transcription fallback; duplicate rows, path escape, or hash mismatch fail closed.
3. Validate the stable private copy with `ffprobe`. If Apple did not supply a verified transcript, split audio into resumable 8–12 minute chunks (10 minutes by default) and transcribe with a per-chunk timeout. Local Whisper is the default. Groq is explicit opt-in only.
4. Run extraction and classification through Ollama on a literal loopback endpoint (`http://127.0.0.1:11434/api/chat` by default), using `gemma3:4b` by default. Analysis failure defaults to `mixed` and `highly_sensitive` with zero outward proposals.
5. Write raw artifacts and private proposals only to the dedicated no-embedding PGLite store and private object root. Run the adapter with ambient database and sync variables scrubbed, from a neutral private working directory, while holding `~/.hermes/state/heavy-job.lock`.
6. Summer may later admit a constraint-relevant, sanitized company work packet. The raw audio, transcript, private classification, and unadmitted proposal never enter shared gbrain, GitHub, Telegram, or an executor prompt.

The legacy `scripts/hermes/jobs/voice-memo-ingest.ts` watcher is not the activation source for this architecture and must remain unloaded.

## Engineering Work Handoff (the only contract with the Pro)

1. Telegram intake, or a sanitized voice proposal explicitly admitted by Summer, is classified as an `issue` span.
2. Hermes-Air files a GitHub issue using the canonical follow-up shape from `.claude/rules/linear.md` (Source / Follow-up / Why it matters / Classification / Acceptance criteria). A voice-derived issue references only the sanitized private proposal receipt, never the raw memo or transcript.
3. Optional: add the `agent-ready` label when the issue should enter the GitHub-native orchestrator immediately.
4. The Pro codex issue shipper or `.github/workflows/github-ai-orchestrator.yml` discovers labeled/ready work — no Air-side `repository_dispatch`, no SSH.
5. PR opens with `Fixes #N` in the body; merge to `main` closes the GitHub issue (Graphite queue-land safe). `linear-sync-on-merge.yml` still mirrors to Linear until `TRACKER_GITHUB_ONLY=1`.

If the Air cannot file the GitHub issue (network down, `gh` outage), queue a Telegram-derived or already-sanitized intent in `~/.hermes/state/linear-queue.jsonl` for operator inspection. A voice-derived proposal remains only in the private voice store and may be retried after service recovery without copying its raw memo or transcript into shared gbrain or the queue.

## Self-Improvement Loop

`deterministic-tracker.ts` runs nightly:

- Reads Hermes dispatch log (`~/.hermes/logs/dispatch.jsonl`).
- Clusters intents by shape (similar input → similar action).
- For any cluster firing ≥5 times in a 30-day window, files a GitHub issue: "Replace LLM-driven path X with deterministic script."
- The Pro's runner picks up these issues like any other and proposes a code change.

This is how Hermes-Air keeps trending toward $0 model calls over time.

## Cost Contract

- **Hermes inference**: $0/mo. `free-model-router.ts` only selects `:free` OpenRouter models. Local Ollama Qwen 3 4B as fallback.
- **Hermes embeddings**: $0/mo for shared company context. The private voice store disables embeddings entirely.
- **Telegram bot**: $0/mo.
- **Tailscale**: $0/mo (free tier, 2 devices under 100-device limit).
- **gbrain**: $0/mo (local PGLite).
- **Hard cap**: any paid spend >$0 in 24h triggers `cost-monitor.ts` to kill non-watchdog launchd jobs and notify Telegram. Resuming requires user confirmation.

## Workspace Topology Reminder

Per `CLAUDE.md` → Workspace Topology: this Air is the **third workspace** alongside Houston (this code repo) and Raleigh (ops/FounderOS). Ops orchestration runs on Air; code work runs on the Pro; FounderOS daily briefings sync via gbrain over Tailscale.

## Related Files

- `scripts/hermes/bootstrap-air.sh` — installer
- `scripts/hermes/config.air.template.yaml` — Hermes config template
- `scripts/hermes/launchd/*.plist.template` — launchd unit templates (the legacy voice-memo watcher must remain unloaded)
- `scripts/hermes/jobs/*.ts` — cron handlers
- `scripts/hermes/lib/free-model-router.ts` — cost-safe model selection
- `docs/HERMES_AIR.md` — operator runbook
- `.claude/plans/system-instruction-you-are-working-polished-gadget.md` — architecture decision record
