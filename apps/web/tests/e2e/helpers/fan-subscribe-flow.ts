import { expect, type Page } from '@playwright/test';
import { FAN_CAPTURE_E2E_OTP_CODE } from '@/lib/e2e/runtime';

const TRIGGER = [
  '[data-testid="profile-inline-notifications-trigger"]',
  '[data-testid="profile-home-alerts-row"]',
  '[data-testid="profile-identity-get-updates"]',
].join(', ');

/**
 * Subscribe to an artist by email through the public profile UI, confirming
 * with the deterministic E2E code (NEXT_PUBLIC_E2E_MODE builds only). Resolves
 * once the confirmation call has succeeded.
 */
export async function subscribeAsFan(
  page: Page,
  handle: string,
  email: string
): Promise<void> {
  await page.goto(`/${handle}?mode=subscribe`, {
    waitUntil: 'domcontentloaded',
  });
  const emailStep = page
    .locator('[data-testid="profile-mobile-notifications-step-email"]:visible')
    .first();
  if (!(await emailStep.isVisible().catch(() => false))) {
    const trigger = page.locator(TRIGGER).first();
    await trigger.waitFor({ state: 'visible', timeout: 60_000 });
    await trigger.click();
  }
  await emailStep.waitFor({ state: 'visible', timeout: 60_000 });
  const useEmail = page.getByRole('button', { name: 'Use Email' });
  if (await useEmail.isVisible().catch(() => false)) await useEmail.click();

  await emailStep
    .locator('[data-testid="mobile-email-input"]')
    .first()
    .fill(email);
  const submit = emailStep.getByRole('button', { name: /^submit$/i });
  await expect(submit).toBeEnabled();
  const [subscribed] = await Promise.all([
    page.waitForResponse(
      r =>
        r.url().includes('/api/notifications/subscribe') &&
        r.request().method() === 'POST',
      { timeout: 60_000 }
    ),
    submit.click(),
  ]);
  expect(subscribed.status(), 'subscribe request').toBeLessThan(400);

  const otpStep = page
    .locator('[data-testid="profile-mobile-notifications-step-otp"]')
    .first();
  await otpStep.waitFor({ state: 'visible', timeout: 120_000 });
  const firstDigit = page.getByLabel('Digit 1 of 6');
  await firstDigit.click();
  await firstDigit.pressSequentially(FAN_CAPTURE_E2E_OTP_CODE);
  const verified = await page.waitForResponse(
    r =>
      r.url().includes('/api/notifications/verify-email-otp') &&
      r.request().method() === 'POST',
    { timeout: 60_000 }
  );
  expect(verified.status(), 'verify-email-otp request').toBeLessThan(400);
}
