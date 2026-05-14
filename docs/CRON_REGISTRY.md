# Cron Job Registry

> **Question this answers:** "What scheduled jobs already run? Can I add my logic to an existing one?"
>
> Before creating a new cron job, read [AGENTS.md — Infrastructure & Scheduling Guardrails](../AGENTS.md#infrastructure--scheduling-guardrails-critical).

## Codex Workspace Automations

These are local Codex automations for agent workflow hygiene. They are not production app crons, do not run in Vercel, and must not add routes under `apps/web/app/api/cron/*`.

| Name | Schedule | Purpose | Source |
|------|----------|---------|--------|
| `PR Comment Hardening Retro` (`pr-comment-hardening-retro`) | Mondays 09:00 America/Los_Angeles | Scans recent PR review comments, reports repeated agent mistake classes, and may open draft PRs only for bounded docs/tests/skill hardening. | Codex automation using `scripts/pr-comment-retro.mjs` |

Before adding another Codex workspace automation, inspect existing Codex automations and repo schedules. Combine with this retro only when the job is about converting review feedback into durable agent hardening; keep product or production scheduling in the Vercel cron registry below.

## GitHub Actions Schedule

Scheduled workflows in `.github/workflows/`. Not Vercel crons — these run on GitHub-hosted runners.

| Workflow | Schedule | Purpose | Source |
|----------|----------|---------|--------|
| `Nightly Tests` | `0 2 * * *` PT | Full unit + E2E suite, Knip dead-code audit. Alerts on failure. | `.github/workflows/nightly-tests.yml` |
| `Test Coverage Audit` | `0 6 * * *` UTC | Regenerates [`docs/TEST_COVERAGE_HEATMAP.md`](TEST_COVERAGE_HEATMAP.md) from [`TEST_RISK_REGISTER.md`](TEST_RISK_REGISTER.md) + v8 coverage. Commits if changed. | `.github/workflows/test-coverage-audit.yml` |
| `Neon Ephemeral Branch Cleanup` | (see workflow) | Reaps Neon branches created by per-PR ephemeral DB tests. | `.github/workflows/neon-ephemeral-branch-cleanup.yml` |

## Production Schedule

Source of truth: `vercel.json` (repo root — Vercel reads this file; `apps/web/vercel.json` has been deleted per JOV-1901 / AUTOMATION_AUDIT.md)

| Cron Path | Schedule | Frequency |
|-----------|----------|-----------|
| `/api/cron/frequent` | `*/15 * * * *` | Every 15 minutes |
| `/api/cron/daily-maintenance` | `0 0 * * *` | Daily at midnight UTC |
| `/api/cron/generate-insights` | `0 5 * * *` | Daily at 05:00 UTC |
| `/api/cron/process-ingestion-jobs` | `* * * * *` | Every minute |
| `/api/cron/purge-pixel-ips` | `0 3 * * *` | Daily at 03:00 UTC |
| `/api/cron/summarize-interviews` | `*/5 * * * *` | Every 5 minutes |
| `/api/cron/generate-playlist` | `0 6 * * *` | Daily at 06:00 UTC |
| `/api/cron/process-pre-saves` | `0 2 * * *` | Daily at 02:00 UTC |
| `/api/cron/monitor-metadata-submissions` | `0 * * * *` | Hourly |
| `/api/cron/process-metadata-submissions` | `0 4 * * *` | Daily at 04:00 UTC |

9 paths are currently scheduled in production. `cleanup-sms-intents` was folded into `daily-maintenance` as a sub-job per JOV-1901 (see AUTOMATION_AUDIT.md). Other cron route files exist as standalone endpoints whose logic is called as sub-jobs of `frequent` or `daily-maintenance`.

**Auth:** All crons use `Authorization: Bearer ${CRON_SECRET}`. The `data-retention` route additionally uses timing-safe comparison + origin verification.

---

## Consolidated: `/api/cron/frequent`

**maxDuration:** 60s | Orchestrates sub-hourly jobs in a single cold start. Each sub-job has independent error handling.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | dbWarmPing | Every invocation | `SELECT 1` to keep Neon compute from auto-suspending |
| 2 | campaigns | Every invocation | `processCampaigns()` (drip sends) + `cleanupExpiredSuppressions()` |
| 3 | pixelRetry | `minute >= 30` | Retries pending pixel event forwarding to ad platforms (FB, Google, TikTok) |
| 4 | scheduleNotifications | Every invocation | Finds releases dropping in next 24h, creates `fanReleaseNotifications` rows |
| 5 | sendNotifications | Every invocation | Sends pending release-day fan notifications via email |
| 6 | leadDiscovery | Every invocation | SerpAPI lead discovery, qualification, auto-approve (gated on `leadPipelineSettings.enabled`) |
| 7 | outreach | Every invocation | Sends a batch of pending outreach emails after auto-approve |
| 8 | alphabetCache | `hour % 6 === 0 && minute < 15` | Warms Spotify alphabet cache |
| 9 | ingestionFallback | If elapsed < 50s | Claims/processes up to 2 ingestion jobs as fallback for dedicated cron |

Source: `apps/web/app/api/cron/frequent/route.ts`

## Consolidated: `/api/cron/daily-maintenance`

**maxDuration:** 300s | Runs once daily at midnight UTC.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | cleanupPhotos | Every day | Deletes orphaned `profilePhotos` (failed uploads >1-24h) + Vercel Blobs |
| 2 | cleanupKeys | Every day | Deletes expired `dashboardIdempotencyKeys` |
| 3 | billingReconciliation | Every day | Reconciles DB subscription status with Stripe; fixes mismatches |
| 4 | cleanupSmsIntents | Every day | Marks expired SMS subscribe intents, hard-deletes rows >24h old (folded from standalone cron per JOV-1901) |
| 5 | dataRetention | **Sundays only** | Heavy: purges old analytics, click events, audience members, pixel events, webhook events, audit logs, chat messages, ingestion jobs per retention policy |

> **Note:** `scheduleNotifications` was previously listed here but has been called directly from `/api/cron/frequent` for sub-hourly scheduling. It is NOT a daily-maintenance sub-job. See AUTOMATION_AUDIT.md for rationale.

Source: `apps/web/app/api/cron/daily-maintenance/route.ts`

## Standalone Cron Routes

These have their own Vercel schedule OR exist as callable endpoints (also invoked as sub-jobs above):

| Route | maxDuration | Description | Also called by |
|-------|-------------|-------------|----------------|
| `/api/cron/generate-insights` | 300s | AI insights for eligible Pro/Founding/Growth profiles with sufficient click data | — |
| `/api/cron/process-ingestion-jobs` | 300s | Claims up to 5 pending ingestion jobs, processes 3 concurrently | `frequent` (fallback) |
| `/api/cron/purge-pixel-ips` | 60s | NULLs `client_ip` from pixel events >48h old (privacy); retains `ip_hash` | — |
| `/api/cron/summarize-interviews` | 300s (default) | Haiku-powered interview summarization; queued jobs stall without this schedule | — |
| `/api/cron/generate-playlist` | 300s (default) | Daily AI playlist generation for admin review | — |
| `/api/cron/process-pre-saves` | 300s (default) | Processes pending Spotify pre-saves where release date has passed; up to 500/run | — |
| `/api/cron/cleanup-sms-intents` | 60s | Marks expired SMS subscribe intents and hard-deletes rows >24h old (no longer scheduled directly — called via `daily-maintenance` sub-job; file kept as admin escape hatch) | `daily-maintenance` |
| `/api/cron/monitor-metadata-submissions` | 60s | Polls third-party metadata pages for drift detection; read-only snapshot workflow | — |
| `/api/cron/process-metadata-submissions` | 60s | Sends queued metadata submissions; processes the outbound send queue | — |
| `/api/cron/billing-reconciliation` | 60s | Standalone entry for billing reconciliation | `daily-maintenance` |
| `/api/cron/cleanup-idempotency-keys` | 60s | Standalone entry for key cleanup | `daily-maintenance` |
| `/api/cron/cleanup-photos` | 60s | Standalone entry for photo cleanup | `daily-maintenance` |
| `/api/cron/data-retention` | 300s | Standalone entry with enhanced auth | `daily-maintenance` |
| `/api/cron/pixel-forwarding` | 60s | Forwards up to 500 pixel events to ad platforms | `frequent` |
| `/api/cron/process-campaigns` | 60s | Processes drip campaign sends | `frequent` |
| `/api/cron/schedule-release-notifications` | 60s | Schedules release-day notifications | `daily-maintenance` |
| `/api/cron/send-release-notifications` | 120s | Sends notifications; recovers stuck rows >10min; max 100/run | `frequent` |

## LLM Model Usage in Web App Crons

> **OpenRouter free-model swap status (JOV-1970):** OpenRouter is not yet integrated in `apps/web/`. The three LLM-calling crons currently use Anthropic models directly. Swap to `nvidia/llama-3.3-nemotron-super-49b-v1:free` is deferred to JOV-1970.

| Cron | File | SDK | Model |
|------|------|-----|-------|
| `generate-insights` | `lib/services/insights/insight-generator.ts` | Vercel AI SDK Gateway (`@ai-sdk/gateway`) | `anthropic/claude-haiku-4-5-20251001` (via `INSIGHT_MODEL` constant) |
| `summarize-interviews` | `lib/interviews/summarize.ts` | Anthropic SDK directly (`@anthropic-ai/sdk`) | `claude-haiku-4-5-20251001` (hard-coded) |
| `generate-playlist` | `lib/playlists/generate-concept.ts` + `curate-tracklist.ts` | Anthropic SDK directly (`@anthropic-ai/sdk`) | `claude-haiku-4-5-20251001` (concept) + `claude-sonnet-4-20250514` (tracklist, hard-coded) |

To swap these to OpenRouter free Nemotron, see JOV-1970 for the full integration checklist.

## Adding Logic to an Existing Cron

1. **Prefer adding a sub-job** to `frequent` (sub-hourly) or `daily-maintenance` (daily) rather than creating a new route
2. Add independent error handling so one sub-job failure doesn't block others
3. Use conditional execution if the logic doesn't need to run every invocation (see frequency patterns above)
4. Creating a new cron route requires explicit human approval — see AGENTS.md guardrails
