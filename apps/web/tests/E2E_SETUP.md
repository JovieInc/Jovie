# E2E Testing Setup Guide

## Overview

E2E tests use **real Clerk test users** that are created once and reused across all test runs. This provides reliable authentication testing without the overhead of dynamic user creation.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ ONE-TIME SETUP (run manually or in CI setup)           │
├─────────────────────────────────────────────────────────┤
│ 1. scripts/setup-e2e-users.ts                          │
│    → Creates users in Clerk via API                    │
│    → Tags with { role: 'e2e', env: 'test' }            │
│    → Outputs Clerk user IDs                            │
│                                                         │
│ 2. Add to Doppler                                      │
│    → E2E_CLERK_USER_ID=user_xxx                        │
│    → E2E_CLERK_USER_USERNAME=e2e@jov.ie                │
│    → E2E_CLERK_USER_PASSWORD=xxx                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ EVERY TEST RUN (fast, no Clerk API calls)              │
├─────────────────────────────────────────────────────────┤
│ global-setup.ts:                                        │
│ - Reads E2E_CLERK_USER_ID from env                     │
│ - Seeds DB with user record                            │
│ - Seeds test profiles (dualipa, taylorswift)           │
│                                                         │
│ Tests:                                                  │
│ - Sign in with E2E_CLERK_USER_USERNAME/PASSWORD        │
│ - Clerk user already exists → fast auth                │
│ - DB records seeded → tests find data                  │
│                                                         │
│ global-teardown.ts: (optional)                          │
│ - Clean up DB records only                             │
│ - DON'T touch Clerk (reuse users next run)             │
└─────────────────────────────────────────────────────────┘
```

## Initial Setup

### 1. Create Test Users in Clerk

Run the setup script to create E2E test users:

```bash
doppler run -- pnpm tsx scripts/setup-e2e-users.ts
```

This will:
- Create 2 test users in Clerk
- Tag them with `{ role: 'e2e', env: 'test' }`
- Generate secure passwords
- Output the user IDs and credentials

Example output:
```
✅ E2E Test Users Setup Complete!

📋 Add these secrets to Doppler (dev config):

E2E_CLERK_USER_ID=user_2abc123xyz
E2E_CLERK_USER_USERNAME=e2e@jov.ie
E2E_CLERK_USER_PASSWORD=aBc123!@#XyZ
```

### 2. Add Secrets to Doppler

Copy the output from step 1 and add to Doppler:

1. Go to https://dashboard.doppler.com
2. Navigate to `jovie-web` → `dev` config
3. Add the three secrets:
   - `E2E_CLERK_USER_ID`
   - `E2E_CLERK_USER_USERNAME`
   - `E2E_CLERK_USER_PASSWORD`

### 3. Seed Database

Create DB records for the test users:

```bash
doppler run -- pnpm tsx tests/seed-test-data.ts
```

This will:
- Create a `users` record with the Clerk user ID
- Create a `creator_profiles` record for the user
- Create test profiles (dualipa, taylorswift)

### 4. Run Tests

Now you can run E2E tests:

```bash
doppler run -- pnpm playwright test
```

## Running Tests

### Local Development

```bash
# Run all E2E tests
doppler run -- pnpm playwright test

# Run specific test file
doppler run -- pnpm playwright test dashboard.spec.ts

# Run with UI mode
doppler run -- pnpm playwright test --ui

# Run with headed browser (see what's happening)
doppler run -- pnpm playwright test --headed
```

### CI/CD

In GitHub Actions, ensure these secrets are available:
- `E2E_CLERK_USER_ID`
- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

The CI workflow should:
1. Pull secrets from Doppler
2. Run seed script (fast, just DB inserts)
3. Run Playwright tests
4. (Optional) Clean up DB records

## Maintenance

### Recreating Test Users

If you need to recreate test users (e.g., password reset, Clerk instance change):

1. Clean up old users:
```bash
doppler run -- pnpm tsx scripts/cleanup-e2e-users.ts
```

2. Create fresh users:
```bash
doppler run -- pnpm tsx scripts/setup-e2e-users.ts
```

3. Update Doppler with new credentials

4. Re-seed database:
```bash
doppler run -- pnpm tsx tests/seed-test-data.ts
```

### Adding More Test Users

Edit `scripts/setup-e2e-users.ts` and add to the `TEST_USERS` array:

```typescript
{
  username: 'e2e-admin-user',
  email: 'e2e-admin@jov.ie',
  password: generateSecurePassword(),
  firstName: 'E2E',
  lastName: 'Admin',
  metadata: {
    role: 'e2e',
    env: 'test',
    purpose: 'Admin user for permission testing',
  },
}
```

Then run the setup script again.

## Troubleshooting

### Tests fail with "Clerk user not found"

**Cause**: E2E_CLERK_USER_ID not set or user doesn't exist in Clerk

**Fix**:
1. Check Doppler has `E2E_CLERK_USER_ID` set
2. Run setup script to create user
3. Verify you're using correct Doppler config: `doppler configure get`

### Tests fail with "Invalid credentials"

**Cause**: Password in Doppler doesn't match Clerk user password

**Fix**:
1. Run cleanup script
2. Run setup script to create fresh user with new password
3. Update Doppler with new credentials

### Seed script skips E2E user creation

**Cause**: `E2E_CLERK_USER_ID` not set in environment

**Fix**:
```bash
# Verify Doppler config
doppler configure get

# Should show: jovie-web dev

# Run with Doppler
doppler run -- pnpm tsx tests/seed-test-data.ts
```

### "Clerk instance keys do not match"

**Cause**: Using production Clerk keys instead of test keys

**Fix**:
1. Verify Doppler config has test keys:
   - `CLERK_SECRET_KEY` should start with `sk_test_`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` should start with `pk_test_`
2. Never use production keys for E2E testing

## Best Practices

### ✅ DO

- Reuse the same test users across runs (fast, reliable)
- Tag users with metadata for easy identification
- Use test instance Clerk keys only
- Keep passwords secure in Doppler
- Clean up DB records between test runs (not Clerk users)

### ❌ DON'T

- Create/delete Clerk users dynamically on every test run (slow, unreliable)
- Use production Clerk keys for testing
- Hardcode user IDs in test files (use environment variables)
- Commit passwords or Clerk IDs to git
- Delete Clerk test users after each run (defeats the purpose)

## Why This Approach?

### Advantages

- ✅ **Fast**: No Clerk API calls during test runs
- ✅ **Reliable**: No network dependency during tests
- ✅ **Real auth**: Uses actual Clerk users for realistic testing
- ✅ **Debuggable**: Same users every time, easy to reproduce issues
- ✅ **Simple**: Just read env vars + seed DB
- ✅ **Cost-effective**: Minimal API usage

### Compared to Dynamic Creation

| Aspect | Fixed Pool (Our Approach) | Dynamic Creation |
|--------|---------------------------|------------------|
| Speed | Fast (0-1s setup) | Slow (5-10s per run) |
| Reliability | High (no network) | Medium (depends on Clerk API) |
| Debugging | Easy (same users) | Hard (ephemeral users) |
| Cost | Low (one-time API calls) | High (API calls every run) |
| Complexity | Simple | Complex |

## Related Files

- `scripts/setup-e2e-users.ts` - Creates test users in Clerk
- `scripts/cleanup-e2e-users.ts` - Removes E2E test users
- `tests/seed-test-data.ts` - Seeds database with user records
- `tests/global-setup.ts` - Runs before all tests (calls seed)
- `tests/helpers/clerk-auth.ts` - Sign-in helper for tests
- `playwright.config.ts` - Playwright configuration
