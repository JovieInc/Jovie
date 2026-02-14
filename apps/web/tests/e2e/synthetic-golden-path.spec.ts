import { expect, test } from '@playwright/test';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Synthetic Monitoring Golden Path Test
 *
 * This test is specifically designed for production synthetic monitoring:
 * - Uses throwaway accounts with auto-cleanup
 * - Runs every 5-10 minutes in production
 * - Alerts on failure via Slack
 * - Minimal assertions focused on critical functionality
 * - Handles production-specific edge cases
 */

test.describe('Synthetic Monitoring - Golden Path', () => {
  // Only run in synthetic monitoring mode
  test.beforeEach(async () => {
    if (process.env.E2E_SYNTHETIC_MODE !== 'true') {
      test.skip();
    }
  });

  test('Production golden path monitoring', async ({ page }) => {
    test.setTimeout(120_000); // 2 minutes for production environment

    // Generate unique throwaway account
    const timestamp = Date.now();
    const testEmail = `synthetic-${timestamp}@jovie-monitoring.test`;
    const testHandle = `synth${timestamp}`;

    console.log(
      `[Synthetic] Testing with: ${testEmail}, handle: ${testHandle}`
    );

    try {
      // CRITICAL PATH 1: Homepage loads
      console.log('[Synthetic] Step 1: Homepage load test');
      await page.goto('/', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Essential homepage elements
      await expect(page.locator('[data-test="signup-btn"]')).toBeVisible({
        timeout: 15000,
      });

      // CRITICAL PATH 2: Sign up flow initiation
      console.log('[Synthetic] Step 2: Sign up flow test');
      await page.locator('[data-test="signup-btn"]').click();
      await expect(page).toHaveURL(/sign-up/, { timeout: 20000 });

      // CRITICAL PATH 3: Clerk registration
      console.log('[Synthetic] Step 3: Clerk registration test');
      const emailInput = page
        .locator('input[name="emailAddress"], input[type="email"]')
        .first();
      await emailInput.waitFor({ state: 'visible', timeout: 15000 });
      await emailInput.fill(testEmail);

      const passwordInput = page
        .locator('input[name="password"], input[type="password"]')
        .first();
      await passwordInput.fill('SyntheticTest123!');

      // Handle both test and production Clerk flows
      const submitButton = page
        .locator(
          'button[type="submit"], button:has-text("Continue"), button:has-text("Sign up")'
        )
        .first();
      await submitButton.click();

      // Production environment might require email verification
      await page.waitForTimeout(3000);

      // Skip verification if in test mode, otherwise handle production flow
      if (process.env.E2E_ENVIRONMENT === 'production') {
        // In production, we might need to handle verification differently
        // This is a placeholder for production-specific verification handling
        try {
          const verifyButton = page.locator(
            'button:has-text("Verify"), button:has-text("Continue")'
          );
          if (await verifyButton.isVisible({ timeout: 5000 })) {
            await verifyButton.click();
          }
        } catch {
          console.log('[Synthetic] No verification step needed');
        }
      }

      // CRITICAL PATH 4: Onboarding flow
      console.log('[Synthetic] Step 4: Onboarding flow test');
      await expect(page).toHaveURL('/onboarding', { timeout: 45000 });

      const usernameInput = page.locator('[data-test="username-input"]');
      await expect(usernameInput).toBeVisible({ timeout: 15000 });

      await usernameInput.fill(testHandle);
      await page.waitForTimeout(2000); // Allow for validation

      const claimButton = page.locator('[data-test="claim-btn"]');
      await expect(claimButton).toBeEnabled({ timeout: 15000 });
      await claimButton.click();

      // CRITICAL PATH 5: Dashboard access
      console.log('[Synthetic] Step 5: Dashboard access test');
      await expect(page).toHaveURL('/app/dashboard', { timeout: 45000 });

      const dashboardWelcome = page.locator('[data-test="dashboard-welcome"]');
      await expect(dashboardWelcome).toBeVisible({ timeout: 15000 });

      // CRITICAL PATH 6: Public profile accessibility
      console.log('[Synthetic] Step 6: Public profile test');
      await page.goto(`/${testHandle}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      await expect(page).toHaveURL(`/${testHandle}`);
      const publicProfile = page.locator('[data-test="public-profile-root"]');
      await expect(publicProfile).toBeVisible({ timeout: 15000 });

      console.log('[Synthetic] ✅ All critical paths verified successfully');
    } catch (error) {
      console.error('[Synthetic] ❌ Critical path failure:', error);

      // Capture additional debug info for production failures
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unknown');

      console.error('[Synthetic] Debug info:', {
        currentUrl,
        pageTitle,
        testEmail,
        testHandle,
        environment: process.env.E2E_ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });

      // Re-throw to fail the test
      throw error;
    }
  });

  test('Critical page health checks', async ({ page }) => {
    test.setTimeout(60_000);

    const criticalPages = [
      { path: '/', name: 'Homepage' },
      { path: '/dualipa', name: 'Profile Page' },
      { path: '/dualipa?mode=listen', name: 'Listen Mode' },
      { path: '/dualipa?mode=tip', name: 'Tip Mode' },
      { path: '/sign-up', name: 'Sign Up' },
    ];

    for (const { path, name } of criticalPages) {
      console.log(`[Synthetic] Health check: ${name} (${path})`);

      await page.goto(path, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });

      // Basic health checks
      await expect(page).toHaveURL(
        new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );

      // Check for critical errors
      const criticalErrorSelectors = [
        'text="500"',
        'text="Internal Server Error"',
        'text="Something went wrong"',
        '[data-testid="error-boundary"]',
      ];

      for (const selector of criticalErrorSelectors) {
        await expect(page.locator(selector)).not.toBeVisible();
      }

      // Ensure page has loaded content
      await expect(page.locator('body')).not.toBeEmpty();

      console.log(`[Synthetic] ✅ ${name} health check passed`);
    }
  });

  test('Performance baseline check', async ({ page }) => {
    test.setTimeout(60_000);

    console.log('[Synthetic] Performance baseline check');

    const startTime = Date.now();

    await page.goto('/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const loadTime = Date.now() - startTime;

    // Performance thresholds (in milliseconds)
    const LOAD_TIME_THRESHOLD = 10000; // 10 seconds max for homepage

    console.log(`[Synthetic] Homepage load time: ${loadTime}ms`);

    if (loadTime > LOAD_TIME_THRESHOLD) {
      console.warn(
        `[Synthetic] ⚠️ Homepage load time (${loadTime}ms) exceeds threshold (${LOAD_TIME_THRESHOLD}ms)`
      );
      // Don't fail the test, but log for monitoring
    }

    // Check for performance-critical elements
    await expect(page.locator('[data-test="signup-btn"]')).toBeVisible({
      timeout: 5000,
    });

    console.log('[Synthetic] ✅ Performance check completed');
  });
});
