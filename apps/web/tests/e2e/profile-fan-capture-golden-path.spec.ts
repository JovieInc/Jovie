import { createHash } from 'node:crypto';
import { type Page, type Route } from '@playwright/test';
import { FAN_CAPTURE_E2E_OTP_CODE } from '@/lib/e2e/runtime';
import {
  assertEmailCaptureComplete,
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

/** Fan capture golden path (#11369): public-profile email + SMS, real APIs, DB rows. @smoke @critical */

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

const EMAIL_VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'desktop', width: 1280, height: 800 },
] as const;

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

  // If the flow defaulted to SMS (Pro creator, smsEnabled=true), switch to email.
  // The "Use Email" button is visible only when channel='sms'.
  const useEmailBtn = flow.getByRole('button', { name: 'Use Email' });
  if (await useEmailBtn.isVisible().catch(() => false)) {
    await useEmailBtn.click();
    await flow
      .locator('[data-testid="mobile-email-input"][type="email"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: SMOKE_TIMEOUTS.QUICK });
  }
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

async function enterOtpCode(page: Page, code: string) {
  const flow = await getActiveNotificationsFlow(page);
  const otpStep = flow
    .locator('[data-testid="profile-mobile-notifications-step-otp"]')
    .first();
  const firstDigitInput = flow.getByLabel('Digit 1 of 6');

  // The email→OTP transition includes an OTP send (Resend) + write on a
  // cold ephemeral Neon branch; the first mobile run in CI regularly needs
  // longer than the standard visibility budget (3×20s timeouts observed),
  // and some runs push past 5× as Neon branch cold-start latency varies.
  await otpStep.waitFor({
    state: 'visible',
    timeout: SMOKE_TIMEOUTS.VISIBILITY * 5,
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

async function runEmailGoldenPath(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
  label: string
) {
  const runId = `${Date.now().toString(36)}-${label}`;
  const testEmail = buildTestEmail(runId);
  const creatorProfileId = await getCreatorProfileIdByUsername(
    TEST_PROFILES.DUALIPA
  );

  if (!creatorProfileId) {
    test.skip(true, `${TEST_PROFILES.DUALIPA} profile not seeded`);
    return;
  }

  await cleanupFanCaptureTestData({ creatorProfileId, email: testEmail });

  try {
    await setupProfileSubscribePage(page, viewport);
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
    await assertEmailCaptureComplete({ creatorProfileId, email: testEmail });
  } finally {
    await cleanupFanCaptureTestData({ creatorProfileId, email: testEmail });
  }
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

  for (const { label, width, height } of EMAIL_VIEWPORTS) {
    test(`${label}: email subscribe → OTP → audience row`, async ({ page }) => {
      await runEmailGoldenPath(page, { width, height }, label);
    });
  }

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
