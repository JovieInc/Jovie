import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { assertFastPageLoad } from './utils/performance-assertions';
import {
  measurePageLoad,
  PERFORMANCE_BUDGETS,
} from './utils/performance-test-utils';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

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
      DATABASE_URL: process.env.DATABASE_URL,
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
  }, testInfo) => {
    test.setTimeout(60_000); // 60 seconds for auth operations

    // STEP 1: Sign in with test user
    await signInUser(page);

    // STEP 2: Should be redirected to dashboard
    await expect(page).toHaveURL(/dashboard/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // STEP 3: Measure dashboard load performance
    const dashboardPerf = await measurePageLoad(page);
    await testInfo.attach('dashboard-load-time', {
      body: `${dashboardPerf.loadTime.toFixed(0)}ms (DOM: ${dashboardPerf.domContentLoaded.toFixed(0)}ms)`,
      contentType: 'text/plain',
    });
    await assertFastPageLoad(
      dashboardPerf.domContentLoaded,
      PERFORMANCE_BUDGETS.dashboard.domContentLoaded,
      testInfo
    );

    console.log(
      `📊 Dashboard Performance: DOM Content Loaded in ${dashboardPerf.domContentLoaded.toFixed(0)}ms`
    );

    // STEP 4: Verify dashboard elements are visible (use more reliable selectors)
    await expect(
      page.locator('h1, h2, [data-testid="dashboard-heading"]').filter({
        hasText: /dashboard|overview|welcome/i,
      })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // STEP 5: Navigate to profile (if user has one)
    const profileLink = page
      .getByRole('link', { name: /view profile|public profile/i })
      .or(page.locator('[data-testid="profile-link"]'));
    const isProfileLinkVisible = await profileLink
      .isVisible()
      .catch(() => false);
    if (isProfileLinkVisible) {
      await profileLink.click();

      // Should be able to view the profile
      await expect(page).toHaveURL(/\/[a-zA-Z0-9-_]+$/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    }
  });

  test('Golden path with listen mode', async ({ page }) => {
    test.setTimeout(45_000);

    // Navigate to existing profile in listen mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';

    // Use domcontentloaded + hydration instead of networkidle for stability
    await page.goto(`/${testProfile}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    // Should show the listen mode interface (use case-insensitive matching)
    await expect(
      page.locator('[data-testid="listen-mode"], h1, h2').filter({
        hasText: /choose a service|listen|streaming/i,
      })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Should show DSP options (Spotify button)
    const spotifyButton = page.locator(
      '[data-testid="spotify-link"], button:has-text("Spotify"), a:has-text("Spotify")'
    );
    await expect(spotifyButton.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('Golden path with tip mode', async ({ page }) => {
    test.setTimeout(45_000);

    // Navigate to existing profile in tip mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';

    // Use domcontentloaded + hydration instead of networkidle for stability
    await page.goto(`/${testProfile}?mode=tip`, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    // Should show the tip mode interface (use case-insensitive matching)
    await expect(
      page.locator('[data-testid="tip-mode"], h1, h2').filter({
        hasText: /send a tip|tip|support/i,
      })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Should show tip options or payment form (use fallback selectors)
    const tipContainer = page.locator(
      '[data-testid="tip-container"], [data-test="tip-selector"], .tip-form, form'
    );
    await expect(tipContainer.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
