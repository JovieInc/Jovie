# GitHub Workflows

## Deployment Model

This repository uses trunk-based development with a single long-lived branch:

- **`main`** → releases to **jov.ie** only after exact queue provenance or the fail-closed direct-main fallback
- Source PRs run deterministic fast checks only (typecheck, lint, portable iOS contract, boundaries, policy, diff secret scan)
- GitHub's native `merge_group` head adds five affected unit shards, one hosted build + layout workspace, path-selected hosted Xcode build/test, and path-selected model-free Promptfoo/golden evals
- A hosted secretless route job uses the fixed unit pool only after a fresh successful Runner Heartbeat; stale, malformed, timed-out, or API-uncertain evidence selects `ubuntu-latest` before unit shards queue
- Heavy evidence runs only through hosted manual, scheduled, or repository events; no PR label fans out CI
- Every exact successful `main` CI attempt enters one fixed `production-mutation` FIFO; the controller revalidates the CI attempt and current SHA before staging or production mutation, with one bounded hosted recovery rerun. A completed-success controller plus exact successful `Production Verified` job makes a generation marker authoritative; one interrupted post-upload marker can consume one SHA-bound recovery lease before any repeated mutation.
- Post-deploy hosted public, homepage, and Lighthouse probes target the immutable deployment URL while the controller retains the lease through `Production Verified`. Staging first proves exact deployment-ID/full-SHA alias ownership, then staging and production exercise both real OAuth buttons and Better Auth catch-all requests; `/api/auth/ok` is namespace liveness, not runtime auth proof. Authenticated smoke is explicit optional evidence until one complete credential pair is configured.
- Production jobs use explicit least privilege: only the dedicated no-checkout, no-secret `attest-staging-build` job receives OIDC/attestation writes; secret-bearing deploy jobs receive no OIDC/attestation permission. Every checkout disables persisted Git credentials, and Vercel tokens/runtime values stay in process environment rather than command arguments.

## Drain Activation Order

Workflow triggers below describe YAML capability, not live GitHub enablement.
During the all-PR drain, enable **Merge Queue Auto-Enroll** and **Auto-Ready Agent
Drafts** first. Enable **Main CI Health Monitor** and **Main Autofix** only after
the queue and production topology have produced bounded proof. Keep GitHub AI
Orchestrator, Agent Pipeline, PR Conflict Handler, Agent Tick, Stuck Draft
Auto-Close, Auto-Fix Lint on Agent Drafts, Taste Classifier/Guard, Auto-PR on
Agent Push, and the legacy Release Loop disabled throughout the drain. The newly added Production
Controller, Production Controller Health, and Production Release workflows
should register active on land; verify their live state before relying on
continuous delivery. A workflow-file merge does not re-enable a workflow that
GitHub already marks disabled. GitHub AI Orchestrator workflow ID `306926687`
was verified `disabled_manually` at rollout preparation. Runner Health Monitor
workflow ID `307794302` was also verified `disabled_manually` after its legacy
repository-variable mutation failed with HTTP 403; keep it disabled until this
observer-only definition lands and is proven, then re-enable the observer.

## Vercel Preview Deployments

### Preview Deployment Workflow

Explicit Vercel preview deployments for a dispatched ref are handled by the `ci.yml` workflow via the `ci-pr-vercel-preview` job.

#### Features:

- Explicit preview deployments for the exact dispatched ref
- Deployment URL in the workflow output and log
- Ref-scoped concurrency controls

#### Triggers:

- Manual `CI` dispatch on the exact ref with `run_preview_deploy=true`

#### Secrets:

- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## CI Workflow

The main CI workflow `ci.yml` is the gatekeeper for PRs to `main`. It includes:

