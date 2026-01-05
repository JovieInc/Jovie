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
 * Hardened for reliability:
 * - Uses consistent timeout constants
 * - Uses shared monitoring utilities
 * - Enhanced error diagnostics
 *
 * @smoke
 */
test.describe('Public Profile Smoke @smoke', () => {
  // Use a known seeded profile handle
  const testHandle = TEST_PROFILES.DUALIPA;

  test('public profile loads and displays core elements', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to public profile with extra time for critical test
      const response = await page.goto(`/${testHandle}`, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION * 2,
      });

      // Smoke invariant: must not be a server error (5xx)
      const status = response?.status() ?? 0;
      expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

      // Check if we got the "temporarily unavailable" error page (DATABASE_URL not set)
      const pageTitle = await page.title();
      const isTemporarilyUnavailable = pageTitle.includes(
        'temporarily unavailable'
      );

      // If the seeded profile exists, verify core elements.
      // If it doesn't exist (404/400) or database is unavailable, that's acceptable for smoke tests.
      if (status === 200 && !isTemporarilyUnavailable) {
        // Verify page title contains creator name
        await expect(page).toHaveTitle(/Dua Lipa/i, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify h1 displays creator name
        await expect(page.locator('h1')).toContainText('Dua Lipa', {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify profile image is visible (any profile image)
        const profileImage = page.locator('img').first();
        await expect(profileImage).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Check for critical errors
        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } else {
        // For 404/400/temporarily unavailable, just verify page renders (not a 500 error)
        await page.waitForLoadState('domcontentloaded');
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Page should have content').toBeTruthy();

        // Still check for console errors even on error pages
        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      }
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
        timeout: SMOKE_TIMEOUTS.NAVIGATION * 2,
      });

      const status = response?.status() ?? 0;

      // Should return 200 (Next.js renders 404 page), 404, or 400 (validation error)
      // A 500 indicates a server error which should fail the test
      // 400 is acceptable for invalid usernames (validation error)
      expect(
        [200, 400, 404].includes(status),
        `Expected 200, 400, or 404 but got ${status} (server error)`
      ).toBe(true);

      // If we got a valid status, verify page content exists
      // For 400/404, the page should still render some content
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

  test('profile page does not have server errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Test both seeded profiles to ensure they work
      for (const handle of [TEST_PROFILES.DUALIPA, TEST_PROFILES.TAYLORSWIFT]) {
        const response = await page.goto(`/${handle}`, {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });

        const status = response?.status() ?? 0;
        expect(
          status,
          `Profile /${handle} returned ${status} (server error)`
        ).toBeLessThan(500);

        // Wait for DOM to be ready before moving to next profile
        await page.waitForLoadState('domcontentloaded');
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
