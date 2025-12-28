# Testing Best Practices Guide

This guide documents best practices for writing reliable, performant tests in the Jovie codebase. It covers Vitest for unit/integration testing and Playwright for E2E testing.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Reliability Patterns](#test-reliability-patterns)
3. [Test Isolation](#test-isolation)
4. [Performance Optimization](#performance-optimization)
5. [Parallel Execution](#parallel-execution)
6. [Mocking Best Practices](#mocking-best-practices)
7. [E2E Testing with Playwright](#e2e-testing-with-playwright)
8. [Common Anti-Patterns](#common-anti-patterns)
9. [Debugging Flaky Tests](#debugging-flaky-tests)

---

## Quick Start

### Running Tests

```bash
# Full test suite (Vitest)
cd apps/web && npm run test

# Fast subset - lib/utility tests only (~30s)
npm run test:fast

# Watch mode for development
npm run test:watch

# E2E tests (Playwright)
npm run test:e2e

# Performance profiling
npm run test:profile

# Flaky test detection (runs 5x)
npm run test:flaky
```

### Test File Organization

```
apps/web/tests/
├── bench/              # Performance benchmarks
├── e2e/               # Playwright E2E tests (*.spec.ts)
├── integration/       # Database/API integration tests
├── lib/               # Unit tests for lib/ modules
├── unit/              # Unit tests for components/hooks
├── test-utils/        # Test utilities and factories
├── setup.ts           # Global test setup (auto-loaded)
├── setup-browser.ts   # Browser globals (window, document)
├── setup-db.ts        # Database setup for integration tests
└── setup-mocks.ts     # Component mocks (Clerk, etc.)
```

---

## Test Reliability Patterns

### 1. Reset Global State in beforeEach

Tests that modify global state must reset it before each test:

```typescript
// GOOD: Reset global state explicitly
describe('Web Vitals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any global flags the module uses
    globalThis.jovieWebVitalsInitialized = false;
    globalThis.jovieWebVitalsHandlers = undefined;
  });

  it('should initialize listeners', () => {
    initWebVitals(); // Works correctly because state was reset
  });
});

// BAD: No state reset - second test may see stale state
describe('Web Vitals', () => {
  it('test 1', () => {
    initWebVitals(); // Sets global flag
  });

  it('test 2', () => {
    initWebVitals(); // May skip initialization due to flag!
  });
});
```

### 2. Use Test Data Factories

Factories ensure unique data per test and reduce boilerplate:

```typescript
import { factories } from './test-utils/factories';

it('should create user profile', () => {
  // Each call generates unique IDs and timestamps
  const user = factories.user({ name: 'Alice' });
  const profile = factories.creatorProfile({ userId: user.id });

  // Test with isolated, predictable data
  expect(profile.userId).toBe(user.id);
});
```

Available factories:
- `factories.user()` - Create user entities
- `factories.creatorProfile()` - Create creator profiles
- `factories.socialLink()` - Create social links
- `factories.clickEvent()` - Create analytics events
- `factories.request()` - Mock NextRequest objects
- `factories.response()` - Mock Response objects
- `factories.uuid()` - Generate unique test IDs

### 3. Provide Complete Mock Data

When mocking fetch responses, include all properties the code accesses:

```typescript
// GOOD: Include url property for redirect handling
vi.mocked(fetch).mockResolvedValue({
  ok: false,
  status: 404,
  url: 'https://example.com/not-found',  // Required for URL validation
  text: async () => 'Not found',
} as Response);

// BAD: Missing url causes new URL(undefined) to throw
vi.mocked(fetch).mockResolvedValue({
  ok: false,
  status: 404,
  text: async () => 'Not found',
} as Response);
```

### 4. Handle Async Operations Properly

Always wait for async operations to complete:

```typescript
// GOOD: Wait for operation to complete
await expect(asyncOperation()).resolves.toBe(expected);

// GOOD: Wait for promise rejection
await expect(failingOperation()).rejects.toThrow('Expected error');

// BAD: No await - test may pass before assertion runs
expect(asyncOperation()).resolves.toBe(expected);
```

---

## Test Isolation

### Automatic Cleanup

The test setup (`tests/setup.ts`) provides automatic cleanup:

- **DOM cleanup** via `@testing-library/react cleanup()`
- **Mock cleanup** via `vi.clearAllMocks()`
- **Global state cleanup** for known test properties
- **Environment variable restoration** for vars added during tests
- **localStorage/sessionStorage cleanup**

### Managing Environment Variables

Use the `withTestEnv` helper for test-scoped environment variables:

```typescript
import { withTestEnv } from './setup';

it('should use encryption key', () => {
  const restoreEnv = withTestEnv({
    PII_ENCRYPTION_KEY: 'test-key',
    NODE_ENV: 'test'
  });

  // Test code that uses these env vars
  expect(process.env.PII_ENCRYPTION_KEY).toBe('test-key');

  restoreEnv(); // Manually restore if needed before test ends
});
```

### Detecting State Pollution

Use `detectStatePollution()` to debug cross-test interference:

```typescript
import { detectStatePollution } from './setup';

afterEach(() => {
  const issues = detectStatePollution();
  if (issues.length > 0) {
    console.warn('State pollution detected:', issues);
  }
});
```

### Timer Management

**Important**: The global cleanup does NOT reset fake timers. Tests using fake timers must manage their own lifecycle:

```typescript
describe('Debounce function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers(); // Clean up YOUR fake timers
  });

  it('should debounce calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

---

## Performance Optimization

### 1. Use the Fast Test Configuration

For quick feedback during development, use `npm run test:fast`:

- Runs only `tests/lib/**/*.test.ts` (pure utility tests)
- Uses `node` environment instead of `jsdom` (13x faster setup)
- Completes in ~30 seconds vs ~4+ minutes

### 2. Keep Tests Focused

```typescript
// GOOD: Focused test with minimal setup
it('should validate email format', () => {
  expect(isValidEmail('user@example.com')).toBe(true);
  expect(isValidEmail('invalid')).toBe(false);
});

// BAD: Over-engineered test with unnecessary setup
it('should validate email format', async () => {
  const db = await setupDatabase();
  const user = await db.createUser({ email: 'user@example.com' });
  expect(isValidEmail(user.email)).toBe(true);
  await db.cleanup();
});
```

### 3. Avoid Retry Delays in Mocks

Ensure mocks don't trigger retry logic unintentionally:

```typescript
// GOOD: Complete mock prevents retry delays
vi.mocked(fetch).mockResolvedValue({
  ok: false,
  status: 429,
  url: 'https://api.example.com/rate-limited',  // Prevents URL validation error
  headers: new Headers({ 'Retry-After': '1' }),
  text: async () => 'Rate limited',
} as Response);

// BAD: Missing url causes 3+ second delays due to retry logic
vi.mocked(fetch).mockResolvedValue({
  ok: false,
  status: 429,
  text: async () => 'Rate limited',
} as Response);
```

### 4. Use Appropriate Timeouts

Set timeouts based on test complexity:

```typescript
// Short timeout for fast operations
it('should parse JSON quickly', () => {
  expect(parseJSON('{"key": "value"}')).toEqual({ key: 'value' });
}, { timeout: 1000 });

// Longer timeout for network operations (integration tests)
it('should fetch data from API', async () => {
  const result = await fetchFromAPI('/users');
  expect(result).toBeDefined();
}, { timeout: 10000 });
```

### 5. Profile Slow Tests

Use the profiler to identify bottlenecks:

```bash
npm run test:profile
```

Output identifies:
- Tests taking >200ms (potentially slow)
- Tests taking >1000ms (needs optimization)
- Tests taking >5000ms (critical - investigate immediately)

---

## Parallel Execution

### Current Configuration

The Vitest configuration uses `forks` pool with `maxForks: 1` for stability. This ensures reliable test execution but runs tests sequentially.

**Why not parallel?** The `@jovie/ui` package has module resolution issues when running with multiple forks. Error: "Failed to resolve import react/jsx-dev-runtime".

### Using test.concurrent

For CPU-bound tests within a single file, use `test.concurrent`:

```typescript
describe('Hash functions', () => {
  // These run concurrently within the file
  test.concurrent('should hash string A', async () => {
    const result = await hashString('input-a');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  test.concurrent('should hash string B', async () => {
    const result = await hashString('input-b');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

### When to Use test.concurrent

**Good candidates:**
- Pure functions with no shared state
- CPU-intensive operations (hashing, encryption)
- Independent API validations

**Avoid for:**
- Tests that modify global state
- Tests using fake timers
- Tests with database operations
- Tests that depend on execution order

---

## Mocking Best Practices

### 1. Mock at Module Level

Use `vi.mock()` at the top of the file for consistent mocking:

```typescript
// Module-level mocks (hoisted automatically)
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}));

// Import after mocks
import { track } from '@/lib/analytics';
import { onLCP } from 'web-vitals';
```

### 2. Clear Mocks Between Tests

Use `vi.clearAllMocks()` in beforeEach (done automatically by setup.ts):

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Clears call history, preserves implementations
});

// For restoring original implementations:
afterEach(() => {
  vi.restoreAllMocks(); // Restores original functions
});
```

### 3. Use Type-Safe Mock Access

```typescript
import { vi, type MockedFunction } from 'vitest';

// Access mock details with proper typing
const mockedTrack = vi.mocked(track);
expect(mockedTrack).toHaveBeenCalledWith('event', { data: 'value' });

// Access mock implementation
const callback = mockedTrack.mock.calls[0][0];
```

### 4. Mock Factories for Complex Objects

For database mocks, use the query builder factory:

```typescript
import { factories } from './test-utils/factories';

const mockDb = factories.queryBuilder([
  factories.user({ name: 'Alice' }),
  factories.user({ name: 'Bob' }),
]);

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));
```

---

## E2E Testing with Playwright

### 1. Use data-testid Selectors

Prefer stable `data-testid` attributes over CSS selectors:

```typescript
// GOOD: Stable selector
await page.getByTestId('submit-button').click();
await expect(page.getByTestId('success-message')).toBeVisible();

// BAD: Brittle CSS selector - breaks when styling changes
await page.locator('.bg-green-500.rounded-full').click();
await expect(page.locator('div.success')).toBeVisible();
```

### 2. Use Condition-Based Waiting

Replace arbitrary timeouts with explicit conditions:

```typescript
// GOOD: Wait for specific condition
await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
await expect(page.getByTestId('dashboard-loaded')).toBeVisible();

// GOOD: Poll for condition
await expect.poll(async () => {
  return await page.getByTestId('status').textContent();
}, { timeout: 5000 }).toBe('Ready');

// GOOD: Wait for URL change
await Promise.race([
  page.waitForURL('**/success'),
  page.waitForSelector('[data-testid="error-message"]'),
]);

// BAD: Arbitrary timeout
await page.waitForTimeout(3000); // Don't do this!
```

### 3. Avoid networkidle

Use `domcontentloaded` instead of `networkidle`:

```typescript
// GOOD: Fast and reliable
await page.goto('/profile', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="profile-content"]');

// BAD: Can hang on long-polling connections
await page.goto('/profile', { waitUntil: 'networkidle' });
```

### 4. Handle Dynamic Content

For dynamically loaded content, use auto-retry assertions:

```typescript
// GOOD: Auto-retry assertion
await expect(page.getByText('Welcome, Alice')).toBeVisible();

// GOOD: With explicit timeout
await expect(page.getByTestId('user-avatar'))
  .toBeVisible({ timeout: 10000 });

// BAD: Single check without retry
const text = await page.getByText('Welcome').textContent();
expect(text).toBe('Welcome, Alice'); // May fail if content not loaded
```

### 5. Screenshot and Trace on Failure

The Playwright config automatically captures screenshots on failure. Use traces for debugging:

```bash
# Run with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

---

## Common Anti-Patterns

### 1. Sharing State Between Tests

```typescript
// BAD: Shared mutable state
let counter = 0;

it('test 1', () => {
  counter++;
  expect(counter).toBe(1);
});

it('test 2', () => {
  counter++;
  expect(counter).toBe(2); // Depends on test 1 running first!
});

// GOOD: Isolated state per test
describe('Counter tests', () => {
  let counter: number;

  beforeEach(() => {
    counter = 0;
  });

  it('test 1', () => {
    counter++;
    expect(counter).toBe(1);
  });

  it('test 2', () => {
    counter++;
    expect(counter).toBe(1); // Independent!
  });
});
```

### 2. Relying on Test Order

```typescript
// BAD: Tests depend on execution order
it('should create user', async () => {
  createdUserId = await createUser({ name: 'Alice' });
});

it('should update user', async () => {
  await updateUser(createdUserId, { name: 'Bob' }); // Fails if run alone!
});

// GOOD: Each test is independent
it('should update user', async () => {
  const userId = await createUser({ name: 'Alice' }); // Create in this test
  await updateUser(userId, { name: 'Bob' });
});
```

### 3. Using sleep() or Arbitrary Timeouts

```typescript
// BAD: Arbitrary delay
await new Promise(resolve => setTimeout(resolve, 2000));
expect(result).toBe('ready');

// GOOD: Wait for condition
await vi.waitFor(() => {
  expect(result).toBe('ready');
});
```

### 4. Over-Mocking

```typescript
// BAD: Mocking internal implementation details
vi.mock('@/lib/utils/internal-helper', () => ({
  __internalFormat: vi.fn(),
}));

// GOOD: Mock at the boundary (external dependencies)
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));
```

### 5. Ignoring Async Errors

```typescript
// BAD: Swallowing errors silently
try {
  await riskyOperation();
} catch (e) {
  // Ignored - test passes but hides bugs!
}

// GOOD: Expect specific errors
await expect(riskyOperation()).rejects.toThrow('Expected error message');
```

---

## Debugging Flaky Tests

### 1. Run Multiple Times

Use the flaky test detector:

```bash
npm run test:flaky
```

This runs the suite 5 times and reports any inconsistent results.

### 2. Check for Race Conditions

Common causes:
- Uncontrolled async operations
- Shared global state
- Timer-dependent logic
- Missing await statements

### 3. Use Verbose Output

```bash
npm run test -- --reporter=verbose
```

### 4. Isolate the Test

Run the specific test in isolation:

```bash
npm run test -- path/to/file.test.ts -t "test name"
```

### 5. Check for Module-Level Side Effects

Some modules execute code on import. Use dynamic imports or mock carefully:

```typescript
// If module has side effects, mock before import
vi.mock('@/lib/module-with-side-effects');

// Then import
const { functionToTest } = await import('@/lib/module-with-side-effects');
```

### 6. Review Setup/Teardown

Ensure proper cleanup:

```typescript
describe('Feature', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = setupFeature();
  });

  afterEach(() => {
    cleanup(); // Always clean up!
  });
});
```

---

## Configuration Reference

### Vitest Config Highlights

From `vitest.config.mts`:

```typescript
{
  pool: 'forks',           // Process isolation
  poolOptions: {
    forks: { maxForks: 1 } // Sequential for reliability
  },
  testTimeout: 30000,      // 30s default timeout
  hookTimeout: 30000,      // 30s for setup/teardown
  setupFiles: ['./tests/setup.ts'],
  environment: 'jsdom',    // Browser-like environment
}
```

### Playwright Config Highlights

From `playwright.config.ts`:

```typescript
{
  timeout: 30000,              // Test timeout
  actionTimeout: 15000,        // Element action timeout
  navigationTimeout: 30000,    // Page navigation timeout
  expect: { timeout: 10000 },  // Assertion auto-retry
  retries: process.env.CI ? 2 : 1, // Retry flaky tests
  webServer: {
    timeout: 120000,           // Server startup timeout
  },
}
```

---

## Related Documentation

- [Test Troubleshooting Guide](./test-troubleshooting.md) - Common issues and solutions
- [Test Configuration Guide](./test-configuration.md) - Detailed config explanations
- [Clerk Testing Setup](./testing-clerk.md) - Authentication testing

---

## Summary

### Key Principles

1. **Isolate** - Each test should be independent and repeatable
2. **Reset** - Clean up global state in beforeEach/afterEach
3. **Wait** - Use condition-based waiting, not arbitrary timeouts
4. **Mock wisely** - Mock at boundaries, provide complete mock data
5. **Profile** - Use `npm run test:profile` to identify slow tests

### Quick Checklist

Before committing tests:

- [ ] Tests pass independently (run with `--reporter=verbose`)
- [ ] No `waitForTimeout()` or `sleep()` calls
- [ ] Using `data-testid` for E2E selectors
- [ ] Mocks include all accessed properties
- [ ] Global state reset in beforeEach
- [ ] Async operations properly awaited
- [ ] No console.log debugging statements
