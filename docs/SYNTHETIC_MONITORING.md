# Synthetic Monitoring

This document describes the synthetic monitoring setup for Jovie's production front-door user journey.

## Overview

Synthetic monitoring runs automated tests against production to make sure a real new visitor can enter the product. The scheduled workflow uses Doppler `prd` secrets, runs Playwright against `https://jov.ie`, and alerts Slack when any blocking check fails.

The production suite is split by responsibility:

- `synthetic-auth-ui.spec.ts` validates that Google/Apple SSO buttons, the intentional email/identifier auth surface, and provider handoff initiation are healthy.
- `synthetic-golden-path.spec.ts` validates the public front-door signup journey.
- `synthetic-better-auth-account.spec.ts` creates one real production email-OTP identity, proves `/start`, session, and `ba_users` → `users` linkage, then transactionally removes the exact identity and verifies zero residue.
- `onboarding-robot.full.spec.ts` validates app behavior after Clerk authentication: profile creation, dashboard load, public profile load, welcome-chat continuity, and exact cleanup.
- `public-profile-smoke.spec.ts` validates the public profile rendering baseline.

## Test Coverage

### Golden Path Test

The primary test covers the complete front-door journey:

1. **`/start` onboarding chat** - verifies the first anonymous chat turn can POST without Turnstile configuration errors.
2. **Homepage CTA** - verifies the primary front-door CTA is visible and routes to `/signup`.
3. **Clerk sign-up** - creates a plus-addressed synthetic production user through the rendered UI.
4. **Mailbox OTP** - reads the Clerk code from a dedicated mailbox provider and completes verification.
5. **Post-signup app state** - confirms the signed-in user can reach a non-empty usable app/onboarding surface.
6. **Scoped cleanup** - deletes only the exact plus-addressed synthetic Clerk user created by that run.

### Onboarding Robot

The onboarding robot is a QA sentinel for the shipped onboarding path, not an activation optimizer. It does not automate Google or Apple provider UI. Production runs create a scoped synthetic Clerk user, authenticate with a Clerk sign-in token, complete `/onboarding`, and clean up only the exact robot user from that run.

Production robot runs do not clear broad onboarding rate-limit keys. Rate-limit clearing remains limited to non-production/local recovery paths.

Coverage:

1. **Synthetic user creation** - creates or reuses a plus-addressed robot email derived from `E2E_PROD_SIGNUP_EMAIL_BASE`.
2. **Clerk token auth** - signs in through Clerk using a short-lived sign-in token.
3. **Profile creation** - completes `/onboarding` with a generated robot handle.
4. **Dashboard load** - verifies `/app` loads and emits `dashboard_loaded`.
5. **Public profile load** - verifies `/<handle>` returns a successful response and no not-found/error copy.
6. **Welcome-chat continuity** - verifies `/api/onboarding/welcome-chat` returns an app chat route.
7. **Scoped cleanup** - removes only the exact robot user, generated handle/profile, and matching Clerk user id.

The fast PR smoke, `onboarding-robot.smoke.spec.ts`, runs separately through the desktop smoke manifest and only verifies anonymous `/start` chat health plus event emission.

### Better Auth Production Account Canary

This required suite is the production identity receipt. Before account creation it resolves the latest Vercel production deployment, requires `READY`, and verifies that `/api/health/build-info` reports the same Git SHA. It then:

1. Creates exactly `<base-local>+jovie-ba-prod-canary-<run-id>@<domain>` through the rendered Better Auth email form.
2. Reads the real OTP through the bearer-protected Cloudflare Email Routing worker.
3. Requires the browser to reach `/start` and `/api/auth/get-session` to return a user.
4. Requires exactly one `ba_users` row linked to exactly one app `users` row by `users.better_auth_user_id`, with a durable `ba_sessions` row.
5. Re-resolves Vercel and fails if the deployment ID or full SHA changed during the run.
6. Deletes the exact app identity, verification, and Better Auth identity in one serializable transaction whose ownership/cardinality guard and row locks are inside the same statement; cascades remove its sessions/accounts. A post-cleanup query must report zero rows in every scoped table.
7. Attaches a receipt containing the deployment ID/SHA and a SHA-256 email digest—never the email, OTP, session token, or database IDs.

The workflow parser treats a missing, empty, or skipped required suite as failure. The production-account test itself is double-gated by `E2E_SYNTHETIC_MODE=true` and `E2E_PROD_ACCOUNT_CANARY_ENABLED=true`. An `afterEach` hook gets a separate cleanup budget when the test times out. Each healthy run also reconciles at most five identities older than 60 minutes, and only when the address matches the anchored canary namespace, the app row is Better-Auth-only, and no creator profile exists.

