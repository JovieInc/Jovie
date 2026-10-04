# Cron Job Registry

> Symphony is the shipping lanes harness (`scripts/lanes/README.md`). The Symphony Elixir control plane is retired from Jovie; paths written `symphony-control/...` live in the private repo JovieInc/symphony-control (full history).

> **Question this answers:** "What scheduled jobs already run? Can I add my logic to an existing one?"
>
> Before creating a new cron job, read [AGENTS.md — Infrastructure & Scheduling Guardrails](../AGENTS.md#infrastructure--scheduling-guardrails-critical).
> **JOV-5852:** execution follows information, not time. A GitHub Actions cron must declare `# clock-class:` (`skip-if-unchanged` | `production-liveness` | `temporal-resource` | `upstream-advisory`). Do not add a clock when a causal event already exists.

## Codex Workspace Automations

These are local Codex automations for agent workflow hygiene. They are not production app crons, do not run in Vercel, and must not add routes under `apps/web/app/api/cron/*`.

| Name | Schedule | Purpose | Source |
|------|----------|---------|--------|
| `PR Comment Hardening Retro` (`pr-comment-hardening-retro`) | Mondays 09:00 America/Los_Angeles | Scans recent PR review comments, reports repeated agent mistake classes, and may open draft PRs only for bounded docs/tests/skill hardening. | Codex automation using `scripts/pr-comment-retro.mjs` |
| `Weekly Paxel + Is Agentic` (`weekly-agent-readiness`) | Tuesdays 09:00 America/Los_Angeles | Runs the reviewed local Paxel wrapper, requires fresh 100/100 public reports for Jovie and LYB, and writes the bounded profile-delta + two-ship receipt outside the repository. Activation fails closed until the one-time YC SSO token exists. | Codex automation using `scripts/weekly-agent-readiness.mjs`; see `docs/operations/weekly-agent-readiness.md` |

Before adding another Codex workspace automation, inspect existing Codex automations and repo schedules. Combine with this retro only when the job is about converting review feedback into durable agent hardening; keep product or production scheduling in the Vercel cron registry below.

## GitHub Actions Schedule

Scheduled workflows in `.github/workflows/`. Not Vercel crons — these run on GitHub-hosted runners.

| Workflow | Schedule | Purpose | Source |
|----------|----------|---------|--------|
| `Fleet Gate Refresh` | `*/5 * * * *` UTC (production-liveness) + push to `main` + `workflow_dispatch` | Rewrites the canonical fleet receipt inside its 10-minute stale window. PR, check, and status events do not start this workflow. Runner Heartbeat's 10-minute dispatch remains the backup. | `.github/workflows/fleet-gate-refresh.yml` |
| `Design Governance` | `17 8 * * 1` UTC | Weekly design-governance audit plus invariant-stewardship receipt. Also triggered by registry/evidence pushes to `main` and `founder-decision-recorded` / `invariant-enforcement-failed` repository events. Not a merge gate. | `.github/workflows/design-governance.yml` |
| `CI Duration Ratchet` | `25 6 * * *` UTC + push to local-gate files on `main` | Measures rolling p95 of recent PR merge-gate CI runs and fails + Slack-alerts when p95 exceeds the committed baseline + margin. `dev-loop` job times every `.husky/pre-commit` rung + pre-push publication against budgets in `scripts/dev-loop-latency.mjs`. | `.github/workflows/ci-duration-ratchet.yml` |
| `Shipping SLO Ratchet` | `13 7 * * *` UTC + manual | JOV-6783: rolling 7d p50/p95 across CI wall time (per required workflow event), merge-queue wait/ejection, PR lead time by lane, red→green remediation, production lag, and merges/day throughput vs the +8% WoW growth line and its second-order trend. >10% improvement held 3 days → draft ratchet PR on `docs/metrics/shipping-slo-baseline.json`; >20% regression/throughput drop or flat growth → deduped `slo-regression` issues. Commits `docs/metrics/shipping-slo-latest.json` so the Symphony lanes status gist (`scripts/lanes/doctor.py`) embeds the `slo` block. LLM-free. | `.github/workflows/shipping-slo.yml` |
| `Merge Queue Ruleset Verify` | `17 6 * * *` UTC + push to ruleset/source files on `main` + manual | Live GitHub ruleset 10512119 parity (`pnpm ci:merge-queue:verify`). Also runs on `main` pushes to ruleset/source files. Slack on failure. Not a source-PR or merge-group gate. | `.github/workflows/merge-queue-ruleset-verify.yml` |
| `Neon Ephemeral Branch Cleanup` | (see workflow) | Terminal-event cleanup: deletes ephemeral Neon branches when PRs close and emits a `jovie-preview-env-cleanup/v1` receipt (JOV-5941). | `.github/workflows/neon-ephemeral-branch-cleanup.yml` |
| `Neon Scheduled Branch Cleanup` | `43 3 * * *` UTC | Daily heartbeat reconciliation for missed ephemeral-Neon cleanup events: reaps orphaned/past-TTL branches once (fail-closed ownership proof) and emits a `jovie-preview-env-cleanup/v1` receipt (JOV-5941). | `.github/workflows/neon-scheduled-cleanup.yml` |
| `Vercel Preview Cleanup` | (see workflow) | Terminal-event cleanup: cancels/deletes preview deployments for a closed PR's ref and emits a `jovie-preview-env-cleanup/v1` receipt (JOV-5941). | `.github/workflows/vercel-preview-cleanup.yml` |
| `Actions Cache GC` | `19 4 * * *` UTC | Evicts closed-ref, exact-key duplicate, and surplus `Linux-turbo-*` Actions caches. Keeps live pnpm/node/playwright caches on `main` and open PR refs unless unused and over budget. | `.github/workflows/actions-cache-gc.yml` |
| `Actions Cache Supersede` | `11,41 * * * *` UTC | Deletes superseded `main` caches: keeps the newest per allowlisted family, drops `pnpm-node-modules-v1-*` and `-v2-*`. | `.github/workflows/actions-cache-supersede.yml` |
| `M2 Revenue-Path Canary` | `37 6 * * *` UTC + Production Controller `workflow_run` + manual / `workflow_call` | Daily + deploy-hook money-path probe: signed-out → claim → $199 Pro checkout → activation. Timestamped receipt; Slack + Linear with repro on red. Distinct from Canary Health Gate uptime. | `.github/workflows/m2-revenue-path-canary.yml` |
| `Marketing Certification Producer` | `41 4 * * *` UTC + push to marketing components/registry/tests on `main` + manual `all=true` | JOV-6928: posts machine certification evidence for the marketing registry to the production ledger. Pushes re-evaluate only entries whose source, declared tests or story changed; the daily run is the missed-event reconciliation heartbeat. Real defects upsert one fingerprinted Linear issue. | `.github/workflows/marketing-certification-producer.yml` |
| `Golden Path Nightly` | `23 9 * * *` UTC (skip-if-unchanged) + manual | JOV-6920: dispatches the real-auth + Stripe test-mode Golden Path lane in `ci.yml` on `main` and files one fingerprinted P0 Linear issue on red. A red run reopens the existing issue into Todo. | `.github/workflows/golden-path-nightly.yml` |
| `Merge Queue Green Enroll` | `*/15 * * * *` UTC (temporal-resource) + required-check `workflow_run` + `unlabeled`/`reopened` + manual | JOV-7589: event-driven enrollment of CLEAN PRs into the merge queue, plus a 15-minute full-roster reconciliation sweep. A merge-queue ejection while checks are already green emits no completion event, so the sweep is the only wake that re-arms a dequeued green head within 15 minutes. | `.github/workflows/merge-queue-green-enroll.yml` |
| `VOC Mine` | `0 14 * * 1` UTC (upstream-advisory) + manual | JOV-7701: weekly mining of public complaints and payment objections about the tools Jovie replaces (app reviews, review pages, HN). Uploads anonymized classified items as a 90-day artifact. Skips until `VOC_TARGETS_JSON` and `EXA_API_KEY` secrets exist; on-demand runs publish dated receipts to gbrain `ops/voc/`. | `.github/workflows/voc-mine.yml`, `scripts/voc/README.md` |
| `Remediation Sweep` | `11 8 * * *` UTC daily; `17 8 * * 1` UTC weekly + manual `dry_run` | JOV-7552: files or reopens fingerprinted Linear issues when a watched failure returns. Weekly: open-draft rollup. Daily: `lane-fix-exhausted` older than 24h, hold labels idle more than 7d, Summer receipt staleness, and Vercel production ERROR. Read-only on GitHub. The Vercel job skips with a warning when no read-only token secret is set. | `.github/workflows/remediation-sweep.yml` |
| `Production Synthetic Monitoring` | `17 */6 * * *` UTC for deep browser synthetics; `47 7 * * *` UTC for Web AI health; manual | Existing front-door/auth/profile coverage plus one daily production Gateway turn for web chat, insights, pitches, titles, and packaging. Web AI failures emit a redacted receipt, Slack alert, and high-priority Linear bug signal with the founder allowlist name. | `.github/workflows/synthetic-monitoring.yml` |
| `Summer Eve identity check` | `*/30 * * * *` UTC + `workflow_dispatch` + every pull request | Rejects a Summer per-deployment URL or deployment-id pin in source. On schedule, manual dispatch, and pull requests that touch the Summer bridge, confirms `https://summer.jov.ie/runtime/v1/identity` is source-bound production project `prj_LaVQva346cjp5XfrbAIIQUln7tPH`. A Vercel readback runs only when `SUMMER_PIN_CHECK_VERCEL_TOKEN` is present. | `.github/workflows/summer-eve-pin.yml` |

## Changed-evidence workflows

Broad test and analysis suites are deliberately absent from the schedule table. `nightly-tests.yml`, `nightly-testing-agent.yml`, `e2e-full-matrix.yml`, `eval-real-model.yml`, `test-coverage-audit.yml`, `sonarcloud.yml`, `codeql.yml`, and `security.yml` run on relevant `main` input changes; `test-flakiness-report.yml` runs after terminal test-workflow events. Each retains explicit manual dispatch. `ci-schedule-inventory` fails CI if any of these workflows regains a cron without being removed from the evidence-driven registry with a reviewed rationale.

## Local Hermes Launchd Schedule

These are machine-local Hermes jobs, not Vercel production crons. They run from launchd on the operator Mac and write to `~/.hermes`.

| Unit | Schedule | Purpose | Source |
|------|----------|---------|--------|
| `co.jovie.hermes.cron-pipeline-scoreboard` | retired | Hard-exits with `retired_linear_only` before reading or publishing historical GitHub-Issue funnel counts. The Linear-primary Gem HUD retains PR/Actions delivery reporting and fails closed when Linear backlog data is unavailable. | `symphony-control/jobs/pipeline-scoreboard.ts` |
| `co.jovie.hermes.cron-gbrain-health-summary` | 07:15 local daily | Verifies the Tailscale-bound HTTP health endpoint, source freshness, and that exactly one server is running; retains `gbrain doctor` as an advisory diagnostic, writes `ops/gbrain-health/latest`, and posts the summary to Telegram/Slack. | `symphony-control/jobs/gbrain-health-summary.ts` |

## Production Schedule

Source of truth: `apps/web/vercel.json`. The Vercel project's Root Directory is set to `apps/web/` (verified via `vercel project inspect jovie`), so Vercel reads that file, not the repo-root `vercel.json`. The root-level `vercel.json` exists for historical reasons and is **not** what Vercel consumes — keep both in sync until it can be deleted (see JOV-1901 / AUTOMATION_AUDIT.md for the original deletion intent).

| Cron Path | Schedule | Frequency |
|-----------|----------|-----------|
| `/api/cron/frequent` | `*/15 * * * *` | Every 15 minutes |
| `/api/cron/daily-maintenance` | `0 0 * * *` | Daily at midnight UTC |
| `/api/cron/generate-insights` | `0 5 * * *` | Daily at 05:00 UTC |
| `/api/cron/process-ingestion-jobs` | `*/6 * * * *` | Every 6 minutes (JOV-2500: lets Neon 5min autosuspend reclaim compute) |
| `/api/cron/process-merch-fulfillment` | `*/10 * * * *` | Every 10 minutes |
| `/api/cron/purge-pixel-ips` | `0 3 * * *` | Daily at 03:00 UTC |
| `/api/cron/summarize-interviews` | `*/5 * * * *` | Every 5 minutes |
| `/api/cron/generate-playlist` | `0 6 * * *` | Daily at 06:00 UTC |
| `/api/cron/process-pre-saves` | `0 2 * * *` | Daily at 02:00 UTC |
| `/api/cron/monitor-metadata-submissions` | `0 * * * *` | Hourly |
| `/api/cron/process-metadata-submissions` | `0 4 * * *` | Daily at 04:00 UTC |
| `/api/cron/public-profile-canary` | `13 6 * * *` | Daily at 06:13 UTC |
| `/api/cron/auth-signup-onboarding-canary` | `23 6 * * *` | Daily at 06:23 UTC (JOV-1871) |
| `/api/cron/artist-daily-snapshots` | `15 9 * * *` | Daily at 09:15 UTC. No-op unless `ARTIST_DAILY_SNAPSHOTS` is true. YouTube Data API statistics when `YOUTUBE_DATA_API_KEY` is set; Wikimedia pageviews. Social HTML waits for isolated egress. |

`cleanup-sms-intents` was folded into `daily-maintenance` as a sub-job per JOV-1901 (see AUTOMATION_AUDIT.md). Other cron route files exist as standalone endpoints whose logic is called as sub-jobs of `frequent` or `daily-maintenance`. `apps/web/vercel.json` is the schedule source of truth.

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
| 10 | redisOperability | Hourly (`minute < 15`) | Runs a namespaced `SET` / `GETDEL` / `DEL` canary with a 60-second TTL; emits a stable Sentry failure class on quota exhaustion, mismatch, or unavailability |
| 11 | workflowApprovalRecovery | Every invocation | Recovers accepted suggested_actions missing workflow_runs enqueue |
| 12 | youtubeLibraryRefresh | Every invocation | JOV-5136: re-syncs YouTube channels stale >24h via `runScheduledRefreshes`. No-op (`provider: null`) until the OAuth connector lands with JOV-3189 |

Source: `apps/web/app/api/cron/frequent/route.ts`

## Consolidated: `/api/cron/daily-maintenance`

**maxDuration:** 300s | Runs once daily at midnight UTC.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | cleanupPhotos | Every day | Deletes orphaned `profilePhotos` (failed uploads >1-24h) + Vercel Blobs |
| 2 | cleanupKeys | Every day | Deletes expired `dashboardIdempotencyKeys` |
| 3 | billingReconciliation | Every day | Reconciles DB subscription status with Stripe; fixes mismatches |
| 4 | cleanupSmsIntents | Every day | Marks expired SMS subscribe intents, hard-deletes rows >24h old (folded from standalone cron per JOV-1901) |
| 5 | waitlistAutoAccept | Every day | Auto-accepts bounded waitlist capacity when the admin setting enables it |
| 6 | profileSearchMonitoring | Every day | Runs profile-search monitoring inside a bounded 90-second sub-budget |
| 7 | discographyReEnrich | Every day | Sweeps a bounded batch of under-enriched discographies |
| 8 | onboardingScriptAggregation | Every day | Recomputes onboarding conversion counters, mines lint-clean candidates, and promotes or retires variants |
| 9 | aiCrawlerAnalytics | Every day | Syncs Cloudflare zone AI-crawl analytics into `ai_crawler_analytics_snapshots` per artist profile when configured |
| 10 | releaseOutcomeReconciliation | Every day | Reconciles bounded release-workflow outcome snapshots and fails visibly on partial errors |
| 11 | founderReviewUploadLeases | Every day | Deletes expired private founder-review uploads that never bound to a receipt; quarantines and reports cleanup failures |
| 12 | dataRetention | **Sundays only** | Heavy: purges old analytics, click events, audience members, pixel events, webhook events, audit logs, chat messages, ingestion jobs per retention policy |

> **Note:** `scheduleNotifications` was previously listed here but has been called directly from `/api/cron/frequent` for sub-hourly scheduling. It is NOT a daily-maintenance sub-job. See AUTOMATION_AUDIT.md for rationale.

Source: `apps/web/app/api/cron/daily-maintenance/route.ts`

## Standalone Cron Routes

These have their own Vercel schedule OR exist as callable endpoints (also invoked as sub-jobs above):

| Route | maxDuration | Description | Also called by |
|-------|-------------|-------------|----------------|
| `/api/cron/generate-insights` | 300s | AI insights for eligible Pro/Founding/Growth profiles with sufficient click data | — |
| `/api/cron/process-ingestion-jobs` | 300s | Claims up to 5 pending ingestion jobs, processes 3 concurrently | `frequent` (fallback) |
| `/api/cron/process-merch-fulfillment` | 300s | Submits queued paid merch orders to Printful and confirms them idempotently | — |
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
| `/api/cron/sync-ai-crawler-analytics` | 120s | Standalone entry for AI crawler analytics sync | `daily-maintenance` |
| `/api/cron/schedule-release-notifications` | 60s | Schedules release-day notifications | `daily-maintenance` |
| `/api/cron/send-release-notifications` | 120s | Sends notifications; recovers stuck rows >10min; max 100/run | `frequent` |
| `/api/cron/public-profile-canary` | 30s | Lightweight HTTP health check: GET /tim, /tim/alerts, /tim/pay, POST /api/audience/visit; emits Sentry breadcrumb + writes Redis key for admin ops panel (JOV-1872) | — |
| `/api/cron/auth-signup-onboarding-canary` | 30s | Lightweight HTTP golden-path check: GET /signup, /signin, /start, POST /api/chat onboarding probe; emits Sentry breadcrumb + writes Redis key for admin ops panel (JOV-1871) | — |
| `/api/cron/artist-daily-snapshots` | 300s | Append-only official-API snapshots for a capped batch of known artists. Default-off (`ARTIST_DAILY_SNAPSHOTS`). Social HTML is not fetched from core. Failures fingerprint as `remediation:artist-snapshots`. | — |

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
