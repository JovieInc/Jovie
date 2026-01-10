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
} from '../utils/smoke-test-utils';

/**
 * Profile Feature Tests - Nightly
 *
 * Comprehensive tests for profile features that are too detailed for rapid smoke testing.
 * These tests verify advanced functionality, edge cases, and feature completeness.
 *
 * @nightly
 */
test.describe('Profile features @nightly', () => {
  test('profile avatar loads correctly', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

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

  test('social links are clickable when present', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

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
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('profile works in dark mode', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.emulateMedia({ colorScheme: 'dark' });

      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      // Wait for dark mode to be applied (with fallback for themes that don't use class)
      try {
        await page.waitForFunction(
          () => {
            const html = document.documentElement;
            return html.classList.contains('dark');
          },
          { timeout: SMOKE_TIMEOUTS.QUICK }
        );
      } catch {
        // Dark mode may be applied via media query instead of class
      }

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

  test('listen mode back button returns to profile', async ({
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

      await page.waitForURL(/\/taylorswift$/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await waitForHydration(page);

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

  test('tip mode back button returns to profile', async ({
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

      await page.waitForURL(/\/taylorswift$/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await waitForHydration(page);

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

  test('can switch between profile modes', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

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

      await expect(page).toHaveURL(/mode=listen/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);

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
});

test.describe('Link display features @nightly', () => {
  test('link URLs are properly formatted and external', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, `/${TEST_PROFILES.TAYLORSWIFT}`);
      await waitForHydration(page);

      const socialLinks = page
        .locator('[data-testid="social-links"]')
        .locator(
          'a[href*="spotify"], a[href*="instagram"], a[href*="twitter"], a[href*="facebook"], a[href*="tiktok"]'
        );

      const linkCount = await socialLinks.count();

      if (linkCount > 0) {
        for (let i = 0; i < linkCount; i++) {
          const link = socialLinks.nth(i);
          const href = await link.getAttribute('href');
          const target = await link.getAttribute('target');
          const rel = await link.getAttribute('rel');

          expect(href, `Link ${i + 1} should have valid URL`).toMatch(
            /^https?:\/\//
          );

          expect(
            target,
            `Link ${i + 1}: External links must open in a new tab`
          ).toBe('_blank');

          expect(
            rel,
            `Link ${i + 1}: External links must include rel="noopener"`
          ).toContain('noopener');
        }
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
