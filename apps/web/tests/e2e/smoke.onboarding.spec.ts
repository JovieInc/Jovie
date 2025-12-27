import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

// Minimal onboarding smoke: unauthenticated users should be redirected to sign-in
// This is deterministic and requires no external inbox/service.

test.describe('Onboarding smoke', () => {
  test('unauthenticated /app/dashboard redirects to /sign-in', async ({
    page,
  }) => {
    const res = await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
    });
    // Should land on sign-in
    await expect(page).toHaveURL(/\/sign-in/);
    expect(res?.ok(), 'Expected the sign-in page to respond OK').toBeTruthy();
  });

  // Optional: full flow when properly configured
  // Run only when E2E_ONBOARDING_FULL=1 and environment is set (Clerk + DATABASE_URL)
  const runFull = process.env.E2E_ONBOARDING_FULL === '1';
  (runFull ? test : test.skip)(
    'programmatic sign-in → onboarding → dashboard',
    async ({ page }) => {
      test.setTimeout(60_000);

      // Skip if env not properly configured (local defaults from global-setup)
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
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Wait for Clerk to be ready
      await page.waitForFunction(
        () => {
          // @ts-expect-error
          return window.Clerk && window.Clerk.isReady();
        },
        { timeout: 10_000 }
      );

      // 2) Programmatically sign in using Clerk's test mode
      // This creates a test user and signs them in
      const testEmail =
        process.env.E2E_TEST_EMAIL || `playwright+${Date.now()}@example.com`;

      // Use Clerk's client-side API to sign in programmatically
      await page.evaluate(async email => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          // Create a test user session
          await clerk.signUp?.create({
            emailAddress: email,
            password: 'TestPassword123!',
          });

          // Complete the sign-up flow
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
          // @ts-expect-error
          return window.Clerk?.user;
        },
        { timeout: 10_000 }
      );

      // 3) Navigate to dashboard — app should redirect to onboarding if needed
      await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

      // Use waitForURL for deterministic waiting
      await page.waitForURL('**/onboarding', {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      });

      // 4) Fill the onboarding form (handle)
      const handleInput = page.getByLabel('Enter your desired handle');
      await expect(handleInput).toBeVisible({ timeout: 5_000 });

      const uniqueHandle = `e2e-${Date.now().toString(36)}`;
      await handleInput.fill(uniqueHandle);

      // Wait for the availability check indicator (green checkmark)
      // Based on the OnboardingForm component, it shows a green circle with checkmark
      await expect(page.locator('.bg-green-500.rounded-full')).toBeVisible({
        timeout: 10_000,
      });

      // Wait for submit button to be enabled
      const submit = page.getByRole('button', { name: 'Create Profile' });
      await expect(submit).toBeVisible();

      // Use expect.poll for deterministic waiting on button state
      await expect
        .poll(
          async () => {
            const isDisabled = await submit.isDisabled();
            return !isDisabled;
          },
          {
            timeout: 15_000,
            intervals: [500, 750, 1000],
          }
        )
        .toBe(true);

      // 5) Submit and expect redirect to dashboard overview
      await submit.click();

      // Wait for URL change to dashboard overview
      await page.waitForURL('**/app/dashboard/overview', {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      });

      // 6) Verify dashboard UI loaded
      // Check for dashboard-specific elements
      await expect(
        page
          .locator('h1, h2')
          .filter({ hasText: /dashboard|overview|welcome/i })
          .first()
      ).toBeVisible({ timeout: 5_000 });

      // Check for navigation elements that indicate successful dashboard load
      await expect(
        page.getByRole('link', { name: /profile|settings|links/i }).first()
      ).toBeVisible({ timeout: 5_000 });

      // Verify the user's handle is displayed somewhere (profile link, header, etc.)
      await expect(page.locator(`text=/${uniqueHandle}/i`).first()).toBeVisible(
        { timeout: 5_000 }
      );
    }
  );
});
