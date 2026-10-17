# Synthetic Monitoring

This document describes the synthetic monitoring setup for Jovie's production front-door user journey.

## Overview

Synthetic monitoring runs automated tests against production to make sure a real new visitor can enter the product. The scheduled workflow reads the GitHub secrets listed below first and uses Doppler `jovie-web/prd` only when that GitHub value is empty. It runs Playwright against `https://jov.ie` and alerts Slack when any blocking check fails.

The production suite is split by responsibility:

- The M2 revenue-path canary (`m2-revenue-path-canary.yml`, JOV-6439) is a separate daily + deploy-hook HTTP probe: signed-out → claim → $199 Pro checkout → activation. It writes a timestamped receipt and files Slack + Linear with repro on red. It does not create Stripe sessions or identities and is not generic uptime.
- `synthetic-auth-ui.spec.ts` validates that Google/Apple SSO buttons, the intentional email/identifier auth surface, and provider handoff initiation are healthy.
- `synthetic-golden-path.spec.ts` validates the public front-door signup journey.
- `synthetic-production-waitlist.spec.ts` reuses one reserved production email-OTP identity, proves the waitlist traversal and scoped durable receipt, and never deletes production identity data.
- `onboarding-robot.full.spec.ts` validates app behavior after Clerk authentication: profile creation, dashboard load, public profile load, welcome-chat continuity, and exact cleanup.
- `public-profile-smoke.spec.ts` validates the public profile rendering baseline.
- `/api/cron/web-ai-health` runs one tiny real production Gateway turn for web chat, insights, pitches, titles, and packaging. Its daily workflow receipt classifies forbidden-model, empty-stream, placeholder-saved, and request failures without retaining model output.

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

### Production Waitlist Canary

This required suite reuses exactly `<base-local>+jovie-prod-waitlist-canary@<domain>`. Before authentication it verifies a read-only production preflight receipt. It then completes real email OTP, submits the waitlist intake, renders the confirmation view, and requires a run-bound receipt proving identity linkage, session, waitlist persistence, analytics, and zero communication jobs. The identity is intentionally retained for the next run. No workflow step receives `DATABASE_URL`, and the suite contains no cleanup or deletion path. This is service evidence only; it does not prove a deployment SHA.

The workflow parser treats a missing or empty required result as failure. A skip is also a failure unless the test annotation contains `synthetic-otp-unavailable`, which is the logged reason used when Tim-only Cloudflare mailbox secrets are absent. That skip is a warning, not a pass. The preflight receipt check still runs and is required. The suite is double-gated by `E2E_SYNTHETIC_MODE=true` and `E2E_PROD_WAITLIST_CANARY_ENABLED=true`.

### Web AI Health

The daily `web-ai-health` job calls the bearer-protected production endpoint at `https://jov.ie/api/cron/web-ai-health`. The five probes execute inside the deployed app, so Gateway authentication uses the production project identity rather than a CI-owned model key. SDK retries are disabled. One scheduled run makes five O(1) model calls, plus one extra call only when a structured probe finishes without a schema-valid object. GLM-5.3 reasoning is always enabled, so these probes request low reasoning. Text and stream probes reserve 1,024 output tokens. Structured probes reserve 4,096, because reasoning shares that ceiling and a shorter budget can end the turn before JSON is emitted.

The redacted `jovie-web-ai-health/v1` receipt records each surface, runtime model, duration, failure cause, and the canonical Gateway allowlist name (`founder-strict-2026-09-17`). It never records prompts, model responses, credentials, user data, or database state. A red run alerts `#alerts-production` and creates or reopens a high-priority Linear bug signal. Forbidden-model, empty-stream, and placeholder-saved failures use distinct cause codes and messages.

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

### M2 Revenue-Path Canary (JOV-6439)

```bash
# Daily / deploy-hook money path against prod (or staging that mirrors checkout)
pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts --base-url https://jov.ie --receipt /tmp/m2-revenue-path-receipt.json
```

Red runs write Slack + a Linear issue with the receipt repro. This canary does not replace generic uptime (`canary-health-gate.yml`).

### Web AI Health (JOV-6938)

