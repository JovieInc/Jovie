# Hermes on the MacBook Air (Always-On Orchestration Node)

Operating contract for the always-on Hermes daemon running on the dedicated 16 GB MacBook Air. This file is the canonical reference; the operator runbook lives at `docs/HERMES_AIR.md`.

## What Hermes-Air IS

A dedicated orchestration node that:

- Ingests brain dumps (Telegram typed messages + macOS Voice Memos transcripts via iCloud).
- Persists every dump to gbrain (Air-as-server, PGLite backend, exposed over Tailscale as a remote-MCP HTTP server).
- Segments dumps into `memory` (gbrain only), `issue` (Linear), and `task` (sub-agent dispatch).
- Files Linear issues for engineering/product/ops work using the canonical follow-up shape from `.claude/rules/linear.md`. The Pro's existing Hermes issue runner picks them up automatically — Linear is the only contract between Air and Pro for engineering work.
- Routes non-engineering tasks (calendar moves, Airtable updates, emails) to the right sub-agent which calls the appropriate MCP.
- Runs deterministic cron jobs: PR-stuck monitor, CI failure triage, HUD refresh, daily briefing, cost monitor, deterministic-tracker (self-improvement), free-model health.

## What Hermes-Air IS NOT

- **NOT a code editor.** No Claude Code sessions, no `pnpm` builds, no Conductor worktrees, no `git` commits, no PR merges from this node.
- **NOT a dispatcher for engineering work over `repository_dispatch`.** All engineering work flows through Linear issues. The Pro's existing runner consumes them.
- **NOT a hot path for product traffic.** Vercel still runs all product crons. Hermes-Air owns ops crons only.
- **NOT a single source of truth.** Linear, GitHub, Airtable, Calendar, and gbrain are durable systems of record; Hermes-Air is a router and watcher.

## Hard Invariants

| Invariant | Enforced by |
|---|---|
| Hermes-Air never edits code or merges PRs | Profile gate (`JOVIE_AGENT_PROFILE!=coder`); `orchestrator-boundary-check.sh` hook on any Claude Code session that ever runs on Air (should be zero) |
| All engineering follow-ups go through Linear | `voice-memo-ingest.ts` and Telegram intake handlers both call the Linear API directly; no `repository_dispatch` from Air |
| Inference cost is $0 unless user explicitly opts in | `free-model-router.ts` only selects `:free` OpenRouter variants; `cost-monitor.ts` kills non-watchdog jobs if any paid spend exceeds $0 in 24h |
| gbrain stays local (Air-hosted, Tailscale-bound) | `gbrain serve` binds to the Tailscale interface only; no public exposure |
| Voice memo transcripts never leave the Air | Stored only in gbrain PGLite; embedding API calls use free providers; no Supabase sync in v1 |
| Single heavy-job semaphore | Ollama inference and `whisper-cli` cannot run concurrently; protected by `~/.hermes/state/heavy-job.lock` |
| Telegram bot token never logged | `~/.hermes/.env` only; `bootstrap-air.sh` verifies `.env` is `chmod 600` and never copied into logs |

## Sub-Agent Profiles

Profiles are defined in `~/.hermes/config.yaml` (template at `scripts/hermes/config.air.template.yaml`). Each profile is a Hermes sub-agent with a scoped skill loadout and MCP allowlist. Profiles never escalate; the chief profile routes incoming intent to the right one.

| Profile | Scope | MCPs allowed | Cannot do |
|---|---|---|---|
| `chief` | default routing, clarification questions, status replies | Linear, gbrain | edit code, spend money |
| `cfo` | finance/spend/runway questions; cost monitor escalations | gbrain, Doppler (read-only), OpenRouter usage | edit code, move money, call Stripe |
| `founder-os` | fundraising, GTM, company-state, warm network recall | Airtable (fundraising base), Gmail (read+draft, not send), Calendar, gbrain | edit code, send emails without confirmation |
| `code-orchestrator` | PR triage, CI failure classification, file Linear repair issues | GitHub (read), Linear (write), gbrain | edit code, merge PRs, push branches |

## Engineering Work Handoff (the only contract with the Pro)

1. Voice memo or Telegram intake → classified as `issue` span.
2. Hermes-Air files a Linear issue using the canonical follow-up shape from `.claude/rules/linear.md` (Source / Follow-up / Why it matters / Classification / Acceptance criteria). `Source` references the gbrain entry permalink.
3. Issue is created with state `In Progress` (Hermes-Air is the agent claiming it per `.claude/rules/linear.md`).
4. The Pro's existing Hermes issue runner discovers the issue and starts work — no Air-side push, no `repository_dispatch`, no SSH.
5. PR opens on the Pro; merge transitions issue to `Done` via existing `linear-sync-on-merge.yml`.

If the Air cannot file the Linear issue (network down, Linear outage), queue the intent in `~/.hermes/state/linear-queue.jsonl` and retry every 5 minutes. Telegram notifies the user only if backlog exceeds 5 entries.

## Self-Improvement Loop

`deterministic-tracker.ts` runs nightly:

- Reads Hermes dispatch log (`~/.hermes/logs/dispatch.jsonl`).
- Clusters intents by shape (similar input → similar action).
- For any cluster firing ≥5 times in a 30-day window, files a Linear issue: "Replace LLM-driven path X with deterministic script."
- The Pro's runner picks up these issues like any other and proposes a code change.

This is how Hermes-Air keeps trending toward $0 model calls over time.

## Cost Contract

- **Hermes inference**: $0/mo. `free-model-router.ts` only selects `:free` OpenRouter models. Local Ollama Qwen 3 4B as fallback.
- **Hermes embeddings**: $0/mo. Free OpenRouter embedding models or local `sentence-transformers` (~80 MB).
- **Telegram bot**: $0/mo.
- **Tailscale**: $0/mo (free tier, 2 devices under 100-device limit).
- **gbrain**: $0/mo (local PGLite).
- **Hard cap**: any paid spend >$0 in 24h triggers `cost-monitor.ts` to kill non-watchdog launchd jobs and notify Telegram. Resuming requires user confirmation.

## Workspace Topology Reminder

Per `CLAUDE.md` → Workspace Topology: this Air is the **third workspace** alongside Houston (this code repo) and Raleigh (ops/FounderOS). Ops orchestration runs on Air; code work runs on the Pro; FounderOS daily briefings sync via gbrain over Tailscale.

## Related Files

- `scripts/hermes/bootstrap-air.sh` — installer
- `scripts/hermes/config.air.template.yaml` — Hermes config template
- `scripts/hermes/launchd/*.plist` — launchd unit files
- `scripts/hermes/jobs/*.ts` — cron handlers
- `scripts/hermes/lib/free-model-router.ts` — cost-safe model selection
- `docs/HERMES_AIR.md` — operator runbook
- `.claude/plans/system-instruction-you-are-working-polished-gadget.md` — architecture decision record
