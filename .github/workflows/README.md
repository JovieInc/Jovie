# GitHub Workflows

## Deployment Model

This repository uses trunk-based development with a single long-lived branch:

- **`main`** → deploys directly to **jov.ie** (production)
- PRs run only the fast merge gate (typecheck, lint, boundaries, guardrails)
- Optional heavyweight PR verification is label-gated via `testing`
- Push to `main` runs post-merge verification (build, smoke, E2E) and then deploys to production
- Post-deploy: canary health gate + production smoke tests

## Vercel Preview Deployments

### Preview Deployment Workflow

Vercel preview deployments for pull requests and feature branches are handled by the `ci.yml` workflow via the `ci-pr-vercel-preview` job.

#### Features:

- Automated preview deployments for pull requests
- PR comment with deployment URL
- Manual triggering via workflow_dispatch for specific PRs
- Fork safety and concurrency controls

#### Triggers:

- Pull request events (opened, reopened, synchronize)
- Push events to non-main branches
- Manual workflow dispatch with PR number input

#### Secrets:

- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## CI Workflow

The main CI workflow `ci.yml` is the gatekeeper for PRs to `main`. It includes:

- **Fast PR gate** (typecheck, lint, boundaries, guardrails) - runs on all PRs and merge queue, required for merge
- **Extended verification** (build, a11y, layout, smoke) - runs only for PRs labeled `testing`
- **Post-merge verification** (build, smoke, E2E) - runs on pushes to `main` before deploy
- **Production deploy** - automatic deployment from the `main` branch to jov.ie after post-merge verification passes
- **Production environment binding** - the `deploy` job targets GitHub `Production – jovie` and Vercel `production`, so `main` remains the only production deploy path
- **Build engine** - Next.js builds use Turbopack, while Turborepo remote cache is shared across CI and Vercel via `TURBO_TOKEN` and `TURBO_TEAM`
- **Canary health gate** - verifies deployment health before declaring success
- **Smoke tests** - validates critical paths after deploy
- **Lighthouse CI** - performance metrics on each deploy

## Promptfoo Eval Cost Controls

Promptfoo has explicit cost lanes:

- **Deterministic evals** run through `pnpm run evals` and the `Promptfoo Evals (deterministic)` CI job. They unset live model keys, set `JOVIE_RUN_LIVE_EVALS=0`, use `cost=deterministic`, and run with `--no-share --no-write`.
- **Live evals** run only from `pnpm run evals:live`, which is wrapped by Doppler at the repo root and still fails unless `JOVIE_RUN_LIVE_EVALS=1` and `AI_GATEWAY_API_KEY` are present. The live Promptfoo lane is manual-only, concurrency 1, and uses `--no-share --no-write`.
- **Live HTTP evals** run only from `pnpm run evals:live:http`, require `JOVIE_RUN_LIVE_HTTP_EVALS=1`, `JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1`, and a loopback `JOVIE_PROMPTFOO_BASE_URL`. Start the local server with `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`; this lane exercises real `/api/chat` HTTP auth and persistence with deterministic no-model chat paths.
- **Live HTTP rate-limit evals** run only from `pnpm run evals:live:http:rate-limit`, require `JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS=1`, `JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1`, `JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1`, and a loopback `JOVIE_PROMPTFOO_BASE_URL`. Start the local server with `JOVIE_DISABLE_REDIS_FOR_EVALS=1` and `JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1`; this lane is manual-only and validates fail-closed 429 headers without touching shared Redis or model providers.
- **Promptfoo eval-infrastructure-only PRs** short-circuit to deterministic eval CI before the `testing` label can fan out into Neon, Lighthouse, mobile overflow, Playwright, or Vercel preview deploy jobs. Use manual `workflow_dispatch` when a full CI run is intentionally needed for eval infrastructure.

The legacy `evals-periodic.yml` workflow is also manual-only. It has no scheduled trigger, requires typing `RUN_LIVE_EVALS` into `confirm_live_llm_evals`, and runs at concurrency 1 if explicitly invoked.

Ship now / Re-evaluate when / Then:

- Ship now: deterministic PR evals stay free, Promptfoo eval-infrastructure-only PRs do not fan out into heavyweight CI or preview deploys even when auto-labeled `testing`, every live LLM eval surface requires manual intent and concurrency 1, live HTTP route evals stay manual plus no-model, and live rate-limit evals require Redis/model-key-disabled local server mode.
- Re-evaluate when: manual live evals catch a release-blocking regression twice in 30 days or observed live eval cost stays below the agreed per-run budget for 10 consecutive runs.
- Then: add a capped scheduled or PR-gated live subset with explicit case count, concurrency 1, and per-run cost reporting.

## Agent Landing Sweep

The `agent-landing-sweep.yml` workflow runs every 15 minutes as a scheduled fallback for the event-driven approve job in `agent-pipeline.yml`. It sweeps open, non-draft agent PRs and enables auto-merge on any that pass all guardrails:

