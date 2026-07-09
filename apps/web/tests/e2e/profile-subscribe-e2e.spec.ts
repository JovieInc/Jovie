import { type Locator, type Page, type Route } from '@playwright/test';
import { expect, test } from './setup';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Profile Subscribe Flow E2E Tests
 *
 * Tests the email subscribe flow end-to-end with API mocking via
 * Playwright route interception on the ProfileInlineNotificationsCTA.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTIFICATIONS_TRIGGER_SELECTOR = [
  '[data-testid="profile-inline-notifications-trigger"]',
  '[data-testid="profile-home-alerts-row"]',
  '[data-testid="profile-home-alerts-fallback-card"]',
].join(', ');
const VISIBLE_EMAIL_STEP_SELECTOR =
  '[data-testid="profile-mobile-notifications-step-email"]:visible';
const VISIBLE_EMAIL_INPUT_SELECTOR =
  '[data-testid="mobile-email-input"]:visible';

async function getActiveNotificationsFlow(page: Page) {
  const dialogFlow = page
    .locator('[role="dialog"][data-testid="profile-mobile-notifications-flow"]')
    .first();
  const dialogVisible = await dialogFlow
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.QUICK })
    .then(() => true)
    .catch(() => false);

  if (dialogVisible) {
    return dialogFlow;
  }

  return page
    .locator('[data-testid="profile-mobile-notifications-flow"]:visible')
    .first();
}

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
  await page.route('**/api/px', (r: Route) =>
    r.fulfill({ status: 204, body: '' })
  );
}

/**
 * Navigate to the test profile, set mobile viewport, and wait for hydration.
 * Returns `false` if the notifications CTA is not present (caller should skip).
 */
async function setupProfilePage(page: Page) {
  await interceptAnalytics(page);
  await page.setViewportSize({ width: 375, height: 812 });

  const response = await smokeNavigate(
    page,
    `/${TEST_PROFILES.DUALIPA}?mode=subscribe`,
    {
      timeout: 120_000,
    }
  );
  expect(response?.status() ?? 0).toBeLessThan(500);

  await waitForHydration(page);

  await page
    .locator(
      [VISIBLE_EMAIL_STEP_SELECTOR, NOTIFICATIONS_TRIGGER_SELECTOR].join(', ')
    )
    .first()
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

/**
 * Open the full-screen notifications flow and wait for the email step.
 */
async function clickTurnOnNotifications(page: Page) {
  const emailStep = page.locator(VISIBLE_EMAIL_STEP_SELECTOR).first();
  const emailVisible = await emailStep
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.QUICK })
    .then(() => true)
    .catch(() => false);

  if (!emailVisible) {
    const btn = page.locator(NOTIFICATIONS_TRIGGER_SELECTOR).first();
    await btn.waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await btn.click();
    await emailStep.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  }

  const flow = await getActiveNotificationsFlow(page);
  await flow.locator(VISIBLE_EMAIL_INPUT_SELECTOR).first().waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
}

/**
 * Type an email and submit the email step.
 */
async function submitEmail(
  page: Page,
  email: string,
  options: { readonly waitForSubscribe?: boolean } = {}
) {
  const flow = await getActiveNotificationsFlow(page);
  const emailStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-email"]')
    .first();
  await emailStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  const input = flow.locator('[data-testid="mobile-email-input"]').first();
  await input.fill(email);

  const submitBtn = emailStep.getByRole('button', { name: /^submit$/i });
  await expect(submitBtn).toBeEnabled();

  if (options.waitForSubscribe) {
    await Promise.all([
      page.waitForResponse(
        response =>
          response.url().includes('/api/notifications/subscribe') &&
          response.request().method() === 'POST',
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      ),
      submitBtn.click(),
    ]);
    return;
  }

  await submitBtn.click();
}

async function expectSubscribeError(page: Page, message: string) {
  await expect(page.getByText(message, { exact: false }).first()).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
}

