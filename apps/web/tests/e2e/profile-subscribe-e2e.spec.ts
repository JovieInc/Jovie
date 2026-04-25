import { type Page, type Route } from '@playwright/test';
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
      '[data-testid="profile-mobile-notifications-step-preferences"], [data-testid="profile-inline-notifications-trigger"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

/**
 * Open the full-screen notifications flow and advance to the email step.
 * Returns `false` if the trigger is not found.
 */
async function clickTurnOnNotifications(page: Page) {
  const preferencesStep = page.getByTestId(
    'profile-mobile-notifications-step-preferences'
  );
  const preferencesVisible = await preferencesStep
    .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
    .catch(() => false);

  if (!preferencesVisible) {
    const btn = page.getByTestId('profile-inline-notifications-trigger');
    await btn.waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await btn.click();
    await preferencesStep.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  }

  await preferencesStep.getByRole('switch', { name: /new music/i }).click();

  await page
    .getByTestId('profile-mobile-notifications-step-email')
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
  await page.getByTestId('mobile-email-input').waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
}

/**
 * Type an email and submit the email step.
 */
async function submitEmail(page: Page, email: string) {
  const emailStep = page.getByTestId('profile-mobile-notifications-step-email');
  await emailStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  const input = page.getByTestId('mobile-email-input');
  await input.fill(email);

  const submitBtn = emailStep.getByRole('button', { name: /^continue$/i });
  await submitBtn.click();
}

async function expectSubscribeError(page: Page, message: string) {
  await expect(
    page
      .getByRole('alert')
      .or(page.getByRole('tooltip'))
      .or(page.getByTestId('profile-mobile-notifications-flow'))
  ).toContainText(message, {
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
}

async function completeNameStep(page: Page, name: string) {
  const nameStep = page.getByTestId('profile-mobile-notifications-step-name');
  await nameStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await page.getByTestId('mobile-name-input').fill(name);
  await nameStep.getByRole('button', { name: /^continue$/i }).click();
}

async function completeBirthdayStep(page: Page) {
  const birthdayStep = page.getByTestId(
    'profile-mobile-notifications-step-birthday'
  );
  await birthdayStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await page.getByTestId('mobile-birthday-month').selectOption('04');
  await page.getByTestId('mobile-birthday-day').selectOption('24');
  await page.getByTestId('mobile-birthday-year').selectOption('1994');
  await birthdayStep.getByRole('button', { name: /^continue$/i }).click();
}

async function enterOtpCode(page: Page, code: string) {
  const otpStep = page.getByTestId('profile-mobile-notifications-step-otp');
  const firstDigitInput = page.getByLabel('Digit 1 of 6');

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

  const otpSubmitBtn = otpStep.getByRole('button', { name: /^verify$/i });
  const canClickVerify = await otpSubmitBtn
    .isEnabled({ timeout: 1000 })
    .catch(() => false);

  if (canClickVerify) {
    await otpSubmitBtn.click();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Profile Subscribe Flow @smoke', () => {
  test.setTimeout(180_000);

  test('email happy path: submit -> OTP -> verify -> success', async ({
    page,
  }) => {
    // Mock subscribe endpoint
    await page.route('**/api/notifications/subscribe', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pendingConfirmation: true }),
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
    await submitEmail(page, 'test@example.com');

    // Wait for OTP step
    await enterOtpCode(page, '123456');

    await completeNameStep(page, 'Alex');
    await completeBirthdayStep(page);

    await page
      .getByTestId('profile-mobile-notifications-step-preferences')
      .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await page
      .getByTestId('profile-mobile-notifications-step-preferences')
      .getByRole('button', { name: /save & finish/i })
      .click();

    await expect(
      page.getByTestId('profile-mobile-notifications-step-done')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByText("You're all set!")).toBeVisible();
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
        body: JSON.stringify({ pendingConfirmation: true }),
      });
    });

    // Mock OTP verify to return 400 error
    await page.route('**/api/notifications/verify-email-otp', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid verification code' }),
      });
    });

    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    await submitEmail(page, 'test@example.com');

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
        body: JSON.stringify({ pendingConfirmation: true }),
      });
    });

    // Mock OTP verify to return 429 rate limit
    await page.route('**/api/notifications/verify-email-otp', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Too many attempts. Please try again later.',
        }),
      });
    });

    await setupProfilePage(page);
    await clickTurnOnNotifications(page);

    await submitEmail(page, 'test@example.com');

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
