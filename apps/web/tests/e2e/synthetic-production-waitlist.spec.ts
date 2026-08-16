import { expect, test } from '@playwright/test';
import {
  buildProductionWaitlistCanaryEmail,
  hashProductionWaitlistCanaryEmail,
  PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
  parseProductionWaitlistCanaryRunId,
  productionWaitlistDurableReceiptSchema,
  productionWaitlistPreflightReceiptSchema,
} from '@/lib/canaries/production-waitlist';
import { PRODUCTION_WAITLIST_CANARY_STORAGE_KEY } from '@/lib/canaries/production-waitlist-client';
import { waitForProductionSignupOtp } from './utils/production-signup-canary';

test.use({ storageState: { cookies: [], origins: [] } });

const REQUIRED_ENV = [
  'BASE_URL',
  'E2E_ENVIRONMENT',
  'E2E_PROD_MAILBOX_PROVIDER',
  'E2E_PROD_OTP_CHECK_ORIGIN',
  'E2E_PROD_OTP_CHECK_TOKEN',
  'E2E_PROD_OTP_CHECK_URL',
  'E2E_PROD_SIGNUP_EMAIL_BASE',
  'PLAYWRIGHT_TEST_BASE_URL',
  'PRODUCTION_WAITLIST_CANARY_READ_TOKEN',
  'SYNTHETIC_RUN_ID',
] as const;

type CanaryEnv = NodeJS.ProcessEnv;

function validateConfig(env: CanaryEnv): void {
  const missing = REQUIRED_ENV.filter(key => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Production waitlist canary missing: ${missing.join(', ')}`
    );
  }
  if (env.E2E_ENVIRONMENT !== 'production') {
    throw new Error('E2E_ENVIRONMENT must be production');
  }
  if (env.E2E_PROD_MAILBOX_PROVIDER !== 'cloudflare-email-routing') {
    throw new Error(
      'Production waitlist canary requires Cloudflare Email Routing'
    );
  }
  for (const key of ['BASE_URL', 'PLAYWRIGHT_TEST_BASE_URL'] as const) {
    if (new URL(env[key]!).href !== 'https://jov.ie/') {
      throw new Error(`${key} must target exactly https://jov.ie`);
    }
  }
  const otpOrigin = new URL(env.E2E_PROD_OTP_CHECK_ORIGIN!);
  const otpUrl = new URL(env.E2E_PROD_OTP_CHECK_URL!);
  if (
    otpOrigin.protocol !== 'https:' ||
    otpOrigin.href !== `${otpOrigin.origin}/` ||
    otpUrl.origin !== otpOrigin.origin ||
    otpUrl.username ||
    otpUrl.password ||
    otpUrl.hash
  ) {
    throw new Error('OTP endpoint must use the configured exact HTTPS origin');
  }
  if ((env.PRODUCTION_WAITLIST_CANARY_READ_TOKEN?.length ?? 0) < 32) {
    throw new Error('Canary read token must be at least 32 characters');
  }
  buildProductionWaitlistCanaryEmail(env.E2E_PROD_SIGNUP_EMAIL_BASE!);
  parseProductionWaitlistCanaryRunId(env.SYNTHETIC_RUN_ID);
}

async function readReceipt(env: CanaryEnv, url: URL) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.PRODUCTION_WAITLIST_CANARY_READ_TOKEN}`,
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`Canary receipt read failed (${response.status})`);
  }
  return payload;
}

test.describe('Synthetic Monitoring - production waitlist', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SYNTHETIC_MODE !== 'true' ||
        process.env.E2E_PROD_WAITLIST_CANARY_ENABLED !== 'true',
      'Production waitlist canary requires both explicit synthetic gates.'
    );
  });

  test('retains one exact identity and proves suppressed waitlist traversal', async ({
    page,
  }) => {
    validateConfig(process.env);
    const runId = parseProductionWaitlistCanaryRunId(
      process.env.SYNTHETIC_RUN_ID
    )!;
    const email = buildProductionWaitlistCanaryEmail(
      process.env.E2E_PROD_SIGNUP_EMAIL_BASE!
    );
    const emailSha256 = hashProductionWaitlistCanaryEmail(email);
    const startedAt = new Date();
    const preflightUrl = new URL(
      '/api/canary/waitlist/receipt?mode=preflight',
      'https://jov.ie'
    );
    const preflight = productionWaitlistPreflightReceiptSchema.parse(
      await readReceipt(process.env, preflightUrl)
    );
    expect(preflight.emailSha256).toBe(emailSha256);

    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email Address').fill(email);
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await expect(
      page.locator('[data-auth-email-code-step="code"]')
    ).toBeVisible();
    const otp = await waitForProductionSignupOtp({
      email,
      env: process.env,
      startedAtMs: startedAt.getTime(),
    });
    await page.getByLabel('Digit 1 of 6').pressSequentially(otp);
    await page.waitForFunction(
      () => !['/signin', '/signup'].includes(window.location.pathname)
    );

    const intake = await page.evaluate(
      async ({ header, currentRunId }) => {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [header]: currentRunId,
          },
          body: JSON.stringify({
            primaryGoal: null,
            primarySocialUrl:
              'https://example.com/jovie-production-waitlist-canary',
            spotifyUrl: null,
            spotifyArtistName: null,
            heardAbout: 'production_waitlist_canary',
            selectedPlan: 'free',
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { header: PRODUCTION_WAITLIST_CANARY_RUN_HEADER, currentRunId: runId }
    );
    expect(intake.status).toBe(200);
    expect(intake.body).toMatchObject({ success: true, status: 'waitlisted' });
    expect(['waitlisted_gate_on', 'already_waitlisted']).toContain(
      intake.body.outcome
    );
    expect(intake.body.entryId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, value),
      { key: PRODUCTION_WAITLIST_CANARY_STORAGE_KEY, value: runId }
    );
    const analytics = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/canary/waitlist/receipt'
    );
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { level: 1, name: "You're on the list" })
    ).toBeVisible();
    expect((await analytics).status()).toBe(200);

    const durableUrl = new URL(
      '/api/canary/waitlist/receipt',
      'https://jov.ie'
    );
    durableUrl.searchParams.set('run_id', runId);
    durableUrl.searchParams.set('entry_id', intake.body.entryId);
    const durable = productionWaitlistDurableReceiptSchema.parse(
      await readReceipt(process.env, durableUrl)
    );
    expect(durable).toMatchObject({
      runId,
      emailSha256,
      entryId: intake.body.entryId,
    });
    expect(durable.assertions.communications.emailJobCount).toBe(0);
  });
});