- **Fast PR gate** (typecheck, lint, boundaries, guardrails, diff secret scan) - required on every source PR
- **Combined integration gate** (fast checks, five affected unit shards, migration policy, build + layout, path-selected Xcode build/test, path-selected model-free Promptfoo/golden evals) - required on GitHub's exact `merge_group` SHA
- **Direct-main fallback** - reruns the complete combined-head contract when an exact successful queue proof is unavailable
- **Explicit deep evidence** (preview, Neon, E2E, Lighthouse, a11y, Storybook, smoke) - hosted manual/scheduled/event work only; never a source-PR event
- **Production release** - `production-controller.yml` owns exact CI authorization and the repo-wide FIFO; `.github/workflows/production-release.yml` owns staging, canary, promotion, observational Sentry/OAuth gates, and the only rollback job
- **Production environment binding** - production promotion targets GitHub `Production – jovie` and Vercel `production`, so `main` remains the only production release path
- **Build engine** - Next.js builds use Turbopack, while Turborepo remote cache is shared across CI and Vercel via `TURBO_TOKEN` and `TURBO_TEAM`
- **Post-deploy probes** - one hosted public-surface job uses the shared deadline-bound semantic verifier for homepage/profile/critical routes and then checks SEO; staging OAuth runs only after exact alias ownership and both staging/production click the real provider UI and observe the Better Auth catch-all plus provider redirect contract; live Lighthouse gives its third-party uploader only a private mode-0400 copy of the hash-sealed evidence set and re-proves both source and isolated identity afterward, as described by the [immutable deployment probe contract](../../docs/ci/production-deployment-probes.md); authenticated smoke skips honestly only when no complete credential pair exists and otherwise records the actual Playwright result; the final canonical/SHA verifier runs under the production lease and blocks `Production Verified`

## Promptfoo Eval Cost Controls

Promptfoo has explicit cost lanes:

- **Deterministic evals** run through `pnpm run evals` and the `Promptfoo Evals (deterministic)` CI job. They unset live model keys, set `JOVIE_RUN_LIVE_EVALS=0`, use `cost=deterministic`, and run with `--no-share --no-write`.
- **Live evals** run only from `pnpm run evals:live`, which is wrapped by Doppler at the repo root and still fails unless `JOVIE_RUN_LIVE_EVALS=1` and `AI_GATEWAY_API_KEY` are present. The live Promptfoo lane is manual-only, concurrency 1, and uses `--no-share --no-write`.
- **Live HTTP evals** run only from `pnpm run evals:live:http`, require `JOVIE_RUN_LIVE_HTTP_EVALS=1`, `JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1`, and a loopback `JOVIE_PROMPTFOO_BASE_URL`. Start the local server with `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`; this lane exercises real `/api/chat` HTTP auth and persistence with deterministic no-model chat paths.
- **Live HTTP rate-limit evals** run only from `pnpm run evals:live:http:rate-limit`, require `JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1`, `JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1`, `JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1`, and a loopback `JOVIE_PROMPTFOO_BASE_URL`. Start the local server with `JOVIE_DISABLE_REDIS_FOR_EVALS=1` and `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`; this lane is manual-only and validates fail-closed 429 headers without touching shared Redis or model providers.
- **Promptfoo eval-infrastructure-only PRs** stay on the deterministic fast source gate; generic `testing` metadata cannot fan out Neon, Lighthouse, mobile overflow, Playwright, eval, or preview deploy jobs. Path-selected deterministic evals run on the exact merge-group head (and direct-main fallback); exhaustive or live eval evidence remains explicit manual work.

The legacy `evals-periodic.yml` workflow is also manual-only. It has no scheduled trigger, requires typing `RUN_LIVE_EVALS` into `confirm_live_llm_evals`, and runs at concurrency 1 if explicitly invoked.

Ship now / Re-evaluate when / Then:

- Ship now: path-selected deterministic evals stay model-key-free on combined heads, Promptfoo eval-infrastructure-only PRs do not fan out into heavyweight source-PR CI or preview deploys from generic `testing` metadata, every live LLM eval surface requires manual intent and concurrency 1, live HTTP route evals stay manual plus no-model, and live rate-limit evals require Redis/model-key-disabled local server mode.
- Re-evaluate when: manual live evals catch a release-blocking regression twice in 30 days or observed live eval cost stays below the agreed per-run budget for 10 consecutive runs.
- Then: add a capped scheduled or PR-gated live subset with explicit case count, concurrency 1, and per-run cost reporting.

## Agent Landing Sweep

The `agent-landing-sweep.yml` workflow is manual-only. When explicitly dispatched, it sweeps open, non-draft agent PRs and enables auto-merge on any that pass all guardrails:

- All required source contexts passed
- No unknown non-advisory terminal-red check
- No sensitive files changed (auth, billing, migrations, CI, etc.)
- No `needs-human` label
- Has `automerge`, `auto-approved`, or `ai:ready-to-merge` label
- Queue pressure below threshold (12 PRs already queued)

