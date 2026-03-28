# Testing Guide

## Test Tiers

| Tier | Tests | When | Time Target |
|------|-------|------|-------------|
| **Smoke** | Homepage, auth pages, protected routes, 404 | Every PR | < 10 min |
| **Full E2E** | All E2E specs including billing and golden-path flows | Main branch, `testing` label | 20-30 min |
| **Nightly** | Extended accessibility and synthetic golden path checks | Scheduled | Unlimited |

## Running Tests

### Unit Tests (Vitest)

```bash
# Fast (local development)
pnpm test

# CI mode with coverage
pnpm test:ci

# Watch mode
pnpm test:watch
```

### E2E Tests (Playwright)

```bash
# Full E2E suite
doppler run -- pnpm test:e2e

# Smoke tests only (fast)
SMOKE_ONLY=1 doppler run -- pnpm e2e:smoke

# Specific test file
doppler run -- pnpm test:e2e tests/e2e/smoke-public.spec.ts

# With UI
doppler run -- pnpm test:e2e:ui
```

## Smoke Test Files

Smoke tests are designed for **fast PR feedback** (< 10 min target):

- `smoke-public.spec.ts` - Public pages (no auth needed)
  - Homepage load, content, hydration
  - Public profile load
  - 404/error handling
  - Critical pages (/, /sign-up, /pricing)

- `auth.spec.ts` - Signed-out auth page coverage
  - `/signin` and `/signup` render Clerk prebuilt auth UI
  - Canonical navigation between auth routes
  - No runtime errors during auth-page hydration

- `smoke-auth.spec.ts` - Authenticated dashboard smoke coverage
  - Protected route redirects
  - Dashboard navigation after Clerk test-mode sign-in
  - Quick auth-page availability checks

## Full Suite Files

These run on main branch and PRs with `testing` label:

- `billing.spec.ts` - Billing routes (/billing, /account, etc.)
- `onboarding.spec.ts` - Onboarding flows (happy path, existing user, taken handle)
- `profile.spec.ts` - Public profile rendering, modes, drawers, deep links
- `axe-audit.spec.ts` - Accessibility tests

## Adding New Tests

### When to add to smoke

Add to smoke **only if**:
- Tests a critical user path (auth, homepage, core features)
- Runs in < 30 seconds
- Doesn't require complex setup
- Failure would block a production deploy

### When to add to full suite

Add to full suite for:
- Feature detail tests
- Accessibility audits
- Edge cases and error states
- Tests requiring database writes

## Performance Targets

| Test Type | Target |
|-----------|--------|
| Unit test (single) | < 200ms |
| Integration test (single) | < 2s |
| Smoke test (total) | < 10 min |
| Full E2E (total) | < 30 min |

## Tagging

Use `@smoke` tag for smoke-critical tests:

```typescript
test.describe('My Tests @smoke', () => {
  // These run in smoke suite
});
```

## CI Pipeline

```text
PR created
    │
    ├── ci-fast (typecheck, lint) ─────────────────┐
    │                                               │
    └── ci-e2e-smoke (if E2E paths changed) ───────┤
                                                    │
                                                    ▼
                                            PR Ready to Merge
                                                    │
                                                    ▼
                                            Push to main
                                                    │
    ┌───────────────────────────────────────────────┘
    │
    ├── Full E2E (2 shards, Chrome + Firefox)
    ├── Unit Tests
    ├── Build + Lighthouse
    └── Deploy (if all pass)
```

## E2E Authentication

### How Clerk Test Auth Works

E2E tests authenticate using Clerk's official testing library (`@clerk/testing/playwright`). The test user uses a **`+clerk_test` email** pattern which enables passwordless auth via a magic OTP code.

| Concept | Detail |
|---------|--------|
| Test email format | `*+clerk_test@jov.ie` (e.g. `browse+clerk_test@jov.ie`) |
| Magic OTP code | `424242` (auto-handled by Clerk testing library) |
| Auth strategy | `email_code` (not password) |
| Password needed? | **NO** — `+clerk_test` emails are passwordless |
| Testing token | Generated via `@clerk/testing/playwright`'s `clerkSetup()` |

### Required Doppler Environment Variables

All E2E auth credentials are stored in Doppler (`jovie-web` project, `dev` config):

| Variable | Required | Purpose |
|----------|----------|---------|
| `E2E_CLERK_USER_USERNAME` | Yes | Test user email (must contain `+clerk_test`) |
| `E2E_CLERK_USER_PASSWORD` | No | Not needed for `+clerk_test` emails |
| `CLERK_SECRET_KEY` | Yes | Server-side Clerk API key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Client-side Clerk key |
| `DATABASE_URL` | Yes | For seeding test data |

### Auth Flow in Tests

