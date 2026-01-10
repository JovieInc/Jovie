import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Link Display Smoke Test
 *
 * Minimal test to verify social links display correctly on public profiles.
 * Detailed link validation tests are in nightly/profile-features.spec.ts.
 *
 * @smoke
 */
test.describe('Link Display @smoke', () => {
  test('public profile displays social links when present @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // Profile should load successfully
      const mainContent = page.locator('main, [role="main"]').first();
      await expect(mainContent).toBeVisible({ timeout: 10000 });

      // Check for social links container - may or may not have links
      const socialLinksSection = page.locator('[data-testid="social-links"]');
      const sectionExists = await socialLinksSection.count();

      if (sectionExists > 0) {
        // If section exists, verify at least one link is visible
        const spotifyLink = socialLinksSection
          .locator('a[href*="spotify"]')
          .first();
        const hasSpotify = await spotifyLink.count();

        if (hasSpotify > 0) {
          await expect(spotifyLink).toBeVisible({ timeout: 10000 });

          // Verify link has valid URL format
          const href = await spotifyLink.getAttribute('href');
          expect(href, 'Link should have valid URL').toMatch(/^https?:\/\//);
        }
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