Use it as an operator recovery tool when the event-driven pipeline missed delivery; it is not an active polling loop.

## GitHub AI Automation

The GitHub-native agent path uses two workflows:

- **`github-ai-orchestrator.yml`**
  - Trigger: `issues.labeled` with `agent-ready`, or `workflow_dispatch` replay
  - Behavior: claims the issue (`status:in-progress`), runs Claude Code implementation, opens a PR with `Fixes #N`, then moves the issue to `status:in-review`
  - Capacity controls: new agent work is deferred when 5 agent PRs are already open

- **`github-ai-dispatcher.yml`**
  - Trigger: `workflow_dispatch` only
  - Behavior: scans open `agent-ready` issues without status labels, dispatches the orchestrator when capacity allows

- **`linear-sync-on-merge.yml`** (parallel-run mirror only)
  - Trigger: `pull_request.closed` (merged)
  - Behavior: reads legacy Linear markers from PR body and syncs the mirror issue to Done until `TRACKER_GITHUB_ONLY=1`

## Main CI Health Monitor

The `main-ci-health-monitor.yml` workflow declares `8,28,48 * * * *` UTC (every
20 minutes) plus manual dispatch. It remains disabled during the initial drain
activation and, once explicitly enabled with Main Autofix after topology proof,
alerts `#alerts-production` when:

- A `ci.yml` run on `main` is queued/in-progress for more than 45 minutes
- The latest `main` CI run failed and remains unresolved for over 45 minutes
- No successful `main` CI has occurred for 3+ hours while merged PRs are waiting

It issues at most one failed-job rerun before autofix becomes eligible at
`run_attempt >= 2`. Before fixed-runner repair begins, Main Autofix records a
durable exact-SHA commit-status owner. Active workflows/PRs and terminal markers
suppress duplicate Slack alerts and dispatch only while that SHA remains red;
a newer main SHA or green rerun wins automatically. An authoritatively active
workflow owns the SHA until its bounded workflow timeout makes it terminal; an
orphaned marker gets only a 30-minute consistency grace lease. Three expired,
cancelled, or otherwise terminal leases become a terminal escalation.
Repair-state API uncertainty is alerted at most once per SHA when its
acknowledgment can be persisted.

## Synthetic Monitoring

The `synthetic-monitoring.yml` workflow runs production canaries against jov.ie at `17 */6 * * *` UTC plus manual dispatch.

## Neon Database

- **Ephemeral branches** - Created per PR for isolated testing
- **Cleanup** - `neon-ephemeral-branch-cleanup.yml` deletes branches when PRs close
- **Protected branch** - `main` is the production database branch

## Agent Push-to-PR Bridge

The `auto-pr-on-push.yml` workflow closes the handoff gap for agent branches
(`codex/*`, `claude/*`, `codegen-bot/*`, `linear/*`) by creating a draft PR
after a push. It enforces the same 5 open-agent-PR capacity cap before creating
new draft PRs; downstream verification and agent pipeline jobs decide when a
draft is ready and whether auto-merge is eligible.

<!-- ci-harness:start -->
## CI Agent Harness

Generated from `.github/ci-harness/manifest.json`. Do not hand-edit this block; run `pnpm ci:harness:docs` after changing the manifest.

### Stage Contract

| Stage | Exact responsibility |
| --- | --- |
| Source PR | Deterministic path + brand classification, risk classification, `ci-fast`, and diff secret scan. `Migration Guard`, `Fork PR Gate`, and `PR Size Guard` remain separate required contexts. |
| Native merge queue | Re-run deterministic gates on the exact `merge_group` head, then require five affected unit shards, one hosted build + layout workspace, path-selected Xcode, and model-free semantic evals. |
| Queue-proven main | Reuse the exact successful merge-group `PR Ready` proof and skip duplicate fallback work. |
| Direct/admin main | Fail closed through path/risk/fast/secret/migration, all five unit shards, and the combined hosted build + layout job; skipped placeholders are invalid. |
| Production release | One reusable staging/canary/promotion/rollback DAG under one non-cancelling caller lease. |
| Post-deploy | Hosted public, auth, homepage, and explicitly provisioned Lighthouse probes settle into `Production Verified` before notification. |
| Scheduled/manual/event | Exhaustive E2E, Neon, a11y, performance, eval, visual, slop, brand, and repair/report loops. |