async function completeNameStep(page: Page, name: string) {
  const flow = await getActiveNotificationsFlow(page);
  const nameStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-name"]')
    .first();
  await nameStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  const input = flow.locator('[data-testid="mobile-name-input"]').first();
  await input.fill(name);
  await expect(input).toHaveValue(name);

  const continueButton = nameStep.getByRole('button', { name: /^continue$/i });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

async function pickBirthdayOption(
  page: Page,
  flow: Locator,
  testId: string,
  optionName: string
) {
  await flow.locator(`[data-testid="${testId}"]`).click();
  await page
    .getByRole('option', { name: optionName, exact: true })
    .click({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

async function completeBirthdayStep(page: Page) {
  const flow = await getActiveNotificationsFlow(page);
  const birthdayStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-birthday"]')
    .first();
  await birthdayStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  // Birthday selects are Radix Selects (portal to document.body), not native
  // <select> elements — open each trigger, then click the option by name.
  await pickBirthdayOption(page, flow, 'mobile-birthday-month', 'April');
  await pickBirthdayOption(page, flow, 'mobile-birthday-day', '24');
  await pickBirthdayOption(page, flow, 'mobile-birthday-year', '1994');
  const continueButton = birthdayStep.getByRole('button', {
    name: /^continue$/i,
  });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

async function enterOtpCode(page: Page, code: string) {
  const flow = await getActiveNotificationsFlow(page);
  const otpStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-otp"]')
    .first();
  const firstDigitInput = flow.getByLabel('Digit 1 of 6');

  await otpStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await firstDigitInput.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });

  await firstDigitInput.click();
  await firstDigitInput.pressSequentially(code);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Profile Subscribe Flow @smoke', () => {
  test.setTimeout(180_000);

  test('email happy path: submit -> OTP -> verify -> activated', async ({
    page,
  }) => {
    // Mock subscribe endpoint
    await page.route('**/api/notifications/subscribe', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription',
          emailDispatched: true,
          durationMs: 1,
          pendingConfirmation: true,
          requiresOtp: true,
        }),
      });
    });

    // Mock OTP verify endpoint
    await page.route('**/api/notifications/verify-email-otp', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock post-OTP enrichment endpoints.
    await page.route('**/api/notifications/update-name', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    await page.route('**/api/notifications/update-birthday', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    await page.route('**/api/notifications/preferences', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, updated: 1 }),
      });
    });

    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    // Type email and submit
    await submitEmail(page, 'test@example.com', { waitForSubscribe: true });

    // Wait for OTP step
    await enterOtpCode(page, '123456');

    await completeNameStep(page, 'Alex');
    await completeBirthdayStep(page);

    await expect(
      (await getActiveNotificationsFlow(page))
        .locator('[data-testid="profile-mobile-notifications-step-done"]')
        .first()
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('invalid email shows validation error', async ({ page }) => {
    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    // Type an invalid email and submit
    await submitEmail(page, 'notanemail');

    await expectSubscribeError(page, 'Please enter a valid email address');
  });

  test('wrong OTP shows error', async ({ page }) => {
    // Mock subscribe to return pending confirmation
    await page.route('**/api/notifications/subscribe', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription',
          emailDispatched: true,
          durationMs: 1,
          pendingConfirmation: true,
          requiresOtp: true,
        }),
      });
    });

    // Mock OTP verify to return 400 error
    await page.route('**/api/notifications/verify-email-otp', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Invalid verification code',
        }),
      });
    });

    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    await submitEmail(page, 'test@example.com', { waitForSubscribe: true });

    // Wait for OTP step
    await enterOtpCode(page, '000000');

    await expectSubscribeError(page, 'Invalid verification code');
  });

  test('OTP rate limited shows rate limit message', async ({ page }) => {
    // Mock subscribe to return pending confirmation
    await page.route('**/api/notifications/subscribe', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription',
          emailDispatched: true,
          durationMs: 1,
          pendingConfirmation: true,
          requiresOtp: true,
        }),
      });
    });

    // Mock OTP verify to return 429 rate limit
    await page.route('**/api/notifications/verify-email-otp', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Too many attempts. Please try again later.',
        }),
      });
    });

    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    await submitEmail(page, 'test@example.com', { waitForSubscribe: true });

    // Wait for OTP step
    await enterOtpCode(page, '000000');

    await expectSubscribeError(
      page,
      'Too many attempts. Please try again later.'
    );
  });

  test('SMS path: toggle shows phone input', async ({ page }) => {
    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    // Look for a channel toggle button (Switch to text / SMS toggle)
    const smsToggle = page
      .getByRole('button', { name: /switch to text/i })
      .or(page.getByRole('button', { name: /sms/i }))
      .or(page.locator('[data-testid="channel-toggle"]'));

    const toggleVisible = await smsToggle
      .first()
      .isVisible({ timeout: SMOKE_TIMEOUTS.QUICK })
      .catch(() => false);

    if (!toggleVisible) {
      test.skip(
        true,
        'SMS toggle not available on this profile (SMS may be disabled)'
      );
      return;
    }

    await smsToggle.first().click();

    // Assert phone input appears
    const phoneInput = page
      .locator('input[inputmode="numeric"]')
      .or(page.locator('input[placeholder*="555"]'))
      .or(page.locator('input[type="tel"]'));

    await expect(phoneInput.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
