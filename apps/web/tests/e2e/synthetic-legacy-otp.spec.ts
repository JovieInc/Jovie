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

/**
 * Legacy email/OTP signup canary — superseded by Layer A UI smoke in
 * `synthetic-auth-ui.spec.ts` (JOV-2446). Kept for one release behind a
 * workflow-level gate so production monitoring does not go dark between
 * merge and the Clerk dashboard flip that removes email/password as a
 * supported strategy.
 *
 * After Layer A is proven green in production AND the Clerk dashboard
 * has been flipped to SSO-only, set repo variable
 * `E2E_PROD_LEGACY_CANARY=0` to disable this step at the workflow level.
 * The file and helpers will be deleted in the JOV-2446 decommission
 * follow-up issue.
 */

// Override global storageState to run these tests as unauthenticated.
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

  const textarea = page.locator('[aria-label="Chat Message Input"]');
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

test.describe('Synthetic Monitoring - Legacy OTP Signup (JOV-2446 cutover)', () => {
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip(
        true,
        'Synthetic legacy OTP canary only runs when E2E_SYNTHETIC_MODE=true.'
      );
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

    console.log(`[Synthetic][legacy] Testing signup canary with: ${testEmail}`);

    try {
      await installSyntheticRouteStubs(page);
      await cleanupProductionSyntheticSignup({
        email: testEmail,
        env: process.env,
      });

      console.log(
        '[Synthetic][legacy] Step 1: /start first-turn chat readiness'
      );
      await verifyStartChatCanSendFirstTurn(page);

      console.log('[Synthetic][legacy] Step 2: Homepage load test');
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

      console.log('[Synthetic][legacy] Step 3: Sign up flow test');
      await primaryCta.click();
      await expect(page).toHaveURL(new RegExp(SIGNUP_PATH), {
        timeout: 20000,
      });
      await assertNoFrontDoorConfigErrors(page);

      console.log('[Synthetic][legacy] Step 4: Clerk email OTP signup');
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

      console.log(
        '[Synthetic][legacy] Step 5: Post-signup app shell readiness'
      );
      await verifyPostSignupUsableState(page);

      console.log('[Synthetic][legacy] ✅ Production signup canary passed');
    } catch (error) {
      console.error('[Synthetic][legacy] ❌ Critical path failure:', error);

      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');

      console.error('[Synthetic][legacy] Debug info:', {
        currentUrl,
        pageTitle,
        testEmail,
        environment: process.env.E2E_ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });

      throw error;
    } finally {
      await cleanupProductionSyntheticSignup({
        email: testEmail,
        env: process.env,
      }).catch(error => {
        console.error('[Synthetic][legacy] Cleanup failed:', error);
      });
    }
  });
});
