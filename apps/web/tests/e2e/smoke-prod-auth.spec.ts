import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  openPublicProfileFromDashboard,
  signInViaRenderedFlow,
  waitForClerk,
} from './helpers/deployed-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Deployed auth smoke tests.
 *
 * Lightweight tests that run against a deployed environment after deploy.
 * Uses seeded E2E Clerk credentials (not +clerk_test emails).
 *
 * These tests verify:
 * 1. Sign-in flow works with real credentials
 * 2. Dashboard loads with real data (not empty state)
 * 3. Navigation between key tabs works
 * 4. A safe core action opens the public profile from dashboard UI
 *
 * @deploy-smoke
 */

test.use({ storageState: { cookies: [], origins: [] } });

function hasDeployAuthCredentials(): boolean {
  const email =
    process.env.E2E_DEPLOY_USER_EMAIL ||
    process.env.E2E_PROD_USER_EMAIL ||
    process.env.E2E_CLERK_USER_USERNAME ||
    '';
  const password =
    process.env.E2E_DEPLOY_USER_PASSWORD ||
    process.env.E2E_PROD_USER_PASSWORD ||
    process.env.E2E_CLERK_USER_PASSWORD ||
    '';
  return email.length > 0 && password.length > 0;
}

function getDeployCredentials() {
  return {
    email:
      process.env.E2E_DEPLOY_USER_EMAIL ||
      process.env.E2E_PROD_USER_EMAIL ||
      process.env.E2E_CLERK_USER_USERNAME ||
      '',
    password:
      process.env.E2E_DEPLOY_USER_PASSWORD ||
      process.env.E2E_PROD_USER_PASSWORD ||
      process.env.E2E_CLERK_USER_PASSWORD ||
      '',
    verificationCode:
      process.env.E2E_DEPLOY_USER_CODE || process.env.E2E_PROD_USER_CODE || '',
  };
}

test.describe('Deployed Auth Smoke @deploy-smoke', () => {
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    if (!hasDeployAuthCredentials()) {
      test.skip(true, 'No deployed auth credentials configured');
    }
  });

  test('sign-in works and dashboard loads', async ({ page }) => {
    const credentials = getDeployCredentials();

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForClerk(page);

    const result = await signInViaRenderedFlow(page, credentials);
    expect(result).toBe('authenticated');

    await waitForHydration(page);

    const main = page.locator('main').first();
    await expect(main, 'Dashboard should be visible after sign-in').toBeVisible(
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    const mainText = await main.innerText().catch(() => '');
    expect(
      mainText.length,
      'Dashboard should have real content (not empty)'
    ).toBeGreaterThan(30);

    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');
  });

  test('dashboard tab navigation works', async ({ page }) => {
    const credentials = getDeployCredentials();

    await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    if (
      page.url().includes(APP_ROUTES.SIGNIN) ||
      page.url().includes('/sign-in')
    ) {
      await waitForClerk(page);

      const result = await signInViaRenderedFlow(page, credentials);
      expect(result).toBe('authenticated');
    }

    await waitForHydration(page);

    const tabs = [APP_ROUTES.DASHBOARD_AUDIENCE, APP_ROUTES.DASHBOARD_RELEASES];

    for (const tabPath of tabs) {
      await page.goto(tabPath, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      await waitForHydration(page);

      const currentUrl = page.url();
      expect(currentUrl).not.toContain(APP_ROUTES.SIGNIN);
      expect(currentUrl).not.toContain('/sign-in');

      const main = page.locator('main').first();
      const mainVisible = await main
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);
      expect(mainVisible, `${tabPath}: main content should be visible`).toBe(
        true
      );
    }
  });

  test('dashboard profile preview opens the public profile', async ({
    page,
  }) => {
    const credentials = getDeployCredentials();

    await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    if (
      page.url().includes(APP_ROUTES.SIGNIN) ||
      page.url().includes('/sign-in')
    ) {
      await waitForClerk(page);

      const result = await signInViaRenderedFlow(page, credentials);
      expect(result).toBe('authenticated');
    }

    await waitForHydration(page);

    const popup = await openPublicProfileFromDashboard(page);
    await expect(popup.locator('body')).toContainText(/\S/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(popup).not.toHaveURL(/\/signin|\/sign-in/);
    await popup.close();
  });
});
