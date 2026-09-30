---
paths: ["docs/HERMES_AIR.md"]
---

# Hermes on the MacBook Air (Always-On Orchestration Node)

> Symphony is the shipping lanes harness (`scripts/lanes/README.md`). The Symphony Elixir control plane is retired from Jovie; paths written `symphony-control/...` live in the private repo JovieInc/symphony-control (full history).

Operating contract for the always-on Hermes gateway running on the dedicated 16 GB MacBook Air. This file is the canonical reference; the operator runbook lives at `docs/HERMES_AIR.md`.

## Current Role (2026-09-29): Mac Lane

Hermes was retired as Summer's runtime on 2026-09-05 and its gateway is unloaded on the Air. The Air (`tims-macbook-air`) is now the fleet's **Mac lane**, doing Mac-only work that Gem (Linux) cannot:

- **Self-hosted Actions runner** `tims-macbook-air` (labels `self-hosted, macOS, ARM64, jovie-mac`). It runs only jobs whose `runs-on` selects `jovie-mac` after a fresh `Mac Runner Heartbeat`. Today that is the iOS fast gate in `ios-ci.yml`. Any stale, busy or uncertain heartbeat falls back to hosted macOS, and the repo variable `JOVIE_MAC_RUNNER=off` forces hosted. Release regressions never run here.
- **Nightly Mac dogfood verifier:** a local launchd job running a headless Claude Code session on a clean `origin/main` worktree. It exercises the iOS simulator build, the macOS apps, and read-only production web. It files at most three `mac-dogfood` Linear issues per night and never edits, commits, pushes or merges.
- **gbrain client only.** The Air uses the ops Mac server over Tailscale with its own bearer token. It runs no gbrain server against the shared database.

The Hermes sections below describe the retired gateway and are kept for reactivation. The private Voice Memo invariants still apply to anything on the Air.

## What Hermes-Air IS

A dedicated orchestration node that:

- Ingests Telegram brain dumps into the shared company workflows.
- Retains a selected, private macOS Voice Memos shadow architecture for later activation. The watcher is disabled and must not process real memos until the activation gate below passes.
- Persists shared company context to gbrain (Air-as-server, PGLite backend, exposed over Tailscale as a remote-MCP HTTP server). Raw Voice Memo audio and transcripts are excluded from that shared store.
- Segments dumps into `memory` (gbrain only), `issue` (Linear), and `task` (sub-agent dispatch).
- Files exactly one Linear issue for engineering/product/ops work using the canonical follow-up shape from `.claude/rules/linear.md` via `symphony-control/lib/tracker-client.ts`. Linear failures queue a Linear retry and fail closed; there is no GitHub fallback or dual-write.
- Routes non-engineering tasks (calendar moves, Airtable updates, emails) to the right sub-agent which calls the appropriate MCP.
- Runs deterministic cron jobs: PR-stuck monitor, CI failure triage, HUD refresh, daily briefing, cost monitor, deterministic-tracker (self-improvement), free-model health.

## What Hermes-Air IS NOT

- **NOT a code author.** No commits, pushes, PR authoring or PR merges from unattended jobs on this node. The Mac-lane runner and dogfood verifier above may build and test in isolated worktrees but do not change code. Interactive operator sessions follow the normal repo rules.
- **NOT a GitHub Issue dispatcher.** Engineering intake is Linear-only and selection belongs to Linear-backed Symphony. The GitHub AI dispatcher/orchestrator and Pro codex issue shipper are retired.
- **NOT a hot path for product traffic.** Vercel still runs all product crons. Hermes-Air owns ops crons only.
- **NOT a backlog source of truth.** Linear is the sole canonical backlog. GitHub remains authoritative for PRs, Actions, and merge-queue evidence; Airtable, Calendar, and gbrain keep their scoped records.

## Hard Invariants

