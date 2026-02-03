# Performance Testing Utilities

Reusable performance measurement utilities for Playwright E2E tests, enabling consistent tracking of page load times, Core Web Vitals, API response times, and user interaction timing.

## Quick Start

### Basic Page Load Measurement

```typescript
import { measurePageLoad } from './utils/performance-test-utils';
import { assertFastPageLoad } from './utils/performance-assertions';

test('page loads quickly', async ({ page }, testInfo) => {
  await page.goto('/dashboard');

  const metrics = await measurePageLoad(page);
  await assertFastPageLoad(metrics.domContentLoaded, 3000, testInfo);

  console.log(`Page loaded in ${metrics.loadTime.toFixed(0)}ms`);
});
```

### Web Vitals Measurement

```typescript
import { measureWebVitals, PERFORMANCE_BUDGETS } from './utils/performance-test-utils';
import { assertWebVitalsHealthy } from './utils/performance-assertions';

test('page has healthy Web Vitals', async ({ page }, testInfo) => {
  await page.goto('/');

  const vitals = await measureWebVitals(page);
  await assertWebVitalsHealthy(vitals, testInfo);

  console.log(`LCP: ${vitals.lcp?.toFixed(0)}ms (budget: ${PERFORMANCE_BUDGETS.homepage.lcp}ms)`);
});
```

### Comprehensive Measurement

```typescript
import { measureAllPerformanceMetrics, PERFORMANCE_BUDGETS } from './utils/performance-test-utils';
import { assertPerformanceBudget } from './utils/performance-assertions';

test('page meets all performance budgets', async ({ page }, testInfo) => {
  await page.goto('/profile');

  const metrics = await measureAllPerformanceMetrics(page, {
    includeResources: true,
  });

  await assertPerformanceBudget(
    metrics,
    PERFORMANCE_BUDGETS.publicProfile,
    testInfo
  );
});
```

## Available Utilities

### Measurement Functions

#### `measurePageLoad(page: Page)`

Measures page load performance using the Navigation Timing API.

**Returns:**
```typescript
{
  loadTime: number;           // Total page load time (ms)
  domContentLoaded: number;   // DOM Content Loaded event (ms)
  ttfb: number;               // Time to First Byte (ms)
  dnsTime: number;            // DNS lookup time (ms)
  connectionTime: number;     // TCP connection time (ms)
  requestTime: number;        // Request duration (ms)
  responseTime: number;       // Response download time (ms)
  domProcessingTime: number;  // DOM processing time (ms)
}
```

**Example:**
```typescript
const metrics = await measurePageLoad(page);
console.log(`DOM loaded in ${metrics.domContentLoaded}ms`);
```

---

#### `measureWebVitals(page: Page)`

Measures Core Web Vitals using PerformanceObserver. Waits up to 10 seconds for LCP and FCP to be captured.

**Returns:**
```typescript
{
  lcp?: number;  // Largest Contentful Paint (ms)
  fcp?: number;  // First Contentful Paint (ms)
  cls?: number;  // Cumulative Layout Shift (score)
  inp?: number;  // Interaction to Next Paint (ms)
  ttfb?: number; // Time to First Byte (ms)
}
```

**Example:**
```typescript
const vitals = await measureWebVitals(page);
console.log(`LCP: ${vitals.lcp}ms, CLS: ${vitals.cls}`);
```

---

#### `measureResourceLoad(page: Page)`

Measures resource loading performance (scripts, images, CSS).

**Returns:**
```typescript
{
  scriptCount: number;
  scriptTotalSize: number;
  imageCount: number;
  imageTotalSize: number;
  cssCount: number;
  cssTotalSize: number;
  slowestResource?: {
    url: string;
    duration: number;
    size: number;
  };
}
```

---

#### `setupApiMonitoring(page: Page)`

Sets up API request monitoring. Returns a cleanup function to stop monitoring and retrieve captured requests.

**Returns:**
```typescript
{
  cleanup: () => Promise<Array<{
    url: string;
    method: string;
    duration: number;
    status: number;
  }>>;
}
```

