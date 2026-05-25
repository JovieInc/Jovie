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

Promptfoo has two explicit cost lanes:

- **Deterministic evals** run through `pnpm run evals` and the `Promptfoo Evals (deterministic)` CI job. They unset live model keys, set `JOVIE_RUN_LIVE_EVALS=0`, use `cost=deterministic`, and run with `--no-share --no-write`.
- **Live evals** run only from `pnpm run evals:live`, which is wrapped by Doppler at the repo root and still fails unless `JOVIE_RUN_LIVE_EVALS=1` and `AI_GATEWAY_API_KEY` are present. The live Promptfoo lane is manual-only, concurrency 1, and uses `--no-share --no-write`.

The legacy `evals-periodic.yml` workflow is also manual-only. It has no scheduled trigger, requires typing `RUN_LIVE_EVALS` into `confirm_live_llm_evals`, and runs at concurrency 1 if explicitly invoked.

Ship now / Re-evaluate when / Then:

- Ship now: deterministic PR evals stay free, while every live LLM eval surface requires manual intent and concurrency 1.
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

## Linear AI Automation

The Linear automation path uses two workflows:

- **`linear-ai-orchestrator.yml`**
  - Trigger: `repository_dispatch` (`linear_todo_ready`) from `/api/webhooks/linear`
  - Behavior: waits for a CodeRabbit plan marker, assigns the issue to Codex in Linear, runs implementation, pushes a codex/* branch for auto-PR creation, then updates Linear to review
  - Includes bounded polling with configurable loop counts (`MAX_PLAN_WAIT_ATTEMPTS`, `PLAN_POLL_INTERVAL_SECONDS`)
  - Burn controls: routine dispatch defaults to `model_tier: economy`; only an explicit
    `premium` payload preserves the premium path
  - Capacity controls: new agent work is deferred when 5 agent PRs are already open

- **`linear-sync-on-merge.yml`**
  - Trigger: `pull_request.closed` (merged)
  - Behavior: reads Linear markers from PR body, moves issue to done, comments merge details back to Linear

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
