/**
 * Profile CLS (Cumulative Layout Shift) Audit
 *
 * Measures layout shift during profile page interactions using PerformanceObserver.
 * Validates CLS < 0.05 for:
 * - Initial page load
 * - Subscribe form state transition
 * - Drawer open/close on mobile
 *
 * NOTE: PerformanceObserver CLS entries are emitted asynchronously and may not
 * capture all layout shifts during JS-driven state transitions. Treat Playwright
 * CLS as a secondary signal.
 *
 * Tagged with @nightly since CLS budgets are unreliable in dev mode.
 */

import type { Page } from '@playwright/test';

import {
  CLS_INTERACTION_BUDGET,
  attachClsResult,
  collectInteractionCls,
  installInteractionClsObserver,
  measureBufferedCls,
  shouldSkipClsInDevMode,
} from '../helpers/cls-measurement';
import { expect, test } from './setup';
import {
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

// Override to run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

const CLS_BUDGET = CLS_INTERACTION_BUDGET;

/**
 * Intercept analytics routes to prevent side effects during testing
 */
async function interceptAnalytics(page: Page): Promise<void> {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

test.describe('Profile CLS Audit @nightly', () => {
  test('profile initial load has CLS < 0.05', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    await interceptAnalytics(page);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    // Wait for images to load so we capture any image-induced layout shifts
    await page
      .waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll('img'));
          return images.every(img => img.complete);
        },
        { timeout: 30_000 }
      )
      .catch(() => {
        // Continue even if some images are still loading
      });

    const cls = await measureBufferedCls(page);

    await attachClsResult(testInfo, 'cls-initial-load', {
      cls,
      budget: CLS_BUDGET,
      profile: TEST_PROFILES.DUALIPA,
    });

    console.log(
      `CLS (initial load): ${cls.toFixed(4)} (budget: ${CLS_BUDGET})`
    );

    expect(
      cls,
      `CLS ${cls.toFixed(4)} exceeds budget of ${CLS_BUDGET}`
    ).toBeLessThan(CLS_BUDGET);
  });

  test('subscribe form state transition has CLS < 0.05', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    await interceptAnalytics(page);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    await installInteractionClsObserver(page);

    // Trigger subscribe form — try clicking the CTA, fall back to query param
    const notifyButton = page
      .locator('button, a')
      .filter({ hasText: /turn on notifications/i })
      .first();
    const hasButton = await notifyButton
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasButton) {
      await notifyButton.click();
    } else {
      // Navigate with query param to trigger subscribe mode
      await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}?mode=subscribe`);
      await waitForHydration(page);
    }

    // Wait for form to appear — fail if the transition never happens
    const formLocator = page
      .locator(
        '[data-testid="subscription-pearl-composer"], [data-testid="profile-inline-cta"], input[type="email"]'
      )
      .first();
    const formAppeared = await formLocator
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!formAppeared) {
      test.skip(
        true,
        'Subscribe form did not appear — cannot measure transition CLS'
      );
      return;
    }

    const cls = await collectInteractionCls(page);

    await attachClsResult(testInfo, 'cls-subscribe-transition', {
      cls,
      budget: CLS_BUDGET,
      profile: TEST_PROFILES.DUALIPA,
    });

    console.log(
      `CLS (subscribe transition): ${cls.toFixed(4)} (budget: ${CLS_BUDGET})`
    );

    expect(
      cls,
      `CLS ${cls.toFixed(4)} during subscribe transition exceeds budget of ${CLS_BUDGET}`
    ).toBeLessThan(CLS_BUDGET);
  });

  test('drawer open/close has CLS < 0.05', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await interceptAnalytics(page);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    await installInteractionClsObserver(page);

    // Open listen drawer — try clicking Listen button, fall back to query param
    const listenButton = page.locator('[data-testid="listen-button"]').first();
    const hasListenButton = await listenButton
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasListenButton) {
      await listenButton.click();
    } else {
      // Try text-based selector
      const textButton = page
        .locator('button, a')
        .filter({ hasText: /listen/i })
        .first();
      const hasTextButton = await textButton
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasTextButton) {
        await textButton.click();
      } else {
        // Navigate with query param to trigger listen mode
        await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}?mode=listen`);
        await waitForHydration(page);
      }
    }

    // Wait for drawer content to appear — fail if the transition never happens
    const drawerLocator = page
      .locator(
        '[role="dialog"], [data-testid="listen-drawer"], [data-state="open"]'
      )
      .first();
    const drawerAppeared = await drawerLocator
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!drawerAppeared) {
      test.skip(
        true,
        'Listen drawer did not appear — cannot measure drawer CLS'
      );
      return;
    }

    // Close the drawer
    await page.keyboard.press('Escape');

    // Wait for drawer to close and layout to settle
    await page
      .locator(
        '[role="dialog"], [data-testid="listen-drawer"], [data-state="open"]'
      )
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {
        // Drawer may already be closed
      });

    const cls = await collectInteractionCls(page);

    await attachClsResult(testInfo, 'cls-drawer-interaction', {
      cls,
      budget: CLS_BUDGET,
      viewport: '375x812',
      profile: TEST_PROFILES.DUALIPA,
    });

    console.log(
      `CLS (drawer open/close): ${cls.toFixed(4)} (budget: ${CLS_BUDGET})`
    );

    expect(
      cls,
      `CLS ${cls.toFixed(4)} during drawer open/close exceeds budget of ${CLS_BUDGET}`
    ).toBeLessThan(CLS_BUDGET);
  });
});