| Invariant | Enforced by |
|---|---|
| Unattended Air jobs never author code or merge PRs | Profile gate (`JOVIE_AGENT_PROFILE!=coder`) on the dogfood verifier; Actions jobs run only reviewed merge-group/main code; `orchestrator-boundary-check.sh` for any coder session |
| All admitted engineering follow-ups go through Linear | Telegram intake handlers file via the Linear-only `tracker-client.ts`; no GitHub Issue fallback or `repository_dispatch` from Air. Private voice proposals require Summer admission and sanitization first. |
| Inference cost is $0 unless user explicitly opts in | `free-model-router.ts` only selects `:free` OpenRouter variants; `cost-monitor.ts` kills non-watchdog jobs if any paid spend exceeds $0 in 24h |
| Air never serves the shared gbrain | Company gbrain is served from the ops Mac (`tims-macbook-pro:7801`, see JovieInc/gbrain `MAINTENANCE.md`); the Air is a Tailscale MCP client with its own revocable token. The private voice store stays local PGLite. |
| Voice memo source material stays private on the Air | Audio, raw transcripts, classifications, and proposals live only under non-symlinked `~/.hermes/private/` roots with `0700` directories and `0600` files. No raw shared gbrain, GitHub, Telegram, dispatch log, or repository write. |
| Voice storage is isolated from company gbrain | A dedicated no-embedding PGLite store lives at `~/.hermes/private/voice-brain/`. The adapter scrubs ambient database, Supabase, repository, sync, provider, and source variables, runs from a neutral private working directory, and requires gbrain repo write-through to report `no_repo_configured`. |
| Voice analysis is local by default | Apple transcripts are accepted only after exact database binding. Missing transcripts fall back to local Whisper. Classification uses literal-loopback Ollama. Groq transcription is disabled unless the operator explicitly sets `HERMES_VOICE_ENABLE_GROQ=1` and provides its key. |
| Voice activation fails closed | No launchd watcher or cron may run until synthetic canaries and a manual shadow review pass, a production local Whisper model is installed, and the user separately authorizes activation. A maintenance window alone does not authorize activation or processing a real memo. |
| Single heavy-job semaphore | Ollama inference and `whisper-cli` cannot run concurrently; protected by `~/.hermes/state/heavy-job.lock` |
| Telegram bot token never logged | `~/.hermes/.env` only; `bootstrap-air.sh` verifies `.env` is `chmod 600` and never copied into logs |

## Sub-Agent Profiles

Profiles are defined in `~/.hermes/config.yaml` (template at `symphony-control/config.air.template.yaml`). Each profile is a Hermes sub-agent with a scoped skill loadout and MCP allowlist. Profiles never escalate; the chief profile routes incoming intent to the right one.

| Profile | Scope | MCPs allowed | Cannot do |
|---|---|---|---|
| `chief` | default routing, clarification questions, status replies | Linear, gbrain | edit code, spend money |
| `cfo` | finance/spend/runway questions; cost monitor escalations | gbrain, Doppler (read-only), OpenRouter usage | edit code, move money, call Stripe |
| `founder-os` | fundraising, GTM, company-state, warm network recall | Airtable (fundraising base), Gmail (read+draft, not send), Calendar, gbrain | edit code, send emails without confirmation |
| `code-orchestrator` | PR triage, CI failure classification, file Linear repair issues | Linear, GitHub (PR/Actions read), gbrain | edit code, merge PRs, push branches |

## Private Voice Shadow Architecture (Selected, Disabled)

This is the selected architecture, not an active service contract:

1. Wait for the Apple recording to remain unchanged across two observations, then copy it into a content-addressed inbox under `~/.hermes/private/voice-ingest/` with restrictive permissions.
2. Read `CloudRecordings.db` in read-only/query-only mode from the recordings directory, then its parent, unless `HERMES_VOICE_MEMOS_DB` supplies the reviewed path. Query `ZCLOUDRECORDING` by exact `ZPATH` filename and read `ZUNIQUEID` plus `ZTRANSCRIPTION`. Accept exactly one row only when the resolved recording stays inside Apple's recordings root and the source audio SHA-256 equals the staged object's SHA-256. Missing database, schema, transcript, or row means transcription fallback; duplicate rows, path escape, or hash mismatch fail closed.
3. Validate the stable private copy with `ffprobe`. If Apple did not supply a verified transcript, split audio into resumable 8–12 minute chunks (10 minutes by default) and transcribe with a per-chunk timeout. Local Whisper is the default. Groq is explicit opt-in only.
4. Run extraction and classification through Ollama on a literal loopback endpoint (`http://127.0.0.1:11434/api/chat` by default), using `gemma3:4b` by default. Analysis failure defaults to `mixed` and `highly_sensitive` with zero outward proposals.
5. Write raw artifacts and private proposals only to the dedicated no-embedding PGLite store and private object root. Run the adapter with ambient database and sync variables scrubbed, from a neutral private working directory, while holding `~/.hermes/state/heavy-job.lock`.
6. Summer may later admit a constraint-relevant, sanitized company work packet. The raw audio, transcript, private classification, and unadmitted proposal never enter shared gbrain, GitHub, Telegram, or an executor prompt.

