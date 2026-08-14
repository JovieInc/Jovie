import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  buildProductionWaitlistCanaryEmail,
  PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
} from '@/lib/canaries/production-waitlist';
import { PRODUCTION_WAITLIST_CANARY_STORAGE_KEY } from '@/lib/canaries/production-waitlist-client';
import { waitForProductionSignupOtp } from './utils/production-signup-canary';
import {
  assertDeploymentStable,
  assertProductionWaitlistCanaryPreflight,
  assertRuntimeMatchesDeployment,
  buildProductionWaitlistCanaryReceipt,
  getReadyProductionDeployment,
  readDurableProductionWaitlistReceipt,
  validateProductionWaitlistCanaryConfig,
} from './utils/production-waitlist-canary';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Synthetic Monitoring - production waitlist', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SYNTHETIC_MODE !== 'true' ||
        process.env.E2E_PROD_WAITLIST_CANARY_ENABLED !== 'true',
      'Production waitlist canary requires both explicit synthetic gates.'
    );
  });

  test('retains one exact identity and proves durable suppressed traversal', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    validateProductionWaitlistCanaryConfig(process.env);

    const runId = process.env.SYNTHETIC_RUN_ID!;
    const email = buildProductionWaitlistCanaryEmail(
      process.env.E2E_PROD_SIGNUP_EMAIL_BASE!
    );
    const startedAt = new Date();
    const deploymentBefore = await getReadyProductionDeployment(process.env);
    await assertRuntimeMatchesDeployment(deploymentBefore);

    // Must pass before any identity or waitlist mutation. This proves the
    // deployed app agrees on the exact identity and fail-closed comms policy.
    await assertProductionWaitlistCanaryPreflight(process.env, email);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('[data-cta-sign-up="true"]').first()
    ).toBeVisible();
    await page.locator('[data-cta-sign-up="true"]').first().click();
    await page.waitForURL(/\/start(?:[/?#]|$)/, { timeout: 30_000 });
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.waitForURL(/\/signin(?:[/?#]|$)/, { timeout: 30_000 });

    await page.getByLabel('Email Address').fill(email);
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await expect(
      page.locator('[data-auth-email-code-step="code"]')
    ).toBeVisible({ timeout: 30_000 });

    const otp = await waitForProductionSignupOtp({
      email,
      env: process.env,
      startedAtMs: startedAt.getTime(),
    });
    await page.getByLabel('Digit 1 of 6').pressSequentially(otp);
    await page.waitForFunction(
      () => !['/signin', '/signup'].includes(window.location.pathname),
      undefined,
      { timeout: 45_000 }
    );

    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session');
      if (!response.ok) return null;
      return (await response.json()) as { user?: { id?: string } };
    });
    expect(session?.user?.id).toBeTruthy();

    const intake = await page.evaluate(
      async ({ canaryRunHeader, runId: browserRunId }) => {
        const response = await fetch('/api/onboarding/intake', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [canaryRunHeader]: browserRunId,
          },
          body: JSON.stringify({
            waitlist: {
              primaryGoal: null,
              primarySocialUrl:
                'https://example.com/jovie-production-waitlist-canary',
              spotifyUrl: null,
              spotifyArtistName: null,
              heardAbout: 'onboarding_chat',
              selectedPlan: 'free',
            },
            transcript: [
              {
                questionId: 'handle',
                prompt: 'Synthetic canary identifier',
                answer: 'jovie-production-waitlist-canary',
                skipped: false,
                timestamp: new Date().toISOString(),
              },
            ],
            metadata: {
              requestedHandle: 'jovie-production-waitlist-canary',
              currentWorkflow: 'Routine service check',
              biggestBlocker: 'n/a',
              launchGoal: 'Evaluate service health',
            },
          }),
        });
        return {
          statusCode: response.status,
          body: (await response.json()) as {
            success?: boolean;
            outcome?: string;
            status?: string;
            entryId?: string;
          },
        };
      },
      {
        canaryRunHeader: PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
        runId,
      }
    );
    expect(intake.statusCode).toBe(200);
    expect(intake.body.success).toBe(true);
    expect(intake.body.status).toBe('waitlisted');
    expect(['waitlisted_gate_on', 'already_waitlisted']).toContain(
      intake.body.outcome
    );
    expect(intake.body.entryId).toBeTruthy();

    await page.evaluate(
      ({ key, currentRunId }) =>
        globalThis.sessionStorage.setItem(key, currentRunId),
      { key: PRODUCTION_WAITLIST_CANARY_STORAGE_KEY, currentRunId: runId }
    );
    const analyticsReceiptResponse = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/canary/waitlist/receipt'
    );
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { level: 1, name: "You're on the list" })
    ).toBeVisible({ timeout: 30_000 });
    expect((await analyticsReceiptResponse).status()).toBe(200);

    const durableReceipt = await readDurableProductionWaitlistReceipt(
      process.env,
      { runId, entryId: intake.body.entryId! }
    );
    expect(durableReceipt.assertions.communications.emailJobCount).toBe(0);

    const deploymentAfter = await getReadyProductionDeployment(process.env);
    assertDeploymentStable(deploymentBefore, deploymentAfter);
    await assertRuntimeMatchesDeployment(deploymentAfter);

    const receipt = buildProductionWaitlistCanaryReceipt({
      runId,
      email,
      deployment: deploymentAfter,
      durableReceipt,
      startedAt,
      completedAt: new Date(),
    });
    const receiptPath = testInfo.outputPath(
      'production-waitlist-canary-receipt.json'
    );
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await testInfo.attach('production-waitlist-canary-receipt', {
      path: receiptPath,
      contentType: 'application/json',
    });
  });
});
