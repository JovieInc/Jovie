import { expect, type Page, test } from '@playwright/test';
import {
  ADMIN_NAV_REGISTRY,
  buildAdminPeopleHref,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { ADMIN_PRIMARY_NAV_SURFACES } from './utils/admin-surface-manifest';
import {
  checkForClientError,
  hasAdminCredentials,
  operatorNavigation,
  signInAsAdmin,
} from './utils/admin-test-utils';
import {
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Operator (Ovie) navigation tests.
 *
 * The operator rail is the `OV Navigation` landmark rendered by
 * UnifiedSidebar from ADMIN_NAV_REGISTRY. It belongs to the Ovie workspace
 * only: since JOV-6771 the customer shell renders the same chrome for admins
 * and creators, so the rail must be absent on customer routes.
 *
 * Run:
 *   doppler run -- pnpm exec playwright test admin-navigation --project=chromium
 */

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

const WORKSPACE_ITEMS = ADMIN_NAV_REGISTRY.filter(
  item => item.section === 'workspaces'
);

const ADMIN_PAGES = FAST_ITERATION
  ? ADMIN_PRIMARY_NAV_SURFACES.slice(0, 1)
  : ADMIN_PRIMARY_NAV_SURFACES;

/** Customer routes where the operator rail must never render. */
const CUSTOMER_PAGES = FAST_ITERATION
  ? [{ path: APP_ROUTES.CHAT, name: 'Chat' }]
  : [
      { path: APP_ROUTES.CHAT, name: 'Chat' },
      { path: APP_ROUTES.CONTACTS, name: 'Contacts' },
    ];

const NAVIGATION_OPTIONS = {
  timeout: FAST_ITERATION ? 90_000 : SMOKE_TIMEOUTS.NAVIGATION,
  retries: FAST_ITERATION ? 3 : 2,
};

async function settleAdminNavigation(page: Page) {
  await waitForHydration(page, { timeout: 15_000 }).catch(() => {});
  await page
    .waitForLoadState('domcontentloaded', { timeout: 5_000 })
    .catch(() => {});
}

async function gotoAdminRoute(page: Page, path: string) {
  await smokeNavigateWithRetry(page, path, NAVIGATION_OPTIONS);
  await settleAdminNavigation(page);
}

test.describe('Admin Navigation Persistence @smoke', () => {
  test.skip(
    FAST_ITERATION,
    'Admin nav persistence runs in the slower authenticated coverage lane'
  );

  // Admin bypass sign-in + dashboard landing needs 180s+ under dev-server compilation, plus test body navigation
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'Admin auth not available');

    page.on('pageerror', error => {
      console.log(`[Page Error] ${error.message}`);
    });

    await signInAsAdmin(page);
  });

  test('operator navigation persists across admin workspaces and stays out of the customer shell', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const nav = operatorNavigation(page);

    for (const adminPage of ADMIN_PAGES) {
      await gotoAdminRoute(page, adminPage.path);

      const { hasError } = await checkForClientError(page);
      expect(hasError, `Client error on ${adminPage.name}`).toBe(false);

      await expect(
        nav,
        `Operator nav should be visible on ${adminPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      await expect(
        page.locator('main').first(),
        `Main content should be visible on ${adminPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    }

    for (const customerPage of CUSTOMER_PAGES) {
      await gotoAdminRoute(page, customerPage.path);
      await expect(
        page.locator('main').first(),
        `Main content should be visible on ${customerPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      await expect(
        nav,
        `Operator nav must not render in the customer shell (${customerPage.name})`
      ).toHaveCount(0);
    }

    // Returning to Ovie restores the rail.
    await gotoAdminRoute(page, APP_ROUTES.ADMIN_NOW);
    await expect(nav).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('admin nav lists the registry workspaces and legacy settings admin redirects to ops', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await gotoAdminRoute(page, APP_ROUTES.ADMIN_PEOPLE);

    const nav = operatorNavigation(page);
    await expect(nav).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    for (const item of WORKSPACE_ITEMS) {
      await expect(
        nav.getByRole('link', { name: item.label, exact: true }),
        `Workspace "${item.label}" should be in the operator nav`
      ).toHaveAttribute('href', item.href);
    }

    // Retired surfaces never reappear in the rail.
    await expect(nav.getByText('Screenshots', { exact: true })).toHaveCount(0);

    await gotoAdminRoute(page, APP_ROUTES.SETTINGS_ADMIN);

    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.ADMIN_OPS}$`));
    await expect(page.getByTestId('hud-admin-page')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('legacy algorithm health route redirects to creators workspace', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await gotoAdminRoute(page, APP_ROUTES.ADMIN_ALGORITHM_HEALTH);

    const creatorsHref = buildAdminPeopleHref('creators');
    await expect(page).toHaveURL(
      new RegExp(`${creatorsHref.replace('?', '\\?')}$`)
    );
    await expect(
      page.locator('[data-testid="admin-people-view-creators"]')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('admin navigation persists during rapid navigation', async ({
    page,
  }) => {
    test.setTimeout(240_000); // Cold local bypass runs still compile several heavy routes

    const nav = operatorNavigation(page);
    const rapidPages = [
      APP_ROUTES.ADMIN_NOW,
      APP_ROUTES.ADMIN_GROWTH,
      APP_ROUTES.ADMIN_PEOPLE,
      APP_ROUTES.ADMIN_NOW,
      APP_ROUTES.ADMIN_OPS,
    ];

    const failures: string[] = [];
    for (const path of rapidPages) {
      try {
        await gotoAdminRoute(page, path);
      } catch (error) {
        failures.push(`${path}: navigation failed (${String(error)})`);
        continue;
      }

      const { hasError } = await checkForClientError(page);
      if (hasError) {
        failures.push(`${path}: client error`);
        continue;
      }

      const visible = await nav
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) failures.push(`${path}: operator nav missing`);
    }

    expect(failures, 'Operator nav issues during rapid navigation').toEqual([]);
  });

  test('admin navigation persists with client-side navigation', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await gotoAdminRoute(page, APP_ROUTES.ADMIN_NOW);
    const nav = operatorNavigation(page);
    await expect(nav).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    for (const item of WORKSPACE_ITEMS.filter(
      entry => entry.href !== APP_ROUTES.ADMIN_NOW
    )) {
      await nav.getByRole('link', { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${item.href}(\\?.*)?$`), {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await settleAdminNavigation(page);

      const { hasError } = await checkForClientError(page);
      expect(hasError, `Client error after clicking ${item.label}`).toBe(false);
      await expect(
        nav,
        `Operator nav should be visible after clicking ${item.label}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    }
  });
});
