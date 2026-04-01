/**
 * Product Screenshots – Public Profile
 *
 * Captures the public artist profile page at phone dimensions
 * for use in the PhoneProfileDemo homepage section.
 *
 * This spec does NOT require auth — public profiles are public.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * Output:
 *   public/product-screenshots/
 */

import { expect, test } from '@playwright/test';
import {
  assertNoDevOverlays,
  hideTransientUI,
  OUTPUT_DIR,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from './helpers';

/** The seeded E2E test user's username handle */
const PROFILE_USERNAME = 'e2e-test-user';

async function assertProfileLoaded(
  page: import('@playwright/test').Page
): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/${PROFILE_USERNAME}$`));
  await expect(page.locator('body')).not.toContainText('Page not found');
  await expect(page.locator('body')).not.toContainText(
    'The link you followed may be broken'
  );
}

test.describe('Product Screenshots – Public Profile', () => {
  test('profile – phone viewport', async ({ page }) => {
    test.setTimeout(120_000);

    // Set phone viewport (iPhone 14 Pro dimensions)
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`/${PROFILE_USERNAME}`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await assertProfileLoaded(page);

    // Wait for profile content to load — look for profile-specific elements
    // (not img[alt] which matches hidden dark-mode logos)
    await page
      .locator('[data-testid="profile-header"], h1, main img[alt]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.CONTENT_VISIBLE });

    // Wait for subscribe section to settle if present
    const subscribeSection = page.locator('section[aria-labelledby="profile-subscribe-heading"]').first();
    if (await subscribeSection.isVisible().catch(() => false)) {
      await subscribeSection.waitFor({ state: 'visible' });
      // Small delay for form to fully hydrate
      await page.waitForTimeout(300);
    }

    // Wait for avatar and release artwork images to load
    await waitForImages(page).catch(() => {
      // Profile may have no images (e.g. no avatar set) — that's OK
      console.log('⚠ Some images may not have loaded, continuing...');
    });

    await waitForSettle(page);
    await hideTransientUI(page);
    await assertNoDevOverlays(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/profile-phone.png`,
      fullPage: false,
    });
    console.log('📸 Saved: profile-phone.png');
  });

  test('profile – desktop viewport', async ({ page }) => {
    test.setTimeout(120_000);

    // Use default desktop viewport (1440x900 from config)
    await page.goto(`/${PROFILE_USERNAME}`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await assertProfileLoaded(page);

    await page
      .locator('[data-testid="profile-header"], h1, main img[alt]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.CONTENT_VISIBLE });

    // Wait for subscribe section to settle if present
    const subscribeSection = page.locator('section[aria-labelledby="profile-subscribe-heading"]').first();
    if (await subscribeSection.isVisible().catch(() => false)) {
      await subscribeSection.waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
    }

    await waitForImages(page).catch(() => {
      console.log('⚠ Some images may not have loaded, continuing...');
    });

    await waitForSettle(page);
    await hideTransientUI(page);
    await assertNoDevOverlays(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/profile-desktop.png`,
      fullPage: false,
    });
    console.log('📸 Saved: profile-desktop.png');
  });
});
