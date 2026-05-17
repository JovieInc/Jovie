# Synthetic Monitoring

This document describes the synthetic monitoring setup for Jovie's production front-door user journey.

## Overview

Synthetic monitoring runs automated tests against production to make sure a real new visitor can enter the product. The scheduled workflow uses Doppler `prd` secrets, runs Playwright against `https://jov.ie`, and alerts Slack when any blocking check fails.

## Test Coverage

### Golden Path Test

The primary test covers the complete front-door journey:

1. **`/start` onboarding chat** - verifies the first anonymous chat turn can POST without Turnstile configuration errors.
2. **Homepage CTA** - verifies the primary front-door CTA is visible and routes to `/signup`.
3. **Clerk sign-up** - creates a plus-addressed synthetic production user through the rendered UI.
4. **Mailbox OTP** - reads the Clerk code from a dedicated mailbox provider and completes verification.
5. **Post-signup app state** - confirms the signed-in user can reach a non-empty usable app/onboarding surface.
6. **Scoped cleanup** - deletes only the exact plus-addressed synthetic Clerk user created by that run.

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
```

Preferred no-inbox provider:

```bash
E2E_PROD_SIGNUP_EMAIL_BASE=synthetic-signup@<dedicated-e2e-domain>
E2E_PROD_MAILBOX_PROVIDER=cloudflare-email-routing
E2E_PROD_OTP_CHECK_URL=https://<otp-worker-host>/latest
E2E_PROD_OTP_CHECK_TOKEN=...
```

Cloudflare Email Routing should be configured on a dedicated e2e domain with a
catch-all route to an Email Worker. The Worker parses Clerk verification emails,
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

The workflow reads runtime secrets through `DOPPLER_TOKEN_PRD`. Do not duplicate Turnstile or mailbox values as standalone GitHub repo secrets.

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
- Email format: `<E2E_PROD_SIGNUP_EMAIL_BASE local>+<run-id>@<domain>`
- Accounts are tagged with Clerk public metadata `role=synthetic_production_canary`
- The test deletes only the exact plus-addressed email created in that run

### Production Considerations

- Synthetic account cleanup must stay scoped to the configured plus-addressed mailbox
- Monitor synthetic account creation rate to avoid hitting limits
- Do not run broad `cleanup-e2e-users.ts` against production Clerk

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
