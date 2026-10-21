# Cron Job Registry

> Symphony is the shipping lanes harness (`scripts/lanes/README.md`). The Symphony Elixir control plane is retired from Jovie; paths written `symphony-control/...` live in the private repo JovieInc/symphony-control (full history).

> **Question this answers:** "What scheduled jobs already run? Can I add my logic to an existing one?"
>
> **Canonical registry (2026-10-20):** every company automation (GitHub, Vercel, lanes, Gem, Macs, Codex, Summer, Managed Agents) is registered with owner, trigger, metric, run-receipt location, max staleness and kill switch in [`canon/automation-registry.jsonl`](../canon/automation-registry.jsonl) (one automation per line). CI (`automation-registry` source guard) fails when a GitHub cron, Vercel cron or lanes clock has no live entry, or a live entry outlives its schedule. This page explains the jobs; the registry is the inventory.
>
> Before creating a new cron job, read [AGENTS.md — Infrastructure & Scheduling Guardrails](../AGENTS.md#infrastructure--scheduling-guardrails-critical).
> **JOV-5852:** execution follows information, not time. A GitHub Actions cron must declare `# clock-class:` (`skip-if-unchanged` | `production-liveness` | `temporal-resource` | `upstream-advisory`). Do not add a clock when a causal event already exists.
> **JOV-INV-042 (2026-10-11):** GitHub cron is frozen. `scripts/lib/ci-schedule-inventory.mjs` keeps `CRON_KEEP_REASONS` (since 2026-10-12 every kept clock names its time-bound external fact, calendar window, real resource limit, or owner-tracked replacement), `ADMISSION_CRON_DEBT`, and `POLLING_DEBT`; each list only shrinks. Admission and landing are event-driven or run from the Gem lanes tick; no workflow polls GitHub state.

## Codex Workspace Automations

Codex automations are heartbeats that wake one live goal thread; Codex is on-demand and is not a scheduler. The active ones are registered as `codex:*` in the registry with a migrate note (pause when the goal closes). The 2026-10-20 sweep archived 16 paused heartbeats to `~/.local/state/retired-loops/2026-10-20/codex-automations/` on the ops Mac. The `pr-comment-hardening-retro` and `weekly-agent-readiness` automations this page used to list were not installed there; their scripts (`scripts/pr-comment-retro.mjs`, `scripts/weekly-agent-readiness.mjs`) run on demand. Recurring needs go to the lanes tick, not a new Codex heartbeat.

## GitHub Actions Schedule

Scheduled workflows in `.github/workflows/`. Not Vercel crons — these run on GitHub-hosted runners.

> **Delivery (measured 2026-10-10..12):** GitHub delivered every sub-daily cron in this repository only about every 6 h (median gap 311-452 min). Workflows whose purpose depends on cadence (Production Continuity 5 min, Runner Heartbeat and Runner Health Monitor 10 min, Cost Anomaly Gate 15 min, Sentry Autofix Recurrence 1 h) are fired by the Gem lanes tick via `repository_dispatch` (`scripts/lanes/continuity_clock.py`); their cron stays as the backstop when Gem is down.

| Workflow | Schedule | Purpose | Source |
|----------|----------|---------|--------|
| `CI Duration Ratchet` | `25 6 * * *` UTC + push to local-gate files on `main` | Measures rolling p95 of recent PR merge-gate CI runs and fails + Slack-alerts when p95 exceeds the committed baseline + margin. `dev-loop` job times every `.husky/pre-commit` rung + pre-push publication against budgets in `scripts/dev-loop-latency.mjs`. | `.github/workflows/ci-duration-ratchet.yml` |
| `Shipping SLO Ratchet` | `13 7 * * *` UTC + manual | JOV-6783: rolling 7d p50/p95 across CI wall time (per required workflow event), merge-queue wait/ejection, PR lead time by lane, red→green remediation, production lag, and merges/day throughput vs the +8% WoW growth line and its second-order trend. >10% improvement held 3 days → draft ratchet PR on `docs/metrics/shipping-slo-baseline.json`; >20% regression/throughput drop or flat growth → deduped `slo-regression` issues. Commits `docs/metrics/shipping-slo-latest.json` so the Symphony lanes status gist (`scripts/lanes/doctor.py`) embeds the `slo` block. LLM-free. | `.github/workflows/shipping-slo.yml` |
| `Merge Queue Ruleset Verify` | `17 6 * * *` UTC + push to ruleset/source files on `main` + manual | Live GitHub ruleset 10512119 parity (`pnpm ci:merge-queue:verify`). Also runs on `main` pushes to ruleset/source files. Slack on failure. Not a source-PR or merge-group gate. | `.github/workflows/merge-queue-ruleset-verify.yml` |
| `Neon Ephemeral Branch Cleanup` | (see workflow) | Terminal-event cleanup: deletes ephemeral Neon branches when PRs close and emits a `jovie-preview-env-cleanup/v1` receipt (JOV-5941). | `.github/workflows/neon-ephemeral-branch-cleanup.yml` |
| `Vercel Preview Cleanup` | (see workflow) | Terminal-event cleanup: cancels/deletes preview deployments for a closed PR's ref and emits a `jovie-preview-env-cleanup/v1` receipt (JOV-5941). | `.github/workflows/vercel-preview-cleanup.yml` |
| `M2 Revenue-Path Canary` | `37 6 * * *` UTC + Production Controller `workflow_run` + manual / `workflow_call` | Daily + deploy-hook money-path probe: signed-out → claim → $199 Pro checkout → activation. Timestamped receipt; Slack + Linear with repro on red. Distinct from Canary Health Gate uptime. | `.github/workflows/m2-revenue-path-canary.yml` |
| `Golden Path Nightly` | `23 9 * * *` UTC (skip-if-unchanged) + manual | JOV-6920: dispatches the real-auth + Stripe test-mode Golden Path lane in `ci.yml` on `main` and exits (skipped when main has a green Golden Path under 24 h old). The dispatched run's `Golden Path Report` job files one fingerprinted P0 Linear issue on red or resolves it on green; a red run reopens the existing issue into Todo. Acquisition eligibility reads that ci.yml job, not this dispatcher. | `.github/workflows/golden-path-nightly.yml` |
| `Security Scanning` | `0 14 * * 1` UTC (upstream-advisory) + push to `main` + manual | JOV-7565: weekly dependency/SAST baseline — upstream OSV/Semgrep advisories publish on their own clock, so push-only triggers can miss new findings on unchanged source. Uploads SARIF with read-contents/security-events only. | `.github/workflows/security.yml`, `scripts/security/` |
| `VOC Mine` | `0 14 * * 1` UTC (upstream-advisory) + manual | JOV-7701: weekly mining of public complaints and payment objections about the tools Jovie replaces (app reviews, review pages, HN). Uploads anonymized classified items as a 90-day artifact. Skips until `VOC_TARGETS_JSON` and `EXA_API_KEY` secrets exist; on-demand runs publish dated receipts to gbrain `ops/voc/`. | `.github/workflows/voc-mine.yml`, `scripts/voc/README.md` |
| `Remediation Sweep` | `11 8 * * *` UTC daily; `17 8 * * 1` UTC weekly + manual `dry_run` | JOV-7552/JOV-7592: files or reopens fingerprinted Linear issues when a watched failure returns. Weekly: open-draft rollup. Daily: `lane-fix-exhausted` older than 24h, hold labels idle more than 7d, terminal-red non-draft `summer-config` PRs, Summer receipt staleness, Vercel production ERROR, and the credentials/spend registry (`--mode credentials`: expiry 7d/1d, runway under 14 days, 50/80/100% caps, unowned secrets; `docs/COST_MONITORING.md` Layer 3). GitHub reads are limited to Jovie and summer-config. The Vercel job skips with a warning when no read-only token secret is set. | `.github/workflows/remediation-sweep.yml` |
| `Production Synthetic Monitoring` | `17 */6 * * *` UTC for deep browser synthetics; `47 7 * * *` UTC for Web AI health; manual | Existing front-door/auth/profile coverage plus one daily production Gateway turn for web chat, insights, pitches, titles, and packaging. Web AI failures emit a redacted receipt, Slack alert, and high-priority Linear bug signal with the founder allowlist name. | `.github/workflows/synthetic-monitoring.yml` |
| `Summer Eve identity check` | `17 * * * *` UTC (hourly) + `workflow_dispatch` + every pull request | Rejects a Summer per-deployment URL or deployment-id pin in source. On schedule, manual dispatch, and pull requests that touch the Summer bridge (the identity job only boots then; other PRs run the pin guard alone), confirms `https://summer.jov.ie/runtime/v1/identity` is source-bound production project `prj_LaVQva346cjp5XfrbAIIQUln7tPH`. A Vercel readback runs only when `SUMMER_PIN_CHECK_VERCEL_TOKEN` is present. | `.github/workflows/summer-eve-pin.yml` |

## Changed-evidence workflows

Broad test and analysis suites are deliberately absent from the schedule table. `nightly-tests.yml`, `nightly-testing-agent.yml`, `e2e-full-matrix.yml`, `test-coverage-audit.yml`, `sonarcloud.yml`, and `codeql.yml` run on relevant `main` input changes; `test-flakiness-report.yml` runs after terminal test-workflow events. Each retains explicit manual dispatch. Fleet Gate Refresh runs on `main` pushes, main CI completion, signed Linear Triage `repository_dispatch`, and manual dispatch, writing the canonical receipt only as a stale fallback; the Gem lanes emitter (`scripts/lanes/fleet_gate_emitter.py`) keeps it fresh between events, so its former `*/5` cron and Runner Heartbeat's dispatch are gone. The disabled Main CI health monitor, Quarantine Recovery, and Auto-PR on Agent Push workflows were deleted on 2026-10-12 (git history has them). Actions Cache GC (which also prunes superseded main generations) runs on every `main` push, which is when large caches are saved. Design Governance (JOV-INV-026 performance pack included) and Visual & A11y Tests (the JOV-INV-018 whole-system Storybook axe sweep) run on the `main` push that changes their inputs. Repo-state audits run on the `main` push that changes their inputs: Doc Gardening Agent and Deprecation Intake (dependency/toolchain paths). Marketing Certification Producer evaluates everything since its last successful run, so a replaced or failed run needs no clock. Security Suppression Audit runs per bot review. Brand Scrub is enforced only in `ci.yml` (diff scan) and the ci-fast structural pytest lane. `ci-schedule-inventory` fails CI if any of these workflows regains a cron without being removed from the evidence-driven registry with a reviewed rationale.

## Learning delivery (JOV-8427)

Shipping SLO's daily clock measures shipping signals only. Its weekly
post-mortem learning step and artifact are retired. Quality Gap Finder retains
its `main` evidence pushes and `quality-gap-scan` deliveries; scheduled calls
to its handler and post-mortem review are rejected before scans or writes.

Growth intake v2 binds a causal event and source revisions rather than an ISO
week. Weekly v1 receipts remain historical and cannot admit analysis. Delivered
terminal/exception evidence, changed source evidence, confidence/value threshold
crossings, and relevant pending jobs cause bounded reconsideration. A week or
night passing does not. See [current ownership and acceptance](quality/EVENT_DRIVEN_LEARNING.md).
Hermes's nightly dispatch-log learning is superseded; the local history below
cannot authorize reactivation or a full-log sweep.

## Local Hermes Launchd Schedule

Retired with Hermes (2026-09-05); the registry records them as `retired` with archive paths. This table does not authorize installation or activation.

| Unit | Schedule | Purpose | Source |
|------|----------|---------|--------|
| `co.jovie.hermes.cron-pipeline-scoreboard` | retired | Hard-exits with `retired_linear_only` before reading or publishing historical GitHub-Issue funnel counts. The Linear-primary Gem HUD retains PR/Actions delivery reporting and fails closed when Linear backlog data is unavailable. | `symphony-control/jobs/pipeline-scoreboard.ts` |
| `co.jovie.hermes.cron-gbrain-health-summary` | 07:15 local daily | Verifies the Tailscale-bound HTTP health endpoint, source freshness, and that exactly one server is running; retains `gbrain doctor` as an advisory diagnostic, writes `ops/gbrain-health/latest`, and posts the summary to Telegram/Slack. | `symphony-control/jobs/gbrain-health-summary.ts` |

## Local Symphony Host Schedule

These machine-local units run from launchd on macOS and systemd user timers on Linux. They are
not GitHub or Vercel cron jobs.

| Unit | Schedule | Purpose | Source |
|------|----------|---------|--------|
| `com.jovie.lanes` / `jovie-lanes.timer` | Every 5 minutes + load/boot | Drain-safe release update, then dispatch idle provider seats. Event-driven workers pull again immediately; this is the idle fallback. | `scripts/lanes/install.sh`, `scripts/lanes/lane_runner.py` |
| `com.jovie.lanes-watchdog` / `jovie-lanes-watchdog.timer` | Every minute + load/boot | Local-only factory liveness observer. Performs at most three bounded recoveries through the installed lanes service, verifies a new admitting/writing observation, and alerts only on exhaustion or decision-required capacity loss. Installed on Gem 2026-10-20 (`jovie-lanes-watchdog.timer`, from the installer template); its receipt is `~/.local/state/jovie-lanes/factory-watchdog.json`, which the lanes doctor watches through the automation registry. | `scripts/lanes/install.sh`, `scripts/lanes/factory_watchdog.py` |

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
| `/api/cron/process-workflow-runs` | `*/6 * * * *` | Every 6 minutes (403 at the trusted-origin check on every call as of 2026-10-20) |
| `/api/cron/voice-pipeline` | `*/5 * * * *` | Every 5 minutes (missing from the unused root `vercel.json`) |
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
| 13 | billingSyncRemediation | Every invocation | JOV-7558: reads the billing audit log and unprocessed Stripe rows. Files one Linear issue labeled `remediation:billing-sync-stale` or `remediation:billing-webhooks-stuck` when the last reconciliation heartbeat is older than 48 hours or a webhook is stuck. Does not call `/api/billing/health`. |
| 14 | canaryReceiptFreshness | Hourly (`minute < 15`) | Reads the two daily acquisition-canary reports; missing, invalid, future or 26-hour-old receipts fail the sub-job with Sentry `canary_receipt_stale`, even when acquisition is disabled. Two Redis reads/run; no new schedule (JOV-7895). |

Source: `apps/web/app/api/cron/frequent/route.ts`

## Consolidated: `/api/cron/daily-maintenance`

**maxDuration:** 300s | Runs once daily at midnight UTC.

| # | Sub-job | When It Runs | What It Does |
|---|---------|-------------|--------------|
| 1 | cleanupPhotos | Every day | Deletes orphaned `profilePhotos` (failed uploads >1-24h) + Vercel Blobs |
| 2 | cleanupKeys | Every day | Deletes expired `dashboardIdempotencyKeys` |
| 3 | billingReconciliation | Every day | Reconciles DB subscription status with Stripe, replays stored unprocessed webhooks without Stripe writes, and records a `reconciliation_run` heartbeat |
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
