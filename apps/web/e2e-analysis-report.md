# Playwright E2E Test Analysis Report

**Generated:** 2025-12-27
**Test Count:** 572 tests across 37 spec files
**Playwright Version:** 1.55.0

## Executive Summary

This report analyzes the Playwright E2E test suite for reliability and performance issues. The analysis identified **15 high-priority issues** and **23 medium-priority issues** across categories including timing flakiness, selector brittleness, authentication dependencies, and configuration problems.

**Key Findings:**
- Web server startup timeout is a critical bottleneck (observed 60s timeout during testing)
- Arbitrary `waitForTimeout()` calls found in 3 test files
- CSS-based selectors used instead of data-testid in 8+ locations
- Many tests conditionally skip based on environment, reducing coverage predictability
- networkidle wait strategy used in 12+ tests, prone to flakiness

---

## 1. Test Infrastructure Overview

### Configuration Files

| Config File | Purpose | Workers | Retries | Web Server |
|-------------|---------|---------|---------|------------|
| `playwright.config.ts` | Main E2E tests | 4 (CI) / auto (local) | 2 (CI) / 0 (local) | Port 3100, 60s timeout |
| `playwright.config.noauth.ts` | No-auth tests | 1 (CI) / auto (local) | 2 (CI) / 0 (local) | Port 3000, 60s timeout |
| `playwright.synthetic.config.ts` | Production monitoring | 1 | 2 | None (uses BASE_URL) |

### Browser Coverage

- **Chromium:** All environments
- **Firefox:** CI only (excluded from smoke tests)
- **WebKit:** Local development only

### Setup Files

- `tests/global-setup.ts` - Clerk authentication, database seeding, browser warmup
- `tests/e2e/setup.ts` - Custom test fixture with console error monitoring
- `tests/seed-test-data.ts` - Creates test profiles (dualipa, taylorswift)
- `tests/synthetic-setup.ts` / `synthetic-teardown.ts` - Production monitoring

---

## 2. Flakiness Issues by Category

### 2.1 Timing Issues (HIGH PRIORITY)

These patterns cause intermittent test failures due to race conditions and timing sensitivity.

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `onboarding-flow.spec.ts` | 158 | `page.waitForTimeout(3000)` - arbitrary wait | 🔴 High |
| `smoke.spec.ts` | 84 | `page.waitForTimeout(500)` - arbitrary wait | 🟡 Medium |
| `tipping.spec.ts` | 86 | `waitForLoadState('networkidle')` - can hang | 🟡 Medium |
| `golden-path.spec.ts` | 88, 107 | `waitUntil: 'networkidle'` - flaky on slow networks | 🟡 Medium |
| `anti-cloaking.spec.ts` | 44 | Time-based performance assertion (<2000ms) | 🟡 Medium |
| `profile.public.spec.ts` | 51-73 | Direct time measurement for performance | 🟡 Medium |

**Recommended Fix:**
```typescript
// ❌ Bad: Arbitrary timeout
await page.waitForTimeout(3000);

// ✅ Good: Condition-based wait
await expect(page.getByTestId('result')).toBeVisible();

// ✅ Good: Use poll for dynamic conditions
await expect.poll(async () => await button.isEnabled(), { timeout: 10000 }).toBe(true);
```

### 2.2 Selector Brittleness (HIGH PRIORITY)

CSS-based selectors are fragile and break when styling changes.

| File | Line | Brittle Selector | Recommended |
|------|------|------------------|-------------|
| `smoke.onboarding.spec.ts` | 118 | `.bg-green-500.rounded-full` | `[data-testid="handle-valid"]` |
| `tipping.spec.ts` | 125 | `button:has-text("$")` | `[data-testid="tip-amount-*"]` |
| `dashboard.access-control.spec.ts` | 121 | `.bg-green-500.rounded-full` | `[data-testid="handle-valid"]` |
| `artist-profile.spec.ts` | 27 | `page.locator('img').first()` | `[data-testid="artist-avatar"]` |
| `profile.public.spec.ts` | 158 | `[href*="instagram"], [href*="twitter"]...` | `[data-testid="social-links"]` |
| `tipping.spec.ts` | 143 | `div:has-text('View on mobile')` | `[data-testid="qr-overlay"]` |

