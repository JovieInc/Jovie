import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

/**
 * E2E Test: Onboarding Happy Path
 *
 * This test verifies the complete onboarding flow:
 * 1. Programmatic sign-in via Clerk
 * 2. Navigate to /dashboard
 * 3. Get redirected to /onboarding
 * 4. Claim an available handle
 * 5. Submit and end up on /dashboard
 *
 * Requirements:
 * - E2E_ONBOARDING_FULL=1 environment variable
 * - Real Clerk and Supabase environment variables
 * - Test duration must be < 60 seconds
 */

test.describe('Onboarding Happy Path', () => {
  // Only run when E2E_ONBOARDING_FULL=1 and environment is properly configured
  const runFull = process.env.E2E_ONBOARDING_FULL === '1';

  test.beforeEach(async () => {
    if (!runFull) {
      test.skip();
    }

    // Validate required environment variables
    const requiredEnvVars = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };

    // Skip if any required env var is missing or contains dummy values
    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('dummy')) {
        console.log(`Skipping test: ${key} is not properly configured`);
        test.skip();
      }
    }
  });

  test('programmatic sign-in → onboarding → dashboard', async ({ page }) => {
    // Set timeout to 60 seconds as per requirement
    test.setTimeout(60_000);

    // Setup Clerk testing token for programmatic authentication
    await setupClerkTestingToken({ page });

    // Step 1: Load homepage to initialize ClerkProvider
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Clerk to be ready
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk && window.Clerk.isReady();
      },
      { timeout: 10_000 }
    );

    // Step 2: Programmatically sign in using Clerk's test mode
    const testEmail =
      process.env.E2E_TEST_EMAIL || `playwright+${Date.now()}@example.com`;
    const testPassword = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          // Try to sign in first (in case user already exists)
          const signIn = await clerk.signIn?.create({
            identifier: email,
            password: password,
          });

          // If sign-in requires further steps, complete them
          if (signIn?.status === 'needs_first_factor') {
            await clerk.signIn?.attemptFirstFactor({
              strategy: 'password',
              password: password,
            });
          }

          // Set the session as active
          await clerk.setActive({
            session:
              signIn?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        } catch (signInError) {
          // If sign-in fails, try to create a new user
          console.log('Sign-in failed, attempting sign-up:', signInError);

          const signUp = await clerk.signUp?.create({
            emailAddress: email,
            password: password,
          });

          // Complete sign-up and set session as active
          await clerk.setActive({
            session:
              signUp?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        }
      },
      { email: testEmail, password: testPassword }
    );

    // Verify authentication completed
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk?.user?.id;
      },
      { timeout: 10_000 }
    );

    // Step 3: Navigate to dashboard - should redirect to onboarding for new users
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Wait for redirect to onboarding page
    await page.waitForURL('**/onboarding', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });

    // Step 4: Fill the onboarding form with a unique handle
    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 5_000 });

    // Generate unique handle with timestamp
    const uniqueHandle = `e2e-${Date.now().toString(36)}`;
    await handleInput.fill(uniqueHandle);

    // Wait for handle availability check to complete (green checkmark indicator)
    await expect(
      page.locator('.bg-green-500.rounded-full').first()
    ).toBeVisible({
      timeout: 10_000,
    });

    // Ensure submit button is enabled after validation
    const submitButton = page.getByRole('button', { name: 'Create Profile' });
    await expect(submitButton).toBeVisible();

    // Use expect.poll for deterministic button state checking
    await expect
      .poll(
        async () => {
          const isEnabled = await submitButton.isEnabled();
          return isEnabled;
        },
        {
          timeout: 15_000,
          intervals: [500, 750, 1000],
        }
      )
      .toBe(true);

    // Step 5: Submit form and wait for redirect to dashboard overview
    await Promise.all([
      page.waitForURL('**/dashboard/overview', {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      }),
      submitButton.click(),
    ]);

    // Step 6: Verify successful dashboard load
    // Check for dashboard-specific elements
    const dashboardHeading = page.locator('h1, h2').filter({
      hasText: /dashboard|overview|welcome|your profile/i,
    });
    await expect(dashboardHeading.first()).toBeVisible({
      timeout: 5_000,
    });

    // Verify navigation links are present
    const navLinks = page.getByRole('link', {
      name: /profile|settings|links|analytics/i,
    });
    await expect(navLinks.first()).toBeVisible({
      timeout: 5_000,
    });

    // Verify the user's handle appears somewhere on the page
    const handleText = page.locator(`text=/${uniqueHandle}/i`);
    await expect(handleText.first()).toBeVisible({
      timeout: 5_000,
    });

    // Verify we can navigate to the Links page from the dashboard nav
    const linksNav = page.getByRole('link', { name: 'Links' });
    await expect(linksNav).toBeVisible({ timeout: 5_000 });

    await Promise.all([
      page.waitForURL('**/dashboard/links', {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      }),
      linksNav.click(),
    ]);

    await expect(
      page
        .locator('h1, h2')
        .filter({ hasText: /manage links/i })
        .first()
    ).toBeVisible({ timeout: 5_000 });

    // Optional: Verify we can access the public profile page with the new handle
    await page.goto(`/${uniqueHandle}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/${uniqueHandle}$`));

    // Verify profile page loaded successfully
    const profileName = page
      .locator('h1, h2')
      .filter({ hasText: uniqueHandle });
    await expect(profileName.first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('authenticated user with existing profile goes directly to dashboard', async ({
    page,
  }) => {
    // This test verifies that users who already completed onboarding
    // are not redirected to onboarding again
    test.setTimeout(30_000);

    // Setup Clerk testing token
    await setupClerkTestingToken({ page });

    // Load homepage to initialize Clerk
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Clerk initialization
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk && window.Clerk.isReady();
      },
      { timeout: 10_000 }
    );

    // Sign in with a test user that has already completed onboarding
    // This assumes E2E_EXISTING_USER_EMAIL and E2E_EXISTING_USER_PASSWORD are set
    const existingEmail = process.env.E2E_EXISTING_USER_EMAIL;
    const existingPassword = process.env.E2E_EXISTING_USER_PASSWORD;

    if (!existingEmail || !existingPassword) {
      test.skip();
      return;
    }

    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        const signIn = await clerk.signIn?.create({
          identifier: email,
          password: password,
        });

        if (signIn?.status === 'needs_first_factor') {
          await clerk.signIn?.attemptFirstFactor({
            strategy: 'password',
            password: password,
          });
        }

        await clerk.setActive({
          session:
            signIn?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      },
      { email: existingEmail, password: existingPassword }
    );

    // Verify authentication
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk?.user?.id;
      },
      { timeout: 10_000 }
    );

    // Navigate to dashboard - should NOT redirect to onboarding
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Verify we stay on dashboard (no redirect to onboarding)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

    // Verify dashboard loaded
    const dashboardElement = page.locator('h1, h2').filter({
      hasText: /dashboard|overview|your profile/i,
    });
    await expect(dashboardElement.first()).toBeVisible({ timeout: 5_000 });
  });
});
