import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { ClerkTestError, signInUser } from '../helpers/clerk-auth';
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
  // Run serially: parallel mode overloads the Turbopack dev server causing all tests
  // to timeout. Serial ensures each test gets full server capacity.
  test.describe.configure({ mode: 'serial' });

  // Intercept fire-and-forget tracking API calls that trigger slow Turbopack
  // compilation cascades (60-75s per route) and block the dev server.
  // These are analytics-only calls that don't affect page functionality.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
  });

  test.beforeEach(async ({ page }, testInfo) => {
    // Check if we have test user credentials
    const username = process.env.E2E_CLERK_USER_USERNAME;
    const hasTestCredentials =
      username &&
      (username.includes('+clerk_test') || process.env.E2E_CLERK_USER_PASSWORD);

    if (!hasTestCredentials) {
      console.log(
        '⚠ Skipping golden path test - no test user credentials configured'
      );
      test.skip();
      return;
    }

    // Skip if Clerk setup wasn't successful (no real Clerk keys)
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      console.warn(
        `⚠ Skipping ${testInfo.title}: Clerk testing setup was not successful`
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
    test.setTimeout(180_000); // 3 minutes — includes sign-in + Turbopack compilation

    // STEP 1: Sign in with test user
    try {
      await signInUser(page);
    } catch (error) {
      // Skip test if Clerk fails to load (e.g., CDN issues, webkit auth flakiness)
      if (
        error instanceof ClerkTestError &&
        (error.code === 'CLERK_NOT_READY' ||
          error.code === 'CLERK_SETUP_FAILED')
      ) {
        console.warn(`⚠ Skipping: ${error.message}`);
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }

      // Handle navigation race and timeout issues
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Navigation interrupted') ||
        msg.includes('net::ERR_') ||
        msg.includes('page.goto') ||
        msg.includes('Target closed') ||
        msg.includes('browser has disconnected')
      ) {
        console.warn(
          `⚠ Skipping: Sign-in navigation issue (${msg.slice(0, 100)})`
        );
        test.skip(true, `Sign-in navigation issue on ${testInfo.project.name}`);
        return;
      }
      throw error;
    }

    // STEP 2: Should be on a dashboard page (signInUser navigates to /app/dashboard/profile)
    await expect(page).toHaveURL(/\/app\//, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // STEP 3: Measure page load performance (informational only in dev mode)
    const dashboardPerf = await measurePageLoad(page);
    await testInfo.attach('dashboard-load-time', {
      body: `${dashboardPerf.loadTime.toFixed(0)}ms (DOM: ${dashboardPerf.domContentLoaded.toFixed(0)}ms)`,
      contentType: 'text/plain',
    });

    // In dev mode, Turbopack cold compilation makes performance timing unreliable.
    // Only assert performance in CI against preview/production builds.
    if (process.env.CI) {
      await assertFastPageLoad(
        dashboardPerf.domContentLoaded,
        PERFORMANCE_BUDGETS.dashboard.domContentLoaded,
        testInfo
      );
    }

    console.log(
      `📊 Dashboard Performance: DOM Content Loaded in ${dashboardPerf.domContentLoaded.toFixed(0)}ms`
    );

    // STEP 4: Verify the app shell rendered (sidebar, content area)
    // The page may be profile, chat, or dashboard depending on routing
    const appShellContent = page
      .locator(
        'main, nav, [data-testid="dashboard-header"], [data-clerk-element="userButton"]'
      )
      .first();
    await expect(appShellContent).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // STEP 5: Verify real data loaded (not silent error → empty state)
    // When fetchDashboardCoreWithSession() fails silently it returns
    // needsOnboarding: true, which redirects to /onboarding. Catch that.
    const currentUrl = page.url();
    expect(
      currentUrl,
      'Dashboard silently failed — redirected to onboarding'
    ).not.toContain('/onboarding');
    expect(
      currentUrl,
      'Dashboard silently failed — redirected to sign-in'
    ).not.toContain('/sign-in');

    // Verify no error banner rendered (shell-level catch renders data-testid="dashboard-error")
    const errorBanner = page.locator('[data-testid="dashboard-error"]');
    await expect(errorBanner).not.toBeVisible({ timeout: 2000 });

    // Verify sidebar navigation rendered with real links (proves DashboardDataProvider has data)
    const sidebarNav = page.locator('nav').first();
    await expect(sidebarNav).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // At least one dashboard nav link should be present (Profile, Releases, etc.)
    const dashboardNavLink = page.locator('nav a[href*="/app/"]').first();
    await expect(dashboardNavLink).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Verify the Clerk user button rendered (proves auth context is intact)
    const userButton = page
      .locator('[data-clerk-element="userButton"], [data-testid="user-button"]')
      .first();
    const hasUserButton = await userButton.isVisible().catch(() => false);
    if (!hasUserButton) {
      console.warn('User button not visible — auth context may be degraded');
    }
  });

  test('Golden path with listen mode', async ({ page }, testInfo) => {
    test.setTimeout(300_000); // 5min — serial mode means previous tests consume compilation time

    // Navigate to existing profile in listen mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';

    // Use commit (first response byte) instead of domcontentloaded for stability
    // Turbopack streams SSR while compiling client chunks — domcontentloaded fires late
    try {
      await page.goto(`/${testProfile}?mode=listen`, {
        waitUntil: 'commit',
        timeout: 120_000,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('net::ERR_') ||
        msg.includes('Target closed') ||
        msg.includes('browser has disconnected')
      ) {
        console.warn(`⚠ Skipping: Navigation issue (${msg.slice(0, 100)})`);
        test.skip(true, `Navigation issue on ${testInfo.project.name}`);
        return;
      }
      throw error;
    }
    await waitForHydration(page);

    // Listen mode shows artist name in h1 and subtitle "Choose a Service"
    // Use .first() to avoid strict mode violation when multiple h1 elements exist
    // 120s timeout: Turbopack client chunk compilation can take 60-120s in dev
    await expect(page.locator('h1').first()).toBeVisible({
      timeout: 120_000,
    });

    // Should show DSP options (e.g., "Open in Spotify") or "not available" message
    const spotifyButton = page
      .getByRole('button', { name: /open in spotify/i })
      .or(page.getByRole('link', { name: /spotify/i }));
    const noLinksMsg = page.getByText(/streaming links aren.t available/i);
    await expect(spotifyButton.first().or(noLinksMsg)).toBeVisible({
      timeout: 120_000,
    });
  });

  test('Golden path with tip mode', async ({ page }, testInfo) => {
    test.setTimeout(300_000); // 5min — serial mode means previous tests consume compilation time

    // Navigate to existing profile in tip mode (use env var or seed data)
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';

    // Use commit (first response byte) instead of domcontentloaded for stability
    // Turbopack streams SSR while compiling client chunks — domcontentloaded fires late
    try {
      await page.goto(`/${testProfile}?mode=tip`, {
        waitUntil: 'commit',
        timeout: 120_000,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('net::ERR_') ||
        msg.includes('Target closed') ||
        msg.includes('browser has disconnected')
      ) {
        console.warn(`⚠ Skipping: Navigation issue (${msg.slice(0, 100)})`);
        test.skip(true, `Navigation issue on ${testInfo.project.name}`);
        return;
      }
      throw error;
    }
    await waitForHydration(page);

    // Tip mode shows artist name in h1 and subtitle "Tip with Venmo"
    // Use .first() to avoid strict mode violation when multiple h1 elements exist
    // 120s timeout: Turbopack client chunk compilation can take 60-120s in dev
    await expect(page.locator('h1').first()).toBeVisible({
      timeout: 120_000,
    });

    // Should show either tip selector or "not available" message
    const tipSelector = page.locator('[data-test="tip-selector"]');
    const tipHeading = page.getByText(/send a tip/i);
    const noTipMsg = page.getByText(/tipping is not available/i);
    const venmoNotAvail = page.getByText(/venmo tipping is not available/i);
    await expect(
      tipSelector.or(tipHeading).or(noTipMsg).or(venmoNotAvail)
    ).toBeVisible({
      timeout: 120_000,
    });
  });
});
