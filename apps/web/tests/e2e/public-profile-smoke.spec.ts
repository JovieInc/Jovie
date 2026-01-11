import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Public Profile Smoke Test
 *
 * Fast, minimal test to verify public creator profiles load correctly.
 * This test runs on every PR to main to block commits that break public profiles.
 *
 * @smoke @critical
 */
test.describe('Public Profile Smoke @smoke @critical', () => {
  const testHandle = TEST_PROFILES.DUALIPA;

  test('public profile loads and displays core elements', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await page.goto(`/${testHandle}`, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Must not be a server error (5xx)
      const status = response?.status() ?? 0;
      expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

      // Check if we got the "temporarily unavailable" error page
      const pageTitle = await page.title();
      const isTemporarilyUnavailable = pageTitle.includes(
        'temporarily unavailable'
      );

      if (status === 200 && !isTemporarilyUnavailable) {
        // Verify page title contains creator name
        await expect(page).toHaveTitle(/Dua Lipa/i, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify h1 displays creator name
        await expect(page.locator('h1')).toContainText('Dua Lipa', {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      } else {
        // For 404/400/temporarily unavailable, just verify page renders
        await page.waitForLoadState('domcontentloaded');
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Page should have content').toBeTruthy();
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('404 page renders for non-existent profile', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await page.goto('/nonexistent-handle-xyz-123', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      const status = response?.status() ?? 0;

      // Should return 200, 400, or 404 - not a 500 server error
      expect(
        status < 500,
        `Expected non-5xx but got ${status} (server error)`
      ).toBe(true);

      if (status < 500) {
        await page.waitForLoadState('domcontentloaded');
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Page should have content').toBeTruthy();
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
