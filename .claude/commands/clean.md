---
description: Run E2E smoke tests, fix console errors, iterate until clean, then open PR
tags: [e2e, testing, automation, cleanup]
---

# /clean - E2E Console Error Cleanup

Autonomous workflow to run Playwright E2E smoke tests on all dashboard, admin, and public pages, detect and fix console errors, and open a PR when clean.

## Goal

Run comprehensive E2E smoke tests, capture all browser console errors, fix them iteratively, and open a clean PR with auto-merge enabled.

## Pre-flight Checklist

Before starting, verify the environment:

```bash
# Ensure dependencies are installed
pnpm install

# Ensure Playwright browsers are installed
cd apps/web && pnpm exec playwright install chromium

# Verify doppler is configured (required for Clerk auth in tests)
doppler run -- echo "Doppler configured"
```

## Test Scope

The following pages are tested:

### Public Pages (No Auth) - `smoke-public.spec.ts`
- `/` - Home page
- `/dualipa` - Public profile
- `/sign-up`, `/pricing` - Critical pages
- Error handling routes

### Dashboard Pages (Auth Required) - `dashboard-pages-health.spec.ts`
- `/app/dashboard/analytics`
- `/app/dashboard/audience`
- `/app/dashboard/chat`
- `/app/dashboard/contacts`
- `/app/dashboard/earnings`
- `/app/dashboard/profile`
- `/app/dashboard/releases`
- `/app/dashboard/tour-dates`

### Admin Pages (Auth + Admin Required) - `dashboard-pages-health.spec.ts`
- `/app/admin`
- `/app/admin/activity`
- `/app/admin/campaigns`
- `/app/admin/creators`
- `/app/admin/users`
- `/app/admin/waitlist`

## Execution Workflow

### Step 1: Run Smoke Tests

```bash
cd apps/web

# Run both public and dashboard/admin health tests
SMOKE_ONLY=1 doppler run -- pnpm exec playwright test \
  tests/e2e/smoke-public.spec.ts \
  tests/e2e/dashboard-pages-health.spec.ts \
  --project=chromium --reporter=line
```

### Step 2: Fix Loop

For each failure or console error detected:

1. **Identify the root cause** in the codebase
2. **Fix the issue** (frontend, backend, config, or test as appropriate)
3. **Prefer correct behavior** over silencing logs
4. **Re-run the tests** after each fix

Repeat until:
- All tests pass
- No console errors or uncaught exceptions remain on any page

### Step 3: Post-Fix Verification

Once tests are clean, run verification:

```bash
# Run /verify for build, typecheck, lint, and other checks
/verify

# Run /simplify on modified files to reduce complexity
/simplify
```

### Step 4: Create PR

```bash
# Create a new branch
git checkout -b fix/clean-console-errors-$(date +%Y%m%d-%H%M%S)

# Stage and commit changes
git add -A
git commit -m "fix: resolve console errors detected in E2E smoke tests

- Fixed console errors detected during E2E smoke testing
- All dashboard, admin, and public pages now load cleanly

Co-Authored-By: Claude <noreply@anthropic.com>"

# Create PR with auto-merge
gh pr create \
  --title "fix: clean console errors from E2E smoke tests" \
  --body "## Summary
- Fixed console errors detected during E2E smoke testing
- All dashboard, admin, and public pages now load cleanly

## Pages Verified
- Home page and public profiles
- All dashboard pages (analytics, audience, chat, contacts, earnings, profile, releases, tour-dates)
- All admin pages (dashboard, activity, campaigns, creators, users, waitlist)

## Test Results
- [x] All smoke tests passing
- [x] No console errors on any page
- [x] Build passes
- [x] Type check passes
- [x] Lint passes"
```

## Constraints

- **Do not ignore or suppress** console errors unless explicitly justified
- **Do not weaken** test coverage
- **Make minimal, correct changes** - fix the root cause, not symptoms
- **Stop only when** the system is fully clean
- **Proceed autonomously** without asking for confirmation

## Debugging Tips

If tests fail repeatedly:

```bash
# Run with headed browser for visual debugging
cd apps/web
SMOKE_ONLY=1 doppler run -- pnpm exec playwright test \
  tests/e2e/smoke-public.spec.ts \
  --project=chromium --headed

# Run specific test with debug mode
SMOKE_ONLY=1 doppler run -- pnpm exec playwright test \
  tests/e2e/dashboard-pages-health.spec.ts \
  --project=chromium --debug

# View test report
pnpm exec playwright show-report
```

## Expected Console Errors

The smoke test utilities (`smoke-test-utils.ts`) already filter ~100+ expected error patterns including:
- Clerk/auth initialization messages
- CSP warnings
- Analytics/third-party service errors
- React hydration warnings (non-critical)
- Network errors for optional resources

Only **unexpected** console errors should trigger fixes.
