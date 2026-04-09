# Launch Gates

## Required CI Jobs For Launch-Candidate PRs

Launch-candidate PRs are not launch-ready unless all of these jobs are green when the launch gate is triggered:

- `PR Ready`
- `Golden Path (PR)`
- `Lighthouse (dashboard PR)`
- `Lighthouse (onboarding PR)`
- `Launch Perf Budgets (PR)`

The launch gate is path-based. It turns on for changes touching:

- onboarding routes, components, or libs
- auth signup/signin entrypoints used by the golden path
- dashboard shell or releases flows
- billing and checkout routes used by the golden path
- golden-path Playwright specs and helpers
- launch-gate CI, Lighthouse, or perf-budget configuration

Docs-only changes do not trigger launch-gate jobs.

## What Each Gate Means

- `Golden Path (PR)`: `tests/e2e/golden-path.spec.ts` passes in CI against an ephemeral Neon database.
- `Lighthouse (dashboard PR)`: authenticated dashboard Lighthouse stays within the blocking thresholds in [apps/web/.lighthouserc.dashboard.pr.json](/Users/timwhite/conductor/workspaces/jovie/memphis-v1/apps/web/.lighthouserc.dashboard.pr.json).
- `Lighthouse (onboarding PR)`: onboarding Lighthouse stays within the blocking thresholds in [apps/web/.lighthouserc.onboarding.pr.json](/Users/timwhite/conductor/workspaces/jovie/memphis-v1/apps/web/.lighthouserc.onboarding.pr.json).
- `Launch Perf Budgets (PR)`: the Gmail-equivalent latency contract passes for:
  - `--group onboarding`
  - `--route-id creator-releases`

This is the required 100ms perceived-latency check. Lighthouse does not measure that warm-navigation budget directly.

## Local Equivalents

Run from the repo root with pinned Doppler scope.

Golden path:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:golden-path:ci
```

Onboarding and creator-releases perf budgets:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:budgets:launch
```

Authenticated dashboard Lighthouse:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:lighthouse:dashboard:pr
```

Onboarding Lighthouse:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:lighthouse:onboarding:pr
```

Standard release QA:

```bash
/qa
```

For local browse QA, start the app with:

```bash
pnpm run dev:web:browse
```

## Launch-Candidate Process

1. Confirm the PR is green on all required launch-gate CI jobs.
2. Run standard `/qa` against preview or the local browse-compatible build.
3. Save QA artifacts under `.context/launch-readiness/<date>/`.
4. Confirm the last 3 synthetic golden-path runs are green.
5. Confirm there are no open Sev-1 or Sev-2 regressions from QA or synthetic monitoring.

## Launch-Day Manual Checklist

- Latest launch-candidate PR is green on all required launch-gate CI jobs.
- `/qa` report is green.
- QA evidence is stored in `.context/launch-readiness/<date>/`.
- Last 3 synthetic golden-path runs are green.
- No open Sev-1 or Sev-2 launch regressions remain.
