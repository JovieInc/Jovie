# Agents Guide (Jovie)

This file defines how AI agents (Claude, Codex, Copilot, etc.) work in this repo so we ship fast while keeping `main` and `production` clean.

## 0. Analytics & Feature Flags (Statsig-only)

- Statsig is the **only** product analytics and feature flag platform used in this repo.
- Do **not** add or reintroduce PostHog, Segment, RudderStack, or any other analytics/flags SDKs.
- Use Statsig feature gates/experiments for non-essential flows; leave MVP-critical flows ungated unless explicitly flagged.

## 1. Branch & Environment Model

- **Feature branches**
  - **Base:** always branch from `main`.
  - **Naming:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>` (3–6 word kebab-case slug).
  - **Never** push directly to `main` or `production`.

- **Long-lived branches**
  - **`main`**
    - Source of truth for all day-to-day development.
    - Must always be **green** on: `pnpm typecheck`, `pnpm lint`, `pnpm test`, basic E2E smoke.
    - Deploys to the **Preview Vercel environment** and Neon child DB branch.
  - **`production`**
    - Mirrors what users see in production.
    - Only updated via **release PRs from `main` → `production`**, never by direct commits.

- **Neon**
  - One **primary production branch** mapped to Git `production`.
  - One **child branch** (the preview/"main" DB branch) kept in sync with production via reset + migrations.
  - **Ephemeral branches** created per feature/PR for full CI and **auto-deleted on PR close** (see CI workflows).

## 2. PR Expectations (All Agents)

- **Before opening a PR**
  - Start from latest `main`.
  - Keep scope tight: one user-visible outcome per PR.
  - Wrap new behavior behind a feature flag named `feature_<slug>` where appropriate.

- **When opening a PR**
  - **Base branch:** `main`.
  - **Title:** `[feat|fix|chore]: <slug>` (conventional commit style).
  - **Body includes:**
    - Goal (1–2 sentences).
    - KPI / outcome (if applicable).
    - Statsig events/experiments added/updated (no PostHog).
    - Rollback plan (usually "disable feature flag" or "revert PR").
  - Add label `auto-merge` when it is safe for CI + automation to merge once green.

- **Required checks for auto-merge into `main`**
  - Fast lane:
    - `pnpm typecheck` (CI job: Typecheck).
    - `pnpm lint` (CI job: Lint).
  - For higher-risk changes (DB, core flows), ensure full CI is enabled (`full-ci` label) so build, unit tests, Drizzle checks, and smoke E2E run.

## 3. Codex Auto-Fix CI

- **Trigger:**
  - Runs after the primary `CI` workflow **fails** on a PR into `main`.
  - Only for PRs from the same repo (no forks) that have the `auto-merge` label.

- **Behavior:**
  - Uses the Codex CLI to:
    - Read the repo and CI logs.
    - Apply minimal, targeted fixes so `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
  - Verifies checks locally inside the workflow.
  - Opens a dedicated `codex/auto-fix-<id>` branch + PR against the original feature branch.

- **Agent obligations:**
  - Do **not** fight Codex auto-fixes; incorporate them or adjust with a follow-up PR.
  - If Codex cannot safely fix an issue (complex refactor, product decision), add `needs-human` or `no-auto-merge` to halt automation.

## 4. Auto-Merge Rules

- Auto-merge is managed by `.github/workflows/auto-merge.yml`:
  - **Regular PRs:** auto-merge allowed when:
    - Base is `main`.
    - PR has `auto-merge` label.
    - CI checks configured for `main` are green.
    - No blocking labels: `blocked`, `human-review`, `no-auto-merge`, `claude:needs-fixes`, `needs-human`.
  - **Dependabot:** auto-merge for patch/minor + security, subject to policy checks.
  - **Codegen/automation PRs:** auto-merge when labeled appropriately (e.g. `codegen`).
  - **Production promotion PRs:** **never** auto-merged; must be manually approved.

## 5. Neon & Migrations

- **Do not** run Drizzle migrations manually in ad-hoc ways.
- CI is responsible for:
  - Creating per-branch Neon ephemeral DBs for full CI when needed.
  - Resetting the long-lived preview/"main" DB branch from the production parent using `neonctl`.
  - Running `drizzle:check` and `drizzle:migrate:*` scripts against the appropriate DATABASE_URL.
- Per PR:
  - Aim for **one migration per PR**.
  - Avoid destructive changes without a clear data-migration plan.

## 6. Agent-Specific Notes

- **Claude (feature work, refactors)**
  - Own end-to-end changes: schema → backend → UI → tests.
  - Prefer server components and feature-flagged rollouts.
  - Always use Statsig for feature gates/experiments; do not introduce any other flag or analytics SDKs.

- **Codex (CI auto-fix, focused cleanups)**
  - Operates only via the `codex-autofix` workflow.
  - Keeps edits minimal and focused on fixing CI regressions.

- **Copilot / other LLM helpers**
  - Local assistance only; any branch/PR they help produce must still obey this guide.

## 7. Safety & Guardrails

- **No direct dependencies** on analytics/flags outside of the existing Statsig and analytics wrappers in `@/lib` and `@/lib/statsig`.
- **No direct Neon branch management** from agents; always go through CI workflows.
- **No direct pushes** to `main` or `production`.
- New features ship **behind Statsig flags/experiments** and with **Statsig events** (or equivalent Statsig metrics) for primary actions.
