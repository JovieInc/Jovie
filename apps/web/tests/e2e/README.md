# E2E Tests

This directory contains Playwright end-to-end coverage for the Jovie web app.

## Running E2E Tests

Run these commands from the repo root. Secret-bound local flows should use the pinned root wrappers.

```bash
# Full E2E suite
pnpm run test:web:e2e

# Headed mode
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e -- --headed

# Single spec
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e tests/e2e/auth.spec.ts

# Playwright UI
doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:ui
```

## Auth Test Model

Jovie now has two different auth-testing modes:

### 1. Authenticated app coverage

- [`auth.setup.ts`](./auth.setup.ts) uses `@clerk/testing/playwright`.
- It calls `setupClerkTestingToken()` and `clerk.signIn()` to create the shared authenticated storage state at `tests/.auth/user.json`.
- Most dashboard, onboarding, billing, and protected-route specs reuse that signed-in state through Playwright config.

### 2. Signed-out auth-page coverage

- [`auth.spec.ts`](./auth.spec.ts) does **not** reuse the shared signed-in state.
- It creates a fresh browser context with an empty `storageState` so `/signin` and `/signup` render the real public Clerk auth UI.
- This is required because Clerk will redirect an already signed-in user away from `<SignIn />` and `<SignUp />`.

### Production smoke auth

- [`smoke-prod-auth.spec.ts`](./smoke-prod-auth.spec.ts) uses real credentials and drives the rendered Clerk sign-in flow.
- It does not assume a fixed second step. The spec branches depending on whether Clerk shows:
  - password entry
  - email-code verification
  - an immediate authenticated redirect

## Useful Auth Specs

- `auth.spec.ts`
  - Signed-out render checks for `/signin` and `/signup`
  - Canonical navigation between those routes
  - Clerk UI hydration without runtime errors
- `smoke-auth.spec.ts`
  - Authenticated dashboard smoke coverage
  - Protected-route redirect behavior
  - Quick auth-page availability checks
- `smoke-prod-auth.spec.ts`
  - Real credential sign-in smoke on deployed environments

## Writing New Auth Tests

- Use the shared authenticated state only for routes that should load as a signed-in user.
- Create a fresh empty browser context for tests that assert `/signin`, `/signup`, redirect boundaries, or Clerk public auth UI.
- Do not hardcode assumptions about password-only or OTP-only flows. Let Clerk Dashboard configuration decide what renders.

## Debugging

```bash
# Debug one spec
PWDEBUG=1 doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e tests/e2e/auth.spec.ts

# Open the Playwright report
pnpm exec playwright show-report
```

When auth tests fail:

- check that Clerk test-mode secrets are present
- check `tests/e2e/auth.setup.ts` first
- confirm whether the failing spec should be signed in or signed out
- remember that `/signin` and `/signup` will redirect when a valid session is already present

## Manual Browser QA With gstack

### Signed-out auth pages

No cookie import is needed. Open `/signin` or `/signup` directly in `/browse`.

Recommended checks:

- `/signin`
- `/signin?email=test@example.com`
- `/signup`
- `/signup?oauth_error=account_exists&redirect_url=%2Fonboarding`

### Signed-in app QA

Local signed-in QA should use the dev auth bootstrap route, not manual cookie import.

Recommended flow:

1. Start the local browse server from the repo root:
   `pnpm run dev:web:browse`
2. In `/browse`, open:
   `/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings`
3. Use `persona=admin` only for admin flows:
   `/api/dev/test-auth/enter?persona=admin&redirect=/app/admin`
4. Verify `/app`, `/onboarding`, or other authenticated routes from that authenticated session.

Use `/setup-browser-cookies` only when you explicitly need to import a real human browser session. For non-loopback hosts, `scripts/browse-auth.ts` is the fallback helper for cookie export.

## Visual And Full-Suite Notes

- Public auth pages can still be covered by broader smoke or visual suites.
- Snapshot updates should only happen after intentional UI changes.
- Prefer behavior assertions over DOM-shape assertions for Clerk surfaces.
