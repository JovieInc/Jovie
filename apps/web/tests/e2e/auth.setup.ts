import { test as setup } from '@playwright/test';
import {
  ClerkTestError,
  setTestAuthBypassSession,
  signInUser,
  waitForAuthenticatedHealth,
} from '../helpers/clerk-auth';

const AUTH_FILE = 'tests/.auth/user.json';

setup.describe.configure({ mode: 'serial' });

setup.setTimeout(360_000); // 6min to absorb local cold-start compilation plus Clerk bootstrap

setup('authenticate', async ({ page }) => {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    await setTestAuthBypassSession(page, null);
    await waitForAuthenticatedHealth(page, process.env.E2E_CLERK_USER_ID);
    await page.context().storageState({ path: AUTH_FILE });
    console.log(`  Test auth bypass session saved to ${AUTH_FILE}`);
    return;
  }

  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  // Guard: write empty auth state if prerequisites missing
  if (!username || process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    console.log('  Auth prerequisites not met, writing empty auth state');
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  try {
    await signInUser(page, { username, password });
  } catch (error) {
    if (
      error instanceof ClerkTestError &&
      ['CLERK_SETUP_FAILED', 'CLERK_NOT_READY', 'MISSING_CREDENTIALS'].includes(
        error.code
      )
    ) {
      console.log(
        `  Auth setup failed (${error.message.substring(0, 120)}), writing empty auth state`
      );
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }
    throw error;
  }

  // 7. Save authenticated session
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`  Session saved to ${AUTH_FILE}`);
});
