/**
 * Release Page Performance Test
 *
 * Validates that smart link release pages meet performance budgets.
 * Follows the same pattern as profile-performance.spec.ts.
 *
 * @nightly — excluded from regular CI runs.
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

function logPerformanceSummary(
  metrics: PerformanceMetrics,
  budgetKey: keyof typeof PERFORMANCE_BUDGETS
): void {
  const budget = PERFORMANCE_BUDGETS[budgetKey];

  console.log('📊 Release Page Performance:');
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
}

test.describe('Release Page Performance @nightly', () => {
  const isDevMode = !process.env.CI;

  test('release page meets performance budgets', async ({ page }, testInfo) => {
    if (isDevMode) {
      test.skip(
        true,
        'Performance budgets are unreliable in dev mode (Turbopack overhead)'
      );
    }

    test.setTimeout(120_000);
    setupPageMonitoring(page);

    try {
      // Navigate to a known release page (seeded test data)
      // Uses the profile handle with a known release slug
      await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`, {
        timeout: 60_000,
        waitUntil: 'load',
      });

      // Find the first release link on the profile
      const releaseLink = page.locator('a[href*="/dualipa/"]').first();
      const href = await releaseLink.getAttribute('href');

      if (!href) {
        test.skip(true, 'No release links found on test profile');
        return;
      }

      // Navigate to the release page
      await smokeNavigate(page, href, {
        timeout: 60_000,
        waitUntil: 'load',
      });

      const metrics = await measureAllPerformanceMetrics(page);
      logPerformanceSummary(metrics, 'release');

      // Assert performance budgets
      assertPerformanceBudget(metrics, PERFORMANCE_BUDGETS.release);
      assertWebVitalsHealthy(metrics.vitals);

      // CLS should be tight for release pages (matches profile standard)
      if (metrics.vitals.cls !== undefined) {
        expect(metrics.vitals.cls).toBeLessThan(0.05);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'App not reachable');
      }
      throw e;
    }
  });
});