**Example:**
```typescript
const { cleanup } = setupApiMonitoring(page);
await page.goto('/dashboard');
const apiRequests = await cleanup();
console.log(`Captured ${apiRequests.length} API requests`);
```

---

#### `measureAllPerformanceMetrics(page, options?)`

Comprehensively measures all performance metrics.

**Options:**
- `includeResources?: boolean` - Include resource timing data
- `includeApiRequests?: boolean` - Include API request data (requires prior setup)

**Example:**
```typescript
const metrics = await measureAllPerformanceMetrics(page, {
  includeResources: true,
});
```

---

#### `measureInteractionTiming(page, interaction)`

Measures timing of a user interaction.

**Example:**
```typescript
const duration = await measureInteractionTiming(page, async () => {
  await page.click('button[data-testid="submit"]');
  await page.waitForSelector('[data-testid="success-message"]');
});
console.log(`Interaction took ${duration}ms`);
```

---

### Assertion Functions

#### `assertPerformanceBudget(metrics, budget, testInfo?)`

Validates performance metrics against budget thresholds.

**Severity Levels:**
- **Warning:** Metric exceeds budget but is <150% of budget (logged, not failed)
- **Critical:** Metric exceeds 150% of budget (test fails)

**Example:**
```typescript
await assertPerformanceBudget(
  metrics,
  PERFORMANCE_BUDGETS.publicProfile,
  testInfo
);
```

---

#### `assertWebVitalsHealthy(vitals, testInfo?)`

Checks Web Vitals against Chrome's thresholds:
- LCP: <2.5s good, >4s poor (fails test)
- FCP: <1.8s good, >3s poor (fails test)
- CLS: <0.1 good, >0.25 poor (fails test)
- INP: <200ms good, >500ms poor (fails test)

**Example:**
```typescript
await assertWebVitalsHealthy(metrics.vitals, testInfo);
```

---

#### `assertFastPageLoad(loadTimeMs, maxLoadTimeMs, testInfo?)`

Simple assertion for page load time.

**Example:**
```typescript
await assertFastPageLoad(metrics.domContentLoaded, 3000, testInfo);
```

---

#### `assertFastApiResponse(responseTimeMs, maxResponseTimeMs)`

Validates API response time.

**Example:**
```typescript
assertFastApiResponse(handleValidationTime, 200);
```

---

## Performance Budgets

Pre-defined budgets aligned with production Web Vitals thresholds:

```typescript
export const PERFORMANCE_BUDGETS = {
  publicProfile: {
    lcp: 2500,     // <2.5s requirement (high-traffic revenue page)
    fcp: 1800,
    ttfb: 800,
    cls: 0.1,
    inp: 200,
    domContentLoaded: 3000,
    loadTime: 4000,
  },
  homepage: {
    lcp: 5000,     // <5s with featured artists
    fcp: 2000,
    ttfb: 1000,
    cls: 0.1,
    inp: 200,
    domContentLoaded: 5000,
    loadTime: 6000,
  },
  dashboard: {
    lcp: 3000,
    fcp: 2000,
    ttfb: 1000,
    cls: 0.1,
    inp: 200,
    domContentLoaded: 4000,
    loadTime: 5000,
  },
  onboarding: {
    lcp: 2000,
    fcp: 1500,
    ttfb: 800,
    cls: 0.1,
    inp: 200,
    domContentLoaded: 2000,
    loadTime: 3000,
    apiResponseTime: 200,  // Handle validation
  },
};
```

**Budget Source:** Production thresholds from `lib/monitoring/web-vitals.ts` lines 97-105.

### Budget Rationale

- **Public Profile:** Strictest budgets (<2.5s LCP) because it's a high-traffic revenue page
- **Homepage:** Relaxed LCP (<5s) to account for featured artists loading
- **Dashboard:** Balanced budgets for authenticated experience
- **Onboarding:** Fast budgets for critical conversion flow

---

## Best Practices

### When to Measure Performance

1. **Critical User Flows:** Always measure performance on revenue-impacting pages (public profile, onboarding, checkout)
2. **After Navigation:** Measure after `page.goto()` completes and page is visible
3. **After Hydration:** For SSR/SSG pages, measure after React hydration settles
4. **Nightly Tests:** Use `@nightly` tag for comprehensive performance tests to avoid slowing CI

