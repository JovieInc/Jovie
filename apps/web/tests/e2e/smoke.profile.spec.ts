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
 * Profile Smoke Tests - Essential checks for rapid deployment
 *
 * These tests verify core profile functionality without being overly detailed.
 * Detailed feature tests (dark mode, performance, responsiveness) are in nightly.
 *
 * @smoke
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

      // Profile should have listen button
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
});
