import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

/**
 * E2E Test: Dashboard Access Control for Foreign Profiles
 *
 * This test verifies that authenticated users cannot access or edit
 * another user's profile data via the dashboard UI and direct URLs.
 *
 * Test scenarios:
 * 1. Create two users (A and B) with complete profiles
 * 2. Log in as user A
 * 3. Attempt to access user B's profile data via dashboard
 * 4. Attempt direct URL manipulation to access user B's data
 * 5. Verify UI prevents access and no data from user B is visible
 *
 * Requirements:
 * - E2E_ONBOARDING_FULL=1 environment variable
 * - Real Clerk environment variables and DATABASE_URL for RLS testing
 */

test.describe('Dashboard Access Control', () => {
  // Only run when E2E_ONBOARDING_FULL=1 and environment is properly configured
  const runFull = process.env.E2E_ONBOARDING_FULL === '1';

  test.beforeEach(async () => {
    if (!runFull) {
      test.skip();
    }

    // Validate required environment variables
    const requiredEnvVars = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    // Skip if any required env var is missing or contains dummy values
    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('dummy')) {
        console.log(`Skipping test: ${key} is not properly configured`);
        test.skip();
      }
    }
  });

  test('user A cannot access user B profile data via dashboard', async ({
    page,
  }) => {
    // Set timeout for complex user creation and testing flow
    test.setTimeout(120_000);

    // Setup Clerk testing token for programmatic authentication
    await setupClerkTestingToken({ page });

    // === Step 1: Create User A and complete onboarding ===
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Clerk to be ready
    await page.waitForFunction(
      () => {
        // @ts-expect-error
        return window.Clerk && window.Clerk.isReady();
      },
      { timeout: 10_000 }
    );

    // Create unique identifiers for both users
    const timestamp = Date.now();
    const userAEmail = `e2e-user-a-${timestamp}@example.com`;
    const userAPassword = 'TestPassword123!';
    const userAHandle = `e2e-user-a-${timestamp.toString(36)}`;

    // Sign up User A
    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          const signUp = await clerk.signUp?.create({
            emailAddress: email,
            password: password,
          });

          await clerk.setActive({
            session:
              signUp?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        } catch (error) {
          console.log('User A sign-up error:', error);
          throw error;
        }
      },
      { email: userAEmail, password: userAPassword }
    );

    // Verify User A is authenticated
    await page.waitForFunction(
      () => {
        // @ts-expect-error
        return window.Clerk?.user?.id;
      },
      { timeout: 10_000 }
    );

    // Complete onboarding for User A
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/onboarding', { timeout: 10_000 });

    const handleInputA = page.getByLabel('Enter your desired handle');
    await expect(handleInputA).toBeVisible({ timeout: 5_000 });
    await handleInputA.fill(userAHandle);

    // Wait for handle validation
    await expect(
      page.locator('.bg-green-500.rounded-full').first()
    ).toBeVisible({ timeout: 10_000 });

    const submitButtonA = page.getByRole('button', { name: 'Create Profile' });
    await expect
      .poll(async () => await submitButtonA.isEnabled(), { timeout: 15_000 })
      .toBe(true);

    // Submit and wait for dashboard
    await Promise.all([
      page.waitForURL('**/app/dashboard**', { timeout: 15_000 }),
      submitButtonA.click(),
    ]);

    // Verify User A's dashboard loads with their data
    await expect(page.locator(`text=/${userAHandle}/i`).first()).toBeVisible({
      timeout: 5_000,
    });

    // Store User A's Clerk ID for later verification
    const userAClerkId = await page.evaluate(() => {
      // @ts-expect-error
      return window.Clerk?.user?.id;
    });

    // Sign out User A
    await page.evaluate(async () => {
      const clerk: any = (window as any).Clerk;
      await clerk.signOut();
    });

    // === Step 2: Create User B and complete onboarding ===
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const userBEmail = `e2e-user-b-${timestamp}@example.com`;
    const userBPassword = 'TestPassword123!';
    const userBHandle = `e2e-user-b-${timestamp.toString(36)}`;

    // Sign up User B
    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        try {
          const signUp = await clerk.signUp?.create({
            emailAddress: email,
            password: password,
          });

          await clerk.setActive({
            session:
              signUp?.createdSessionId ||
              clerk.client?.lastActiveSessionId ||
              null,
          });
        } catch (error) {
          console.log('User B sign-up error:', error);
          throw error;
        }
      },
      { email: userBEmail, password: userBPassword }
    );

    // Complete onboarding for User B
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/onboarding', { timeout: 10_000 });

    const handleInputB = page.getByLabel('Enter your desired handle');
    await handleInputB.fill(userBHandle);

    await expect(
      page.locator('.bg-green-500.rounded-full').first()
    ).toBeVisible({ timeout: 10_000 });

    const submitButtonB = page.getByRole('button', { name: 'Create Profile' });
    await expect
      .poll(async () => await submitButtonB.isEnabled(), { timeout: 15_000 })
      .toBe(true);

    await Promise.all([
      page.waitForURL('**/app/dashboard**', { timeout: 15_000 }),
      submitButtonB.click(),
    ]);

    // Verify User B's dashboard loads with their data
    await expect(page.locator(`text=/${userBHandle}/i`).first()).toBeVisible({
      timeout: 5_000,
    });

    // Store User B's Clerk ID for later verification
    const userBClerkId = await page.evaluate(() => {
      // @ts-expect-error
      return window.Clerk?.user?.id;
    });

    // Sign out User B
    await page.evaluate(async () => {
      const clerk: any = (window as any).Clerk;
      await clerk.signOut();
    });

    // === Step 3: Sign back in as User A and test access control ===
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Sign in as User A
    await page.evaluate(
      async ({ email, password }) => {
        const clerk = (window as unknown as { Clerk: any }).Clerk;
        if (!clerk) throw new Error('Clerk not initialized');

        const signIn = await clerk.signIn?.create({
          identifier: email,
          password: password,
        });

        if (signIn?.status === 'needs_first_factor') {
          await clerk.signIn?.attemptFirstFactor({
            strategy: 'password',
            password: password,
          });
        }

        await clerk.setActive({
          session:
            signIn?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      },
      { email: userAEmail, password: userAPassword }
    );

    // Verify User A is authenticated
    const currentUserIdAfterSignIn = await page.evaluate(() => {
      // @ts-expect-error
      return window.Clerk?.user?.id;
    });
    expect(currentUserIdAfterSignIn).toBe(userAClerkId);

    // === Step 4: Verify User A can only see their own data in dashboard ===
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

    // Should stay on dashboard (not redirect to onboarding)
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 5_000 });

    // Verify User A sees their own data
    await expect(page.locator(`text=/${userAHandle}/i`).first()).toBeVisible({
      timeout: 5_000,
    });

    // Verify User A does NOT see User B's data anywhere on the dashboard
    const userBHandleElements = page.locator(`text=${userBHandle}`);
    await expect(userBHandleElements).toHaveCount(0);

    // === Step 5: Test access to User B's public profile (should work) ===
    // User A should be able to view User B's public profile page
    await page.goto(`/${userBHandle}`, { waitUntil: 'domcontentloaded' });

    // Should load User B's public profile successfully
    await expect(page).toHaveURL(new RegExp(`/${userBHandle}$`));
    await expect(page.locator(`text=/${userBHandle}/i`).first()).toBeVisible({
      timeout: 5_000,
    });

    // But there should be NO edit controls visible (since it's not User A's profile)
    // Dashboard edit links should not be present on public profiles
    const editButtons = page.getByRole('button', {
      name: /edit|update|save|delete/i,
    });
    await expect(editButtons).toHaveCount(0);

    const dashboardLinks = page.getByRole('link', {
      name: /dashboard|settings|edit/i,
    });
    await expect(dashboardLinks).toHaveCount(0);

    // === Step 6: Attempt direct URL manipulation (should fail gracefully) ===
    // Try to access dashboard with User B's data via URL parameters
    // Note: The current dashboard doesn't use URL params for user selection,
    // but this tests against potential future parameter-based access

    // Go back to dashboard and verify still seeing only User A's data
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`text=/${userAHandle}/i`).first()).toBeVisible({
      timeout: 5_000,
    });

    // Try various potential attack vectors via URL manipulation
    const attackUrls = [
      `/app/dashboard?user=${userBClerkId}`,
      `/app/dashboard?profile=${userBHandle}`,
      `/app/dashboard#user=${userBClerkId}`,
      `/app/dashboard/${userBHandle}`,
    ];

    for (const attackUrl of attackUrls) {
      await page.goto(attackUrl, { waitUntil: 'domcontentloaded' });

      // Should either redirect to normal dashboard or show User A's data only
      // Never should show User B's data
      const userBDataVisible = await page
        .locator(`text=${userBHandle}`)
        .count();
      expect(userBDataVisible).toBe(0);

      // Should still show User A's data or be on a safe page
      const isOnDashboard = page.url().includes('/app/dashboard');
      if (isOnDashboard) {
        await expect(
          page.locator(`text=/${userAHandle}/i`).first()
        ).toBeVisible({ timeout: 5_000 });
      }
    }

    // === Step 7: Verify API-level protection ===
    // Check that direct API calls don't leak User B's data
    // This simulates what happens if someone tries to manipulate client-side requests

    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/debug/dashboard', {
          credentials: 'include', // Include auth cookies
        });
        return {
          status: res.status,
          data: await res.json(),
        };
      } catch (error) {
        return {
          status: 500,
          error: (error as Error).message,
        };
      }
    });

    // If the debug endpoint exists and returns data, it should only contain User A's data
    if (response.status === 200 && response.data) {
      const responseString = JSON.stringify(response.data).toLowerCase();

      // Should contain User A's handle
      expect(responseString).toContain(userAHandle.toLowerCase());

      // Should NOT contain User B's handle
      expect(responseString).not.toContain(userBHandle.toLowerCase());
    }

    console.log('✅ Access control test completed successfully');
    console.log(
      `User A (${userAHandle}) cannot access User B (${userBHandle}) data`
    );
  });

  test('unauthenticated user cannot access dashboard', async ({ page }) => {
    test.setTimeout(30_000);

    // Try to access dashboard without authentication
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

    // Should redirect to sign-in page
    await page.waitForURL('**/sign-in**', { timeout: 10_000 });

    // Verify sign-in form is present
    const signInForm = page.locator(
      'form, input[type="email"], input[type="password"]'
    );
    await expect(signInForm.first()).toBeVisible({ timeout: 5_000 });
  });

  test('user cannot access non-existent profile', async ({ page }) => {
    test.setTimeout(30_000);

    // Try to access a profile that doesn't exist
    const nonExistentHandle = `nonexistent-${Date.now()}`;
    await page.goto(`/${nonExistentHandle}`, { waitUntil: 'domcontentloaded' });

    // Should show 404 page
    await expect(page).toHaveURL(new RegExp(`/${nonExistentHandle}$`));

    // Should show not found message
    const notFoundIndicator = page.locator(
      'text=/not found|404|does not exist/i'
    );
    await expect(notFoundIndicator.first()).toBeVisible({ timeout: 5_000 });
  });
});
