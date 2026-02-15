import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

/**
 * E2E Test: Onboarding Happy Path
 *
 * This test verifies the complete onboarding flow:
 * 1. Programmatic sign-in via Clerk
 * 2. Navigate to /app/dashboard
 * 3. Get redirected to /onboarding
 * 4. Claim an available handle
 * 5. Submit and end up on /app/dashboard
 *
 * Requirements:
 * - E2E_ONBOARDING_FULL=1 environment variable
 * - Real Clerk environment variables and DATABASE_URL
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
      DATABASE_URL: process.env.DATABASE_URL,
    };

    // Skip if any required env var is missing or contains dummy values
    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('dummy')) {
        console.log(`Skipping test: ${key} is not properly configured`);
        test.skip();
      }
    }
  });

  test('programmatic session → onboarding (handle → done) → dashboard', async ({
    page,
  }) => {
    // Set timeout to 60 seconds as per requirement
    test.setTimeout(60_000);

    // Setup Clerk testing token for programmatic authentication (bypasses bot protection)
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

    // Step 2: Create or reuse a test user session in Clerk test mode.
    // In test mode, Clerk allows creating users/sessions without real OTP/password flows.
    const testEmail =
      process.env.E2E_TEST_EMAIL ||
      `playwright+${Date.now().toString(36)}@example.com`;

    await createOrReuseTestUserSession(page, testEmail);

    // Verify authentication completed
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk?.user?.id;
      },
      { timeout: 10_000 }
    );

    // Step 3: Navigate to dashboard - should redirect to onboarding for new users
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

    // Wait for redirect to onboarding page
    await page.waitForURL('**/onboarding', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });

    // Step 4: Handle step - claim an available handle
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

    // Step 5: Submit form and wait for redirect to dashboard
    await Promise.all([
      page.waitForURL('**/app/dashboard', {
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

    // Verify we can navigate to the Profile page from the dashboard nav
    const profileNav = page.getByRole('link', { name: 'Profile' });
    await expect(profileNav).toBeVisible({ timeout: 5_000 });

    await Promise.all([
      page.waitForURL('**/app/dashboard/profile', {
        timeout: 10_000,
        waitUntil: 'domcontentloaded',
      }),
      profileNav.click(),
    ]);

    await expect(
      page
        .locator('h1, h2')
        .filter({ hasText: /profile/i })
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

    // Sign in with a test user that has already completed onboarding.
    // We rely on backend data seeding so this user is treated as fully onboarded.
    const existingEmail =
      process.env.E2E_EXISTING_USER_EMAIL || 'existing-onboarded@example.com';

    await createOrReuseTestUserSession(page, existingEmail);

    // Verify authentication
    await page.waitForFunction(
      () => {
        // @ts-ignore
        return window.Clerk?.user?.id;
      },
      { timeout: 10_000 }
    );

    // Navigate to dashboard - should NOT redirect to onboarding
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

    // Verify we stay on dashboard (no redirect to onboarding)
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 5_000 });

    // Verify dashboard loaded
    const dashboardElement = page.locator('h1, h2').filter({
      hasText: /dashboard|overview|your profile/i,
    });
    await expect(dashboardElement.first()).toBeVisible({ timeout: 5_000 });
  });
});
