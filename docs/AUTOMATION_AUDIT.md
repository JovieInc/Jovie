# Automation Audit — Crons, Agent Workflows, KPI Alignment

> **Issue:** JOV-1901
> **Date:** 2026-07-18 control-plane refresh (original audit: 2026-05-07)
> **Scope:** Production crons (`vercel.json` + `apps/web/app/api/cron/**`), GitHub Actions agent workflows
> **Status:** Living current-state inventory. Trigger claims below were re-checked against `.github/workflows/`; this refresh also records the bounded schedule changes made during the CI throughput repair.

---

## 0. AgentOS Follow-Up Decision

The follow-up architecture decision is captured in [`docs/AGENT_OS_ARCHITECTURE.md`](AGENT_OS_ARCHITECTURE.md).

Accepted direction:

- Use Vercel Workflow/WDK as the first durable coordinator for AgentOS v1.
- Defer Trigger.dev unless WDK fails compile, local durability, retry/queue, or operator-visibility proof points.
- Keep GitHub Actions and GStack as the required PR, review, ship, and deploy gates.
- Treat Hermes and Ruflo as execution adapters, not source of truth.
- Introduce a canonical `AgentRunArtifact` contract before adding runtime integrations.
- Keep `/hud` as a readable status board; mount dense operator workflows under `/app/admin/ops`.

No cron or workflow triggers were changed by this decision note.

### 0.1 Product memory runtime split (JOV-2705)

Creator-facing product memory uses a **separate durable stack** from internal AgentOS WDK. Canonical architecture: [`docs/MEMORY_CORE_ARCHITECTURE.md`](MEMORY_CORE_ARCHITECTURE.md). Import boundaries: [`docs/MEMORY_ADR.md`](MEMORY_ADR.md).