1. **`global-setup.ts`**: Loads env vars, calls `clerkSetup()` to get testing token, seeds test data
2. **`auth.setup.ts`**: Navigates to `/signin`, signs in via `clerk.signIn()` with `email_code` strategy, saves session to `tests/.auth/user.json`
3. **Screenshot/E2E specs**: Use `signInUser(page)` from `helpers/clerk-auth.ts` which detects `+clerk_test` emails and uses the correct auth strategy
4. **`shouldSkipAuth()`**: Guards authenticated specs — skips if credentials missing or Clerk setup failed. `+clerk_test` emails do NOT require a password.

### Product Screenshots

Generate marketing screenshots for the homepage:

```bash
# Full pipeline: seed data + auth + capture all screenshots
doppler run -p jovie-web -c dev -- pnpm --filter web screenshots

# Capture only (skip seed, use existing data)
doppler run -p jovie-web -c dev -- pnpm --filter web screenshots:capture

# Seed only (populate "Aria Chen" test artist data)
doppler run -p jovie-web -c dev -- pnpm --filter web screenshots:seed
```

Screenshots are saved to `apps/web/public/product-screenshots/` and used by homepage components (`ReleasesSection`, `PhoneProfileDemo`, `AudienceCRMSection`).

### Local Browse Auth Bootstrap

Local `/browse` and `/qa` runs should use the app's dev auth bootstrap, not manual Clerk login.

Start the local browse-compatible server:

```bash
doppler run -- pnpm --filter web dev:local:browse
```

Then authenticate the browse session with one route hit:

```text
/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings
```

Notes:
1. `creator` is the default browse persona and is the normal choice for dashboard QA.
2. `admin` is opt-in:
   `/api/dev/test-auth/enter?persona=admin&redirect=/app/admin`
3. This flow sets the bypass cookies directly and works without `NEXT_PUBLIC_E2E_MODE=1`.
4. It auto-provisions the local browse persona if it is missing.

### Fallback Helper For Non-Loopback Hosts

If you need cookie export for staging or another non-loopback host, use:

```bash
doppler run -- pnpm tsx scripts/browse-auth.ts --base-url https://staging.jov.ie --persona creator
```

The helper now prefers the local dev auth route on loopback/private hosts and only uses the Clerk testing-token flow as fallback on non-loopback hosts.

### Common Auth Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `⚠ Skipping: E2E_CLERK_USER_USERNAME not configured` | Missing Doppler env var | Run with `doppler run -p jovie-web -c dev --` |
| `⚠ Skipping: Clerk testing setup was not successful` | `clerkSetup()` failed | Check `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are real keys |
| Screenshots show login screen | Auth guard skipping tests | Ensure `E2E_CLERK_USER_USERNAME` contains `+clerk_test` |
| `audience-crm.png` missing | Auth guard skipped `audience.spec.ts` | Same as above — fix the auth guard |
| `CLERK_SETUP_FAILED` | Real Clerk keys not in env | Run via Doppler, not bare `pnpm` |
| `Failed to load Clerk JS` on localhost | Clerk proxy forces HTTPS, localhost has no SSL | The app now auto-disables the Clerk proxy on insecure local/private HTTP origins. If you are reusing an already-running dev server, restart it so the new runtime path is active. You can still force the old behavior with `NEXT_PUBLIC_CLERK_PROXY_DISABLED=1` when needed for test pipelines. |
| Local `/browse` still looks signed out | Dev server was not started in browse mode | Restart with `doppler run -- pnpm --filter web dev:local:browse` |
| Local `/browse` hits `/signin` | Dev auth bootstrap route was not used | Open `/api/dev/test-auth/enter?persona=creator&redirect=/app/dashboard/earnings` first |
| OTP input not visible | Testing token not set before navigation | Only relevant for non-loopback fallback; check `setupClerkTestingToken()` runs in `auth.setup.ts` |
| `Couldn't find your account` on staging | Staging uses live Clerk instance, test user is in test instance | Always run screenshots against localhost (dev server), not staging |

## Troubleshooting

### Tests timing out

- Check if test is doing too much (should be < 30s)
- Verify network mocks are in place
- Consider moving to full suite if test is slow
- For auth pages, confirm the spec is not accidentally reusing authenticated storage state

### Flaky tests

- Add to `tests/quarantine.json` with owner and exit criteria
- Auto-unquarantined after 5 consecutive passes
- Run `pnpm test:flaky` to detect flaky tests

### Smoke suite too slow

- Target: < 10 min
- If over budget, move tests to full suite
- Consolidate redundant tests


## UI Test Strategy (Flake Resistance)

> Strategy note: UI tests intentionally avoid layout- and copy-coupled assertions.

### We test

- Core logic and data transformations (unit + integration)
- Golden-path E2E user journeys
- Auth and billing flows
- Musicfetch integration behavior
- Structural accessibility (roles, semantic hierarchy, keyboard reachability)

### We do not test in CI

- Exact CSS values (padding, margin, font-size, pixel colors)
- Screenshot or visual diff checks that fail on copy/content updates
- Assertions coupled to marketing headline text or frequently changing copy

When UI polish needs validation, rely on manual QA and product screenshot workflows instead of deploy-blocking assertions.