The legacy `symphony-control/jobs/voice-memo-ingest.ts` watcher is not the activation source for this architecture and must remain unloaded.

## Engineering Work Handoff (the only contract with the Pro)

1. Telegram intake, or a sanitized voice proposal explicitly admitted by Summer, is classified as an `issue` span.
2. Hermes-Air files exactly one Linear issue using the canonical follow-up shape from `.claude/rules/linear.md` (Source / Follow-up / Why it matters / Classification / Acceptance criteria). A voice-derived issue references only the sanitized private proposal receipt, never the raw memo or transcript.
3. Linear-backed Symphony selects eligible work under the Linear ownership contract.
4. GitHub Issue dispatchers and local/remote GitHub issue shippers remain retired; GitHub is used only for the resulting PR, Actions, and merge-queue evidence.
5. The PR preserves its Linear marker and `jov-XXXX` branch pattern so `linear-sync-on-merge.yml` transitions the canonical issue after merge.

If Linear is unavailable, rate-limited, or rejects the mutation, queue a Telegram-derived or already-sanitized intent in `~/.hermes/state/linear-queue.jsonl` for operator inspection and dispatch nothing. Never fall back to GitHub. A voice-derived proposal remains only in the private voice store and may be retried after service recovery without copying its raw memo or transcript into shared gbrain or the queue.

## Self-Improvement Loop

`deterministic-tracker.ts` runs nightly:

- Reads Hermes dispatch log (`~/.hermes/logs/dispatch.jsonl`).
- Clusters intents by shape (similar input → similar action).
- For any cluster firing ≥5 times in a 30-day window, files exactly one Linear issue: "Replace LLM-driven path X with deterministic script."
- Linear-backed Symphony may pick up the issue under the normal ownership contract.

This is how Hermes-Air keeps trending toward $0 model calls over time.

## Cost Contract

- **Hermes inference**: $0/mo. `free-model-router.ts` only selects `:free` OpenRouter models. Local Ollama Qwen 3 4B as fallback.
- **Hermes embeddings**: $0/mo for shared company context. The private voice store disables embeddings entirely.
- **Telegram bot**: $0/mo.
- **Tailscale**: $0/mo (free tier, 2 devices under 100-device limit).
- **gbrain**: $0/mo on the Air (client of the ops Mac server; private voice store is local PGLite).
- **Hard cap**: any paid spend >$0 in 24h triggers `cost-monitor.ts` to kill non-watchdog launchd jobs and notify Telegram. Resuming requires user confirmation.

## Workspace Topology Reminder

Per `CLAUDE.md` → Workspace Topology: this Air is the **third workspace** alongside Houston (this code repo) and Raleigh (ops/FounderOS). Ops orchestration runs on Air; code work runs on the Pro; FounderOS daily briefings sync via gbrain over Tailscale.

## Related Files

- `symphony-control/bootstrap-air.sh` — installer
- `symphony-control/config.air.template.yaml` — Hermes config template
- `symphony-control/launchd/*.plist.template` — launchd unit templates (the legacy voice-memo watcher must remain unloaded)
- `symphony-control/jobs/*.ts` — cron handlers
- `symphony-control/lib/free-model-router.ts` — cost-safe model selection
- `docs/HERMES_AIR.md` — operator runbook
- `.claude/plans/system-instruction-you-are-working-polished-gadget.md` — architecture decision record
