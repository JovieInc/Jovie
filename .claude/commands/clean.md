---
description: Run E2E smoke tests, fix console errors, iterate until clean, then open PR
tags: [e2e, testing, automation, cleanup]
---

# /clean - E2E Console Error Cleanup

Autonomous workflow to run Playwright E2E smoke tests on all dashboard, admin, and public pages, detect and fix console errors, and ship PRs incrementally as fixes accumulate.

## Goal

Run comprehensive E2E smoke tests, capture all browser console errors, fix them iteratively, and ship focused PRs as soon as fixes are cohesive — don't wait until everything is clean.

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

### Step 2: Fix Loop with Checkpoints

For each failure or console error detected:

1. **Identify the root cause** in the codebase
2. **Fix the issue** (frontend, backend, config, or test as appropriate)
3. **Prefer correct behavior** over silencing logs
4. **Re-run the tests** after each fix

#### Checkpoint: Ship When Ready

After fixing a cohesive group of errors (e.g., all errors in one component, one page, or one category), evaluate:

1. **Are the fixes self-contained?** (Would they make sense as a standalone PR?)
2. **Do they pass /verify?** (typecheck, lint, affected tests)
3. **Are they within PR Discipline limits?** (max 10 files, max 400 lines)

If yes to all three — **ship immediately:**

```bash
# Return to main
git checkout main && git pull origin main

# Create focused branch
git checkout -b fix/clean-{category}-$(date +%Y%m%d-%H%M%S)

# Stage specific files, commit, push, PR, auto-merge
git add <specific-files>
git commit -m "fix: resolve {category} console errors from E2E smoke tests

- {Fix description 1}
- {Fix description 2}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push -u origin fix/clean-{category}-$(date +%Y%m%d-%H%M%S)

gh pr create \
  --title "fix: clean {category} console errors from E2E smoke tests" \
  --body "$(cat <<'EOF'
## Summary
- Fixed {category} console errors detected during E2E smoke testing

## Pages Affected
- {list of affected pages}

## Test plan
- [x] Smoke tests pass for affected pages
- [x] TypeScript compiles
- [x] Biome lint passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --auto --squash

# Return to main for next batch
git checkout main
```

**Don't wait for CI** — move to the next group of errors immediately. CI runs in parallel.

Then continue the fix loop from Step 1, re-running tests on fresh main to find remaining errors.

### Step 3: Final Verification

Once all tests pass and no console errors remain:

```bash
# Run /verify for build, typecheck, lint, and other checks
/verify

# Run /simplify on modified files to reduce complexity
/simplify
```

If there are any remaining uncommitted fixes, ship them as a final PR.

### Step 4: Summary

```
E2E Clean Run Complete

PRs Created:
  1. {PR URL} - {category} - CI: pending/passed
  2. {PR URL} - {category} - CI: pending/passed
  ...

Pages Verified Clean:
  - {list all pages that now pass}

Remaining Issues: {count, if any}
```

## Constraints

- **Do not ignore or suppress** console errors unless explicitly justified
- **Do not weaken** test coverage
- **Make minimal, correct changes** - fix the root cause, not symptoms
- **Ship incrementally** - don't accumulate a massive PR
- **Size gates are hard limits** - max 10 files, max 400 lines per PR
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
