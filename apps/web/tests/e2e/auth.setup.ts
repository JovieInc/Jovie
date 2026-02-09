import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const AUTH_FILE = 'tests/.auth/user.json';

setup.describe.configure({ mode: 'serial' });

setup.setTimeout(240_000); // 4min to handle Turbopack cold-start compilation

setup('authenticate', async ({ page, baseURL }) => {
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  // Guard: write empty auth state if prerequisites missing
  if (!username || process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    console.log('  Auth prerequisites not met, writing empty auth state');
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // 1. Set up testing token BEFORE navigation
  await setupClerkTestingToken({ page });

  // 2. Navigate to sign-in page (has ClerkProvider)
  await page.goto(APP_ROUTES.SIGNIN, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);

  // 3. Sign in using appropriate strategy
  // Wrap in try/catch to handle "already signed in" from testing token
  try {
    if (username.includes('+clerk_test')) {
      await clerk.signIn({
        page,
        signInParams: { strategy: 'email_code', identifier: username },
      });
    } else if (password) {
      await clerk.signIn({
        page,
        signInParams: { strategy: 'password', identifier: username, password },
      });
    } else {
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already signed in')) {
      console.log('  Already signed in via testing token, continuing...');
    } else {
      throw error;
    }
  }

  // 4. Navigate to dashboard profile to verify auth + warm up route
  // Use DASHBOARD_PROFILE instead of DASHBOARD (which redirects to chat)
  // Use 'load' to ensure Clerk JS bundle is fully loaded (Turbopack cold-start can take 60s+)
  await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
    waitUntil: 'load',
    timeout: 120_000,
  });

  // 5. Verify authentication — wait for Clerk to finish client-side initialization
  // After Turbopack compiles the page, Clerk still needs time to hydrate.
  // The sidebar nav only renders for authenticated users.
  const authIndicator = page.locator('nav[aria-label="Dashboard navigation"]');
  await expect(authIndicator).toBeVisible({ timeout: 90_000 });

  // 6. Save authenticated session
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  Session saved to ${AUTH_FILE}`);
});
