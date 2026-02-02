import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { hasClerkCredentials } from '../helpers/clerk-credentials';

const authFile = '.auth/user.json';

/**
 * Authentication setup - runs once before all tests
 *
 * Creates an authenticated session and saves it to storageState.
 * All subsequent tests will reuse this auth state for ~10-15s faster execution per test.
 *
 * This is a Playwright best practice for authenticated testing:
 * https://playwright.dev/docs/auth#reuse-signed-in-state
 */
setup('authenticate', async ({ page }) => {
  // Skip if no credentials configured
  if (!hasClerkCredentials()) {
    console.log('⚠ No Clerk credentials - skipping auth setup');
    console.log('  Tests requiring auth will be skipped');
    return;
  }

  console.log('🔐 Setting up authentication for all tests...');

  try {
    // Set up Clerk testing token
    await setupClerkTestingToken({ page });

    // Sign in using the test user
    await signInUser(page);

    // Verify we're authenticated
    const dashboardHeader = page.locator('[data-testid="dashboard-header"]');
    await expect(dashboardHeader).toBeVisible({ timeout: 10000 });

    // Save signed-in state to reuse across tests
    await page.context().storageState({ path: authFile });

    console.log(`✅ Authentication setup complete - saved to ${authFile}`);
    console.log(
      '   All tests will now start authenticated (huge performance win!)'
    );
  } catch (error) {
    console.error('❌ Authentication setup failed:', error);
    console.log('   Tests will fall back to individual sign-ins');
    throw error;
  }
});
