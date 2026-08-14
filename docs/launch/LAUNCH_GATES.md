# Launch Gates

## Founder lock (JOV-5085) — fail-closed on every PR

The locked product path is homepage **Get started** → `/start` → logged-out first message actually sends → waitlist write only after verified auth.

- Merge gate: `Golden Path Lock` (`ci-golden-path-lock`) always runs on source PRs and merge-group heads. It fans into `PR Ready`. Red cannot merge. No stub receipt. No skip because `E2E_PROD` secrets are missing.
- Local command: `node scripts/golden-path-lock.mjs merge-gate`
- Prod detect → autofix: `.github/workflows/golden-path-prod-autofix.yml` probes `https://jov.ie` after each Production Controller run and launches Cursor-direct when the live path breaks. Missing `CURSOR_API_KEY` fails closed. This is event-driven, not a 5-minute cron.
- JOV-5084-class lies (401 mapped to “Too many messages”) fail both the merge gate and the prod probe.

This lock is not the manual signup → onboarding → Stripe Playwright suite below. That suite stays opt-in and must not be the merge lock.

## Required CI Jobs For Launch-Candidate PRs

Launch-candidate PRs are not launch-ready unless all of these jobs are green when the launch gate is triggered:

- `PR Ready`
- `Golden Path (PR)`
- `Lighthouse (dashboard PR)`
- `Lighthouse (onboarding PR)`

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
- `Lighthouse (dashboard PR)`: authenticated dashboard Lighthouse stays within the blocking thresholds in [apps/web/.lighthouserc.dashboard.pr.json](../../apps/web/.lighthouserc.dashboard.pr.json).
- `Lighthouse (onboarding PR)`: onboarding Lighthouse stays within the blocking thresholds in [apps/web/.lighthouserc.onboarding.pr.json](../../apps/web/.lighthouserc.onboarding.pr.json).

## Required Local Launch Perf Check

The Gmail-equivalent latency contract is enforced locally before push, not as a dedicated CI job.

Run this from the repo root with pinned Doppler scope:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:budgets:launch
```

What it does:

- builds the production app locally
- starts the standalone server on loopback
- enables the local auth bypass for authenticated measurement
- runs strict budgets for:
  - `--group onboarding`
  - `--route-id creator-releases`

This is the required 100ms perceived-latency check. Lighthouse does not measure that warm-navigation budget directly, so this must pass locally before you push.

## Local Equivalents

Run from the repo root with pinned Doppler scope.

Golden path:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:golden-path:ci
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

1. Confirm the local launch perf check passes.
2. Confirm the PR is green on all required launch-gate CI jobs.
3. Run standard `/qa` against preview or the local browse-compatible build.
4. Save QA artifacts under `.context/launch-readiness/<date>/`.
5. Confirm the last 3 synthetic golden-path runs are green.
6. Confirm there are no open Sev-1 or Sev-2 regressions from QA or synthetic monitoring.

## Launch-Day Manual Checklist

- Latest local launch perf check passed.
- Latest launch-candidate PR is green on all required launch-gate CI jobs.
- `/qa` report is green.
- QA evidence is stored in `.context/launch-readiness/<date>/`.
- Last 3 synthetic golden-path runs are green.
- No open Sev-1 or Sev-2 launch regressions remain.
