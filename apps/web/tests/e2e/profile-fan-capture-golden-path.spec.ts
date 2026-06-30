import { createHash } from 'node:crypto';
import { type Page, type Route } from '@playwright/test';
import { FAN_CAPTURE_E2E_OTP_CODE } from '@/lib/e2e/runtime';
import {
  assertAudienceMemberForEmail,
  assertConfirmedEmailSubscription,
  assertSmsSubscriptionRow,
  cleanupFanCaptureTestData,
  getCreatorProfileIdByUsername,
  hasFanCaptureDatabase,
} from './helpers/fan-capture-golden-path';
import { expect, test } from './setup';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Fan capture golden path (JOV-3343 / #11369)
 *
 * End-to-end guardrail for public-profile email + SMS capture. Uses real
 * notification APIs (no subscribe/verify mocks) and verifies durable rows in
 * notification_subscriptions + audience_members.
 *
 * Email OTP is deterministic in CI/local E2E (424242) — same contract as
 * Clerk +clerk_test verification.
 *
 * @smoke @critical @fan-capture
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const NOTIFICATIONS_TRIGGER_SELECTOR = [
  '[data-testid="profile-inline-notifications-trigger"]',
  '[data-testid="profile-home-alerts-row"]',
  '[data-testid="profile-home-alerts-fallback-card"]',
].join(', ');
const VISIBLE_EMAIL_STEP_SELECTOR =
  '[data-testid="profile-mobile-notifications-step-email"]:visible';
const VISIBLE_EMAIL_INPUT_SELECTOR =
  '[data-testid="mobile-email-input"]:visible';

function buildTestEmail(runId: string): string {
  return `fan-capture+${runId}@test.jov.ie`;
}

function buildTestPhone(runId: string): string {
  const suffix = [...createHash('sha256').update(runId).digest()]
    .map(byte => (byte % 10).toString())
    .join('')
    .slice(-10)
    .padStart(10, '0');
  return `+1${suffix}`;
}

async function interceptAnalyticsOnly(page: Page) {
  await page.route('**/api/profile/view', (route: Route) =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', (route: Route) =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', (route: Route) =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/px', (route: Route) =>
    route.fulfill({ status: 204, body: '' })
  );
}

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

async function openSubscribeFlow(page: Page) {
  const emailStep = page.locator(VISIBLE_EMAIL_STEP_SELECTOR).first();
  const emailVisible = await emailStep
    .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.QUICK })
    .then(() => true)
    .catch(() => false);

  if (!emailVisible) {
    const trigger = page.locator(NOTIFICATIONS_TRIGGER_SELECTOR).first();
    await trigger.waitFor({
      state: 'visible',
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await trigger.click();
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

async function setupProfileSubscribePage(
  page: Page,
  viewport: { readonly width: number; readonly height: number }
) {
  await interceptAnalyticsOnly(page);
  await page.setViewportSize(viewport);

  const response = await smokeNavigate(
    page,
    `/${TEST_PROFILES.DUALIPA}?mode=subscribe`,
    { timeout: 120_000 }
  );
  expect(response?.status() ?? 0).toBeLessThan(500);

  await waitForHydration(page);
  await openSubscribeFlow(page);
}

async function submitEmailStep(
  page: Page,
  email: string,
  options: { readonly waitForSubscribe?: boolean } = {}
) {
  const flow = await getActiveNotificationsFlow(page);
  const emailStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-email"]')
    .first();
  const input = flow.locator('[data-testid="mobile-email-input"]').first();
  await input.fill(email);

  const submitBtn = emailStep.getByRole('button', { name: /^continue$/i });
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
  await firstDigitInput.click();
  await firstDigitInput.pressSequentially(code);
}

async function skipNameAndBirthday(page: Page) {
  const flow = await getActiveNotificationsFlow(page);
  const nameStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-name"]')
    .first();
  await nameStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await nameStep.getByRole('button', { name: /^continue$/i }).click();

  const birthdayStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-birthday"]')
    .first();
  await birthdayStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });
  await birthdayStep.getByRole('button', { name: /^continue$/i }).click();
  await birthdayStep.getByRole('button', { name: /^continue$/i }).click();

  await expect(
    flow
      .locator('[data-testid="profile-mobile-notifications-step-done"]')
      .first()
  ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
}

test.describe('Fan capture golden path @smoke @critical', () => {
  test.setTimeout(240_000);

  test.beforeEach(async () => {
    if (!hasFanCaptureDatabase()) {
      test.skip(true, 'DATABASE_URL not available for fan capture golden path');
    }

    const deterministicOtpEnabled =
      process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
      process.env.NEXT_PUBLIC_E2E_MODE === '1';
    if (!deterministicOtpEnabled) {
      test.skip(
        true,
        'Fan capture golden path requires E2E_USE_TEST_AUTH_BYPASS=1 or NEXT_PUBLIC_E2E_MODE=1'
      );
    }
  });

  test('mobile: email subscribe → OTP → audience row', async ({ page }) => {
    const runId = `${Date.now().toString(36)}-mobile`;
    const testEmail = buildTestEmail(runId);
    const creatorProfileId = await getCreatorProfileIdByUsername(
      TEST_PROFILES.DUALIPA
    );

    if (!creatorProfileId) {
      test.skip(true, `${TEST_PROFILES.DUALIPA} profile not seeded`);
      return;
    }

    await cleanupFanCaptureTestData({
      creatorProfileId,
      email: testEmail,
    });

    try {
      await setupProfileSubscribePage(page, { width: 375, height: 812 });
      await submitEmailStep(page, testEmail, { waitForSubscribe: true });

      await enterOtpCode(page, FAN_CAPTURE_E2E_OTP_CODE);

      await page.waitForResponse(
        response =>
          response.url().includes('/api/notifications/verify-email-otp') &&
          response.request().method() === 'POST' &&
          response.status() < 400,
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );

      await skipNameAndBirthday(page);

      await assertConfirmedEmailSubscription({
        creatorProfileId,
        email: testEmail,
      });
      await assertAudienceMemberForEmail({
        creatorProfileId,
        email: testEmail,
      });
    } finally {
      await cleanupFanCaptureTestData({
        creatorProfileId,
        email: testEmail,
      });
    }
  });

  test('desktop: email subscribe → OTP → audience row', async ({ page }) => {
    const runId = `${Date.now().toString(36)}-desktop`;
    const testEmail = buildTestEmail(runId);
    const creatorProfileId = await getCreatorProfileIdByUsername(
      TEST_PROFILES.DUALIPA
    );

    if (!creatorProfileId) {
      test.skip(true, `${TEST_PROFILES.DUALIPA} profile not seeded`);
      return;
    }

    await cleanupFanCaptureTestData({
      creatorProfileId,
      email: testEmail,
    });

    try {
      await setupProfileSubscribePage(page, { width: 1280, height: 800 });
      await submitEmailStep(page, testEmail, { waitForSubscribe: true });
      await enterOtpCode(page, FAN_CAPTURE_E2E_OTP_CODE);

      await page.waitForResponse(
        response =>
          response.url().includes('/api/notifications/verify-email-otp') &&
          response.request().method() === 'POST' &&
          response.status() < 400,
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );

      await skipNameAndBirthday(page);

      await assertConfirmedEmailSubscription({
        creatorProfileId,
        email: testEmail,
      });
      await assertAudienceMemberForEmail({
        creatorProfileId,
        email: testEmail,
      });
    } finally {
      await cleanupFanCaptureTestData({
        creatorProfileId,
        email: testEmail,
      });
    }
  });

  test('mobile: SMS subscribe persists notification row', async ({ page }) => {
    const runId = `${Date.now().toString(36)}-sms`;
    const testPhone = buildTestPhone(runId);
    const creatorProfileId = await getCreatorProfileIdByUsername(
      TEST_PROFILES.DUALIPA
    );

    if (!creatorProfileId) {
      test.skip(true, `${TEST_PROFILES.DUALIPA} profile not seeded`);
      return;
    }

    await cleanupFanCaptureTestData({
      creatorProfileId,
      phone: testPhone,
    });

    try {
      await setupProfileSubscribePage(page, { width: 375, height: 812 });

      const subscribeResult = await page.evaluate(
        async ({ artistId, phone }: { artistId: string; phone: string }) => {
          const response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artist_id: artistId,
              channel: 'sms',
              phone,
              country_code: 'US',
              source: 'profile_bell',
            }),
          });

          const body = (await response.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
          } | null;

          return {
            status: response.status,
            success: body?.success ?? false,
            error: body?.error ?? null,
          };
        },
        { artistId: creatorProfileId, phone: testPhone }
      );

      expect(
        subscribeResult.status,
        `SMS subscribe failed: ${subscribeResult.error ?? subscribeResult.status}`
      ).toBeLessThan(500);
      expect(subscribeResult.success).toBe(true);

      await assertSmsSubscriptionRow({
        creatorProfileId,
        phone: testPhone,
      });
    } finally {
      await cleanupFanCaptureTestData({
        creatorProfileId,
        phone: testPhone,
      });
    }
  });
});