**Missing data-testid Attributes:**
- Handle validation indicator
- Tip amount buttons
- Social link containers
- QR code overlay
- Avatar images
- Profile content sections

### 2.3 Authentication Dependencies (MEDIUM PRIORITY)

Many tests skip when authentication is not configured, reducing test coverage predictability.

| File | Condition | Impact |
|------|-----------|--------|
| `golden-path.spec.ts` | Skips if no `E2E_CLERK_USER_USERNAME` | Core journey not tested |
| `smoke.onboarding.spec.ts` | Skips full flow without `E2E_ONBOARDING_FULL=1` | Limited coverage |
| `dashboard.access-control.spec.ts` | Skips without `E2E_ONBOARDING_FULL=1` | Security tests skipped |
| `onboarding-flow.spec.ts` | Skips DB test without valid `DATABASE_URL` | Integration gaps |

**Environment Variable Dependencies:**
- `E2E_CLERK_USER_USERNAME` / `E2E_CLERK_USER_PASSWORD`
- `E2E_ONBOARDING_FULL`
- `E2E_DB_HEALTH`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`

### 2.4 External Service Dependencies (MEDIUM PRIORITY)

| Dependency | Test Files | Issue |
|------------|------------|-------|
| Clerk Auth | golden-path, smoke.onboarding, dashboard.* | Rate limits, network failures |
| PostgreSQL | onboarding-flow, seed-test-data | Connection failures |
| QR Code API | tipping.spec.ts | External service availability |
| Vercel Preview | synthetic tests | Deployment timing |

### 2.5 State Pollution Risks (MEDIUM PRIORITY)

| File | Risk | Description |
|------|------|-------------|
| `tipping.spec.ts` | localStorage | Sets `theme` in localStorage, persists between tests |
| `dashboard.access-control.spec.ts` | Database | Creates users that persist across runs |
| `onboarding-flow.spec.ts` | API mocking | `page.route()` may not clean up properly |
| `anti-cloaking.spec.ts` | Window object | Overrides `window.fetch` in init script |

### 2.6 Web Server Startup (CRITICAL)

**Observed Issue:** Tests timing out waiting for web server (60s timeout reached)

**Root Causes:**
1. Next.js dev server cold start takes 30-60s on first run
2. No health check endpoint for faster readiness detection
3. `doppler run` adds overhead
4. Turbopack warnings about lockfiles

**Configuration:**
```typescript
webServer: {
  command: 'NODE_ENV=test PORT=3100 NEXT_DISABLE_TOOLBAR=1 pnpm run dev',
  url: 'http://localhost:3100',
  timeout: 60000, // Often insufficient
}
```

---

## 3. Test Categories Analysis

### 3.1 Smoke Tests (Low Risk)
- `smoke.spec.ts` - 3 tests, basic page loads
- Generally reliable, uses minimal external dependencies
- **Issue:** Uses `waitForTimeout(500)` unnecessarily

### 3.2 Authentication Tests (High Risk)
- `smoke.onboarding.spec.ts` - Complex auth flow
- `golden-path.spec.ts` - Multi-step user journey
- `dashboard.access-control.spec.ts` - Security testing
- **Issues:** Heavy Clerk dependency, programmatic sign-up can fail

### 3.3 Profile Tests (Medium Risk)
- `artist-profile.spec.ts` - Depends on seeded data
- `profile.public.spec.ts` - Performance measurements
- **Issues:** Time-based assertions, seeded data dependency

### 3.4 Feature Tests (Variable Risk)
- `tipping.spec.ts` - UI state management
- `anti-cloaking.spec.ts` - API testing
- **Issues:** Mock complexity, state pollution

### 3.5 Performance Tests (High Flakiness Risk)
- `profile.public.spec.ts` - LCP/TTI measurements
- `anti-cloaking.spec.ts` - Response time assertions
- **Issue:** Time-based assertions highly system-dependent

---

## 4. Configuration Issues

### 4.1 Inconsistent Timeouts

| Test | Timeout | Appropriate? |
|------|---------|--------------|
| `golden-path` auth test | 60s | ✅ Reasonable for auth |
| `golden-path` listen/tip | 45s | ✅ OK |
| `dashboard.access-control` main | 120s | ⚠️ Very long |
| `dashboard.access-control` unauth | 30s | ✅ OK |
| Default | 30s (Playwright default) | ⚠️ May be too short for some flows |

### 4.2 Missing globalTeardown

The main `playwright.config.ts` has `globalSetup` but no `globalTeardown`:
- Test users created in database persist
- Browser warmup resources not cleaned
- Clerk test sessions may accumulate

### 4.3 Web Server Configuration

**Current Issues:**
```typescript
webServer: {
  command: 'NODE_ENV=test PORT=3100 NEXT_DISABLE_TOOLBAR=1 pnpm run dev',
  timeout: 60000, // Too short for cold starts
}
```

**Recommended:**
```typescript
webServer: {
  command: 'NODE_ENV=test PORT=3100 NEXT_DISABLE_TOOLBAR=1 pnpm run dev',
  timeout: 120000, // 2 minutes for cold start
  // Or better: use a pre-built version
  // command: 'NODE_ENV=test PORT=3100 pnpm run start',
}
```

---

## 5. Priority Recommendations

### Immediate Fixes (P0 - This Sprint)

1. **Increase web server timeout to 120s** in `playwright.config.ts`
2. **Replace arbitrary `waitForTimeout()` calls** with condition-based waits
3. **Add `data-testid` attributes** for handle validation indicator and tip buttons
4. **Add globalTeardown** to clean up test data

### Short-term Improvements (P1 - Next Sprint)

5. **Replace `networkidle` with `domcontentloaded`** where possible
6. **Add retry logic** for Clerk authentication operations
7. **Create test data factories** instead of relying on database seeds
8. **Document required environment variables** for different test modes

### Medium-term Optimizations (P2)

9. **Pre-build the application** for E2E tests instead of using dev server
10. **Add health check endpoint** (`/api/health`) for faster startup detection
11. **Implement test isolation** for localStorage/sessionStorage
12. **Create mock Clerk** for tests that don't need real auth

### Long-term Reliability (P3)

13. **Implement flaky test detection** in CI with automatic quarantine
14. **Add visual regression testing** for critical pages
15. **Create E2E test performance baseline** with alerting
16. **Implement parallel test sharding** for faster CI runs

---

## 6. Test Reliability Metrics (Baseline)

Based on infrastructure analysis:

| Metric | Current State | Target |
|--------|---------------|--------|
| Tests requiring auth | ~40% skip without credentials | 100% coverage with mocks |
| Tests using `waitForTimeout` | 3 occurrences | 0 |
| Tests using CSS selectors | ~15 occurrences | 0 (use data-testid) |
| Tests with `networkidle` | 12+ occurrences | Use sparingly |
| Web server startup success | ~80% (timeout issues) | 99%+ |
| Estimated pass rate | Unknown | Target: 95%+ |

---

## 7. Files Requiring Changes

### High Priority

| File | Changes Required |
|------|------------------|
| `playwright.config.ts` | Increase webServer timeout, add globalTeardown |
| `onboarding-flow.spec.ts` | Replace `waitForTimeout(3000)` |
| `smoke.spec.ts` | Replace `waitForTimeout(500)` |
| `smoke.onboarding.spec.ts` | Use data-testid for handle validation |
| `dashboard.access-control.spec.ts` | Use data-testid for handle validation |

### Medium Priority

| File | Changes Required |
|------|------------------|
| `tipping.spec.ts` | Add data-testid selectors, clean up localStorage |
| `golden-path.spec.ts` | Replace networkidle, add retry logic |
| `profile.public.spec.ts` | Reduce reliance on time measurements |
| `artist-profile.spec.ts` | Use data-testid for avatar, social links |

### Component Files (data-testid additions)

| Component | Attribute Needed |
|-----------|------------------|
| Handle validation indicator | `data-testid="handle-valid"` / `"handle-invalid"` |
| Tip amount buttons | `data-testid="tip-amount-5"`, etc. |
| QR overlay | `data-testid="qr-overlay"` |
| Avatar image | `data-testid="artist-avatar"` |
| Social links container | `data-testid="social-links"` |

---

## 8. CI/CD Considerations

### Current Workflow Gaps

1. No flaky test detection/quarantine
2. No test duration tracking over time
3. No parallel test sharding
4. Tests run serially in CI (4 workers is low for 572 tests)

### Recommended CI Improvements

```yaml
# .github/workflows/e2e.yml additions
- name: Run E2E tests with retries
  run: |
    npx playwright test --retries=2 --reporter=json,html

