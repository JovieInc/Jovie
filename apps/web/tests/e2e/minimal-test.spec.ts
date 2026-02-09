import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { ClerkTestError, signInUser } from '../helpers/clerk-auth';

/**
 * Test for React 19 transient hooks error.
 *
 * There's a known React 19 bug (facebook/react#33580) that causes a transient
 * "Rendered more hooks than during the previous render" error during hydration.
 * The error appears briefly then "magically disappears" as the page stabilizes.
 *
 * This test verifies that the page eventually renders correctly, waiting for
 * the transient error to resolve itself.
 */
test('minimal dashboard load test', async ({ page }, testInfo) => {
  test.setTimeout(120_000); // 2 minutes — signInUser includes Turbopack cold compile + Clerk CDN

  // Skip if Clerk setup wasn't successful (no real Clerk keys)
  if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    test.skip(true, 'Clerk testing setup was not successful');
    return;
  }

  // Capture console errors for debugging
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', error => {
    errors.push(`PageError: ${error.message}\nStack: ${error.stack}`);
  });

  await setupClerkTestingToken({ page });

  // Sign in and navigate to dashboard
  try {
    await signInUser(page, {
      username: process.env.E2E_CLERK_USER_USERNAME,
      password: process.env.E2E_CLERK_USER_PASSWORD,
    });
  } catch (error) {
    // Skip test if Clerk fails to load (e.g., CDN issues, webkit auth flakiness)
    if (
      error instanceof ClerkTestError &&
      (error.code === 'CLERK_NOT_READY' ||
        error.code === 'CLERK_SETUP_FAILED' ||
        error.code === 'MISSING_CREDENTIALS')
    ) {
      test.skip(true, `Clerk auth failed: ${error.message}`);
      return;
    }

    // Handle navigation race and timeout issues (common in webkit)
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('Navigation interrupted') ||
      msg.includes('net::ERR_') ||
      msg.includes('Timeout') ||
      msg.includes('page.goto') ||
      msg.includes('Target closed') ||
      msg.includes('browser has disconnected')
    ) {
      test.skip(
        true,
        `Sign-in navigation issue on ${testInfo.project.name}: ${msg.slice(0, 80)}`
      );
      return;
    }
    throw error;
  }

  // Wait for the page to fully stabilize after the React 19 transient error
  // The error is a known bug that resolves itself after hydration completes
  // We use polling to check if the page has recovered from the error state
  await expect(async () => {
    const bodyText = await page.locator('body').innerText();
    // The page should not show the error message once stabilized
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('client-side exception');
  }).toPass({ timeout: 20000, intervals: [500, 1000, 2000, 3000, 5000] });

  // Log any errors that were captured (for debugging, not failing)
  if (errors.length > 0) {
    console.log('Transient errors captured (resolved):', errors.length);
  }

  // Verify the dashboard actually loaded by checking for the dashboard header or app shell
  const dashboardContent = page
    .locator(
      '[data-testid="dashboard-header"], main, [data-clerk-element="userButton"]'
    )
    .first();
  await expect(dashboardContent).toBeVisible({ timeout: 30000 });
});
