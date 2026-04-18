# Cron Job Registry

> **Question this answers:** "What scheduled jobs already run? Can I add my logic to an existing one?"
>
> Before creating a new cron job, read [AGENTS.md — Infrastructure & Scheduling Guardrails](../AGENTS.md#infrastructure--scheduling-guardrails-critical).

## Production Schedule

Source of truth: `apps/web/vercel.json`

| Cron Path | Schedule | Frequency | Sentry Monitor Slug |
|-----------|----------|-----------|---------------------|
| `/api/cron/frequent` | `*/15 * * * *` | Every 15 minutes | `cron-frequent` |
| `/api/cron/daily-maintenance` | `0 0 * * *` | Daily at midnight UTC | `cron-daily-maintenance` |
| `/api/cron/generate-insights` | `0 5 * * *` | Daily at 05:00 UTC | `cron-generate-insights` |
| `/api/cron/process-ingestion-jobs` | `* * * * *` | Every minute | `cron-process-ingestion-jobs` |
| `/api/cron/purge-pixel-ips` | `0 3 * * *` | Daily at 03:00 UTC | `cron-purge-pixel-ips` |

Only these 5 paths are scheduled in production. Other cron route files exist as standalone endpoints whose logic is called as sub-jobs of `frequent` or `daily-maintenance`.

**Auth:** All crons use `Authorization: Bearer ${CRON_SECRET}`. The `data-retention` route additionally uses timing-safe comparison + origin verification.
**Operational control:** high-risk cron fanout can be paused with the runtime `cronFanoutEnabled` control. Housekeeping routes remain monitored even when fanout is paused.

---

## Consolidated: `/api/cron/frequent`

**maxDuration:** 60s | Orchestrates sub-hourly jobs in a single cold start. Each sub-job has independent error handling.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | dbWarmPing | Every invocation | `SELECT 1` to keep Neon compute from auto-suspending |
| 2 | campaigns | Every invocation | `processCampaigns()` (drip sends) + `cleanupExpiredSuppressions()` |
| 3 | pixelRetry | `minute >= 30` | Retries pending pixel event forwarding to ad platforms (FB, Google, TikTok) |
| 4 | scheduleNotifications | Every invocation | Schedules release-day notifications |
| 5 | sendNotifications | Every invocation | Sends pending release-day fan notifications via email |
| 6 | leadDiscovery | Every invocation | SerpAPI lead discovery, qualification, auto-approve (gated on `leadPipelineSettings.enabled`) |
| 7 | alphabetCache | `hour % 6 === 0 && minute < 15` | Warms Spotify alphabet cache |
| 8 | ingestionFallback | If elapsed < 50s | Claims/processes up to 2 ingestion jobs as fallback for dedicated cron |

Source: `apps/web/app/api/cron/frequent/route.ts`

## Consolidated: `/api/cron/daily-maintenance`

**maxDuration:** 300s | Runs once daily at midnight UTC.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | cleanupPhotos | Every day | Deletes orphaned `profilePhotos` (failed uploads >1-24h) + Vercel Blobs |
| 2 | cleanupKeys | Every day | Deletes expired `dashboardIdempotencyKeys` |
| 3 | billingReconciliation | Every day | Reconciles DB subscription status with Stripe; fixes mismatches |
| 4 | dataRetention | **Sundays only** | Heavy: purges old analytics, click events, audience members, pixel events, webhook events, audit logs, chat messages, ingestion jobs per retention policy |

Source: `apps/web/app/api/cron/daily-maintenance/route.ts`

## Standalone Cron Routes

These have their own Vercel schedule OR exist as callable endpoints (also invoked as sub-jobs above):

| Route | maxDuration | Description | Also called by |
|-------|-------------|-------------|----------------|
| `/api/cron/generate-insights` | 300s | AI insights for eligible Pro/Founding/Growth profiles with sufficient click data | — |
| `/api/cron/process-ingestion-jobs` | 300s | Claims up to 5 pending ingestion jobs, processes 3 concurrently | `frequent` (fallback) |
| `/api/cron/purge-pixel-ips` | 60s | NULLs `client_ip` from pixel events >48h old (privacy); retains `ip_hash` | — |
| `/api/cron/process-pre-saves` | default | Processes Spotify pre-saves where release date has passed; up to 500/run | — |
| `/api/cron/billing-reconciliation` | 60s | Standalone entry for billing reconciliation | `daily-maintenance` |
| `/api/cron/cleanup-idempotency-keys` | 60s | Standalone entry for key cleanup | `daily-maintenance` |
| `/api/cron/cleanup-photos` | 60s | Standalone entry for photo cleanup | `daily-maintenance` |
| `/api/cron/data-retention` | 300s | Standalone entry with enhanced auth | `daily-maintenance` |
| `/api/cron/pixel-forwarding` | 60s | Forwards up to 500 pixel events to ad platforms | `frequent` |
| `/api/cron/process-campaigns` | 60s | Processes drip campaign sends | `frequent` |
| `/api/cron/schedule-release-notifications` | 60s | Schedules release-day notifications | `daily-maintenance` |
| `/api/cron/send-release-notifications` | 120s | Sends notifications; recovers stuck rows >10min; max 100/run | `frequent` |

## Adding Logic to an Existing Cron

1. **Prefer adding a sub-job** to `frequent` (sub-hourly) or `daily-maintenance` (daily) rather than creating a new route
2. Add independent error handling so one sub-job failure doesn't block others
3. Use conditional execution if the logic doesn't need to run every invocation (see frequency patterns above)
4. Creating a new cron route requires explicit human approval — see AGENTS.md guardrails
