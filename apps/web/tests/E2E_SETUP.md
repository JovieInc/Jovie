# E2E Testing Setup Guide

## Overview

E2E tests use a small pool of real Clerk test users that are created once and reused. Each test run seeds app data locally, then uses Clerk's Playwright testing helpers to establish the authenticated browser session.

## Architecture

```text
ONE-TIME SETUP
  scripts/setup-e2e-users.ts
    -> creates reusable Clerk test users
    -> outputs E2E_CLERK_USER_* secrets

EVERY TEST RUN
  tests/global-setup.ts
    -> loads env
    -> seeds app data
    -> warms core routes

  tests/e2e/auth.setup.ts
    -> uses @clerk/testing/playwright
    -> calls setupClerkTestingToken()
    -> signs in programmatically
    -> saves tests/.auth/user.json

  authenticated specs
    -> reuse tests/.auth/user.json

  tests/e2e/auth.spec.ts
    -> creates a fresh empty browser context
    -> verifies signed-out /signin and /signup
```

## Initial Setup

### 1. Create Clerk test users

```bash
doppler run -- pnpm tsx scripts/setup-e2e-users.ts
```

Add the generated secrets to Doppler:

- `E2E_CLERK_USER_ID`
- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

### 2. Seed app data

```bash
doppler run -- pnpm tsx tests/seed-test-data.ts
```

This creates the app-side records and shared test profiles the suite expects.

### 3. Run Playwright

```bash
doppler run -- pnpm playwright test
```

## Auth Behavior In Tests

### Authenticated suite behavior

- `auth.setup.ts` is the source of truth for authenticated browser setup.
- It uses Clerk's Playwright testing package, not hand-written form automation.
- The helper attempts password auth first and can fall back to email-code auth when Clerk is configured that way.

### Signed-out auth-page behavior

- `tests/e2e/auth.spec.ts` must stay signed out.
- It creates a new context with empty cookies and local storage so `/signin` and `/signup` do not redirect to `/app`.
- If those tests suddenly start landing on `/app`, the browser context is probably inheriting authenticated state by mistake.

## Local Commands

```bash
# Full suite
doppler run -- pnpm playwright test

# One file
doppler run -- pnpm playwright test tests/e2e/auth.spec.ts

# Headed mode
doppler run -- pnpm playwright test --headed

# UI mode
doppler run -- pnpm playwright test --ui
```

## Troubleshooting

### Auth setup fails

Check:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `E2E_CLERK_USER_ID`
- `E2E_CLERK_USER_USERNAME`
- `E2E_CLERK_USER_PASSWORD`

Use test-instance Clerk keys only.

### Auth pages redirect to `/app`

Cause:

- the spec is running with authenticated storage state

Fix:

- use a fresh browser context with empty `storageState`
- do not reuse `tests/.auth/user.json` for `/signin` or `/signup` render checks

### Clerk instance keys do not match

Cause:

- publishable and secret keys are coming from different Clerk instances

Fix:

- verify both keys point at the same test Clerk instance
- recreate test users if the instance changed

## Related Files

- `scripts/setup-e2e-users.ts`
- `scripts/cleanup-e2e-users.ts`
- `tests/seed-test-data.ts`
- `tests/global-setup.ts`
- `tests/e2e/auth.setup.ts`
- `tests/e2e/auth.spec.ts`
- `tests/e2e/smoke-prod-auth.spec.ts`
- `playwright.config.ts`