### How to Tag Tests

```typescript
test.describe('Profile Performance @nightly', () => {
  test('profile meets budgets', async ({ page }, testInfo) => {
    // Performance test code
  });
});
```

The `@nightly` tag excludes tests from regular CI runs (see `playwright.config.ts`).

### Measuring Without Failing Tests

For smoke tests, measure performance but only warn on budget violations:

```typescript
const vitals = await measureWebVitals(page);
await testInfo.attach('vitals', {
  body: JSON.stringify(vitals, null, 2),
  contentType: 'application/json',
});

if (vitals.lcp && vitals.lcp > PERFORMANCE_BUDGETS.homepage.lcp) {
  console.warn(`⚠️  LCP exceeded budget: ${vitals.lcp}ms`);
}
// Don't call assertWebVitalsHealthy() to avoid failing test
```

### CI/CD Integration

Performance metrics are automatically attached to test results via `testInfo.attach()`:

```typescript
await testInfo.attach('performance-metrics', {
  body: JSON.stringify(metrics, null, 2),
  contentType: 'application/json',
});
```

View attached metrics in:
- Playwright HTML report (`npx playwright show-report`)
- Test artifacts in CI/CD (GitHub Actions, etc.)
- JSON reporter output

---

## Advanced Usage

### Monitoring API Requests

```typescript
const { cleanup } = setupApiMonitoring(page);

await page.goto('/dashboard');
await page.waitForLoadState('networkidle');

const apiRequests = await cleanup();

const slowRequests = apiRequests.filter(req => req.duration > 500);
if (slowRequests.length > 0) {
  console.warn('Slow API requests:', slowRequests);
}
```

### Comparing Performance Across Pages

```typescript
const profiles = ['dualipa', 'taylorswift'];
const results = [];

for (const profile of profiles) {
  await page.goto(`/${profile}`);
  const metrics = await measureAllPerformanceMetrics(page);
  results.push({ profile, lcp: metrics.vitals.lcp });
}

await testInfo.attach('profile-comparison', {
  body: JSON.stringify(results, null, 2),
  contentType: 'application/json',
});
```

### Measuring Interaction Performance

```typescript
const clickDuration = await measureInteractionTiming(page, async () => {
  await page.click('[data-testid="load-more"]');
  await page.waitForSelector('[data-testid="new-content"]');
});

assertFastApiResponse(clickDuration, 1000);
```

---

## Troubleshooting

### "Navigation timing not available" Error

**Cause:** `measurePageLoad()` called before navigation completes.

**Solution:** Ensure page is fully loaded:
```typescript
await page.goto('/');
await page.waitForLoadState('domcontentloaded');
const metrics = await measurePageLoad(page);
```

---

### Web Vitals Not Captured (LCP/FCP undefined)

**Cause:** PerformanceObserver doesn't capture metrics before 10s timeout.

**Solution:** Increase wait time or check if page has content:
```typescript
const vitals = await measureWebVitals(page);
if (!vitals.lcp) {
  console.warn('LCP not captured within 10s timeout');
}
```

---

### Performance Budgets Too Strict

**Cause:** CI runner performance variance or realistic page complexity.

**Solution:** Either:
1. Increase budget by 50% to account for variance
2. Use warning severity only (don't fail test)
3. Run performance tests nightly on consistent hardware

---

## Examples

See these test files for complete examples:

- **`tests/e2e/profile-performance.spec.ts`** - Public profile performance test
- **`tests/e2e/golden-path.spec.ts`** - Dashboard load measurement
- **`tests/e2e/smoke-public.spec.ts`** - Homepage Web Vitals measurement

---

## Future Enhancements

Potential additions for incremental rollout:

1. **Lighthouse Integration:** Full Lighthouse audits in CI
2. **Performance Trends:** Track metrics over time with database storage
3. **Real User Monitoring (RUM) Comparison:** Compare E2E metrics to production RUM data
4. **Custom Metrics:** Framework-specific metrics (Next.js hydration time, etc.)
5. **Performance Regression Detection:** Auto-detect regressions vs. baseline