- CI PR Ready check passed
- Scope judge passed
- CodeRabbit not blocking
- No sensitive files changed (auth, billing, migrations, CI, etc.)
- No `needs-human` label
- Has `automerge`, `auto-approved`, or `ai:ready-to-merge` label
- Queue pressure below threshold (12 PRs already queued)

This catches PRs that the event-driven pipeline missed due to delivery delays or race conditions.

## GitHub AI Automation

The GitHub-native agent path uses two workflows:

- **`github-ai-orchestrator.yml`**
  - Trigger: `issues.labeled` with `agent-ready`, or `workflow_dispatch` replay
  - Behavior: claims the issue (`status:in-progress`), runs Claude Code implementation, opens a PR with `Fixes #N`, then moves the issue to `status:in-review`
  - Capacity controls: new agent work is deferred when 5 agent PRs are already open

- **`github-ai-dispatcher.yml`**
  - Trigger: every 15 minutes + `workflow_dispatch`
  - Behavior: scans open `agent-ready` issues without status labels, dispatches the orchestrator when capacity allows

- **`linear-sync-on-merge.yml`** (parallel-run mirror only)
  - Trigger: `pull_request.closed` (merged)
  - Behavior: reads legacy Linear markers from PR body and syncs the mirror issue to Done until `TRACKER_GITHUB_ONLY=1`

## Main CI Health Monitor

The `main-ci-health-monitor.yml` workflow runs every 15 minutes and alerts `#alerts-production` when:

- A `ci.yml` run on `main` is queued/in-progress for more than 30 minutes
- The latest `main` CI run failed and remains unresolved for over 30 minutes
- No successful `main` CI has occurred for 3+ hours while merged PRs are waiting

This closes the silent-failure gap when merge queue passes but `main` post-merge CI is blocked.

## Synthetic Monitoring

The `synthetic-monitoring.yml` workflow runs golden path tests against jov.ie on a schedule to catch production issues.

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

### Tiers

| Tier | Purpose | Merge-gate jobs |
| --- | --- | --- |
| Fast Gate | Cheap deterministic checks required for every merge candidate. | `ci-fast`, `Typecheck Stable Safety Gate`, `Unit Tests` |
| Structural Contract | Mechanical architecture, workflow, docs, and repo-rule checks. | `Structural Contract`, `CI Risk Classifier` |
| Risk-Triggered Smoke | Focused smoke validation for sensitive auth, billing, DB, config, and agent-control-plane changes. | `E2E Smoke (PR Fast Feedback)`, `Golden Path (PR)` |
| Preview Evidence | Preview deploys and visual/a11y/performance evidence for review. | `Build (public routes)`, `Lighthouse (public routes PR)`, `Lighthouse (dashboard PR)`, `Lighthouse (onboarding PR)`, `Lighthouse (admin PR)`, `Preview Deploy (PR)` |
| Main Deploy | Post-merge staging, canary, production promotion, and deploy-health gates. | none |
| Scheduled Cleanup | Report-first cleanup loops for flakes, coverage drift, harness health, and main-CI repair. | none |

### Merge Gates

`PR Ready` may require only jobs declared as merge gates below. Informational jobs must stay out of the aggregate merge gate.

| Job | Tier | Local remediation command |
| --- | --- | --- |
| `ci-fast` | fast-gate | `pnpm run typecheck && pnpm run biome:check` |
| `Typecheck Stable Safety Gate` | fast-gate | `pnpm --filter @jovie/web run typecheck:stable -- --pretty false` |
| `Structural Contract` | structural-contract | `pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm doc:freshness:check && pnpm test:reliability-detectors` |
| `CI Risk Classifier` | structural-contract | `pnpm ci:harness:check` |
| `Unit Tests` | fast-gate | `pnpm --filter=@jovie/web run test:fast` |
| `Build (public routes)` | preview-evidence | `pnpm run build:web` |
| `Lighthouse (public routes PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:public:launch` |
| `Lighthouse (dashboard PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:dashboard:pr` |
| `Lighthouse (onboarding PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:onboarding:pr` |
| `Lighthouse (admin PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:admin:pr` |
| `E2E Smoke (PR Fast Feedback)` | risk-triggered-smoke | `pnpm run test:web:smoke` |
| `Golden Path (PR)` | risk-triggered-smoke | `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:golden-path:ci` |
| `Preview Deploy (PR)` | preview-evidence | `pnpm run build:web` |

### Risk-Triggered Evidence

Sensitive changes are classified deterministically before auto-merge. High-risk changes require smoke and/or preview evidence and block unattended auto-merge.

| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |
| --- | --- | --- | --- | --- |
| CI and workflow control plane | high | yes | no | no |
| Agent control plane | high | yes | no | no |
| Auth and identity | high | yes | yes | no |
| Activation, AI, and background data flows | high | yes | yes | no |
| Billing and money movement | high | yes | yes | no |
| Database and migrations | high | yes | no | no |
| Proxy and middleware | high | yes | yes | no |
| Environment and runtime config | high | yes | yes | no |
| Public UI and profile surfaces | medium | no | yes | no |
<!-- ci-harness:end -->
