import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  assertPageHealthy,
  assertPageRendered,
  setupPageMonitoring,
  smokeNavigate,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Core smoke tests - verify the app runs without crashing
 * These tests are the first line of defense for deployment eligibility.
 *
 * Hardened for reliability:
 * - Uses proper wait strategies instead of redundant load states
 * - Enhanced error diagnostics
 * - Consistent timeout usage
 */
test.describe('Smoke Tests @smoke', () => {
  test('Homepage loads without errors @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to homepage
      await smokeNavigate(page, '/');

      // Wait for hydration to complete (more reliable than multiple load states)
      await waitForHydration(page);

      // Should land on a valid page
      const url = page.url();
      expect(url).toBeTruthy();

      // Check for any content to ensure page renders
      await assertPageRendered(page);

      // Get diagnostics and assert no critical errors
      const context = getContext();
      await assertPageHealthy(page, context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('App handles unknown routes gracefully @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to a non-existent route
      const response = await smokeNavigate(page, '/non-existent-route-123');

      // Should show 404 page or redirect, not crash (5xx)
      const status = response?.status() ?? 0;
      expect(status, `Expected non-5xx status but got ${status}`).toBeLessThan(
        500
      );

      // Wait for page to render
      await page.waitForLoadState('domcontentloaded');

      const pageContent = await page.textContent('body');
      expect(pageContent, 'Page should have content').toBeTruthy();

      // Should not have server error indicators
      const bodyText = pageContent?.toLowerCase() ?? '';
      expect(
        bodyText.includes('internal server error'),
        'Page should not show internal server error'
      ).toBe(false);

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('Critical pages respond without 500 errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const routes = ['/', '/sign-up', '/pricing'];

    try {
      for (const route of routes) {
        const response = await smokeNavigate(page, route);

        // Should not return 5xx error
        const status = response?.status() ?? 0;
        expect(
          status,
          `Route ${route} returned status ${status} (server error)`
        ).toBeLessThan(500);

        // Wait for DOM to be ready before moving to next route
        await page.waitForLoadState('domcontentloaded');

        // Verify page has meaningful content
        const bodyContent = await page.locator('body').textContent();
        expect(
          bodyContent && bodyContent.length > 50,
          `Route ${route} should have meaningful content`
        ).toBe(true);
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
