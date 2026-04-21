import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  openPublicProfileFromDashboard,
  signInViaRenderedFlow,
  waitForClerk,
} from './helpers/deployed-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Synthetic Monitoring Golden Path Test
 *
 * This suite runs against the deployed app with a seeded canary user.
 * It intentionally avoids mutating production data while still proving that the
 * live login flow, dashboard shell, a safe core action, and the public profile
 * path all work together.
 */

function getSyntheticCredentials() {
  return {
    email: process.env.E2E_SYNTHETIC_USER_EMAIL ?? '',
    password: process.env.E2E_SYNTHETIC_USER_PASSWORD ?? '',
    verificationCode: process.env.E2E_SYNTHETIC_USER_CODE ?? '',
  };
}

async function interceptTrackingRoutes(page: Page) {
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

test.describe('Synthetic Monitoring - Golden Path', () => {
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('seeded-user auth journey stays healthy', async ({ page }) => {
    test.setTimeout(120_000);
    const credentials = getSyntheticCredentials();

    try {
      await interceptTrackingRoutes(page);

      console.log('[Synthetic] Step 1: Sign-in flow');
      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForClerk(page);

      const result = await signInViaRenderedFlow(page, credentials);
      if (result === 'verification-required') {
        throw new Error(
          'Synthetic canary requires E2E_SYNTHETIC_USER_CODE for the current Clerk flow'
        );
      }
      if (result !== 'authenticated') {
        throw new Error(`Synthetic sign-in failed with result: ${result}`);
      }

      console.log('[Synthetic] Step 2: Dashboard load');
      await waitForHydration(page);
      const main = page.locator('main').first();
      await expect(main).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      const mainText = await main.innerText().catch(() => '');
      expect(mainText.length).toBeGreaterThan(30);

      console.log('[Synthetic] Step 3: Open public profile from dashboard');
      const popup = await openPublicProfileFromDashboard(page);
      await expect(popup.locator('body')).toContainText(/\S/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(popup).not.toHaveURL(/\/signin|\/sign-in/);
      await popup.close();

      console.log('[Synthetic] ✅ Auth journey passed');
    } catch (error) {
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');

      console.error('[Synthetic] ❌ Auth journey failure', {
        currentUrl,
        pageTitle,
        syntheticUser: credentials.email,
        environment: process.env.E2E_ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  });

  test('critical public pages stay healthy', async ({ page }) => {
    test.setTimeout(60_000);
    await interceptTrackingRoutes(page);

    const criticalPages = [
      { path: '/', name: 'Homepage' },
      { path: '/signin', name: 'Sign In' },
      { path: '/signup', name: 'Sign Up' },
      { path: '/pricing', name: 'Pricing' },
    ];

    for (const { path, name } of criticalPages) {
      console.log(`[Synthetic] Health check: ${name} (${path})`);

      await page.goto(path, {
        waitUntil: 'commit',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);

      await expect(page).toHaveURL(
        new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );

      const criticalErrorSelectors = [
        'text="500"',
        'text="Internal Server Error"',
        'text="Something went wrong"',
        '[data-testid="error-boundary"]',
      ];

      for (const selector of criticalErrorSelectors) {
        await expect(page.locator(selector)).not.toBeVisible();
      }

      await expect(page.locator('body')).not.toBeEmpty();
      console.log(`[Synthetic] ✅ ${name} health check passed`);
    }
  });

  test('homepage performance stays within baseline', async ({ page }) => {
    test.setTimeout(60_000);
    await interceptTrackingRoutes(page);

    const startTime = Date.now();

    await page.goto('/', {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const loadTime = Date.now() - startTime;
    const loadTimeThreshold = 10_000;

    console.log(`[Synthetic] Homepage load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(loadTimeThreshold);
  });
});