### Health Checks

Additional monitoring includes:

- Critical page load times
- Error boundary detection
- `/start` visible Turnstile/auth configuration errors
- Public profile rendering
- Performance baseline validation

## Data Test Attributes

The following `data-test` attributes are used for reliable element selection:

| Attribute                         | Element                   | Purpose                |
| --------------------------------- | ------------------------- | ---------------------- |
| `data-testid="homepage-primary-cta"` | Homepage primary CTA      | Entry point tracking   |
| `aria-label="Chat message input"` | `/start` chat composer    | First-turn chat check  |
| `data-test="dashboard-welcome"`   | Dashboard header          | Successful onboarding  |
| `data-test="public-profile-root"` | Profile page container    | Public accessibility   |
| `data-test="listen-btn"`          | Listen mode DSP buttons   | Listen functionality   |
| `data-test="tip-selector"`        | Tip mode amount selector  | Tip functionality      |

## Running Tests Locally

### Golden Path Test (Development)

```bash
# Run against local development server
pnpm test:e2e:golden-path

# Run with UI for debugging
pnpm exec playwright test tests/e2e/golden-path.spec.ts --ui
```

### Synthetic Monitoring Test

```bash
# Run synthetic monitoring test against staging
E2E_SYNTHETIC_MODE=true BASE_URL=https://staging.jov.ie pnpm test:e2e:synthetic

# Run against production (requires Doppler prd production secrets)
doppler run --project jovie-web --config prd -- \
  E2E_SYNTHETIC_MODE=true \
  E2E_ENVIRONMENT=production \
  BASE_URL=https://jov.ie \
  PLAYWRIGHT_TEST_BASE_URL=https://jov.ie \
  pnpm --filter=@jovie/web run test:e2e:synthetic
```

### Onboarding Robot

```bash
# Fast anonymous /start smoke
pnpm --filter=@jovie/web exec playwright test tests/e2e/onboarding-robot.smoke.spec.ts

# Full production synthetic robot
doppler run --project jovie-web --config prd -- \
  E2E_SYNTHETIC_MODE=true \
  E2E_ENVIRONMENT=production \
  E2E_SKIP_WEB_SERVER=1 \
  BASE_URL=https://jov.ie \
  PLAYWRIGHT_TEST_BASE_URL=https://jov.ie \
  pnpm --filter=@jovie/web exec playwright test tests/e2e/onboarding-robot.full.spec.ts --config=playwright.synthetic.config.ts --project=chromium-synthetic
```

### Readiness Preflight

```bash
doppler run --project jovie-web --config prd -- \
  pnpm --filter=@jovie/web run check:signup-readiness -- --target=prd
```

## Environment Variables

### Required for Synthetic Monitoring

```bash
E2E_SYNTHETIC_MODE=true
E2E_ENVIRONMENT=production|preview
BASE_URL=https://jov.ie
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
DATABASE_URL=postgres://...
SESSION_SECRET=...
AI_GATEWAY_API_KEY=...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
E2E_PROD_SIGNUP_EMAIL_BASE=synthetic-signup@...
E2E_PROD_SIGNUP_PASSWORD=...
E2E_PROD_MAILBOX_PROVIDER=gmail
E2E_PROD_MAILBOX_CLIENT_ID=...
E2E_PROD_MAILBOX_CLIENT_SECRET=...
E2E_PROD_MAILBOX_REFRESH_TOKEN=...
E2E_PROD_ACCOUNT_CANARY_ENABLED=true
VERCEL_TOKEN=...
VERCEL_ORG_ID=...
VERCEL_PROJECT_ID=...
```

The onboarding robot additionally requires `E2E_PROD_SIGNUP_EMAIL_BASE`, `CLERK_SECRET_KEY`, and `DATABASE_URL`. It does not require mailbox OTP settings because it signs in with a Clerk sign-in token instead of driving provider UI.

Preferred no-inbox provider:

```bash
E2E_PROD_SIGNUP_EMAIL_BASE=synthetic-signup@<dedicated-e2e-domain>
E2E_PROD_MAILBOX_PROVIDER=cloudflare-email-routing
E2E_PROD_OTP_CHECK_URL=https://<otp-worker-host>/latest
E2E_PROD_OTP_CHECK_TOKEN=...
```

Cloudflare Email Routing should be configured on a dedicated e2e domain with a
catch-all route to an Email Worker. The Worker parses auth verification emails,
stores only short-lived OTP state for the addressed run, and exposes a
bearer-protected `POST` endpoint. The synthetic canary calls
`E2E_PROD_OTP_CHECK_URL` with:

