import { expect, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Synthetic Monitoring — Critical page health + performance baseline.
 *
 * The legacy email/OTP signup canary that previously lived in this file
 * has moved to `synthetic-legacy-otp.spec.ts` (gated behind
 * `E2E_PROD_LEGACY_CANARY` at the workflow level) and is being replaced
 * by the Layer A UI smoke in `synthetic-auth-ui.spec.ts` (JOV-2446).
 *
 * This file keeps the always-on critical-page health checks and
 * performance baseline. Neither depends on signup/auth.
 */

// Override global storageState to run these tests as unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

const HOMEPAGE_PRIMARY_CTA_TEST_ID = 'homepage-primary-cta';
const SIGNUP_PATH = '/signup';
const START_PATH = '/start';
const TURNSTILE_CONFIG_ERROR = 'turnstile is not configured';

test.describe('Synthetic Monitoring - Golden Path', () => {
  // Only run in synthetic monitoring mode
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('Critical page health checks', async ({ page }) => {
    test.setTimeout(60_000);

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    const criticalPages = [
      { path: '/', name: 'Homepage' },
      { path: START_PATH, name: 'Start Onboarding Chat' },
      { path: '/dualipa', name: 'Profile Page' },
      { path: '/dualipa?mode=listen', name: 'Listen Mode' },
      { path: '/dualipa?mode=pay', name: 'Pay Mode' },
      { path: SIGNUP_PATH, name: 'Sign Up' },
    ];

    for (const { path, name } of criticalPages) {
      console.log(`[Synthetic] Health check: ${name} (${path})`);

      await page.goto(path, {
        waitUntil: 'commit',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);

      // Basic health checks
      await expect(page).toHaveURL(
        new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );

      // Check for critical errors
      const criticalErrorSelectors = [
        'text="500"',
        'text="Internal Server Error"',
        'text="Something went wrong"',
        `text="${TURNSTILE_CONFIG_ERROR}"`,
        '[data-testid="error-boundary"]',
      ];

      for (const selector of criticalErrorSelectors) {
        await expect(page.locator(selector)).not.toBeVisible();
      }

      // Ensure page has loaded content
      await expect(page.locator('body')).not.toBeEmpty();

      console.log(`[Synthetic] ✅ ${name} health check passed`);
    }
  });

  test('Performance baseline check', async ({ page }) => {
    test.setTimeout(60_000);

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    console.log('[Synthetic] Performance baseline check');

    const startTime = Date.now();

    await page.goto('/', {
      waitUntil: 'commit',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const loadTime = Date.now() - startTime;

    // Performance thresholds (in milliseconds)
    const LOAD_TIME_THRESHOLD = 10000; // 10 seconds max for homepage

    console.log(`[Synthetic] Homepage load time: ${loadTime}ms`);

    if (loadTime > LOAD_TIME_THRESHOLD) {
      console.warn(
        `[Synthetic] ⚠️ Homepage load time (${loadTime}ms) exceeds threshold (${LOAD_TIME_THRESHOLD}ms)`
      );
      // Don't fail the test, but log for monitoring
    }

    // Check for performance-critical elements
    await expect(page.getByTestId('homepage-hero-shell')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId(HOMEPAGE_PRIMARY_CTA_TEST_ID)).toBeVisible({
      timeout: 5000,
    });

    console.log('[Synthetic] ✅ Performance check completed');
  });
});
