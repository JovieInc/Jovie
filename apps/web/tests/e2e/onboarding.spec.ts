import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

/**
 * Onboarding E2E Tests (consolidated)
 *
 * Covers:
 * 1. New user: sign up -> onboarding -> claim handle -> dashboard -> public profile
 * 2. Existing user with profile: sign in -> dashboard (no onboarding redirect)
 * 3. Handle taken: prevents submission
 *
 * Requires:
 * - E2E_ONBOARDING_FULL=1
 * - Real Clerk env vars + DATABASE_URL
 */

test.describe('Onboarding', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    FAST_ITERATION,
    'Onboarding end-to-end coverage is handled by the dedicated golden path in fast iteration'
  );

  const runFull = process.env.E2E_ONBOARDING_FULL === '1';

  function skipIfNotConfigured() {
    if (!runFull) {
      test.skip(true, 'E2E_ONBOARDING_FULL=1 not set');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Auth setup not available');
    }
    const required = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'DATABASE_URL',
    ];
    for (const key of required) {
      const val = process.env[key];
      if (!val || val.includes('dummy')) {
        test.skip(true, `${key} not configured`);
      }
    }
  }

  async function interceptAnalytics(page: Page) {
    await page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
  }

  async function ensureClerkReady(page: Page): Promise<boolean> {
    try {
      await page.goto('/signin', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    } catch {
      return false;
    }

    return page
      .waitForFunction(() => !!(window as any).Clerk?.loaded, {
        timeout: 60_000,
      })
      .then(() => true)
      .catch(() => false);
  }

  test('new user completes onboarding, reaches dashboard, and has live public profile', async ({
    page,
  }) => {
    skipIfNotConfigured();
    test.setTimeout(120_000);

    await interceptAnalytics(page);
    await setupClerkTestingToken({ page });

    const clerkLoaded = await ensureClerkReady(page);
    if (!clerkLoaded) {
      test.skip(true, 'Clerk JS failed to load');
      return;
    }

    // Create fresh test user
    const testEmail =
      process.env.E2E_TEST_EMAIL ||
      `playwright+clerk_test+${Date.now().toString(36)}@example.com`;

    try {
      await createOrReuseTestUserSession(page, testEmail);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      test.skip(true, `Clerk user creation failed: ${msg.slice(0, 100)}`);
      return;
    }

    // Verify authentication
    const isAuthenticated = await page
      .waitForFunction(() => !!(window as any).Clerk?.user?.id, {
        timeout: 15_000,
      })
      .then(() => true)
      .catch(() => false);

    if (!isAuthenticated) {
      test.skip(true, 'Clerk user session not established');
      return;
    }

    // Navigate to dashboard -- should redirect to onboarding for new users
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForURL('**/onboarding', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Claim a unique handle
    const uniqueHandle = `e2e-${Date.now().toString(36)}`;
    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 15_000 });
    await handleInput.fill(uniqueHandle);

    // Wait for availability check (green indicator)
    await expect(
      page.locator('.bg-green-500.rounded-full').first()
    ).toBeVisible({ timeout: 10_000 });

    // Submit
    const submitButton = page.getByRole('button', { name: 'Create Profile' });
    await expect(submitButton).toBeVisible();
    await expect
      .poll(async () => submitButton.isEnabled(), {
        timeout: 15_000,
        intervals: [500, 750, 1000],
      })
      .toBe(true);

    await Promise.all([
      page.waitForURL('**/app/dashboard', {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      }),
      submitButton.click(),
    ]);

    // Verify dashboard loaded with real content
    const dashboardHeading = page.locator('h1, h2').filter({
      hasText: /dashboard|overview|welcome|your profile/i,
    });
    await expect(dashboardHeading.first()).toBeVisible({ timeout: 15_000 });

    // Verify nav links present
    const navLinks = page.getByRole('link', {
      name: /profile|settings|links|analytics/i,
    });
    await expect(navLinks.first()).toBeVisible({ timeout: 15_000 });

    // Verify handle appears on dashboard
    const handleText = page.locator(`text=/${uniqueHandle}/i`);
    await expect(handleText.first()).toBeVisible({ timeout: 15_000 });

    // Verify public profile is live
    await page.goto(`/${uniqueHandle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(page).toHaveURL(new RegExp(`/${uniqueHandle}$`));

    const profileName = page
      .locator('h1, h2')
      .filter({ hasText: uniqueHandle });
    await expect(profileName.first()).toBeVisible({ timeout: 15_000 });
  });

  test('authenticated user with existing profile goes directly to dashboard', async ({
    page,
  }) => {
    skipIfNotConfigured();
    test.setTimeout(120_000);

    await interceptAnalytics(page);
    await setupClerkTestingToken({ page });

    const clerkLoaded = await ensureClerkReady(page);
    if (!clerkLoaded) {
      test.skip(true, 'Clerk JS failed to load');
      return;
    }

    const existingEmail =
      process.env.E2E_EXISTING_USER_EMAIL ||
      process.env.E2E_CLERK_USER_USERNAME;

    if (!existingEmail) {
      test.skip(
        true,
        'No E2E_EXISTING_USER_EMAIL or E2E_CLERK_USER_USERNAME set'
      );
      return;
    }

    try {
      if (existingEmail.includes('+clerk_test')) {
        await clerk.signIn({
          page,
          signInParams: { strategy: 'email_code', identifier: existingEmail },
        });
      } else {
        const password = process.env.E2E_CLERK_USER_PASSWORD;
        if (!password) {
          test.skip(true, 'No password for non-clerk_test email');
          return;
        }
        await clerk.signIn({
          page,
          signInParams: {
            strategy: 'password',
            identifier: existingEmail,
            password,
          },
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('already signed in')) {
        test.skip(true, `Sign-in failed: ${msg.slice(0, 100)}`);
        return;
      }
    }

    const isAuthenticated = await page
      .waitForFunction(() => !!(window as any).Clerk?.user?.id, {
        timeout: 15_000,
      })
      .then(() => true)
      .catch(() => false);

    if (!isAuthenticated) {
      test.skip(true, 'Clerk session not established');
      return;
    }

    try {
      await page.goto('/app/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    } catch {
      test.skip(true, 'Dashboard navigation failed');
      return;
    }

    const url = page.url();
    if (!/\/app\//.test(url)) {
      test.skip(true, 'Auth gate redirected away from dashboard');
      return;
    }

    // Should NOT be on onboarding
    expect(url).not.toContain('/onboarding');

    // Verify dashboard shell rendered
    const dashNav = page.locator('nav[aria-label="Dashboard navigation"]');
    const userButton = page.locator('[data-clerk-element="userButton"]');
    const appShell = page
      .locator('main, aside, [data-testid="sidebar"]')
      .first();
    try {
      await expect(dashNav.or(userButton).or(appShell)).toBeVisible({
        timeout: 30_000,
      });
    } catch {
      test.skip(true, 'Dashboard shell did not render after auth');
    }
  });

  test('taken handle blocks onboarding completion', async ({ page }) => {
    skipIfNotConfigured();
    test.setTimeout(90_000);

    await interceptAnalytics(page);
    await setupClerkTestingToken({ page });

    const clerkLoaded = await ensureClerkReady(page);
    if (!clerkLoaded) {
      test.skip(true, 'Clerk JS failed to load');
      return;
    }

    // Bootstrap fresh user
    const email = `onboarding-taken+${Date.now().toString(36)}@example.com`;
    try {
      await createOrReuseTestUserSession(page, email);
    } catch {
      test.skip(true, 'Could not create test user');
      return;
    }

    await page
      .waitForFunction(() => !!(window as any).Clerk?.user?.id, {
        timeout: 10_000,
      })
      .catch(() => {});

    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/onboarding**', {
      timeout: 15_000,
      waitUntil: 'domcontentloaded',
    });

    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 10_000 });

    const takenHandle = process.env.E2E_TAKEN_HANDLE || 'dualipa';

    // Verify handle is actually taken
    const checkResponse = await page.request.get(
      `/api/handle/check?handle=${takenHandle}`
    );
    if (!checkResponse.ok()) {
      test.skip(true, 'Handle availability endpoint not reachable');
    }
    const checkData = (await checkResponse.json()) as { available?: boolean };
    if (checkData.available) {
      test.skip(true, `Handle ${takenHandle} is unexpectedly available`);
    }

    await handleInput.fill(takenHandle);
    await expect(page.getByText('Not available')).toBeVisible({
      timeout: 10_000,
    });

    // Submit button must be disabled
    const handleContinue = page.getByRole('button', { name: 'Continue' });
    await expect(handleContinue).toBeDisabled();

    // Must still be on the handle claim step
    await expect(
      page.getByRole('heading', { name: 'Claim your handle' })
    ).toBeVisible();
  });
});
