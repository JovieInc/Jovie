import { type Page, type Route } from '@playwright/test';
import { expect, test } from './setup';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Profile Drawer Open/Close Lifecycle Tests (Mobile Only)
 *
 * Tests all 7 drawer types at mobile breakpoint (375x812):
 * listen, tip, subscribe, about, contact, tour, menu
 *
 * Each test verifies:
 * 1. Drawer opens with correct content
 * 2. Drawer closes via close button or Escape
 * 3. Profile page returns to normal state after close
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: 'serial' });

const MOBILE_VIEWPORT = { width: 375, height: 812 };

async function interceptAnalytics(page: Page) {
  await page.route('**/api/profile/view', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', (r: Route) =>
    r.fulfill({ status: 200, body: '{}' })
  );
}

async function assertProfileRestored(page: Page, artistName = 'Dua Lipa') {
  await expect(
    page
      .getByText(artistName, { exact: true })
      .filter({ visible: true })
      .first(),
    'Artist name should be visible after drawer close'
  ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

async function closeDrawer(page: Page) {
  const closeButton = page.getByRole('button', { name: /close/i }).first();
  const closeVisible = await closeButton.isVisible().catch(() => false);
  if (closeVisible) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }
}

test.describe('Profile Drawers - Mobile Open/Close Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Music Mode
  // ──────────────────────────────────────────────────────────────────────────

  test('music mode opens and returns home', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=listen`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const musicPanel = page
      .getByTestId('profile-primary-tab-releases')
      .or(page.getByTestId('profile-primary-tab-listen'))
      .first();

    await expect(musicPanel).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await page.getByRole('button', { name: 'Home' }).click();

    await expect(page).toHaveURL(new RegExp(`/${TEST_PROFILES.DUALIPA}$`));
    await expect(musicPanel).toBeHidden();
    await expect(page.getByTestId('profile-home-rail')).toBeVisible();

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Tip Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('tip drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(page, '/tim?mode=pay');
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page.getByTestId('profile-mode-drawer-pay');
    await expect(drawerContent).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('profile-pay-recipient')).toContainText(
      'Pay Tim White'
    );
    await expect(page.getByTestId('profile-pay-recipient')).toContainText(
      '@tim via Venmo'
    );

    await closeDrawer(page);

    await drawerContent
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
    const contentStillVisible = await drawerContent
      .isVisible()
      .catch(() => false);
    expect(
      contentStillVisible,
      'Drawer content should be hidden after close'
    ).toBe(false);

    await expect(page).toHaveURL(/\/tim$/);
    await assertProfileRestored(page, 'Tim White');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Subscribe Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('subscribe drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=subscribe`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page
      .getByTestId('profile-mobile-notifications-flow')
      .first();

    await expect(drawerContent).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await closeDrawer(page);

    await drawerContent
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
    const contentStillVisible = await drawerContent
      .isVisible()
      .catch(() => false);
    expect(
      contentStillVisible,
      'Drawer content should be hidden after close'
    ).toBe(false);

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. About Mode
  // ──────────────────────────────────────────────────────────────────────────

  test('about mode opens and returns home', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=about`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const aboutPanel = page.getByTestId('profile-primary-tab-about');

    await expect(aboutPanel).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(new RegExp(`/${TEST_PROFILES.DUALIPA}$`));
    await expect(aboutPanel).toBeHidden();
    await expect(page.getByTestId('profile-home-rail')).toBeVisible();

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Contact Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('contact drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=contact`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page.getByTestId('profile-mode-drawer-contact');

    await expect(drawerContent).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await closeDrawer(page);

    await drawerContent
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
    const contentStillVisible = await drawerContent
      .isVisible()
      .catch(() => false);
    expect(
      contentStillVisible,
      'Drawer content should be hidden after close'
    ).toBe(false);

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Events Mode
  // ──────────────────────────────────────────────────────────────────────────

  test('events mode opens and returns home', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=tour`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const eventsPanel = page.getByTestId('profile-primary-tab-tour');

    await expect(eventsPanel).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(new RegExp(`/${TEST_PROFILES.DUALIPA}$`));
    await expect(eventsPanel).toBeHidden();
    await expect(page.getByTestId('profile-home-rail')).toBeVisible();

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Menu Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('menu drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    // The public-profile contract gives the top overflow trigger one stable,
    // exact accessible name. Broad fallback unions can resolve a stale or
    // hidden menu-like control while the compact shell is hydrating.
    const trigger = page.getByRole('button', {
      name: 'Menu',
      exact: true,
    });

    await expect(trigger).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await trigger.click();

    // Menu drawer should show navigation items or menu content
    const drawerContent = page.getByTestId('profile-menu-drawer');

    await expect(drawerContent).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Close menu via Escape (menus typically lack a close button)
    await page.keyboard.press('Escape');

    await drawerContent
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
    const contentStillVisible = await drawerContent
      .isVisible()
      .catch(() => false);
    expect(
      contentStillVisible,
      'Drawer content should be hidden after close'
    ).toBe(false);

    await assertProfileRestored(page);
  });
});
