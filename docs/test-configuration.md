# Test Configuration Guide

This guide documents the test configuration decisions for the Jovie web application, explaining **why** each setting exists and the trade-offs considered.

## Table of Contents

- [Overview](#overview)
- [Vitest Configuration](#vitest-configuration)
  - [Main Configuration (vitest.config.mts)](#main-configuration-vitestconfigmts)
  - [Fast Configuration (vitest.config.fast.mts)](#fast-configuration-vitestconfigfastmts)
  - [Test Setup Files](#test-setup-files)
- [Playwright Configuration](#playwright-configuration)
  - [E2E Configuration (playwright.config.ts)](#e2e-configuration-playwrightconfigts)
  - [Global Setup and Teardown](#global-setup-and-teardown)
- [Configuration Comparisons](#configuration-comparisons)
- [Common Gotchas](#common-gotchas)

---

## Overview

The test suite uses two testing frameworks:

| Framework | Purpose | Config File | Run Command |
|-----------|---------|-------------|-------------|
| Vitest | Unit/Integration tests | `vitest.config.mts` | `npm run test` |
| Vitest (fast) | Quick feedback loop | `vitest.config.fast.mts` | `npm run test:fast` |
| Playwright | E2E browser tests | `playwright.config.ts` | `npm run test:e2e` |

---

## Vitest Configuration

### Main Configuration (vitest.config.mts)

#### Pool Strategy: Why `forks` with `maxForks: 1`

```typescript
pool: 'forks',
poolOptions: {
  forks: {
    minForks: 1,
    maxForks: 1,
  },
},
```

**Decision**: Use the forks pool with a single fork instead of parallel execution.

**Rationale**:
- **Module resolution stability**: Parallel execution (`maxForks > 1` or `threads` pool) causes module resolution errors with the `@jovie/ui` package. The error manifests as "Failed to resolve import `react/jsx-dev-runtime`".
- **Mock isolation**: Forks provide better isolation for module mocking compared to threads. Each fork gets its own module cache.
- **Reliability over speed**: Test reliability is more valuable than raw execution speed. Flaky tests waste more developer time than slower-but-consistent tests.

**Trade-offs**:
- Tests run sequentially within each file
- Total execution time is longer than optimal parallel execution
- However, the `isolate: true` setting still provides per-test isolation

**Alternatives considered**:
- `pool: 'threads'` - Faster but causes @jovie/ui resolution failures
- `maxForks: 'auto'` - Causes intermittent failures due to module caching conflicts

#### Test Environment: `jsdom`

```typescript
environment: 'jsdom',
```

**Decision**: Use jsdom for DOM simulation in all tests.

**Rationale**:
- Next.js components require DOM APIs (window, document, localStorage)
- @testing-library/react expects a DOM environment
- jsdom provides consistent behavior across platforms

**Important**: Keep jsdom at version `^26.1.0`. Version 27+ has ESM/CJS compatibility issues with `@exodus/bytes` that break the test environment.

#### Test Isolation

```typescript
isolate: true,
```

**Decision**: Enable strict test isolation.

**Rationale**:
- Prevents state pollution between tests
- Each test gets a fresh module environment
- Slight performance cost, but prevents hard-to-debug flakiness

#### Timeouts

```typescript
testTimeout: 10000, // 10s for reliability
hookTimeout: 5000,  // 5s for setup/teardown
```

**Decision**: Generous but bounded timeouts.

**Rationale**:
- **10s test timeout**: Accounts for async operations, database queries, and API calls without being too permissive
- **5s hook timeout**: Setup/teardown should be fast; this catches hung operations
- **Not too short**: Prevents false failures on slow machines or CI environments
- **Not too long**: Catches genuinely hung tests within reasonable time

#### Environment Variables

```typescript
env: {
  URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
  NODE_ENV: 'test',
},
```

**Decision**: Set critical env vars directly in config rather than relying on `.env.test`.

**Rationale**:
- Ensures tests run consistently regardless of local env file state
- `URL_ENCRYPTION_KEY` is required by encryption utilities
- `NODE_ENV: 'test'` triggers test-specific code paths

#### Dependency Inlining

```typescript
server: {
  deps: {
    inline: [
      '@testing-library/react',
      '@testing-library/jest-dom',
    ],
  },
},
```

**Decision**: Inline testing library dependencies.

**Rationale**:
- Avoids ESM/CJS compatibility issues
- Faster module resolution
- More consistent behavior across different Node.js versions

#### Path Aliases

```typescript
resolve: {
  alias: [
    { find: /^@\//, replacement: './' },
    { find: /^@jovie\/ui$/, replacement: '../../packages/ui' },
    // ... more aliases
  ],
},
```

**Decision**: Mirror Next.js path aliases for test compatibility.

**Rationale**:
- Tests can import from `@/` just like application code
- `@jovie/ui` points to the actual package in the monorepo
- Maintains parity between test and runtime environments

---

### Fast Configuration (vitest.config.fast.mts)

The fast configuration is optimized for quick feedback during development.

#### Environment: `node` (Not jsdom)

```typescript
environment: 'node',
```

**Decision**: Use Node.js environment for fast tests.

**Rationale**:
- **13x faster** than jsdom for test environment setup
- Pure logic tests don't need DOM APIs
- Dramatically reduces overall execution time

**Trade-off**: Cannot test React components or DOM-dependent code.

#### Focused Test Selection

```typescript
include: ['tests/lib/**/*.test.ts'],
exclude: [
  'tests/lib/hooks/**',        // React hooks require DOM
  'tests/lib/stripe/**',       // Uses React context
  'tests/lib/monitoring/web-vitals.test.ts', // Browser-only
  // ... more exclusions
],
```

**Decision**: Run only pure logic tests.

**Rationale**:
- `tests/lib/` contains utility functions and pure business logic
- Excludes tests that import React components (causes crashes in Node env)
- Provides ~30s feedback loop instead of ~4-5 minutes

#### Minimal Setup File

```typescript
setupFiles: ['./tests/setup-fast.ts'],
```

The fast setup file (`setup-fast.ts`) is intentionally minimal:

```typescript
// Suppress noisy runtime warnings in tests
global.console = {
  ...console,
  debug: () => {},
  warn: () => {},
};
```

**Rationale**:
- No DOM-related setup needed
- No @testing-library imports
- Minimizes initialization overhead

#### Aggressive Timeouts

```typescript
testTimeout: 5000, // 5s for fast feedback
hookTimeout: 2000, // 2s for setup/teardown
```

**Decision**: Short timeouts to catch slow tests.

**Rationale**:
- Fast tests should complete in <100ms typically
- 5s is generous enough for edge cases
- Encourages writing efficient test code

---

### Test Setup Files

#### Main Setup (tests/setup.ts)

The main setup file provides comprehensive test isolation:

| Feature | Purpose |
|---------|---------|
| `@testing-library/jest-dom` matchers | Extended assertions like `toBeVisible()` |
| DOM cleanup | `cleanup()` after each test |
| Mock clearing | `vi.clearAllMocks()` after each test |
| Global state reset | Cleans known test properties from `globalThis` |
| Environment restoration | Removes env vars added during tests |
| Storage clearing | Clears localStorage/sessionStorage |

**Important**: Timer cleanup (`vi.useRealTimers()`) is NOT included globally because tests that use fake timers expect them to persist across test cases within a file.

#### Utility Functions

```typescript
// Detect state pollution
export function detectStatePollution(): string[]

// Test-scoped env vars with auto-cleanup
export function withTestEnv(envVars: Record<string, string>): () => void
```

---

## Playwright Configuration

### E2E Configuration (playwright.config.ts)

#### Web Server Timeout: 120 seconds

```typescript
webServer: {
  timeout: 120000, // 120 seconds
}
```

**Decision**: Extended timeout for development server startup.

**Rationale**:
- Next.js dev server can take 60-90s on cold start (first run, cache empty)
- 60s default was causing intermittent failures
- 120s provides buffer for slow machines or heavy compile loads

#### Retry Strategy

```typescript
retries: process.env.CI ? 2 : 1,
```

**Decision**: Different retry counts for CI vs local.

**Rationale**:
- **CI (2 retries)**: E2E tests are inherently more flaky due to network/timing. Retries catch transient failures without failing the build.
- **Local (1 retry)**: Quick feedback on genuine failures while still catching the occasional flake.

**Note**: Before increasing retries, fix the underlying flakiness. Retries are a safety net, not a solution.

#### Worker Configuration

```typescript
workers: process.env.CI ? 4 : undefined,
```

**Decision**: Fixed workers in CI, auto-detect locally.

**Rationale**:
- **CI (4 workers)**: Predictable parallelism for consistent execution times
- **Local (undefined)**: Uses available CPU cores for faster feedback

#### Timeout Hierarchy

```typescript
timeout: 30000,      // Global test timeout
expect: { timeout: 10000 },  // Assertion auto-retry
actionTimeout: 15000,        // Click, fill, etc.
navigationTimeout: 30000,    // page.goto, etc.
```

**Decision**: Layered timeouts with increasing specificity.

**Rationale**:
- **30s global**: Maximum time for any single test
- **10s expect**: Playwright auto-retries assertions for this duration
- **15s action**: Catches hung elements without waiting too long
- **30s navigation**: Slow pages during development mode

#### Trace and Debugging

```typescript
trace: 'on-first-retry',
video: 'retain-on-failure',
screenshot: 'only-on-failure',
```

**Decision**: Capture debugging artifacts only on failures.

**Rationale**:
- Traces are expensive (time + storage) but invaluable for debugging
- `on-first-retry` captures trace before the retry that might succeed
- Video and screenshots only on failure minimize storage costs

#### Browser Configuration

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  // Firefox only in full suite (not smoke tests)
  ...(process.env.SMOKE_ONLY !== '1' ? [{ name: 'firefox' }] : []),
  // WebKit only locally (skip in CI)
  ...(!process.env.CI ? [{ name: 'webkit' }] : []),
]
```

**Decision**: Selective browser coverage based on context.

**Rationale**:
- **Chromium**: Always run (primary browser, most users)
- **Firefox**: Skip for smoke tests (speed) but include in full runs (coverage)
- **WebKit**: Local only because CI MacOS runners are expensive

---

### Global Setup and Teardown

#### Global Setup (tests/global-setup.ts)

| Step | Purpose |
|------|---------|
| Clerk authentication | Sets up testing token for authenticated tests |
| Environment defaults | Provides fallback values for required env vars |
| Database seeding | Creates required test profiles |
| Browser warmup | Pre-launches browser to avoid cold start in first test |

**Smoke test optimization**:
```typescript
if (process.env.SMOKE_ONLY === '1') {
  console.log('Skipping browser warmup for smoke tests');
  return;
}
```

#### Global Teardown (tests/global-teardown.ts)

Logs test completion status and duration metrics. Minimal cleanup since Playwright handles browser cleanup automatically.

---

## Configuration Comparisons

### When to Use Each Configuration

| Scenario | Configuration | Command | Expected Duration |
|----------|---------------|---------|-------------------|
| Quick feedback while coding | Fast | `npm run test:fast` | ~30-35s |
| Full unit/integration tests | Main | `npm run test` | ~4-5 min |
| E2E browser tests | Playwright | `npm run test:e2e` | Varies |
| Coverage report | Main + coverage | `npm run test:coverage` | ~5-6 min |
| CI pipeline | Main | `npm run test -- --run` | ~4-5 min |

### Performance vs Reliability Trade-offs

| Setting | Performance Impact | Reliability Impact | Current Choice |
|---------|-------------------|-------------------|----------------|
| `pool: 'forks'` vs `'threads'` | -20% speed | +100% stability | forks |
| `maxForks: 1` vs `'auto'` | -40% speed | +100% stability | 1 |
| `isolate: true` vs `false` | -10% speed | +50% stability | true |
| `environment: 'node'` vs `'jsdom'` | +90% speed | Limited scope | node (fast only) |

---

## Common Gotchas

### 1. jsdom Version

**Issue**: jsdom v27+ breaks tests with ESM/CJS errors.

**Solution**: Keep `jsdom: "^26.1.0"` in package.json.

### 2. Parallel Execution Failures

**Issue**: Tests fail with "Failed to resolve import react/jsx-dev-runtime".

**Solution**: This is a monorepo-specific issue with `@jovie/ui`. Keep `maxForks: 1`.

### 3. Mock Response URL Property

**Issue**: Fetch mock tests take 3+ seconds.

**Cause**: Mock responses missing `url` property trigger retry logic.

**Solution**: Always include `url: 'https://example.com'` in mock responses when testing code that uses `allowedHosts`.

### 4. Global State Leakage

**Issue**: Tests pass individually but fail when run together.

**Solution**:
- Reset `globalThis` properties in `beforeEach`
- Use the cleanup in `tests/setup.ts`
- See `TEST_STATE_PROPERTIES` for known state to clean

### 5. Timer Persistence

**Issue**: `vi.useFakeTimers()` affects subsequent tests.

**Solution**: Vitest cleanup does NOT include `vi.useRealTimers()` intentionally. Manage timer lifecycle in individual test files.

---

## Related Documentation

- [Testing Guide](./testing-guide.md) - Best practices for writing tests
- [Test Troubleshooting](./test-troubleshooting.md) - Common issues and solutions

---

*Last updated: December 2024*
