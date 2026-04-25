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
async function setupProfilePage(page: Page): Promise<boolean> {
  await interceptAnalytics(page);
  await page.setViewportSize({ width: 375, height: 812 });

  const response = await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`, {
    timeout: 120_000,
  });
  expect(response?.status() ?? 0).toBeLessThan(500);

  await waitForHydration(page);

  // Wait for the inline CTA wrapper to appear
  const ctaVisible = await page
    .locator('[data-testid="profile-inline-cta"]')
    .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
    .catch(() => false);

  return ctaVisible;
}

/**
 * Click the inline subscribe CTA and wait for the email input to appear.
 * Returns `false` if the button is not found.
 */
async function clickTurnOnNotifications(page: Page): Promise<boolean> {
  const btn = page.getByRole('button', {
    name: /turn on notifications|notify me about new releases/i,
  });
  const visible = await btn
    .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
    .catch(() => false);
  if (!visible) return false;

  await btn.click();

  // Wait for the email input to render
  await page
    .locator('[data-testid="inline-email-input"]')
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.VISIBILITY });

  return true;
}

/**
 * Type an email and submit via the circular arrow button.
 */
async function submitEmail(page: Page, email: string) {
  const input = page.locator('[data-testid="inline-email-input"]');
  await input.fill(email);

  const submitBtn = page.getByRole('button', { name: /submit/i });
  await submitBtn.click();
}

async function expectSubscribeError(page: Page, message: string) {
  await expect(
    page
      .getByRole('alert')
      .or(page.getByRole('tooltip'))
      .or(page.locator('[data-testid="profile-inline-cta"]'))
  ).toContainText(message, {
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
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

    // Mock name/birthday update endpoints (hit after OTP success)
    await page.route('**/api/notifications/subscriber/name', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    await page.route(
      '**/api/notifications/subscriber/birthday',
      async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    );

    const ctaAvailable = await setupProfilePage(page);
    if (!ctaAvailable) {
      test.skip(true, 'Notifications CTA not available on test profile');
      return;
    }

    const opened = await clickTurnOnNotifications(page);
    if (!opened) {
      test.skip(true, '"Turn on notifications" button not found');
      return;
    }

    // Type email and submit
    await submitEmail(page, 'test@example.com');

    // Wait for OTP step
    const otpInput = page.locator('[data-testid="otp-autofill-input"]');
    await otpInput.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Fill OTP code
    await otpInput.fill('123456');

    // The OTP component auto-submits on complete, but click verify if needed
    const otpSubmitBtn = page.getByRole('button', { name: /submit/i });
    if (await otpSubmitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await otpSubmitBtn.click();
    }

    // After OTP success, the flow goes to name step, then birthday, then done.
    // Skip through name step (submit empty)
    const nameInput = page.locator('[data-testid="inline-name-input"]');
    const nameVisible = await nameInput
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);
    if (nameVisible) {
      const nameSubmitBtn = page.getByRole('button', { name: /submit/i });
      await nameSubmitBtn.click();
    }

    // Skip through birthday step (submit empty)
    const birthdayInput = page.locator('[data-testid="inline-birthday-input"]');
    const birthdayVisible = await birthdayInput
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);
    if (birthdayVisible) {
      const birthdaySubmitBtn = page.getByRole('button', { name: /submit/i });
      await birthdaySubmitBtn.click();
    }

    // Assert success state: "Notifications on" text visible
    await expect(page.getByText('Notifications on')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('invalid email shows validation error', async ({ page }) => {
    const ctaAvailable = await setupProfilePage(page);
    if (!ctaAvailable) {
      test.skip(true, 'Notifications CTA not available on test profile');
      return;
    }

    const opened = await clickTurnOnNotifications(page);
    if (!opened) {
      test.skip(true, '"Turn on notifications" button not found');
      return;
    }

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

    const ctaAvailable = await setupProfilePage(page);
    if (!ctaAvailable) {
      test.skip(true, 'Notifications CTA not available on test profile');
      return;
    }

    const opened = await clickTurnOnNotifications(page);
    if (!opened) {
      test.skip(true, '"Turn on notifications" button not found');
      return;
    }

    await submitEmail(page, 'test@example.com');

    // Wait for OTP step
    const otpInput = page.locator('[data-testid="otp-autofill-input"]');
    await otpInput.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Fill wrong OTP
    await otpInput.fill('000000');

    // Click verify submit if available
    const otpSubmitBtn = page.getByRole('button', { name: /submit/i });
    if (await otpSubmitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await otpSubmitBtn.click();
    }

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

    const ctaAvailable = await setupProfilePage(page);
    if (!ctaAvailable) {
      test.skip(true, 'Notifications CTA not available on test profile');
      return;
    }

    const opened = await clickTurnOnNotifications(page);
    if (!opened) {
      test.skip(true, '"Turn on notifications" button not found');
      return;
    }

    await submitEmail(page, 'test@example.com');

    // Wait for OTP step
    const otpInput = page.locator('[data-testid="otp-autofill-input"]');
    await otpInput.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Fill OTP and trigger submit
    await otpInput.fill('000000');

    const otpSubmitBtn = page.getByRole('button', { name: /submit/i });
    if (await otpSubmitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await otpSubmitBtn.click();
    }

    await expectSubscribeError(
      page,
      'Too many attempts. Please try again later.'
    );
  });

  test('SMS path: toggle shows phone input', async ({ page }) => {
    const ctaAvailable = await setupProfilePage(page);
    if (!ctaAvailable) {
      test.skip(true, 'Notifications CTA not available on test profile');
      return;
    }

    const opened = await clickTurnOnNotifications(page);
    if (!opened) {
      test.skip(true, '"Turn on notifications" button not found');
      return;
    }

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
