# Test Troubleshooting Guide

This guide documents common test issues, their root causes, and solutions. It's based on real problems discovered during the Jovie test reliability improvement initiative.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Error Messages](#common-error-messages)
3. [Vitest Issues](#vitest-issues)
4. [Playwright E2E Issues](#playwright-e2e-issues)
5. [State Pollution Problems](#state-pollution-problems)
6. [Performance Issues](#performance-issues)
7. [CI-Specific Issues](#ci-specific-issues)
8. [Debugging Tools](#debugging-tools)

---

## Quick Diagnostics

### Symptom-Based Quick Reference

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Test passes alone, fails in suite | State pollution | Reset global state in `beforeEach` |
| "require() of ES Module" error | jsdom v27+ ESM issue | Downgrade jsdom to v26.x |
| Test randomly passes/fails | Race condition or timing | Use condition-based waits |
| Tests suddenly slow (~3s each) | Mock missing `url` property | Add `url` to mock Response |
| E2E timeout waiting for server | Web server startup slow | Increase `webServer.timeout` to 120s |
| "Cannot find module" in tests | Module resolution issue | Check tsconfig paths and aliases |

### First Steps for Any Test Failure

1. **Run the test in isolation:**
   ```bash
   npm run test -- path/to/file.test.ts -t "test name"
   ```

2. **Check if it's flaky:**
   ```bash
   npm run test:flaky -- path/to/file.test.ts
   ```

3. **Get verbose output:**
   ```bash
   npm run test -- --reporter=verbose path/to/file.test.ts
   ```

---

## Common Error Messages

### "require() of ES Module not supported"

**Full Error:**
```
Error [ERR_REQUIRE_ESM]: require() of ES Module node_modules/.../index.js
from node_modules/jsdom/lib/... not supported.
```

**Root Cause:** jsdom v27+ introduced ESM-only dependencies (like `@exodus/bytes`) that don't work with Vitest's CommonJS module resolution.

**Solution:** Pin jsdom to v26.x in `package.json`:
```json
{
  "devDependencies": {
    "jsdom": "^26.1.0"
  }
}
```

**Files Affected:** Any test using jsdom environment (most component tests)

---

### "Failed to resolve import react/jsx-dev-runtime"

**Full Error:**
```
Error: Failed to resolve import "react/jsx-dev-runtime" from
"packages/ui/src/components/..."
```

**Root Cause:** The `@jovie/ui` package has module resolution issues when Vitest runs with multiple parallel workers (forks > 1).

**Solution:** Keep `maxForks: 1` in Vitest configuration:
```typescript
// vitest.config.mts
poolOptions: {
  forks: {
    maxForks: 1, // Required for @jovie/ui compatibility
  },
},
```

**Trade-off:** Tests run sequentially but reliably. Use `test.concurrent` within files for some parallelism.

---

### "Cannot read properties of undefined (reading 'xxx')"

**Common Causes:**

1. **Missing mock properties:**
   ```typescript
   // BAD: Missing url property causes new URL(undefined) to throw
   vi.mocked(fetch).mockResolvedValue({
     ok: false,
     status: 404,
   } as Response);

   // GOOD: Include all accessed properties
   vi.mocked(fetch).mockResolvedValue({
     ok: false,
     status: 404,
     url: 'https://example.com/not-found',
     text: async () => 'Not found',
   } as Response);
   ```

2. **Component not mounted yet:**
   ```typescript
   // BAD: Accessing element before render completes
   const { result } = renderHook(() => useMyHook());
   expect(result.current.data.value).toBe('x'); // data might be undefined

   // GOOD: Wait for loading to complete
   await waitFor(() => {
     expect(result.current.data).toBeDefined();
   });
   expect(result.current.data.value).toBe('x');
   ```

---

### "Timeout - Async callback was not invoked within the 5000ms timeout"

**Causes:**
1. Missing `await` on async operation
2. Promise that never resolves
3. Fake timers not advanced

**Solutions:**

```typescript
// 1. Missing await
// BAD
it('should complete', () => {
  asyncOperation(); // Not awaited!
});

// GOOD
it('should complete', async () => {
  await asyncOperation();
});

// 2. Advance fake timers
beforeEach(() => {
  vi.useFakeTimers();
});

it('should timeout', async () => {
  const promise = operationWithTimeout();
  vi.advanceTimersByTime(5000); // Advance timer
  await expect(promise).rejects.toThrow('Timeout');
});

// 3. Increase timeout for slow operations
it('should complete slowly', async () => {
  await slowOperation();
}, { timeout: 30000 });
```

---

## Vitest Issues

### Global State Not Reset Between Tests

**Symptom:** Test passes when run alone, fails when run with other tests.

**Example Problem:**
```typescript
// In web-vitals.ts
let initialized = false;
export function initWebVitals() {
  if (initialized) return; // Early exit if already called
  initialized = true;
  // ... setup listeners
}
```

```typescript
// In tests - First test sets initialized = true
it('test 1', () => {
  initWebVitals(); // Sets initialized = true
  expect(listeners).toHaveLength(5);
});

// Second test skips initialization because flag is still true!
it('test 2', () => {
  initWebVitals(); // Exits early - no listeners set up
  expect(listeners).toHaveLength(5); // FAILS!
});
```

**Solution:** Reset global state in `beforeEach`:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // Reset any global flags the module uses
  globalThis.jovieWebVitalsInitialized = false;
  globalThis.jovieWebVitalsHandlers = undefined;
});
```

**Known Global State in Jovie:**
- `globalThis.jovieWebVitalsInitialized` - Web vitals initialization flag
- `globalThis.jovieWebVitalsHandlers` - Web vitals handler references
- `globalThis.statsigInitialized` - Statsig SDK state

---

### Module-Level Side Effects

**Symptom:** Import order affects test results.

**Problem:** Some modules execute code on import:
```typescript
// analytics.ts
export const analytics = createAnalyticsClient(); // Runs on import!
```

**Solution:** Mock before importing:
```typescript
vi.mock('@/lib/analytics', () => ({
  analytics: { track: vi.fn() },
}));

// Import AFTER mock
import { analytics } from '@/lib/analytics';
```

Or use dynamic imports:
```typescript
it('should track event', async () => {
  vi.mock('@/lib/analytics');
  const { analytics } = await import('@/lib/analytics');
  // ... test
});
```

---

### Mocks Not Cleared Between Tests

**Symptom:** Mock call counts accumulate across tests.

**Problem:**
```typescript
const mockFn = vi.fn();

it('test 1', () => {
  mockFn();
  expect(mockFn).toHaveBeenCalledTimes(1); // PASS
});

it('test 2', () => {
  mockFn();
  expect(mockFn).toHaveBeenCalledTimes(1); // FAIL - it's 2!
});
```

**Solution:** Clear mocks in `beforeEach` (done automatically in setup.ts):
```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Playwright E2E Issues

### Web Server Startup Timeout

**Error:**
```
Error: Timed out waiting for server at http://localhost:3100
```

**Cause:** Next.js dev server cold start takes 30-60s, default timeout is 60s.

**Solution:** Increase timeout in `playwright.config.ts`:
```typescript
webServer: {
  command: 'pnpm run dev',
  url: 'http://localhost:3100',
  timeout: 120000, // 2 minutes
  reuseExistingServer: !process.env.CI,
},
```

---

### Flaky Locator Timeouts

**Error:**
```
locator.click: Timeout 15000ms exceeded.
```

**Causes:**
1. Element not visible/rendered yet
2. Wrong selector
3. Element behind overlay

**Debugging:**
```typescript
// 1. Check if element exists
console.log(await page.locator('button').count());

// 2. Use Playwright Inspector
await page.pause(); // Opens interactive debugger

// 3. Take screenshot
await page.screenshot({ path: 'debug.png', fullPage: true });
```

**Solutions:**
```typescript
// Wait for element to be actionable
await expect(page.getByTestId('button')).toBeVisible();
await page.getByTestId('button').click();

// Use data-testid instead of CSS selectors
// BAD: Brittle selector
await page.locator('.bg-green-500.rounded-full').click();

// GOOD: Stable selector
await page.getByTestId('handle-valid').click();
```

---

### networkidle Hangs

**Symptom:** Test hangs at `waitUntil: 'networkidle'`

**Cause:** Long-polling connections or WebSockets keep network active.

**Solution:** Use `domcontentloaded` with explicit waits:
```typescript
// BAD: Can hang indefinitely
await page.goto('/dashboard', { waitUntil: 'networkidle' });

// GOOD: Fast and predictable
await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
await expect(page.getByTestId('dashboard-loaded')).toBeVisible();
```

---

### Arbitrary Timeout Issues

**Problem Patterns Found in Jovie:**

| File | Line | Issue |
|------|------|-------|
| `onboarding-flow.spec.ts` | 158 | `waitForTimeout(3000)` |
| `smoke.spec.ts` | 84 | `waitForTimeout(500)` |
| `tipping.spec.ts` | various | `waitForLoadState('networkidle')` |

**How to Fix:**
```typescript
// INSTEAD OF: await page.waitForTimeout(3000);

// Wait for specific condition:
await expect(page.getByTestId('result')).toBeVisible();

// Or use polling:
await expect.poll(async () => {
  return await page.getByTestId('status').textContent();
}, { timeout: 5000 }).toBe('Ready');

// Or wait for URL change:
await page.waitForURL('**/success');
```

---

### Authentication Test Failures

**Symptom:** Auth tests skip or fail intermittently.

**Required Environment Variables:**
```bash
E2E_CLERK_USER_USERNAME=test@example.com
E2E_CLERK_USER_PASSWORD=secret
E2E_ONBOARDING_FULL=1  # Enable full auth flows
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

**Debugging:**
```bash
# Check if auth is configured
echo $E2E_CLERK_USER_USERNAME

# Run with debug output
DEBUG=pw:api npx playwright test golden-path.spec.ts
```

---

## State Pollution Problems

### Detecting State Pollution

Use the built-in detection helper:
```typescript
import { detectStatePollution } from './setup';

afterEach(() => {
  const issues = detectStatePollution();
  if (issues.length > 0) {
    console.warn('State pollution detected:', issues);
  }
});
```

### Common Sources

1. **localStorage/sessionStorage:**
   ```typescript
   // In setup.ts afterEach (automatic)
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Environment Variables:**
   ```typescript
   // Use withTestEnv helper
   const restore = withTestEnv({ API_KEY: 'test' });
   // ... test code
   restore(); // Automatic in afterEach
   ```

3. **DOM Elements:**
   ```typescript
   // Automatic via @testing-library/react cleanup
   afterEach(() => {
     cleanup();
   });
   ```

4. **Window/Global Object:**
   ```typescript
   afterEach(() => {
     delete globalThis.myTestProperty;
   });
   ```

---

## Performance Issues

### Tests Taking 3+ Seconds Each

**Symptom:** Tests for error handling (404, 429) take ~3 seconds.

**Root Cause:** Mock Response missing `url` property causes retry logic:
```typescript
// Code checks response.url for validation
if (response.url && !isAllowedHost(new URL(response.url).host)) {
  // ...
}

// When url is undefined, new URL(undefined) throws
// This triggers catch block with retry logic
```

**Solution:** Include `url` in mock Response:
```typescript
vi.mocked(fetch).mockResolvedValue({
  ok: false,
  status: 404,
  url: 'https://example.com/not-found', // Required!
  text: async () => 'Not found',
} as Response);
```

**Files Fixed:**
- `tests/lib/ingestion/linktree.test.ts`
- `tests/lib/ingestion/beacons.test.ts`

---

### Slow First Test Run

**Symptom:** First test run takes 5-7 minutes, subsequent runs take 2 minutes.

**Cause:** Vitest/esbuild cache cold start.

**Solution:** Cache is automatically built on first run. For CI, use caching:
```yaml
# .github/workflows/ci.yml
- uses: actions/cache@v4
  with:
    path: |
      node_modules/.vite
      node_modules/.cache
    key: vitest-${{ hashFiles('**/package-lock.json') }}
```

---

### Finding Slow Tests

Use the performance profiler:
```bash
npm run test:profile
```

Output shows:
- Tests >200ms (yellow warning)
- Tests >1000ms (orange warning)
- Tests >5000ms (red critical)

---

## CI-Specific Issues

### Test Passes Locally, Fails in CI

**Common Causes:**

1. **Environment differences:**
   ```typescript
   // Check for CI-specific behavior
   const isCI = process.env.CI === 'true';
   ```

2. **Timing sensitivity:**
   ```typescript
   // Use longer timeouts in CI
   const timeout = process.env.CI ? 30000 : 10000;
   await operation().timeout(timeout);
   ```

3. **Missing environment variables:**
   ```yaml
   # Ensure all required env vars are set
   env:
     DATABASE_URL: ${{ secrets.DATABASE_URL }}
     CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
   ```

---

### Flaky Test Detection in CI

The CI workflow automatically detects flaky tests:
```yaml
# From test-performance.yml
- name: Detect Flaky Tests
  run: |
    npm run test:flaky -- --runs 5
```

Tests that pass inconsistently are flagged in the PR comment.

---

## Debugging Tools

### Vitest Debugging

```bash
# Run with verbose output
npm run test -- --reporter=verbose

# Run specific test file
npm run test -- path/to/file.test.ts

# Run specific test by name
npm run test -- -t "test name pattern"

# Run with Node inspector
node --inspect-brk node_modules/.bin/vitest run
```

### Playwright Trace Viewer

For failed tests, traces are automatically captured:

```bash
# View trace file
npx playwright show-trace test-results/.../trace.zip
```

To always capture traces:
```bash
npx playwright test --trace on
```

The trace viewer shows:
- Network requests
- Console logs
- DOM snapshots at each step
- Action timeline

### Using Playwright Inspector

Add `page.pause()` to stop execution and open interactive debugger:

```typescript
it('debug my test', async ({ page }) => {
  await page.goto('/');
  await page.pause(); // Opens inspector
  // Continue stepping through manually
});
```

Or run in headed mode:
```bash
npx playwright test --headed --debug
```

### Screenshot Debugging

Take screenshots at any point:
```typescript
await page.screenshot({ path: 'debug-1.png' });
// ... more actions
await page.screenshot({ path: 'debug-2.png', fullPage: true });
```

### Test Isolation Check

Run a test multiple times to check for flakiness:
```bash
for i in {1..10}; do npm run test -- path/to/file.test.ts; done
```

Or use the built-in flaky detector:
```bash
npm run test:flaky
```

---

## Quick Reference: Fixed Issues Summary

### Phase 3 Fixes Applied

| Issue | Root Cause | Fix Applied | Tests Affected |
|-------|-----------|-------------|----------------|
| jsdom v27 ESM error | @exodus/bytes ESM-only | Pinned jsdom to v26.1.0 | 19 tests |
| web-vitals state | Global initialization flag | Reset in beforeEach | 15 tests |
| Slow 404/429 tests | Missing mock `url` property | Added url to mocks | 4 tests |
| E2E arbitrary waits | waitForTimeout() calls | Condition-based waits | 7 files |
| Brittle selectors | CSS class selectors | data-testid patterns | 6 files |
| networkidle hangs | Long-polling connections | domcontentloaded | 4 files |

---

## Related Documentation

- [Testing Best Practices Guide](./testing-guide.md) - Patterns for writing reliable tests
- [Test Configuration Guide](./test-configuration.md) - Detailed config explanations
- [Clerk Testing Setup](./testing-clerk.md) - Authentication testing

---

## Getting Help

1. Check this guide first
2. Search existing test files for similar patterns
3. Run with `--reporter=verbose` for detailed output
4. Use Playwright trace viewer for E2E issues
5. Ask in #engineering Slack channel
