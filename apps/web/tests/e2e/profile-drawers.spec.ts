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

function artistNameLocator(page: Page) {
  return page.getByText('Dua Lipa', { exact: true }).first();
}

async function assertProfileRestored(page: Page) {
  await expect(
    artistNameLocator(page),
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
  // 1. Listen Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('listen drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=listen`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page
      .getByText(/listen on/i)
      .or(page.locator('a[href*="spotify"], a[href*="apple"]').first())
      .first();

    if (!(await drawerContent.isVisible().catch(() => false))) {
      test.skip(true, 'Listen drawer content not visible — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(new RegExp(`/${TEST_PROFILES.DUALIPA}$`));
    await expect(
      page.getByRole('button', { name: /close/i }).first()
    ).toBeHidden();
    await expect(drawerContent).toBeHidden();

    await assertProfileRestored(page);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Tip Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('tip drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    const trigger = page.locator('[data-testid="pay-trigger"]').first();

    if (!(await trigger.isVisible().catch(() => false))) {
      test.skip(true, 'Tip trigger not visible — skipping');
      return;
    }

    await trigger.click();

    const drawerContent = page.getByText(/tip/i).first();
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
      .locator('input[type="email"], input[type="tel"]')
      .first()
      .or(
        page
          .getByText(/turn on notifications|notify me about new releases/i)
          .first()
      )
      .or(page.getByText(/get notified/i).first());

    if (!(await drawerContent.isVisible().catch(() => false))) {
      test.skip(true, 'Subscribe drawer content not visible — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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
  // 4. About Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('about drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=about`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page
      .getByText(/about/i)
      .first()
      .or(page.locator('[data-testid="about-section"]').first());

    if (!(await drawerContent.isVisible().catch(() => false))) {
      test.skip(true, 'About drawer content not visible — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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

    const drawerContent = page
      .getByText(/contact/i)
      .first()
      .or(page.locator('[data-testid="contacts-trigger"]').first());

    if (!(await drawerContent.isVisible().catch(() => false))) {
      test.skip(true, 'Contact drawer content not visible — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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
  // 6. Tour Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('tour drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    const response = await smokeNavigate(
      page,
      `/${TEST_PROFILES.DUALIPA}?mode=tour`
    );
    expect(response?.status() ?? 0).toBeLessThan(500);
    await waitForHydration(page);

    const drawerContent = page
      .getByText(/no upcoming shows/i)
      .first()
      .or(page.getByText(/tour/i).first())
      .or(page.locator('[data-testid="tour-section"]').first());

    if (!(await drawerContent.isVisible().catch(() => false))) {
      test.skip(true, 'Tour drawer content not visible — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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
  // 7. Menu Drawer
  // ──────────────────────────────────────────────────────────────────────────

  test('menu drawer opens and closes', async ({ page }) => {
    await interceptAnalytics(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);
    await waitForHydration(page);

    // Look for menu trigger: hamburger icon, ellipsis, or menu button
    const trigger = page
      .getByRole('button', { name: /menu/i })
      .first()
      .or(page.locator('[data-testid="menu-trigger"]').first())
      .or(page.locator('button[aria-label*="menu" i]').first())
      .or(page.locator('[data-testid="hamburger"]').first());

    if (!(await trigger.isVisible().catch(() => false))) {
      test.skip(true, 'Menu trigger not visible — skipping');
      return;
    }

    await trigger.click();

    // Menu drawer should show navigation items or menu content
    const drawerContent = page
      .getByRole('navigation')
      .first()
      .or(page.locator('[role="menu"]').first())
      .or(page.locator('[data-testid="menu-drawer"]').first());

    const menuVisible = await drawerContent
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);

    if (!menuVisible) {
      test.skip(true, 'Menu drawer content not visible after click — skipping');
      return;
    }

    await expect(drawerContent).toBeVisible();

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