| Layer | Internal AgentOS | Product memory |
| --- | --- | --- |
| Durable runner | Vercel Workflow/WDK (`workflows/agent-os-dry-run.ts`) | Trigger.dev via `WorkflowRunner` when cross-step durability ships; v0 runs inline |
| Cognition | Bounded agent adapters + artifact builders | Vercel `eve` via `AgentHarness` (supersedes OpenAI Agents SDK target — #12498; AI SDK Gateway interim for chat/simple extraction) |
| Store | `AgentRunArtifact`, admin ops tables | Neon `memory_*` via `lib/memory/*` |

**Does not change §0 AgentOS direction:** WDK dry-run proof for the operator control plane remains in flight. Trigger.dev is **not** an AgentOS-WDK-failure fallback for product memory — it is the planned product workflow runner ([JOV-1945](https://linear.app/jovie/issue/JOV-1945)). No cron entries or GitHub Actions triggers were added for memory workflows in this decision.

---

## 1. Cron Registry

### Scheduled in `vercel.json` (5 entries — source of truth)

| Path | Schedule | Frequency | Enabled? | Purpose | Recommendation | Rationale |
|------|----------|-----------|----------|---------|----------------|-----------|
| `/api/cron/frequent` | `*/15 * * * *` | Every 15 min | Yes | Orchestrates 7 sub-jobs: DB warm ping, campaign drip sends, pixel retry, fan notification sends, lead discovery, Spotify alphabet cache warm, ingestion job fallback | **Keep** | Core heartbeat; consolidates what would otherwise be 7 separate scheduled routes. Well-structured with independent error handling. |
| `/api/cron/daily-maintenance` | `0 0 * * *` | Daily midnight UTC | Yes | Orchestrates 5 sub-jobs: schedule release notifications, clean orphaned photos, clean idempotency keys, billing reconciliation, data retention (Sundays only) | **Keep** | Correct consolidation pattern; all sub-jobs are maintenance work that runs daily or weekly. |
| `/api/cron/generate-insights` | `0 5 * * *` | Daily 05:00 UTC | Yes | LLM-generated analytics insights for Pro/Founding/Growth profiles with sufficient click data | **Keep — verify LLM spend** | Directly compounds product value. AI call volume is bounded to eligible profiles with `MIN_TOTAL_CLICKS` threshold. Monitor batch size as user count grows. |
| `/api/cron/process-ingestion-jobs` | `* * * * *` | Every minute | Yes | Claims up to 5 pending ingestion jobs, processes 3 concurrently | **Keep** | Per-minute cadence is appropriate for job queue drain; ingestion latency directly affects user-perceived quality. The `frequent` fallback (≤2 jobs) provides redundancy without duplicate work. |
| `/api/cron/purge-pixel-ips` | `0 3 * * *` | Daily 03:00 UTC | Yes | NULLs `client_ip` from pixel events >48h old for privacy compliance; retains `ip_hash` | **Keep** | Privacy-compliance obligation; low-cost DB update, runs once daily. |

### Standalone Route Files (orphaned from `vercel.json` — not in active schedule)

These routes exist in the codebase but have **no entry in `vercel.json`**. They function as callable sub-endpoints invoked by `frequent` or `daily-maintenance`, or as on-demand admin calls.

| Path | `maxDuration` | Called By | Status | Purpose | Recommendation |
|------|---------------|-----------|--------|---------|----------------|
| `billing-reconciliation` | 60s | `daily-maintenance` sub-job | Orphaned (no vercel.json schedule) | Standalone entry for billing reconciliation | **Keep as sub-job only** — no dedicated schedule needed; `daily-maintenance` covers it. |
| `cleanup-idempotency-keys` | 60s | `daily-maintenance` sub-job | Orphaned | Standalone entry for key cleanup | **Keep as sub-job only** |
| `cleanup-photos` | 60s | `daily-maintenance` sub-job + `helpers.ts` | Orphaned | Standalone entry for photo cleanup | **Keep as sub-job only** |
| `cleanup-sms-intents` | 60s | None detected | Orphaned | Marks expired SMS subscribe intents as `expired`; hard-deletes rows older than 24h | **Consolidate into `daily-maintenance`** — pure daily janitor work, no reason to be standalone. |
| `data-retention` | 300s | `daily-maintenance` sub-job | Orphaned | Enhanced-auth standalone entry for data retention (Sundays only) | **Keep as sub-job only** — enhanced auth path is a security feature, not a scheduling need. |
| `generate-playlist` | 120s | None detected | Orphaned | AI playlist concept generation; saves as "pending" for admin review | **Add to `vercel.json` at daily 06:00 UTC, or add to `daily-maintenance`** — currently runs never. File comment says "daily at 6 AM UTC (configured in vercel.json)" but it is missing. |
| `monitor-metadata-submissions` | 60s | None detected | Orphaned | Polls third-party pages (AllMusic, Amazon) for metadata drift | **Add to `vercel.json` at hourly cadence if feature is active** — comment documents intended hourly schedule but no entry exists. |
| `pixel-forwarding` | 60s | `frequent` sub-job | Orphaned | Forwards up to 500 pixel events to ad platforms (FB, Google, TikTok) | **Keep as sub-job only** |
| `process-campaigns` | 60s | `frequent` sub-job | Orphaned | Processes drip campaign sends | **Keep as sub-job only** |
| `process-metadata-submissions` | 60s | None detected | Orphaned | Sends queued metadata submissions to DSPs | **Add to `vercel.json` or `frequent`** if metadata-submission feature is enabled for users. Currently runs never. |
| `process-pre-saves` | default (30s) | None detected | Orphaned | Processes Spotify pre-saves where release date has passed; up to 500/run | **Add to `vercel.json`** — pre-save processing is time-sensitive (release day) and currently not running on any schedule. |
| `schedule-release-notifications` | 60s | `daily-maintenance` sub-job | Orphaned | Schedules notifications for releases dropping in next 24h | **Keep as sub-job only** |
| `send-release-notifications` | 120s | `frequent` sub-job | Orphaned | Sends notifications; recovers stuck rows; max 100/run | **Keep as sub-job only** |
| `summarize-interviews` | 300s | None detected | Orphaned | Summarizes pending user interviews via Claude Haiku | **Add to `frequent` or `vercel.json` at 5-min interval** — file comment says "every 5 minutes" but no schedule exists. Interviews stall silently in `pending` state. |

**Discrepancy with `docs/CRON_REGISTRY.md`:** The registry lists `process-pre-saves` as having "no Vercel schedule" but implies it should have one. `generate-playlist`, `monitor-metadata-submissions`, `process-metadata-submissions`, and `summarize-interviews` are not mentioned in the existing registry at all. The registry should be updated to match this audit.

---

## 2. Agent Workflow Registry

Declared YAML triggers describe workflow capability, not the repository's live
GitHub enablement state. During the PR-drain rollout, enable only **Merge Queue
Auto-Enroll** and **Auto-Ready Agent Drafts** first. Enable **Main CI Health
Monitor** and **Main Autofix** only after the staged queue and production path
have produced bounded proof. Keep **GitHub AI Orchestrator**, **Agent Pipeline**,
**PR Conflict Handler**, **Agent Tick**, **Stuck Draft Auto-Close**, **Auto-Fix
Lint on Agent Drafts**, **Taste Classifier**, **Taste Label Guard**, **Auto-PR on
Agent Push**, and the legacy **Release Loop** disabled throughout the drain. The new **Production
Controller**, **Production Controller Health**, and **Production Release**
workflows are intended to register active on land; verify that state explicitly
before treating production delivery as continuous. Merging workflow files does
not re-enable an existing disabled workflow. At rollout preparation, GitHub AI
Orchestrator workflow ID `306926687` was verified `disabled_manually`. Runner
Health Monitor workflow ID `307794302` was verified `disabled_manually` after
the legacy repository-variable mutation failed with HTTP 403; keep it disabled
until the observer-only definition lands and is proven.

### GitHub Actions — Agent/Automation Workflows

| Workflow | File | Trigger | What It Does | Usage Pattern | Recommendation |
|----------|------|---------|--------------|--------------|----------------|
| **GitHub AI Orchestrator** | `github-ai-orchestrator.yml` | GitHub issue receives `agent-ready` + `workflow_dispatch` replay | Implements one eligible GitHub issue, pushes a branch, and opens a PR; capacity-gated at 5 open agent PRs | Verified `disabled_manually` (workflow ID `306926687`) at rollout preparation | **Keep disabled during drain** — do not admit new agent work while draining existing PRs |
| **GitHub AI Dispatcher** | `github-ai-dispatcher.yml` | `workflow_dispatch` only | Scans `agent-ready` GitHub issues and dispatches bounded orchestrator replays | Manual recovery | **Manual-only** — no active polling schedule |
| **Linear AI Dispatcher** | retired (workflow removed) | none | Legacy scheduled Linear polling loop | none | **Retired** — no active `linear-ai-dispatcher.yml` exists |
| **Hermes CLI Worker** | `hermes-cli-worker.yml` | `repository_dispatch` (`hermes_cli_worker`) + `workflow_dispatch` | Runs a self-hosted CLI worker (codex-cli, claude-code, or ruflo) on Hermes tasks; supports kinds: investigation, bug_patch, code_review, qa, triage, support_draft | Recently shipped (PR #8092); triggered on-demand | **Keep — enable if self-hosted runner is ready** — requires `[self-hosted, hermes]` runner. Verify runner is operational before routing work here. |
| **Merge Queue Auto-Enroll** | `merge-queue-autoenroll.yml` | PR/CI/main events + manual; no schedule | Revalidates the exact current head and enrolls eligible PRs into GitHub's native merge queue | First controller enabled during drain | **Keep enabled first** — canonical queue enrollment owner |
| **Auto-Ready Agent Drafts** | `auto-ready-agent-drafts.yml` | PR/CI events + manual; no schedule | Promotes only the exact current draft head after canonical source gates pass | First controller enabled during drain | **Keep enabled first** — canonical draft promotion owner |
| **Agent Pipeline** | `agent-pipeline.yml` | `workflow_run` (CI completes) | Unified: (1) fixes agent PRs after CI failures (up to 5 attempts/SHA), (2) auto-approves + enables auto-merge when all gates pass | Disabled throughout drain; trigger is declarative only | **Keep disabled during drain** — avoid a second repair/enrollment owner |
| **Main Autofix** | `main-autofix.yml` | `workflow_run` after an unhealthy Main CI monitor + guarded `workflow_dispatch` | Runs only after CI `run_attempt >= 2` and positive proof that no exact-SHA repair owner exists; records workflow-bound ownership before fixed-runner work, counts only recent durable ownership (never healthy/skipped workflow invocation) toward cross-SHA escalation, gives orphaned markers a 30-minute consistency grace, counts cancelled/expired leases toward a 3-attempt cap, and terminally acknowledges no-PR outcomes | Disabled initially; enable only after queue/production proof | **Activation-gated** — bounded exact-SHA ownership prevents repair fanout, timeout loops, and permanent deadlock |
| **Main CI Health Monitor** | `main-ci-health-monitor.yml` | Declared `8,28,48 * * * *` UTC + manual | Detects stalled/failing main CI, issues one failed-job rerun, suppresses duplicate schedule alerts/dispatch for active or terminal exact-SHA repair, and durably deduplicates repair-state uncertainty notification | Disabled initially; enable with Main Autofix after proof | **Activation-gated** |
| **Runner Health Monitor** | `runner-health-monitor.yml` | Declared every 10 minutes + manual | Hosted read-only Runner Heartbeat observer; CI selects fixed or hosted unit capacity per run and never waits for repository-variable mutation | Verified `disabled_manually` (workflow ID `307794302`) after legacy HTTP 403 | **Re-enable only after observer-only proof** |
| **Sentry Autofix** | `sentry-autofix.yml` | `repository_dispatch` (`sentry-issue`) | Receives Sentry error payload, calls Claude Code to fix root cause, opens auto-merge PR with dedup | Event-driven; fires when Sentry webhook delivers | **Keep** — directly compounds product stability KPI |
| **Nightly Tests** | `nightly-tests.yml` | `30 23 * * *` America/Los_Angeles + manual | Runs Knip dead-code audit, full unit test suite, E2E suite (including Design V1 canary and full-surface chaos), Slack alerts on failure | Daily; at least a 90-minute buffer before the 09:00 UTC screenshot/Tuesday harness lanes | **Keep** — only place full E2E and dead-code audits run; flags regressions before they compound |
| **Nightly Testing Agent** | `nightly-testing-agent.yml` | Scheduled `30 4 * * *` PT | Risk-ranked target selection, unit telemetry normalization, Stryker mutation hotspots, commits `docs/NIGHTLY_TESTING_AGENT_REPORT.md`, publishes Redis ops snapshot for `/app/admin/ops` | Daily | **Keep** — deterministic, LLM-free regression intelligence loop (JOV-1870) |
| **Synthetic Monitoring** | `synthetic-monitoring.yml` | Every 6 hours + manual dispatch | Front-door, Better Auth production account, onboarding, and public-profile canaries against `jov.ie`; the account canary creates one exact throwaway identity and transactionally proves zero residue | Independent production health lane | **Keep** — isolated from the retired Agent Tick monolith and outside deploy-blocking CI |
| **Cost Anomaly Gate** | `cost-anomaly-gate.yml` | Declared `*/15 * * * *` UTC + manual | Alert-only Sentry event-volume observer; opens one deduplicated incident and never mutates production | Every 15 minutes only when the workflow is explicitly enabled and Production secrets resolve | **Keep activation-gated** — verify workflow state and secrets before relying on continuous coverage |
| **Linear Sync on Merge** | `linear-sync-on-merge.yml` | `pull_request` (closed) | Extracts Linear issue marker from merged PR, transitions issue to Done, posts merge SHA comment | Per-merge | **Keep** — closes the Linear state loop for all merged PRs, not just agent ones |
| **Auto-PR on Agent Push** | `auto-pr-on-push.yml` | `push` to `codex/**`, `codegen-bot/**`, `linear/**`, `claude/**`, `*/jov-**` | Creates draft PR when agent pushes branch without an existing PR; extracts Linear ticket ID | Disabled throughout drain; trigger is declarative only | **Keep disabled during drain** — avoids admitting new work while draining the queue |
| **Agent PR Verify Ready** | retired (workflow disabled and removed) | none | Duplicated source-PR verification and promoted drafts from stale event runs | none | **Retired** — canonical `CI / PR Ready` plus the current-head Auto-Ready controller own this transition without a second CI fanout |
| **Auto-Resolve Conflicts** | retired (workflow disabled and removed) | none | Merged `main` into PR branches from label events | none | **Retired** — conflict remediation uses the exact-head GitHub Update Branch `REBASE` path; no automatic merge commit or force-push controller remains |
| **Neon Scheduled Cleanup** | `neon-scheduled-cleanup.yml` | `workflow_dispatch` only | Cleans up orphaned Neon ephemeral branches from E2E / nightly runs | Manual | **Manual-only** — no active schedule |
| **Neon Ephemeral Branch Cleanup** | `neon-ephemeral-branch-cleanup.yml` | Event-driven (PR close) | Deletes Neon branch created for a PR when PR closes | Per-PR close | **Keep** |
| **Periodic Evals** | `evals-periodic.yml` | `workflow_dispatch` with typed `RUN_LIVE_EVALS` confirmation | Runs legacy live LLM eval tests; builds Docker image | Manual-only, concurrency 1 | **Keep manual-only** — no scheduled live-eval spend; verify coverage before any scheduled trigger returns |
| **CI** | `ci.yml` | source PR, native `merge_group`, `main`, and explicit manual dispatch | Source fast gate; exact combined-head integration; queue-proof reuse or direct-main fallback; release-readiness handoff to the production controller | Stage-specific | **Keep** — production mutation is owned outside CI by the fixed controller lease |
| **Sentry Error Gate** | `sentry-error-gate.yml` | Reusable `workflow_call` | 5-minute soak watching Sentry for error spikes post-deploy; triggers rollback if spike detected | Called by deploy flow | **Keep** |
| **Canary Health Gate** | `canary-health-gate.yml` | Reusable `workflow_call` | Verifies staging health before production promotion | Called by CI deploy flow | **Keep** |
| **CodeQL** | `codeql.yml` | `push: main`, `36 5 * * *` UTC, manual | GitHub-native static analysis security scan | Post-merge + nightly | **Keep** |
| **Security** | `security.yml` | `push: main`, `5 6 * * *` UTC, manual | Additional security scanning | Post-merge + nightly | **Keep** |
| **SonarCloud** | `sonarcloud.yml` | `0 7 * * *` UTC + manual | Code quality + security analysis | Nightly | **Keep** |
| **Actionlint** | `actionlint.yml` | Push/PR | Lints `.github/workflows/*.yml` for errors | Per-PR | **Keep** |
| **Desktop Release** | `desktop-release.yml` | Push/tag | Electron app build and auto-update CI | Per-release | **Keep** |
| **iOS CI** | `ios-ci.yml` | Push/PR | iOS app build | Per-PR | **Keep** |
| **E2E Full Matrix** | `e2e-full-matrix.yml` | `15 15 * * 1` UTC + manual | Full E2E matrix run across browsers | Weekly / on-demand | **Keep** |
| **Screenshots** | `screenshots.yml` | path-filtered `push: main`, `0 9 * * *` UTC, manual | Generates product screenshots and opens/updates the screenshot PR | Post-merge + daily | **Keep** |
| **Fork PR Gate** | `fork-pr-gate.yml` | `pull_request` from fork | Safety gate for external fork PRs | Per-fork-PR | **Keep** |

---

## 3. KPI Alignment Check

Founder priorities (current cycle): **product stability → design system transfer → agentic ops lock → demo video + GTM (paused 2-3 days)**.

### Automations that compound founder work toward KPIs

| Automation | KPI Impact | Mechanism |
|------------|-----------|-----------|
| `github-ai-orchestrator` | Agentic ops lock, design system transfer | Event-driven GitHub issue → implementation → PR pipeline |
| `main-autofix` + `main-ci-health-monitor` | Product stability | Catches and fixes red main without founder interrupt; 3-attempt cap prevents runaway |
| `sentry-autofix` | Product stability | Closes the production-error → fix loop automatically; each Sentry issue that gets auto-fixed is one fewer interrupt for the founder |
| `agent-pipeline` (auto-approve + auto-merge) | All KPIs | Reduces PR review queue backlog; agent-generated code flows to production without founder bottleneck when quality gates pass |
| `synthetic-monitoring` | Product stability | Catches production regressions between deploys; alerts without requiring the founder to manually health-check |
| `nightly-tests` (Design V1 canary) | Design system transfer | Catches Design V1 flag regressions nightly; ensures the flagged surfaces don't silently break as the system rolls out |

### Automations that do not currently compound KPIs (could be paused)

| Automation | Current Status | Pause Risk |
|------------|---------------|------------|
| `Periodic Evals` (`evals-periodic.yml`) | Manual-only with `RUN_LIVE_EVALS` confirmation | Low — no scheduled spend. If this returns to a schedule, add measured per-run cost and current product-surface coverage before relying on results. |
| `generate-playlist` cron route | Missing from `vercel.json` (runs never) | None — it's already not running. Decide if AI playlist feature is active before adding schedule. |
| `monitor-metadata-submissions` cron route | Missing from `vercel.json` (runs never) | None — not running. Add schedule only if metadata-submission feature is user-facing. |

### Top 3 KPI-compounding automation gaps

**Gap 1 — Summarize-interviews is silently stalled (product stability + agentic ops)**
`/api/cron/summarize-interviews` is coded and ready but has no Vercel cron entry. The comment says "every 5 minutes." Interview data sits in `pending` state indefinitely. If user interviews are being collected (even by internal testing), the summarization pipeline never runs. Fix: add `summarize-interviews` to `frequent` as a new sub-job, or add a `vercel.json` entry at `*/5 * * * *`.

**Gap 2 — Pre-save processing has no schedule (product quality)**
`/api/cron/process-pre-saves` is not in `vercel.json`. Spotify pre-saves expire or go stale on release day if not processed promptly. This is user-facing: fans who pre-saved an album should get a library addition on release day. Adding it to `vercel.json` at `*/30 * * * *` or incorporating it into `frequent` (runs when release day matches) would close this gap.

**Gap 3 — No automated "agentic ops health" report (agentic ops lock)**
There is no workflow that reports the weekly health of the agent pipeline itself: how many issues were dispatched, how many PRs auto-merged, how many required `needs-human`, what the average time-to-merge was. The existing `pr-comment-hardening-retro` Codex automation (`scripts/pr-comment-retro.mjs`) covers agent mistake patterns from review comments, but not throughput metrics. A weekly Monday GitHub Actions job that queries the Linear API and GH PR list and posts a summary to Slack would give the founder a signal on whether the agentic ops investment is paying off — without adding any API cost beyond Linear + GH queries.

---

## 4. OpenRouter Free-Model Routing

| Cron / Agent | Current Model | Substitution Candidate | Acceptable? | Notes |
|---|---|---|---|---|
| `generate-insights` | Unknown (check `lib/services/insights/insight-generator.ts`) | `google/gemini-flash-1.5:free` or `meta-llama/llama-3.1-8b-instruct:free` | Maybe — flag for review | Insights are a Pro feature; output quality matters. Free models are worth A/B testing against current output before switching. |
| `summarize-interviews` | Claude Haiku (`summarize-interviews` comment) | `google/gemini-flash-1.5:free` | Likely yes for internal interviews | Summarization is a structured extract task; free Gemini Flash handles it well. Use for internal/admin interviews; keep Haiku for user-facing summaries if quality bar is high. |
| `generate-playlist` | Unknown (check `lib/playlists/pipeline.ts`) | `meta-llama/llama-3.1-8b-instruct:free` | Maybe | Playlist concept generation is creative; output quality is visible to admins. Test before switching. |
| `linear-ai-orchestrator` (Claude Code action) | Claude Sonnet (Anthropic) | Not substitutable | No | Full code implementation requires strong reasoning. Claude Code OAuth token is a different billing vector (Anthropic usage, not OpenAI). Do not substitute. |
| `main-autofix` (Claude Code action) | Claude Sonnet (Anthropic) | Not substitutable | No | Red-main fix requires strong code reasoning; wrong fixes compound the problem. Do not substitute. |
| `sentry-autofix` (Claude Code action) | Claude Sonnet (Anthropic) | Not substitutable | No | Same as above. |
| `agent-pipeline` fix job (Claude Code action) | Claude Sonnet (Anthropic) | Not substitutable | No | Same as above. |

**Summary:** The remaining LLM-using cron routes are worth testing with free models on a staging branch before committing.

---

## 5. Cost Guardrail Summary

### Current cron/agent API call volumes

| Route / Workflow | External API | Calls per Run | Runs per Day | Est. Daily Calls | Scaling Factor | Concern Level |
|---|---|---|---|---|---|---|
| `frequent` → `leadDiscovery` | SerpAPI (lead discovery) | Variable (per lead) | 96 (every 15 min) | Gated on `leadPipelineSettings.enabled` | O(leads found) | **Monitor** — SerpAPI costs real money; confirm `enabled` gate is off unless GTM is active |
| `frequent` → `campaigns` | Email provider (Resend) | Per drip send | 96 | Proportional to active campaign enrollments | O(active campaigns) | Low at current scale |
| `frequent` → `pixelRetry` / `pixel-forwarding` | FB/Google/TikTok pixel endpoints | Up to 500 events | 48 (minute ≥30 runs) | Up to 24,000 pixel forwards | O(pixel events) | Low — batch forwarding, not per-user API calls |
| `generate-insights` | LLM API | Per eligible profile | 1 | O(Pro+ users with clicks) | O(users) | **Monitor as Pro user count grows** |
| `summarize-interviews` | Claude Haiku | Per pending interview | 0 (not scheduled!) | 0 | O(interviews) | Currently zero cost (not running) |
| `synthetic-monitoring` | Jovie, Vercel, Cloudflare OTP, Resend, Neon | Per run: one email, two Vercel lookups, two build-info reads, bounded OTP polling, scoped account/session DB writes + cleanup, and a max-5 stale-canary reconciliation query | 4/day (every 6 hours) | 4 emails/day plus bounded API/DB traffic; Playwright retries only on failure | O(1) | Low but no longer read-only; monitor Resend volume and cleanup failures |

### Quiet cost concern

**Lead discovery in `frequent` is the highest-risk recurring cost.** If `leadPipelineSettings.enabled` is `true` in production, SerpAPI is called on every 15-minute tick (96 calls/day). SerpAPI charges per search. Verify the gate is `false` while GTM is paused. When GTM resumes, document the expected SerpAPI call volume and cost per 1,000 users in the PR that re-enables it.

### Activation and recurring-cost boundary

This document does not enable workflows. The topology changes modify declared
workflow behavior, but repository enablement remains an explicit operator step.
No new model-spend loop is introduced; hosted schedules and production
controllers must be verified against their documented activation gates before
their recurring usage is treated as live.

### Cost Impact for any new automation ideas

Any new cron or agent loop added based on this audit must include a Cost Impact section per `docs/CRON_REGISTRY.md` and `.claude/rules/infra.md` guardrails:

```markdown
## Cost Impact
- External API calls: ~X calls/day to [Service] (X calls/run × Y runs/day)
- Monthly projection: ~X calls/month at current user count
- Scaling factor: O(1) / O(users) / O(records) per run
- Monthly cost estimate: $X based on [pricing tier]
```

---

## Appendix: Files Audited

### Cron routes (`apps/web/app/api/cron/`)
- `billing-reconciliation/route.ts`
- `cleanup-idempotency-keys/route.ts`
- `cleanup-photos/route.ts` + `helpers.ts`
- `cleanup-sms-intents/route.ts`
- `daily-maintenance/route.ts`
- `data-retention/route.ts`
- `frequent/route.ts`
- `generate-insights/route.ts`
- `generate-playlist/route.ts`
- `monitor-metadata-submissions/route.ts`
- `pixel-forwarding/route.ts`
- `process-campaigns/route.ts`
- `process-ingestion-jobs/route.ts`
- `process-metadata-submissions/route.ts`
- `process-pre-saves/route.ts`
- `purge-pixel-ips/route.ts`
- `schedule-release-notifications/route.ts`
- `send-release-notifications/route.ts`
- `summarize-interviews/route.ts`

### GitHub Actions workflows (`.github/workflows/`)
All 28 files audited. Agent-relevant workflows called out in Section 2.

### Reference docs
- `apps/web/vercel.json` (schedule source of truth)
- `docs/CRON_REGISTRY.md` (existing registry — discrepancies noted)
