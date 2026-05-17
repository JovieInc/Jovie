import { expect, type Page, test } from '@playwright/test';
import {
  buildProductionSignupEmail,
  cleanupProductionSyntheticSignup,
  fillOtpCode,
  tagProductionSyntheticSignup,
  validateProductionSignupCanaryConfig,
  waitForProductionSignupOtp,
} from './utils/production-signup-canary';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

const HOMEPAGE_PRIMARY_CTA_TEST_ID = 'homepage-primary-cta';
const SIGNUP_PATH = '/signup';
const START_PATH = '/start';
const TURNSTILE_CONFIG_ERROR = 'turnstile is not configured';

async function installSyntheticRouteStubs(page: Page) {
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

async function assertNoFrontDoorConfigErrors(page: Page) {
  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 10_000 })
    .catch(() => '');

  expect(bodyText.toLowerCase()).not.toContain(TURNSTILE_CONFIG_ERROR);
  expect(bodyText.toLowerCase()).not.toContain('auth unavailable');
  expect(bodyText.toLowerCase()).not.toContain('clerk is not configured');
}

async function verifyStartChatCanSendFirstTurn(page: Page) {
  await page.goto(START_PATH, {
    waitUntil: 'commit',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  await waitForHydration(page);
  await assertNoFrontDoorConfigErrors(page);

  const textarea = page.locator('[aria-label="Chat message input"]');
  await expect(textarea).toBeVisible({ timeout: 20_000 });
  await textarea.fill('I manage a production canary artist.');

  const chatResponse = page.waitForResponse(
    response =>
      response.url().includes('/api/chat') &&
      response.request().method() === 'POST',
    { timeout: 45_000 }
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  const response = await chatResponse;

  expect(
    response.status(),
    `First onboarding chat turn returned HTTP ${response.status()}`
  ).toBeLessThan(500);
  expect(response.status()).not.toBe(401);
  expect(response.status()).not.toBe(403);
}

async function completeProductionMailboxSignup({
  page,
  email,
  password,
  startedAtMs,
}: {
  readonly page: Page;
  readonly email: string;
  readonly password: string;
  readonly startedAtMs: number;
}) {
  const emailInput = page
    .locator('input[name="emailAddress"], input[type="email"]')
    .first();
  await expect(emailInput).toBeVisible({ timeout: 20_000 });
  await emailInput.fill(email);

  const firstPasswordInput = page
    .locator('input[name="password"], input[type="password"]')
    .first();
  if (
    await firstPasswordInput.isVisible({ timeout: 2_000 }).catch(() => false)
  ) {
    await firstPasswordInput.fill(password);
  }

  await page
    .getByRole('button', { name: /continue|sign up|create/i })
    .first()
    .click();

  const secondPasswordInput = page
    .locator('input[name="password"], input[type="password"]')
    .first();
  if (
    await secondPasswordInput.isVisible({ timeout: 5_000 }).catch(() => false)
  ) {
    await secondPasswordInput.fill(password);
    await page
      .getByRole('button', { name: /continue|sign up|create/i })
      .first()
      .click();
  }

  const otp = await waitForProductionSignupOtp({
    email,
    env: process.env,
    startedAtMs,
  });
  await fillOtpCode(page, otp);

  const verifyButton = page
    .getByRole('button', { name: /verify|continue|complete|submit/i })
    .first();
  if (await verifyButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await verifyButton.click();
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect(page).not.toHaveURL(/\/signup(?:\?|$)/, { timeout: 45_000 });
}

async function verifyPostSignupUsableState(page: Page) {
  await page.goto('/app', {
    waitUntil: 'commit',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  await waitForHydration(page);

  const url = new URL(page.url());
  expect(url.pathname).not.toBe('/signin');
  expect(url.pathname).not.toBe('/signup');
  await assertNoFrontDoorConfigErrors(page);

  const bodyText = await page.locator('body').innerText({ timeout: 15_000 });
  expect(bodyText.length).toBeGreaterThan(50);
}

/**
 * Synthetic Monitoring Golden Path Test
 *
 * This test is specifically designed for production synthetic monitoring:
 * - Uses throwaway accounts with auto-cleanup
 * - Runs on the production synthetic schedule
 * - Alerts on failure via Slack
 * - Minimal assertions focused on critical functionality
 * - Handles production-specific edge cases
 */

test.describe('Synthetic Monitoring - Golden Path', () => {
  // Only run in synthetic monitoring mode
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('Production signup, onboarding, and app-shell canary', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const config = validateProductionSignupCanaryConfig(process.env);
    if (!config.ok) {
      throw new Error(
        `Production signup canary is not configured:\n${config.summary}`
      );
    }

    const runId = process.env.SYNTHETIC_RUN_ID ?? `synthetic-${Date.now()}`;
    const testEmail = buildProductionSignupEmail(
      process.env.E2E_PROD_SIGNUP_EMAIL_BASE!,
      runId
    );
    const startedAtMs = Date.now();

    console.log(`[Synthetic] Testing signup canary with: ${testEmail}`);

    try {
      await installSyntheticRouteStubs(page);
      await cleanupProductionSyntheticSignup({
        email: testEmail,
        env: process.env,
      });

      console.log('[Synthetic] Step 1: /start first-turn chat readiness');
      await verifyStartChatCanSendFirstTurn(page);

      console.log('[Synthetic] Step 2: Homepage load test');
      await page.goto('/', {
        waitUntil: 'commit',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);
      await assertNoFrontDoorConfigErrors(page);

      const primaryCta = page.getByTestId(HOMEPAGE_PRIMARY_CTA_TEST_ID);
      await expect(primaryCta).toBeVisible({
        timeout: 15000,
      });

      console.log('[Synthetic] Step 3: Sign up flow test');
      await primaryCta.click();
      await expect(page).toHaveURL(new RegExp(SIGNUP_PATH), {
        timeout: 20000,
      });
      await assertNoFrontDoorConfigErrors(page);

      console.log('[Synthetic] Step 4: Clerk email OTP signup');
      await completeProductionMailboxSignup({
        page,
        email: testEmail,
        password: process.env.E2E_PROD_SIGNUP_PASSWORD!,
        startedAtMs,
      });
      await tagProductionSyntheticSignup({
        email: testEmail,
        env: process.env,
        runId,
      });

      console.log('[Synthetic] Step 5: Post-signup app shell readiness');
      await verifyPostSignupUsableState(page);

      console.log('[Synthetic] ✅ Production signup canary passed');
    } catch (error) {
      console.error('[Synthetic] ❌ Critical path failure:', error);

      // Capture additional debug info for production failures
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');

      console.error('[Synthetic] Debug info:', {
        currentUrl,
        pageTitle,
        testEmail,
        environment: process.env.E2E_ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });

      // Re-throw to fail the test
      throw error;
    } finally {
      await cleanupProductionSyntheticSignup({
        email: testEmail,
        env: process.env,
      }).catch(error => {
        console.error('[Synthetic] Cleanup failed:', error);
      });
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