```bash
doppler run --project jovie-web --config prd --only-secrets=CRON_SECRET --no-fallback -- \
  sh -c 'curl --fail-with-body --header "Authorization: Bearer $CRON_SECRET" https://jov.ie/api/cron/web-ai-health'
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
CRON_SECRET=...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
E2E_PROD_SIGNUP_EMAIL_BASE=synthetic-signup@...
E2E_PROD_SIGNUP_PASSWORD=...
E2E_PROD_MAILBOX_PROVIDER=gmail
E2E_PROD_MAILBOX_CLIENT_ID=...
E2E_PROD_MAILBOX_CLIENT_SECRET=...
E2E_PROD_MAILBOX_REFRESH_TOKEN=...
E2E_PROD_WAITLIST_CANARY_ENABLED=true
PRODUCTION_WAITLIST_CANARY_READ_TOKEN=...
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

### GitHub secrets this workflow reads

`synthetic-monitoring.yml` references these `secrets.*` names and no others. Values are masked and are never printed. Doppler is not a second copy of a non-empty GitHub value.

GitHub first, then Doppler `jovie-web/prd` when the GitHub value is empty:

| Secret | Required for a green deep run |
| --- | --- |
| `CRON_SECRET` | Yes. Web AI health, limiter store, and authenticated billing health. |
| `E2E_PROD_MAILBOX_PROVIDER` | Only for the OTP traversal. |
| `E2E_PROD_OTP_CHECK_ORIGIN` | No. Tim-only. Absent secrets skip OTP steps with `synthetic-otp-unavailable`. |
| `E2E_PROD_OTP_CHECK_TOKEN` | No. Tim-only. Same skip. |
| `E2E_PROD_OTP_CHECK_URL` | No. Tim-only. Same skip. |
| `E2E_PROD_SIGNUP_EMAIL_BASE` | Yes. Waitlist preflight and the onboarding robot. |
| `PRODUCTION_WAITLIST_CANARY_READ_TOKEN` | Yes. Bearer for `GET /api/canary/waitlist/receipt?mode=preflight`. |

GitHub only:

| Secret | Use |
| --- | --- |
| `DOPPLER_TOKEN_PRD` | Doppler fallback credential. It is removed from the waitlist canary process. |
| `LINEAR_API_KEY` | Failure and recovery intake. |
| `SLACK_WEBHOOK_URL` | Alert and summary delivery. |

`github.token` is the built-in Actions token used for run lookup. It is not a mirrored secret.

The waitlist canary process receives only the resolved allowlist above. It does not receive `DATABASE_URL`. Other Playwright steps use `doppler run --preserve-env`, so a non-empty GitHub value wins and Doppler still supplies secrets that are unset, including Clerk and database credentials the onboarding robot already reads. Turnstile and the rest of the Doppler config stay there. Do not add those names as new GitHub secrets for this workflow.

Web AI health, the limiter probe, and authenticated billing health read `CRON_SECRET` the same way. The model calls use the deployed production app's Gateway identity.

This document does not store secret values.

## GitHub Actions Workflow

The synthetic monitoring runs automatically via GitHub Actions:

### Schedule

- Deep browser synthetics: `17 */6 * * *` UTC
- Web AI health: `47 7 * * *` UTC (five model turns/day)


### Environments Tested

- **Production**: https://jov.ie

### Failure Handling

1. **Single Environment Failure**: Alert sent to `#alerts-production`
2. **Multiple Environment Failure**: Critical alert sent to `#alerts-critical`
3. **Daily Success Summary**: Sent to `#monitoring` at 9 PM PST
4. **Web AI Failure**: High-priority Linear bug signal with per-surface cause and Gateway allowlist attribution

### Secret source (JOV-6813)

JOV-7237 caps the Doppler `jovie-web/prd` sync at 100 secrets, so the canary values cannot be added there. The workflow no longer uses `doppler run --only-secrets … --no-fallback` for that set. Each name is taken from the GitHub secret of the same name when it is non-empty, and from Doppler only otherwise.

`Production Synthetic Tests` runs on `17 */6 * * *` and on `workflow_dispatch`. The daily `47 7 * * *` run is Web AI health only, so a green workflow conclusion on that cron does not exercise the waitlist canary.

`E2E_PROD_OTP_CHECK_ORIGIN`, `E2E_PROD_OTP_CHECK_TOKEN`, and `E2E_PROD_OTP_CHECK_URL` are Tim-only and may be absent. When any of them is empty after resolution:

- The legacy OTP step logs `::warning title=Tim-only OTP secrets absent::` with the missing names and does not run Playwright. The parser does not require its results file for that run.
- The waitlist OTP traversal calls `test.skip` with `synthetic-otp-unavailable`. The parser records that annotation as a warning and does not fail the job for it.
- The waitlist preflight, signup readiness, SEO/AEO ratchet, Layer A auth UI, golden path, public profile smoke, and the onboarding robot still run. They do not read the OTP secrets.

A missing preflight result, a preflight failure, or any other required skip still fails the job. An OTP skip without that annotation is not a pass.

On [run 37071206285](https://github.com/JovieInc/Jovie/actions/runs/37071206285) (2026-10-02T22:13Z) the old `--no-fallback` invocation exited before Playwright because those names were absent from Doppler. That run is the provisioning evidence for moving the names to GitHub. It is not the current command.

The onboarding robot reads `E2E_PROD_SIGNUP_EMAIL_BASE` from the resolved environment. It does not read OTP secrets. Its other credentials still come from Doppler through `doppler run --preserve-env`. A required robot skip or failure still fails the job.

## Synthetic Account Management

### Account Strategy

- The production waitlist canary reuses exactly `<base-local>+jovie-prod-waitlist-canary@<domain>` on every run
- That retained Better Auth identity and its waitlist receipt are never deleted by synthetic monitoring
- The canary reasserts the supported waitlist traversal idempotently and records a run-bound, redacted durable receipt
- Onboarding robot accounts use the `+onboarding-robot-<run-id>` suffix and Clerk public metadata `role=synthetic_onboarding_robot`
- Onboarding robot cleanup requires an exact robot email, Clerk `user_` id, `or-` run id, and generated `jor...` handle before touching the database or Clerk

### Production Considerations

- The retained production waitlist identity must remain exact and must not gain a cleanup path
- Monitor onboarding robot account creation and cleanup separately from the retained waitlist identity
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
- Redacted Web AI receipt under `web-ai-health-<run>-<attempt>`
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
