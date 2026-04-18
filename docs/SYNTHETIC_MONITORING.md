# Synthetic Monitoring

Synthetic monitoring is the live canary for Jovie's highest-priority public and authenticated journeys.

Related docs:

- [Launch Gates](./launch/LAUNCH_GATES.md)
- [Production Readiness Review](./launch/PRODUCTION_READINESS_REVIEW.md)
- [Readiness Scorecard](./launch/READINESS_SCORECARD.md)
- [On-Call Process](./ON_CALL_PROCESS.md)

## Canonical Production Lane

Source of truth:

- Workflow: `.github/workflows/synthetic-monitoring.yml`
- Playwright config: `apps/web/playwright.synthetic.config.ts`
- Spec: `apps/web/tests/e2e/synthetic-golden-path.spec.ts`

The production synthetic lane now uses a seeded canary account instead of creating throwaway users in production.

Coverage:

1. `https://jov.ie/signin`
2. Seeded-user sign-in
3. Dashboard shell render
4. Safe core action: open the public profile from the dashboard profile panel
5. Public pages stay healthy: `/`, `/signin`, `/signup`, `/pricing`
6. Homepage load stays within the baseline threshold

This is intentionally narrower than full onboarding. Real new-user signup and onboarding remain a staging concern until mailbox automation and cleanup are safe enough for production.

## Staging Use

Use `https://staging.jov.ie` for flows that mutate state more aggressively:

- signup and onboarding experiments
- billing verification
- launch-candidate journey gates before promotion

## Required Environment

Synthetic runs fail fast when required env is missing.

Required environment variables:

```bash
E2E_SYNTHETIC_MODE=true
E2E_ENVIRONMENT=production
BASE_URL=https://jov.ie
PLAYWRIGHT_TEST_BASE_URL=https://jov.ie
E2E_SYNTHETIC_USER_EMAIL=...
E2E_SYNTHETIC_USER_PASSWORD=...
```

Optional when the Clerk flow requires email verification:

```bash
E2E_SYNTHETIC_USER_CODE=...
```

GitHub secrets used by the scheduled workflow:

- `E2E_SYNTHETIC_USER_EMAIL`
- `E2E_SYNTHETIC_USER_PASSWORD`
- `E2E_SYNTHETIC_USER_CODE`
- `SLACK_WEBHOOK_URL`

## Running Locally

From the repo root:

```bash
BASE_URL=https://staging.jov.ie \
PLAYWRIGHT_TEST_BASE_URL=https://staging.jov.ie \
E2E_SYNTHETIC_MODE=true \
E2E_ENVIRONMENT=staging \
E2E_SYNTHETIC_USER_EMAIL=... \
E2E_SYNTHETIC_USER_PASSWORD=... \
pnpm --filter @jovie/web run test:e2e:synthetic
```

## Alerting

- Failures alert `#alerts-production`
- Scheduled healthy runs post to `#monitoring`
- Incident handling follows [On-Call Process](./ON_CALL_PROCESS.md)

## Operational Notes

- Production synthetic is a trust signal, not a broad regression suite.
- The workflow must always use `test:e2e:synthetic`; do not point it at ad hoc spec paths.
- If production synthetic starts skipping because env is missing, treat that as a broken monitor, not a harmless warning.