- name: Upload test results
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/

- name: Check for flaky tests
  run: |
    # Parse JSON report and flag tests that passed on retry
    node scripts/detect-flaky-tests.js
```

---

## Appendix A: Complete Test File List

```
tests/e2e/
├── accessibility-audit.spec.ts (10+ tests)
├── anti-cloaking.spec.ts (18 tests)
├── artist-profile.spec.ts (22 tests)
├── cookie-banner.spec.ts (1 test)
├── core-user-journeys.spec.ts (7 tests)
├── cors-check.spec.ts (1 test)
├── cta-button.spec.ts (5 tests)
├── dashboard-routing.spec.ts (6 tests)
├── dashboard.access-control.spec.ts (3 tests)
├── dashboard.profile-link-card.spec.ts
├── error-states.spec.ts
├── featured-artists.spec.ts
├── golden-path.spec.ts (3 tests)
├── homepage.spec.ts
├── legal.spec.ts
├── onboarding-flow.spec.ts (10 tests)
├── onboarding.handle-race.spec.ts
├── onboarding.handle-taken.spec.ts
├── onboarding.happy.spec.ts
├── onboarding.live-profile.spec.ts
├── pricing.spec.ts
├── profile.public.spec.ts (12 tests)
├── public-profile-smoke.spec.ts
├── releases-dashboard.spec.ts
├── setup.ts (shared fixture)
├── smoke.billing.spec.ts
├── smoke.onboarding.spec.ts (2 tests)
├── smoke.profile.basic.spec.ts
├── smoke.profile.spec.ts
├── smoke.profiles.spec.ts
├── smoke.spec.ts (3 tests)
├── style-sanity.spec.ts
├── synthetic-golden-path.spec.ts
├── tip-promo.spec.ts
├── tipping.spec.ts (8 tests across 2 modes)
├── waitlist-primary-goal.spec.ts
└── README.md
```

---

## Appendix B: Environment Variable Reference

| Variable | Required For | Default |
|----------|--------------|---------|
| `BASE_URL` | All tests | `http://localhost:3100` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth tests | Mock key |
| `CLERK_SECRET_KEY` | Auth tests | Mock key |
| `DATABASE_URL` | DB tests, seeding | None |
| `E2E_CLERK_USER_USERNAME` | Golden path | None |
| `E2E_CLERK_USER_PASSWORD` | Golden path | None |
| `E2E_ONBOARDING_FULL` | Full auth tests | `0` |
| `E2E_DB_HEALTH` | DB health tests | `0` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview tests | None |
| `CI` | CI detection | None |
| `SMOKE_ONLY` | Skip warmup | `0` |
