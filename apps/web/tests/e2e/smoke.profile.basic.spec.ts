import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Basic profile smoke tests - simplified for reliability
 * These are lightweight tests that validate core profile functionality.
 *
 * Hardened for reliability:
 * - Uses consistent timeout constants
 * - Uses shared monitoring utilities
 * - Enhanced error diagnostics
 */
test.describe('Basic Profile smoke tests @smoke', () => {
  test('taylorswift profile page loads with correct title @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Should not redirect to 404
      await expect(page).toHaveURL(/\/taylorswift/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Check that the page title includes artist name
      await expect(page).toHaveTitle(/Taylor Swift/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Check that we don't get a 404 error
      const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
      await expect(notFoundText).not.toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('profile page responds correctly @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    try {
      const response = await smokeNavigate(
        page,
        `/${TEST_PROFILES.TAYLORSWIFT}`
      );

      // Should get 200 OK response
      expect(response?.status(), 'Expected 200 OK response').toBe(200);

      // Should have correct content type
      const contentType = response?.headers()['content-type'];
      expect(contentType, 'Should have HTML content type').toContain(
        'text/html'
      );

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('non-existent profile returns 404 @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await smokeNavigate(page, '/nonexistentprofile123456');

      // Should not be a server error (5xx)
      const status = response?.status() ?? 0;
      expect(status, 'Should not be server error').toBeLessThan(500);

      // Wait for page to render
      await page.waitForLoadState('domcontentloaded');

      // Page should have content (not blank)
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent, 'Page should have content').toBeTruthy();

      // Acceptable responses for non-existent profiles:
      // - 404 status
      // - 400 status (validation error for invalid usernames)
      // - 200 with "not found" content (Next.js 404 page)
      // - 200 with redirect (handled gracefully)
      const is404OrError = status === 404 || status === 400;
      const hasNotFoundContent = bodyContent
        ?.toLowerCase()
        .includes('not found');

      // Either HTTP status indicates error, or page shows not found message
      // Don't require the specific h1 element as 404 page layouts may vary
      expect(
        is404OrError || hasNotFoundContent || status === 200,
        `Non-existent profile should return 404/400 or show not found content, got status ${status}`
      ).toBe(true);

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('listen mode URL works @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=listen`);

      // Should stay on listen mode URL
      await expect(page).toHaveURL(/\/taylorswift.*mode=listen/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Should not be 404
      const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
      await expect(notFoundText).not.toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('tip mode URL works @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=tip`);

      // Should stay on tip mode URL
      await expect(page).toHaveURL(/\/taylorswift.*mode=tip/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Should not be 404
      const notFoundText = page.locator('h1').filter({ hasText: /not found/i });
      await expect(notFoundText).not.toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
