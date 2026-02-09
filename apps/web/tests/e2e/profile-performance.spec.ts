/**
 * Public Profile Performance Test
 *
 * Validates that public profile pages meet performance budgets:
 * - LCP < 2.5s (high-traffic revenue page requirement)
 * - FCP < 1.8s
 * - TTFB < 800ms
 * - DOM Content Loaded < 3s
 *
 * Tagged with @nightly to exclude from regular CI runs.
 */

import { expect, test } from './setup';
import {
  assertPerformanceBudget,
  assertWebVitalsHealthy,
} from './utils/performance-assertions';
import {
  measureAllPerformanceMetrics,
  PERFORMANCE_BUDGETS,
} from './utils/performance-test-utils';
import type { PerformanceMetrics } from './utils/performance-types';
import {
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

// Override to run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Log performance metrics summary
 */
function logPerformanceSummary(
  metrics: PerformanceMetrics,
  budgetKey: keyof typeof PERFORMANCE_BUDGETS
): void {
  const budget = PERFORMANCE_BUDGETS[budgetKey];

  console.log('📊 Public Profile Performance:');
  console.log(
    `   LCP: ${metrics.vitals.lcp?.toFixed(0)}ms (budget: ${budget.lcp}ms)`
  );
  console.log(
    `   FCP: ${metrics.vitals.fcp?.toFixed(0)}ms (budget: ${budget.fcp}ms)`
  );
  console.log(
    `   TTFB: ${metrics.vitals.ttfb?.toFixed(0)}ms (budget: ${budget.ttfb}ms)`
  );
  console.log(
    `   DOM Content Loaded: ${metrics.navigation.domContentLoaded.toFixed(0)}ms (budget: ${budget.domContentLoaded}ms)`
  );

  if (metrics.resources) {
    console.log(
      `   Resources: ${metrics.resources.scriptCount} scripts, ${metrics.resources.imageCount} images`
    );
    if (metrics.resources.slowestResource) {
      const filename =
        metrics.resources.slowestResource.url.split('/').pop() || 'unknown';
      const duration = metrics.resources.slowestResource.duration.toFixed(0);
      console.log(`   Slowest resource: ${filename} (${duration}ms)`);
    }
  }
}

test.describe('Public Profile Performance @nightly', () => {
  // Performance budgets are only meaningful against production builds.
  // In dev mode Turbopack adds significant overhead that makes timing
  // assertions unreliable. Skip the entire suite unless running in CI
  // against a preview / production build.
  const isDevMode = !process.env.CI;

  test('profile page meets performance budgets', async ({ page }, testInfo) => {
    if (isDevMode) {
      test.skip(
        true,
        'Performance budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    const { cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);

      // Wait for page to be fully loaded
      await expect(page.locator('body')).toBeVisible();

      // Measure all performance metrics
      const metrics = await measureAllPerformanceMetrics(page, {
        includeResources: true,
      });

      // Assert against public profile budget
      await assertPerformanceBudget(
        metrics,
        PERFORMANCE_BUDGETS.publicProfile,
        testInfo
      );

      // Also check Web Vitals
      await assertWebVitalsHealthy(metrics.vitals, testInfo);

      // Log summary for visibility
      logPerformanceSummary(metrics, 'publicProfile');
    } finally {
      cleanup();
    }
  });

  test('profile page Web Vitals are healthy across multiple loads', async ({
    page,
  }, testInfo) => {
    if (isDevMode) {
      test.skip(
        true,
        'Web Vitals assertions are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    const { cleanup } = setupPageMonitoring(page);

    try {
      // Test both profiles to ensure consistency
      const profiles = [TEST_PROFILES.DUALIPA, TEST_PROFILES.TAYLORSWIFT];
      const results: Array<{ profile: string; lcp?: number; fcp?: number }> =
        [];

      for (const profile of profiles) {
        await smokeNavigate(page, `/${profile}`);
        await expect(page.locator('body')).toBeVisible();

        const metrics = await measureAllPerformanceMetrics(page);
        results.push({
          profile,
          lcp: metrics.vitals.lcp,
          fcp: metrics.vitals.fcp,
        });

        await assertWebVitalsHealthy(metrics.vitals);
      }

      // Attach comparison results
      await testInfo.attach('profile-comparison', {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
      });

      console.log('📊 Profile Performance Comparison:');
      results.forEach(r => {
        console.log(
          `   ${r.profile}: LCP ${r.lcp?.toFixed(0)}ms, FCP ${r.fcp?.toFixed(0)}ms`
        );
      });
    } finally {
      cleanup();
    }
  });
});
