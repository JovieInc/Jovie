import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const AUTH_FILE = 'tests/.auth/user.json';

setup.describe.configure({ mode: 'serial' });

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
  if (username.includes('+clerk_test')) {
    // OTP flow: +clerk_test emails auto-verify with code 424242
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

  // 4. Navigate to dashboard to verify auth + warm up route
  await page.goto(APP_ROUTES.DASHBOARD, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  // 5. Verify authentication
  const authIndicator = page
    .locator('[data-clerk-element="userButton"]')
    .or(page.locator('[data-testid="user-menu"]'))
    .or(page.locator('[data-testid="dashboard-header"]'));
  await expect(authIndicator).toBeVisible({ timeout: 30_000 });

  // 6. Save authenticated session
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  Session saved to ${AUTH_FILE}`);
});
