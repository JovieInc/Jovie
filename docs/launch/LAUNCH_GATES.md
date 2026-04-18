# Launch Gates

This document defines the blocking evidence required to treat Jovie as launch-ready.

Related docs:

- [Synthetic Monitoring](../SYNTHETIC_MONITORING.md)
- [Production Readiness Review](./PRODUCTION_READINESS_REVIEW.md)
- [Readiness Scorecard](./READINESS_SCORECARD.md)
- [On-Call Process](../ON_CALL_PROCESS.md)

## Blocking Signals

Launch-candidate work is not ready unless all of the following are green:

- `PR Ready`
- `Golden Path (PR)`
- `Lighthouse (dashboard PR)`
- `Lighthouse (onboarding PR)`
- `Canary Health Gate (staging)` on main deploy
- `Staging Auth Journey Gate` on main deploy
- `Staging Billing Gate` on main deploy

Supporting but non-blocking signals:

- post-deploy production auth smoke
- production synthetic monitoring history
- Sentry error soak gate

## What The Staging Gates Prove

- `Canary Health Gate (staging)`: the deployment is reachable and healthy enough for HTTP-level verification
- `Staging Auth Journey Gate`: a real seeded user can authenticate and perform a safe core action on staging
- `Staging Billing Gate`: checkout plus webhook side effects work on staging before promotion

## Migration Contract

Current deploy behavior is not a true isolated staging environment.

- Database migrations run against production before staging app verification.
- App rollout is staged.
- Schema rollout is already live.

Because of that, schema-affecting launches must follow this contract:

1. Use additive expand/contract changes only.
2. Keep old app code compatible with the new schema during the staging verification window.
3. Treat rollback as forward-fix unless a truly isolated staging database exists.
4. Do not describe the current flow as full staging verification.

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

Launch perf budget:

```bash
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:budgets:launch
```

## Launch-Day Checklist

- Latest launch-candidate PR is green on all blocking launch-gate jobs.
- Staging auth and billing gates passed on the exact production-bound build.
- Last 3 production synthetic runs are green.
- No unresolved Sev-1 or Sev-2 launch regressions remain.
- [Production Readiness Review](./PRODUCTION_READINESS_REVIEW.md) is complete.
- [Readiness Scorecard](./READINESS_SCORECARD.md) is green enough to support a go/no-go call.