```json
{ "email": "synthetic-signup+run-id@<dedicated-e2e-domain>", "sinceMs": 1770000000000 }
```

The endpoint should return `404` or `204` while no fresh code is available, or
`200` with one of:

```json
{ "otp": "123456" }
{ "code": "123456" }
{ "text": "Your verification code is 123456." }
```

### GitHub Secrets

The workflow reads application, database, and mailbox secrets through `DOPPLER_TOKEN_PRD`. The Better Auth account canary also reads the existing `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` GitHub secrets to bind its receipt to the active production deployment. Do not duplicate Turnstile or mailbox values as standalone GitHub repo secrets.

## GitHub Actions Workflow

The synthetic monitoring runs automatically via GitHub Actions:

### Schedule

- **Business Hours (8 AM - 8 PM Pacific)**: Every 15 minutes
- **Off Hours**: Every 30 minutes

### Environments Tested

- **Production**: https://jov.ie

### Failure Handling

1. **Single Environment Failure**: Alert sent to `#alerts-production`
2. **Multiple Environment Failure**: Critical alert sent to `#alerts-critical`
3. **Daily Success Summary**: Sent to `#monitoring` at 9 PM PST

## Throwaway Account Management

### Account Strategy

- Each test run creates a fresh user account
- Better Auth account-canary email format: `<base-local>+jovie-ba-prod-canary-<run-id>@<domain>`
- Its cleanup guard accepts only that anchored namespace and requires zero `ba_users`, `users`, `ba_sessions`, `ba_accounts`, and `ba_verifications` residue
- Accounts are tagged with Clerk public metadata `role=synthetic_production_canary`
- The test deletes only the exact plus-addressed email created in that run
- Onboarding robot accounts use the `+onboarding-robot-<run-id>` suffix and Clerk public metadata `role=synthetic_onboarding_robot`
- Onboarding robot cleanup requires an exact robot email, Clerk `user_` id, `or-` run id, and generated `jor...` handle before touching the database or Clerk

### Production Considerations

- Synthetic account cleanup must stay scoped to the configured plus-addressed mailbox
- Monitor synthetic account creation rate to avoid hitting limits
- Do not run broad `cleanup-e2e-users.ts` against production Clerk
- Do not add a production cleanup endpoint for onboarding robot runs

## Alerting

### Slack Channels

- `#alerts-production`: Single environment failures
- `#alerts-critical`: Multiple environment failures indicating service issues
- `#monitoring`: Daily health summaries and status updates

### Alert Information

Each alert includes:

- Environment affected (production/preview)
- Specific test failures
- Direct link to GitHub Actions run
- Playwright trace, video, screenshot, and JSON artifacts under `synthetic-test-results`
- Timestamp and context

### Escalation

1. **First Alert**: Team notification in Slack
2. **Repeated Failures**: Consider on-call escalation
3. **Critical Multi-Environment**: Immediate escalation required
4. **Incident Process**: Follow `docs/ON_CALL_PROCESS.md` for triage, communication, and closure

## Maintenance

### Regular Tasks

- **Weekly**: Review synthetic monitoring results and trends
- **Monthly**: Clean up old synthetic test accounts
- **Quarterly**: Review and update test scenarios

### Updating Tests

When modifying the golden path:

1. Update the relevant test file
2. Test locally against preview environment
3. Deploy and verify in production
4. Monitor initial runs for false positives

### Adding New Critical Paths

1. Add `data-test` attributes to new UI elements
2. Create test scenarios in `golden-path.spec.ts`
3. Update this documentation
4. Test thoroughly before deploying

## Troubleshooting

### Common Issues

- **Clerk Test User Limits**: Production environment may have user creation limits
- **Network Timeouts**: Increase timeout values for slow environments
- **Element Not Found**: Verify `data-test` attributes are deployed

### Debug Mode

```bash
# Run with debug logging
DEBUG=pw:api pnpm test:e2e:synthetic

# Run with headed browser for visual debugging
pnpm exec playwright test tests/e2e/synthetic-golden-path.spec.ts --headed
```

### Log Analysis

Check GitHub Actions logs for:

- Detailed test execution steps
- Screenshot/video captures on failure
- Performance timing information
- Environment configuration details

## Performance Baselines

### Current Targets

- **Homepage Load**: < 10 seconds
- **Complete Golden Path**: < 2 minutes
- **Sign Up Flow**: < 45 seconds
- **Profile Creation**: < 30 seconds

### Monitoring

Performance metrics are logged with each test run and can be used to:

- Detect performance regressions
- Establish baseline improvements
- Alert on significant slowdowns
