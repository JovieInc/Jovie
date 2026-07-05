# Clerk Testing Setup Guide

This document outlines the proper setup for testing with Clerk authentication in the Jovie application.

## Overview

We have two testing modes:

1. **Mock Mode** (default): Tests run without real Clerk authentication using mock keys
2. **Authenticated Mode**: Tests run with real Clerk authentication using a test user

## Environment Configuration

### Required Environment Variables

For authenticated testing, you need these environment variables:

```bash
# Clerk API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-real-publishable-key
CLERK_SECRET_KEY=sk_test_your-real-secret-key

# E2E Test User Credentials
E2E_CLERK_USER_USERNAME=your-test-user@example.com
E2E_CLERK_USER_PASSWORD=YourTestPassword123!
```

### Environment Files

- `.env.development.local` - Contains real Clerk keys and test user for local development
- `.env.test` - Contains mock keys by default, can be overridden for CI
- `.env.production` - Production keys (never commit to repo)

## Test User Setup

### Creating a Test User

1. Go to your Clerk Dashboard
2. Navigate to "Users" section
3. Create a new user with:
   - Email: A dedicated test email (e.g., `e2e@yourdomain.com`)
   - Password: A secure test password
   - Verify the user if email verification is enabled

### Test User Requirements

- The test user should be fully verified (email/phone if required)
- User should have completed onboarding if your app requires it
- User should have necessary permissions for your test scenarios

## Test Configurations

### 1. Mock Mode (Default)

Used when:

- No real Clerk keys are provided
- Environment variables contain "mock", "dummy", or placeholder values
- Quick testing without authentication flows

```bash
# These trigger mock mode
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_mock-key-for-testing
CLERK_SECRET_KEY=sk_test_mock-key-for-testing
```

### 2. Authenticated Mode

Used when:

- Real Clerk keys are provided
- Test user credentials are configured
- Testing authentication flows and protected routes

```bash
# Real keys (from Clerk Dashboard — load from Doppler or .env.development.local, never commit)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-real-publishable-key
CLERK_SECRET_KEY=sk_test_your-real-secret-key
E2E_CLERK_USER_USERNAME=your-test-user@example.com
E2E_CLERK_USER_PASSWORD=YourTestPassword123!
```

## Test Types

### Smoke Tests

- Always run in mock mode
- Test basic functionality without authentication
- Fast execution, no external dependencies

```bash
pnpm e2e:smoke
```

### Golden Path Tests

- Require authenticated mode with test user
- Test critical user journeys with authentication
- Skip automatically if test user not configured

```bash
pnpm test:e2e:golden-path
```

### Full Test Suite

- Mix of mock and authenticated tests
- Some tests skip if authentication not available

```bash
pnpm e2e:full
```

## Helper Functions

### Authentication Helpers

Located in `tests/helpers/clerk-auth.ts`:

```typescript
import {
  signInUser,
  signOutUser,
  isAuthenticated,
} from '../helpers/clerk-auth';

// Sign in the test user
await signInUser(page);

// Check if user is authenticated
const authenticated = await isAuthenticated(page);

// Sign out the user
await signOutUser(page);
```

### Test Configuration Check

Tests automatically check for proper configuration:

```typescript
test.beforeEach(async ({ page }) => {
  const hasTestCredentials =
    process.env.E2E_CLERK_USER_USERNAME && process.env.E2E_CLERK_USER_PASSWORD;

  if (!hasTestCredentials) {
    console.log('⚠ Skipping test - no test user credentials configured');
    test.skip();
    return;
  }

  await setupClerkTestingToken({ page });
});
```

## CI/CD Configuration

### GitHub Actions

For CI environments, set the following secrets:

```yaml
env:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
  CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
  E2E_CLERK_USER_USERNAME: ${{ secrets.E2E_CLERK_USER_USERNAME }}
  E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

### Test Execution

```yaml
- name: Run E2E tests without auth
  run: pnpm e2e:smoke

- name: Run E2E tests with auth (if configured)
  run: pnpm test:e2e:golden-path
  continue-on-error: true # Don't fail CI if auth not configured
```

## Troubleshooting

### Common Issues

1. **"Invalid host" errors**
   - Remove any frontend URL configuration from environment
   - Ensure Clerk keys match your domain

2. **"Bot protection" errors**
   - Ensure `@clerk/testing` is installed
   - Check that `clerkSetup()` is called in global setup
   - Verify `setupClerkTestingToken()` is called before tests

3. **Test user not working**
   - Verify user exists in Clerk Dashboard
   - Check user is fully verified (email/phone)
   - Ensure password is correct and meets requirements

4. **Tests always skipping**
   - Check environment variable names are correct
   - Verify values don't contain "mock", "dummy", or placeholders
   - Ensure test user credentials are set

### Debug Logging

The test setup provides detailed logging:

```
✓ Clerk testing token set up successfully
✓ E2E test user configured: your-test-user@example.com
```

or

```
ℹ Using mock Clerk keys for testing
⚠ Skipping test - no test user credentials configured
```

## Best Practices

1. **Test User Management**
   - Use dedicated test users, don't use real user accounts
   - Keep test user credentials secure
   - Regularly rotate test user passwords

2. **Test Design**
   - Design tests to work with existing test user state
   - Don't assume clean state, handle existing data
   - Use unique identifiers when creating test data

3. **Environment Isolation**
   - Use separate Clerk apps for development/staging/production
   - Never use production Clerk keys in tests
   - Keep environment files in `.gitignore`

4. **Performance**
   - Use mock mode for tests that don't need authentication
   - Group authenticated tests to minimize setup overhead
   - Set appropriate timeouts for auth operations (60s+)

## Security Notes

- Never commit real Clerk keys or passwords to version control
- Use environment variables or secure secret management
- Regularly audit test user permissions
- Monitor test user activity for anomalies
- Consider using separate test Clerk instance for security
