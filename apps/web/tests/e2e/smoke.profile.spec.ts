import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  elementVisible,
  SMOKE_SELECTORS,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Profile smoke tests - verify profile page functionality
 * Tests mode switching, responsiveness, and core UI elements.
 *
 * Hardened for reliability:
 * - Uses data-testid selectors where available
 * - Uses Playwright's built-in performance metrics instead of Date.now()
 * - Robust element visibility checks
 * - Enhanced error diagnostics
 */
test.describe('Profile smoke tests @smoke', () => {
  test('profile page loads and displays artist information @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Should not redirect (profile exists)
      await expect(page).toHaveURL(/\/taylorswift/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Artist name should be visible
      const artistName = page
        .locator('h1, h2')
        .filter({ hasText: /taylor swift/i });
      await expect(artistName.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Profile should have listen and tip buttons
      // Try data-testid first, fallback to text-based selector
      const hasListenTestId = await elementVisible(
        page,
        SMOKE_SELECTORS.LISTEN_BUTTON
      );
      if (hasListenTestId) {
        await expect(
          page.locator(SMOKE_SELECTORS.LISTEN_BUTTON).first()
        ).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      } else {
        const listenButton = page
          .locator('a, button')
          .filter({ hasText: /listen/i });
        await expect(listenButton.first()).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      }

      const hasTipTestId = await elementVisible(
        page,
        SMOKE_SELECTORS.TIP_BUTTON
      );
      if (hasTipTestId) {
        await expect(
          page.locator(SMOKE_SELECTORS.TIP_BUTTON).first()
        ).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      } else {
        const tipButton = page.locator('a, button').filter({ hasText: /tip/i });
        await expect(tipButton.first()).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('listen mode displays DSP options @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=listen`);

      await expect(page).toHaveURL(/\/taylorswift\?mode=listen/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // At least one music platform should be visible
      const dspButtons = page
        .locator(
          'a[href*="spotify"], a[href*="apple"], a[href*="youtube"], button'
        )
        .filter({
          hasText: /spotify|apple|youtube|amazon|tidal|deezer/i,
        });

      await expect(dspButtons.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('listen mode back button returns to profile @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=listen`);
      await waitForHydration(page);

      await expect(page).toHaveURL(/\/taylorswift\?mode=listen/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const backButton = page.locator(SMOKE_SELECTORS.BACK_BUTTON).first();

      await expect(backButton).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await backButton.click();

      // Should navigate back to the base profile URL
      await page.waitForURL(/\/taylorswift$/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Wait for page to re-hydrate after navigation
      await waitForHydration(page);

      // Ensure profile view is loaded - check for Listen or Subscribe button
      const primaryCTA = page
        .locator(
          'a[href*="/listen"], button:has-text("Subscribe"), a:has-text("Listen now")'
        )
        .first();
      await expect(primaryCTA).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('tip mode displays tipping interface @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=tip`);

      await expect(page).toHaveURL(/\/taylorswift\?mode=tip/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Should have amount selectors or tip interface
      const tipInterface = page.locator('button, div').filter({
        hasText: /\$\d+|tip|venmo|payment/i,
      });

      await expect(tipInterface.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('tip mode back button returns to profile @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}?mode=tip`);
      await waitForHydration(page);

      await expect(page).toHaveURL(/\/taylorswift\?mode=tip/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const backButton = page.locator(SMOKE_SELECTORS.BACK_BUTTON).first();

      await expect(backButton).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await backButton.click();

      // Should navigate back to the base profile URL
      await page.waitForURL(/\/taylorswift$/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Wait for page to re-hydrate after navigation
      await waitForHydration(page);

      // Ensure profile view is loaded - check for Tip or primary CTA button
      const primaryCTA = page
        .locator(
          'a[href*="/tip"], a[href*="/listen"], button:has-text("Subscribe")'
        )
        .first();
      await expect(primaryCTA).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('can switch between profile modes @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Click listen button (try data-testid first)
      const hasListenTestId = await elementVisible(
        page,
        SMOKE_SELECTORS.LISTEN_BUTTON
      );
      const listenButton = hasListenTestId
        ? page.locator(SMOKE_SELECTORS.LISTEN_BUTTON).first()
        : page
            .locator('a, button')
            .filter({ hasText: /listen/i })
            .first();

      await listenButton.click();

      // Should navigate to listen mode
      await expect(page).toHaveURL(/mode=listen/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Navigate back to profile
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Click tip button if available
      const hasTipTestId = await elementVisible(
        page,
        SMOKE_SELECTORS.TIP_BUTTON
      );
      const tipButton = hasTipTestId
        ? page.locator(SMOKE_SELECTORS.TIP_BUTTON).first()
        : page.locator('a, button').filter({ hasText: /tip/i }).first();

      const tipButtonVisible = await tipButton.isVisible().catch(() => false);

      if (tipButtonVisible) {
        await tipButton.click();
        await expect(page).toHaveURL(/mode=tip/, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('non-existent profile shows 404 or redirects appropriately @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await smokeNavigate(page, '/nonexistentprofile123456');

      // Should either show 404 or redirect, must not be 5xx
      const status = response?.status() ?? 0;
      expect(status, 'Should not be server error').toBeLessThan(500);

      const is404 = status === 404;
      const hasNotFound = await elementVisible(
        page,
        'h1:has-text("not found")'
      );
      const redirectedHome =
        page.url().includes('://') &&
        !page.url().includes('/nonexistentprofile123456');

      expect(
        is404 || hasNotFound || redirectedHome,
        'Should show 404, not found message, or redirect'
      ).toBeTruthy();

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('profile page is responsive on mobile @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Check that essential elements are still visible on mobile
      const artistName = page
        .locator('h1, h2')
        .filter({ hasText: /taylor swift/i });
      await expect(artistName.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Buttons should still be accessible
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

  test('profile page loads within acceptable time @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Use Playwright's built-in performance metrics
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Get navigation timing from browser
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

      // Page should load within acceptable time (using DOM metrics)
      // These are more reliable than Date.now() comparisons
      expect(
        navigationTiming.domContentLoaded,
        'DOM content should load within 5s'
      ).toBeLessThan(5000);

      // Check that content is interactive
      const listenButton = page
        .locator('a, button')
        .filter({ hasText: /listen/i })
        .first();
      await expect(listenButton).toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      // Attach performance data for debugging
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
});

test.describe('Profile feature smoke tests @smoke', () => {
  test('profile avatar loads correctly @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

      // Check for avatar image using robust selector
      const hasAvatarTestId = await elementVisible(
        page,
        SMOKE_SELECTORS.PROFILE_AVATAR
      );

      const avatar = hasAvatarTestId
        ? page.locator(SMOKE_SELECTORS.PROFILE_AVATAR).first()
        : page
            .locator(
              'img[alt*="taylor" i], img[alt*="avatar" i], img[alt*="profile" i]'
            )
            .first();

      if (await avatar.isVisible().catch(() => false)) {
        // Check that image has loaded (has natural dimensions)
        const hasLoaded = await avatar.evaluate((img: HTMLImageElement) => {
          return img.complete && img.naturalHeight > 0;
        });
        expect(hasLoaded, 'Avatar image should be fully loaded').toBeTruthy();
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('social links are clickable when present @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // Check for social links (including Spotify and other platforms)
      const socialLinks = page.locator(
        '[data-testid="social-links"] a, ' +
          'a[href*="instagram"], a[href*="twitter"], a[href*="facebook"], ' +
          'a[href*="tiktok"], a[href*="spotify"]'
      );
      const socialCount = await socialLinks.count();

      if (socialCount > 0) {
        const firstSocial = socialLinks.first();
        await expect(firstSocial).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        const href = await firstSocial.getAttribute('href');
        expect(href, 'Social link should have href').toBeTruthy();
        expect(href, 'Social link should be a valid URL').toMatch(
          /^https?:\/\//
        );
      } else {
        // eslint-disable-next-line no-console
        console.log('⚠ No social links found, skipping validation');
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('profile works in dark mode @smoke', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Set dark mode preference
      await page.emulateMedia({ colorScheme: 'dark' });

      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // Wait for dark mode to be applied
      await page.waitForFunction(
        () => {
          const html = document.documentElement;
          return html.classList.contains('dark');
        },
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );

      // Check that page loads without errors
      const artistName = page
        .locator('h1, h2')
        .filter({ hasText: /taylor swift/i });
      await expect(artistName.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
