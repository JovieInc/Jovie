import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
} from '../utils/smoke-test-utils';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Responsive & Performance Tests - Nightly
 *
 * Comprehensive tests for responsiveness and performance metrics.
 * These tests require more time and are better suited for nightly runs.
 *
 * @nightly
 */
test.describe('Responsive design @nightly', () => {
  test('profile page is responsive on mobile', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.setViewportSize({ width: 375, height: 667 });

      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      const artistName = page
        .locator('h1, h2')
        .filter({ hasText: /taylor swift/i });
      await expect(artistName.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const buttons = page
        .locator('a, button')
        .filter({ hasText: /listen|tip/i });
      await expect(buttons.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage is responsive on mobile', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.setViewportSize({ width: 375, height: 667 });

      await smokeNavigate(page, '/');

      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage is responsive on tablet', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.setViewportSize({ width: 768, height: 1024 });

      await smokeNavigate(page, '/');

      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});

test.describe('Performance metrics @nightly', () => {
  test('profile page loads within acceptable time', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      const navigationTiming = await page.evaluate(() => {
        const timing = performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming;
        return {
          loadTime: timing.loadEventEnd - timing.startTime,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.startTime,
          firstPaint: performance.getEntriesByType('paint')[0]?.startTime ?? 0,
        };
      });

      expect(
        navigationTiming.domContentLoaded,
        'DOM content should load within 5s'
      ).toBeLessThan(5000);

      const listenButton = page
        .locator('a, button')
        .filter({ hasText: /listen/i })
        .first();
      await expect(listenButton).toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      if (testInfo) {
        await testInfo.attach('performance-timing', {
          body: JSON.stringify(navigationTiming, null, 2),
          contentType: 'application/json',
        });
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage loads within acceptable time', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/');

      const navigationTiming = await page.evaluate(() => {
        const timing = performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming;
        return {
          loadTime: timing.loadEventEnd - timing.startTime,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.startTime,
          firstPaint: performance.getEntriesByType('paint')[0]?.startTime ?? 0,
          ttfb: timing.responseStart - timing.startTime,
        };
      });

      // Homepage should be fast
      expect(
        navigationTiming.domContentLoaded,
        'Homepage DOM should load within 3s'
      ).toBeLessThan(3000);

      if (testInfo) {
        await testInfo.attach('homepage-performance', {
          body: JSON.stringify(navigationTiming, null, 2),
          contentType: 'application/json',
        });
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
