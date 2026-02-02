import { test } from '@playwright/test';
import { hasClerkCredentials } from '../helpers/clerk-credentials';

/**
 * Debug test to check what Clerk user ID we get after authentication
 */
test('check Clerk user ID', async ({ page }) => {
  if (!hasClerkCredentials()) {
    test.skip();
    return;
  }

  // storageState should have authenticated us already
  await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

  // Wait a moment for the page to load
  await page.waitForTimeout(3000);

  // Extract Clerk user info from the page
  const clerkUser = await page.evaluate(() => {
    const clerk = (
      window as {
        Clerk?: {
          user?: {
            id?: string;
            primaryEmailAddress?: { emailAddress?: string };
          };
        };
      }
    ).Clerk;
    if (!clerk?.user) return null;
    return {
      id: clerk.user.id,
      email: clerk.user.primaryEmailAddress?.emailAddress,
    };
  });

  console.log('🔍 Clerk User Info:', JSON.stringify(clerkUser, null, 2));
  console.log(
    'Expected Clerk ID in seed script: user_31mqVTy5GIyFXxvfyRArBu7Xt4v'
  );
  console.log('Actual Clerk ID from browser:', clerkUser?.id);
  console.log(
    'Do they match?',
    clerkUser?.id === 'user_31mqVTy5GIyFXxvfyRArBu7Xt4v' ? 'YES ✅' : 'NO ❌'
  );
});
