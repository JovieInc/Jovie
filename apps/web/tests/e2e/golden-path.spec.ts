import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

/**
 * Golden Path E2E Test - Critical User Journey
 *
 * This test guards the core user flow that generates revenue:
 * 1. User authentication with existing test user
 * 2. Dashboard access and navigation
 * 3. Public profile accessibility
 *
 * Critical Success Criteria:
 * - Uses existing test user (no new registrations)
 * - Uses data-test selectors, not screenshots
 * - Runs in both preview and production
 * - Alerts on failure via Slack
 * - Completes in <60 seconds
 */

test.describe('Golden Path - Complete User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Check if we have test user credentials
    const hasTestCredentials =
      process.env.E2E_CLERK_USER_USERNAME &&
      process.env.E2E_CLERK_USER_PASSWORD;

    if (!hasTestCredentials) {
      console.log(
        '⚠ Skipping golden path test - no test user credentials configured'
      );
      test.skip();
      return;
    }

    // Validate required environment variables
    const requiredEnvVars = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('mock') || value.includes('dummy')) {
        console.log(`⚠ Skipping test: ${key} is not properly configured`);
        test.skip();
        return;
      }
    }

    // Setup Clerk testing token
    await setupClerkTestingToken({ page });
  });

  test('Authenticated user can access dashboard and view profile', async ({
    page,
  }) => {
    test.setTimeout(60_000); // 60 seconds for auth operations

    // STEP 1: Sign in with test user
    await signInUser(page);

    // STEP 2: Should be redirected to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // STEP 3: Verify dashboard elements are visible
    await expect(page.locator('text=Dashboard')).toBeVisible();

    // STEP 4: Navigate to profile (if user has one)
    const profileLink = page
      .getByRole('link', { name: 'View profile' })
      .or(page.locator('text="Public Profile"'));
    if (await profileLink.isVisible()) {
      await profileLink.click();

      // Should be able to view the profile
      await expect(page).toHaveURL(/\/[a-zA-Z0-9-_]+$/, { timeout: 10000 });
    }
  });

  test('Golden path with listen mode', async ({ page }) => {
    test.setTimeout(45_000);

    // Navigate to existing profile in listen mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    await page.goto(`/${testProfile}?mode=listen`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Should show the listen mode interface
    await expect(page.locator('text=Choose a Service')).toBeVisible({
      timeout: 10000,
    });

    // Should show DSP options
    const spotifyButton = page.locator('text=Spotify');
    await expect(spotifyButton).toBeVisible();
  });

  test('Golden path with tip mode', async ({ page }) => {
    test.setTimeout(45_000);

    // Navigate to existing profile in tip mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    await page.goto(`/${testProfile}?mode=tip`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Should show the tip mode interface
    await expect(page.locator('text=Send a Tip')).toBeVisible({
      timeout: 10000,
    });

    // Should show tip options or payment form
    const tipContainer = page.locator(
      '[data-testid="tip-container"], .tip-form'
    );
    await expect(tipContainer).toBeVisible();
  });
});
