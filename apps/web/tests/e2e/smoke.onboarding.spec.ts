import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, smokeNavigate } from './utils/smoke-test-utils';

/**
 * Onboarding smoke tests
 * Minimal smoke: unauthenticated users should be redirected to sign-in.
 * This is deterministic and requires no external inbox/service.
 */
test.describe('Onboarding smoke @smoke', () => {
  test('unauthenticated /app/dashboard redirects to /sign-in @smoke', async ({
    page,
  }) => {
    const res = await smokeNavigate(page, '/app/dashboard');

    // Should land on sign-in
    await expect(page).toHaveURL(/\/sign-in/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    expect(res?.ok(), 'Expected the sign-in page to respond OK').toBeTruthy();
  });

  // Optional: full flow when properly configured
  // Run only when E2E_ONBOARDING_FULL=1 and environment is set (Clerk + DATABASE_URL)
  const runFull = process.env.E2E_ONBOARDING_FULL === '1';
  (runFull ? test : test.skip)(
    'programmatic sign-in → onboarding → dashboard',
    async ({ page }) => {
      test.setTimeout(60_000);

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

      // Setup Clerk testing token for programmatic authentication
      await setupClerkTestingToken({ page });

      // 1) Load an unprotected page that initializes Clerk
      await smokeNavigate(page, '/');

      // Wait for Clerk to be ready
      await page.waitForFunction(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clerkWindow = window as any;
          return clerkWindow.Clerk && clerkWindow.Clerk.isReady();
        },
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );

      // 2) Programmatically sign in using Clerk's test mode
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
          // If user already exists, try to sign in
          await clerk.signIn?.create({
            identifier: email,
            password: 'TestPassword123!',
          });
          await clerk.setActive({
            session: clerk.client?.lastActiveSessionId || null,
          });
        }
      }, testEmail);

      // Wait for authentication to complete
      await page.waitForFunction(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).Clerk?.user;
        },
        { timeout: SMOKE_TIMEOUTS.VISIBILITY }
      );

      // 3) Navigate to dashboard — app should redirect to onboarding if needed
      await smokeNavigate(page, '/app/dashboard');

      await page.waitForURL('**/onboarding', {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
        waitUntil: 'domcontentloaded',
      });

      // 4) Fill the onboarding form (handle)
      const handleInput = page.getByLabel('Enter your desired handle');
      await expect(handleInput).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });

      const uniqueHandle = `e2e-${Date.now().toString(36)}`;
      await handleInput.fill(uniqueHandle);

      // Wait for the availability check indicator
      await expect(page.locator('.bg-green-500.rounded-full')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Wait for submit button to be enabled
      const submit = page.getByRole('button', { name: 'Create Profile' });
      await expect(submit).toBeVisible();

      await expect
        .poll(
          async () => {
            const isDisabled = await submit.isDisabled();
            return !isDisabled;
          },
          {
            timeout: SMOKE_TIMEOUTS.NAVIGATION,
            intervals: [500, 750, 1000],
          }
        )
        .toBe(true);

      // 5) Submit and expect redirect to dashboard overview
      await submit.click();

      await page.waitForURL('**/app/dashboard/overview', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });

      // 6) Verify dashboard UI loaded
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
    }
  );
});
