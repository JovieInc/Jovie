import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  withRetry,
} from '../utils/smoke-test-utils';

/**
 * Comprehensive Onboarding Flow Tests - Nightly
 *
 * Full programmatic sign-in and onboarding flow tests that require
 * database access and Clerk authentication. Too slow for smoke tests.
 *
 * @nightly
 */
test.describe('Full onboarding flow @nightly', () => {
  test('programmatic sign-in → onboarding → dashboard', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const { getContext, cleanup } = setupPageMonitoring(page);

    // Skip if env not properly configured
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
    const sk = process.env.CLERK_SECRET_KEY || '';
    const dbUrl = process.env.DATABASE_URL || '';
    if (
      !pk ||
      !sk ||
      !dbUrl ||
      pk.includes('dummy') ||
      sk.includes('dummy') ||
      dbUrl.includes('dummy')
    ) {
      test.skip();
    }

    try {
      await setupClerkTestingToken({ page });

      await smokeNavigate(page, '/');

      await withRetry(
        async () => {
          await page.waitForFunction(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const clerkWindow = window as any;
              return clerkWindow.Clerk && clerkWindow.Clerk.isReady();
            },
            { timeout: SMOKE_TIMEOUTS.VISIBILITY }
          );
        },
        { retries: 2 }
      );

      const testEmail =
        process.env.E2E_TEST_EMAIL || `playwright+${Date.now()}@example.com`;

      await page.evaluate(async email => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          await clerk.signUp?.create({
            emailAddress: email,
            password: 'TestPassword123!',
          });
          await clerk.setActive({
            session: clerk.client?.lastActiveSessionId || null,
          });
        } catch {
          await clerk.signIn?.create({
            identifier: email,
            password: 'TestPassword123!',
          });
          await clerk.setActive({
            session: clerk.client?.lastActiveSessionId || null,
          });
        }
      }, testEmail);

      await withRetry(
        async () => {
          await page.waitForFunction(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (window as any).Clerk?.user;
            },
            { timeout: SMOKE_TIMEOUTS.VISIBILITY }
          );
        },
        { retries: 2 }
      );

      await smokeNavigate(page, '/app/dashboard');

      await page.waitForURL('**/onboarding', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });

      const handleInput = page.getByLabel('Enter your desired handle');
      await expect(handleInput).toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      const uniqueHandle = `e2e-${Date.now().toString(36)}`;
      await handleInput.fill(uniqueHandle);

      const availabilityIndicator = page.locator(
        '[data-testid="handle-available"], [aria-label*="available"], .text-green-500, .bg-green-500'
      );

      await expect(availabilityIndicator.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const submit = page.getByRole('button', { name: 'Create Profile' });
      await expect(submit).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });

      await expect
        .poll(
          async () => {
            const isDisabled = await submit.isDisabled();
            return !isDisabled;
          },
          {
            timeout: SMOKE_TIMEOUTS.NAVIGATION,
            intervals: [500, 750, 1000],
            message: 'Create Profile button should become enabled',
          }
        )
        .toBe(true);

      await submit.click();

      await page.waitForURL('**/app/dashboard', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page
          .locator('h1, h2')
          .filter({ hasText: /dashboard|overview|welcome/i })
          .first()
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });

      await expect(
        page.getByRole('link', { name: /profile|settings|links/i }).first()
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });

      await expect(page.locator(`text=/${uniqueHandle}/i`).first()).toBeVisible(
        {
          timeout: SMOKE_TIMEOUTS.QUICK,
        }
      );

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