### Tiers

| Tier | Purpose | Merge-gate jobs |
| --- | --- | --- |
| Source Fast Gate | Cheap deterministic checks required on each source PR and repeated on the synthetic combined head. | `Path Changes` (both), `ci-fast` (both), `Secret Scan (gitleaks + trufflehog)` (both), `Migration Guard` (both), `Unit Tests` (merge-group) |
| Structural Contract | Mechanical architecture, workflow, docs, and repo-rule checks. | `CI Risk Classifier` (both) |
| Explicit Deep Evidence | Manual, scheduled, or event-driven deep evidence that never starts from or delays ordinary PR Ready. | none |
| Preview Evidence | Hosted manual/event visual, a11y, performance, and preview evidence outside the source-PR event. | none |
| Combined Integration | Affected unit, one hosted build-plus-layout workspace, path-selected Xcode, and model-free semantic evals for GitHub's exact merge-group head. | `Build + Layout (combined)` (merge-group), `iOS Build + Test (combined)` (merge-group), `Promptfoo Evals (deterministic)` (merge-group), `Golden Eval Set (deterministic)` (merge-group) |
| Production Release | Each exact successful main CI attempt feeds one fixed production-mutation FIFO from authorization through staging, promotion, centralized rollback, immutable probes, canonical proof, marker, and best-effort notification; one hosted monitor retry is bounded to controller attempt 1. | none |
| Post-deploy Verification | Hosted public, homepage, and Lighthouse probes target the immutable release URL under the controller lease; authenticated smoke runs only when a complete credential pair exists, while public Better Auth/OAuth gates remain blocking. | none |
| Scheduled Cleanup | Report-first cleanup loops for flakes, coverage drift, harness health, and main-CI repair. | none |

### Merge Gates

Source `PR Ready` may require only `source-pr`/`both` jobs below. Merge-group `PR Ready` may require only `merge-group`/`both` jobs. Informational evidence stays out of both required aggregates.

| Job | Gate stage | Tier | Local remediation command |
| --- | --- | --- | --- |
| `Path Changes` | both | fast-gate | `git diff --name-only origin/main...HEAD` |
| `ci-fast` | both | fast-gate | `pnpm run typecheck && pnpm run biome:check` |
| `CI Risk Classifier` | both | structural-contract | `pnpm ci:harness:check` |
| `Secret Scan (gitleaks + trufflehog)` | both | fast-gate | `./scripts/security/scan-secrets.sh ci-pr origin/main` |
| `Migration Guard` | both | fast-gate | `cd apps/web && ./scripts/check-migrations.sh && ./scripts/validate-migrations.sh` |
| `Unit Tests` | merge-group | fast-gate | `pnpm --filter=@jovie/web run test:fast` |
| `Build + Layout (combined)` | merge-group | combined-integration | `pnpm run build:web && pnpm --filter @jovie/web exec playwright test tests/e2e/hud-scroll.spec.ts --config=playwright.config.noauth.ts --project=chromium` |
| `iOS Build + Test (combined)` | merge-group | combined-integration | `pnpm run ios:lint && pnpm run ios:test` |
| `Promptfoo Evals (deterministic)` | merge-group | combined-integration | `pnpm run evals` |
| `Golden Eval Set (deterministic)` | merge-group | combined-integration | `pnpm run evals:golden` |

### Risk Signals and Opt-in Evidence

Sensitive changes are classified deterministically on source PRs. Smoke and preview are routing signals for hosted manual, scheduled, or event-driven evidence; no PR label allocates a heavy source-event lane. The generic `testing`, `deep-ci`, `launch-candidate`, and `deploy-preview` labels have no CI fan-out semantics.

| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |
| --- | --- | --- | --- | --- |
| CI and workflow control plane | high | yes | yes | no |
| Agent control plane | high | yes | no | no |
| Auth and identity | high | yes | yes | no |
| Activation, AI, and background data flows | high | yes | yes | no |
| Billing and money movement | high | yes | yes | no |
| Database and migrations | high | yes | no | no |
| Proxy and middleware | high | yes | yes | no |
| Environment and runtime config | high | yes | yes | no |
| Public UI and profile surfaces | medium | no | yes | no |
<!-- ci-harness:end -->
