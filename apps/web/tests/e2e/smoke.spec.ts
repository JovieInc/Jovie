import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  assertPageRendered,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Core smoke tests - verify the app runs without crashing
 * These tests are the first line of defense for deployment eligibility.
 */
test.describe('Smoke Tests @smoke', () => {
  test('Homepage loads without errors @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to homepage
      await smokeNavigate(page, '/');

      // Allow for page to fully load
      await page.waitForLoadState('load');

      // Should land on a valid page
      const url = page.url();
      expect(url).toBeTruthy();

      // Check for any content to ensure page renders
      await assertPageRendered(page);

      // Small buffer to capture late resource responses
      await page.waitForLoadState('domcontentloaded');

      // Get diagnostics and assert no critical errors
      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('App handles unknown routes gracefully @smoke', async ({ page }) => {
    // Navigate to a non-existent route
    await smokeNavigate(page, '/non-existent-route-123');

    // Should show 404 page or redirect, not crash
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // Should not have server error
    await expect(page.locator('text=500')).not.toBeVisible({
      timeout: SMOKE_TIMEOUTS.QUICK,
    });
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible({
      timeout: SMOKE_TIMEOUTS.QUICK,
    });
  });

  test('Critical pages respond without 500 errors @smoke', async ({ page }) => {
    const routes = ['/', '/sign-up', '/pricing'];

    for (const route of routes) {
      const response = await smokeNavigate(page, route);

      // Should not return 500 error
      expect(
        response?.status(),
        `Route ${route} returned status ${response?.status()}`
      ).toBeLessThan(500);
    }
  });
});
