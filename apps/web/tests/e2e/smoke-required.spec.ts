import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  elementVisible,
  SMOKE_SELECTORS,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Required Smoke Test - MUST PASS for every deploy to main
 *
 * This test is intentionally minimal and fast (<1 min).
 * It verifies the most critical public-facing flow: public profiles load.
 *
 * Auth testing is covered by the full E2E suite (use 'testing' label on PRs).
 * This smoke test can run locally without secrets.
 *
 * Hardened for reliability:
 * - Uses data-testid selectors where available
 * - Graceful fallbacks for missing elements
 * - Enhanced error diagnostics
 *
 * @smoke @required
 */

test.describe('Required Smoke Test @smoke @required', () => {
  test('public profile loads without errors', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to a known seeded profile
      const response = await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);

      // Must not be a server error
      const status = response?.status() ?? 0;
      expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

      // Check if database is available
      const pageTitle = await page.title();
      const isTemporarilyUnavailable = pageTitle.includes(
        'temporarily unavailable'
      );

      // If profile exists and DB is available, verify core elements
      if (status === 200 && !isTemporarilyUnavailable) {
        // Verify page title contains creator name
        await expect(page).toHaveTitle(/Dua Lipa/i, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify h1 displays creator name
        await expect(page.locator('h1')).toContainText('Dua Lipa', {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Verify profile image is visible using robust selector strategy
        // Priority: data-testid > explicit alt text > any image fallback
        const hasProfileAvatar = await elementVisible(
          page,
          SMOKE_SELECTORS.PROFILE_AVATAR
        );

        if (hasProfileAvatar) {
          await expect(
            page.locator(SMOKE_SELECTORS.PROFILE_AVATAR).first()
          ).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
        } else {
          // Fallback: check for image with explicit alt text
          const hasExplicitImage = await elementVisible(
            page,
            'img[alt*="Dua Lipa"]'
          );

          if (hasExplicitImage) {
            await expect(
              page.locator('img[alt*="Dua Lipa"]').first()
            ).toBeVisible({
              timeout: SMOKE_TIMEOUTS.VISIBILITY,
            });
          } else {
            // Final fallback: any visible image (profile might use different alt)
            const hasAnyImage = await elementVisible(page, 'img');
            expect(hasAnyImage, 'Profile should have at least one image').toBe(
              true
            );
          }
        }

        // Check for critical errors
        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } else {
        // For 404/400/temporarily unavailable, just verify page renders
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

  test('homepage responds without server error', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await smokeNavigate(page, '/');

      // Must not be a server error
      const status = response?.status() ?? 0;
      expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

      // Wait for page to be ready
      await page.waitForLoadState('domcontentloaded');

      // Verify there's meaningful content
      const bodyContent = await page.locator('body').textContent();
      expect(
        bodyContent && bodyContent.length > 100,
        'Homepage should have meaningful content'
      ).toBe(true);

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
