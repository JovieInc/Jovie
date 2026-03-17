# GitHub UI Setup For Fast Iteration

This document captures the GitHub UI configuration that should back the fast-iteration CI model in [`.github/workflows/ci.yml`](C:\Users\Tim White\.codex\worktrees\c95b\Jovie\.github\workflows\ci.yml).

## Goal

- Preview deploys are the default QA surface for internal PRs.
- Merge queue blocks only on the fast deterministic lane.
- `main` deploys to production immediately after merge.
- Production health checks run after deploy.
- Long E2E and soak-style checks do not sit in the synchronous shipping path.

## Rulesets

Current active ruleset:

- Name: `Main Branch Protection`
- Target: `refs/heads/main`
- Merge queue: enabled
- Merge method in queue: `SQUASH`
- Max entries to build: `5`
- Min entries to merge: `1`
- Max entries to merge: `10`
- Grouping strategy: `ALLGREEN`
- Check response timeout: `10` minutes

Recommended required checks for `main`:

- `Fork PR Gate`
- `PR Ready`
- `Gitleaks Secret Scanning`
- `SonarCloud Quality Gate`
- `Migration Guard`

These are the intended active required checks as of March 17, 2026.

Recommended UI settings for the `main` ruleset:

1. Go to `Settings` -> `Rules` -> `Rulesets`.
2. Open `Main Branch Protection`.
3. Confirm branch target is only `refs/heads/main`.
4. Confirm `Require a pull request before merging` is enabled.
5. Confirm `Require status checks to pass` is enabled with only:
   - `Fork PR Gate`
   - `PR Ready`
   - `Gitleaks Secret Scanning`
   - `SonarCloud Quality Gate`
   - `Migration Guard`
6. Confirm `Require branches to be up to date before merging` is enabled.
7. Confirm `Merge queue` is enabled with:
   - merge method `Squash`
   - `max entries to build = 5`
   - `min entries to merge = 1`
   - `max entries to merge = 10`
8. Do not add long-running checks like extended smoke, full E2E, Lighthouse, or Sentry soak as required status checks.

## Environments

Canonical environments used by the workflow:

- `Preview – jovie`
- `Production – jovie`

Current state from the GitHub API:

- `Preview – jovie`
  - admins can bypass: `true`
  - protection rules: none
- `Production – jovie`
  - admins can bypass: `false`
  - protection rules: none

There is also a duplicate legacy environment:

- `Preview - jovie`

Recommended cleanup:

1. Keep `Preview – jovie` as the canonical preview environment.
2. Keep `Production – jovie` as the canonical production environment.
3. Delete or stop using `Preview - jovie` so the workflow and UI use one exact name.

Recommended environment configuration:

### Preview – jovie

1. Go to `Settings` -> `Environments` -> `Preview – jovie`.
2. Leave required reviewers disabled.
3. Leave wait timers disabled.
4. Allow admin bypass.
5. Do not restrict deployment branches unless you specifically want to lock preview to PR workflows only.

### Production – jovie

1. Go to `Settings` -> `Environments` -> `Production – jovie`.
2. Keep required reviewers disabled.
3. Keep wait timers disabled.
4. Keep admin bypass disabled if you want a stricter production audit trail.
5. Do not add manual approval here if your goal is fast trunk-based deploys after merge.

## Secrets And Variables Used By The Workflow

The workflow references these repository-level secrets or variables in GitHub Actions:

- Secrets
  - `DATABASE_URL`
  - `DATABASE_URL_MAIN`
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `SONAR_TOKEN`
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_AUTOMATION_BYPASS_SECRET`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`
  - `SLACK_WEBHOOK_URL`
  - `NEON_API_KEY`
- Variables
  - `NEON_PROJECT_ID`
  - `CI_FAST_RUNNER`
  - `TURBO_TEAM`

## Operating Model

1. Open an internal PR to `main`.
2. Wait for `PR Ready`, `Gitleaks Secret Scanning`, and `SonarCloud Quality Gate` to pass.
3. Use the automatic `Preview Deploy (PR)` URL for QA.
4. Merge once preview looks good.
5. Let `main` deploy immediately to production.
6. Watch the short production health gate and post-deploy monitors.
