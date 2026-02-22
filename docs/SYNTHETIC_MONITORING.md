# Synthetic Monitoring

This document describes the synthetic monitoring setup for Jovie's golden path user journey.

## Overview

Synthetic monitoring runs automated tests against production and preview environments to ensure critical user flows are working correctly. The tests run every 5-10 minutes and alert the team via Slack when issues are detected.

## Test Coverage

### Golden Path Test

The primary test covers the complete revenue-generating user journey:

1. **Homepage Load** - Verify site accessibility and signup button
2. **Sign Up Flow** - Clerk registration process
3. **Username Claim** - Onboarding with handle validation
4. **Dashboard Access** - Successful profile creation
5. **Public Profile** - Profile accessibility and rendering

### Health Checks

Additional monitoring includes:

- Critical page load times
- Error boundary detection
- API endpoint health
- Performance baseline validation

## Data Test Attributes

The following `data-test` attributes are used for reliable element selection:

| Attribute                         | Element                   | Purpose                |
| --------------------------------- | ------------------------- | ---------------------- |
| `data-test="signup-btn"`          | Homepage signup button    | Entry point tracking   |
| `data-test="username-input"`      | Onboarding username field | Handle validation flow |
| `data-test="claim-btn"`           | Onboarding submit button  | Profile creation       |
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
E2E_SYNTHETIC_MODE=true BASE_URL=https://preview.jovie.app pnpm test:e2e:synthetic

# Run against production (requires production secrets)
E2E_SYNTHETIC_MODE=true BASE_URL=https://jovie.app pnpm test:e2e:synthetic
```

## Environment Variables

### Required for Synthetic Monitoring

```bash
E2E_SYNTHETIC_MODE=true
E2E_ENVIRONMENT=production|preview
BASE_URL=https://jovie.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### GitHub Secrets

The following secrets must be configured in GitHub Actions:

| Secret                       | Description                       |
| ---------------------------- | --------------------------------- |
| `CLERK_PUBLISHABLE_KEY_PROD` | Production Clerk publishable key  |
| `CLERK_SECRET_KEY_PROD`      | Production Clerk secret key       |
| `SUPABASE_URL_PROD`          | Production Supabase URL           |
| `SUPABASE_ANON_KEY_PROD`     | Production Supabase anonymous key |
| `SLACK_WEBHOOK_URL`          | Slack webhook for alerts          |

## GitHub Actions Workflow

The synthetic monitoring runs automatically via GitHub Actions:

### Schedule

- **Business Hours (9 AM - 9 PM PST)**: Every 5 minutes
- **Off Hours (9 PM - 9 AM PST)**: Every 10 minutes

### Environments Tested

- **Production**: https://jovie.app
- **Preview**: https://preview.jovie.app

### Failure Handling

1. **Single Environment Failure**: Alert sent to `#alerts-production`
2. **Multiple Environment Failure**: Critical alert sent to `#alerts-critical`
3. **Daily Success Summary**: Sent to `#monitoring` at 9 PM PST

## Throwaway Account Management

### Account Strategy

- Each test run creates a fresh user account
- Email format: `synthetic-{timestamp}@jovie-monitoring.test`
- Handle format: `synth{timestamp}`
- Accounts are not automatically cleaned up (manual cleanup required)

### Production Considerations

- Synthetic accounts should be periodically cleaned from production database
- Monitor synthetic account creation rate to avoid hitting limits
- Consider implementing auto-cleanup after 24-48 hours

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
