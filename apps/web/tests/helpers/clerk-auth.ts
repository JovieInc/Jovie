import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page } from '@playwright/test';

/**
 * Custom error types for better test debugging
 */
export class ClerkTestError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ClerkTestError';
  }
}

/**
 * Creates or reuses a Clerk test user session for the given email.
 *
 * Assumes the page has already loaded the app and Clerk has been initialized.
 */
export async function createOrReuseTestUserSession(page: Page, email: string) {
  if (!email) {
    throw new ClerkTestError(
      'E2E test user email not configured. Set E2E_CLERK_USER_USERNAME.',
      'MISSING_CREDENTIALS'
    );
  }

  await page.evaluate(
    async ({ email: targetEmail }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerk = (window as any).Clerk;
      if (!clerk) throw new Error('Clerk not initialized');

      // Reuse existing session if one is already active
      if (clerk.user && clerk.session) {
        return;
      }

      try {
        // Prefer signing in an existing user for this email
        const signIn = await clerk.signIn?.create({ identifier: targetEmail });

        await clerk.setActive({
          session:
            signIn?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      } catch {
        // If sign-in fails (e.g., user does not exist), create a new user
        const signUp = await clerk.signUp?.create({
          emailAddress: targetEmail,
        });

        await clerk.setActive({
          session:
            signUp?.createdSessionId ||
            clerk.client?.lastActiveSessionId ||
            null,
        });
      }
    },
    { email }
  );
}

/**
 * Authenticates a user in Clerk for E2E tests.
 *
 * Key requirements for Clerk testing:
 * 1. clerkSetup() must be called in global-setup.ts first
 * 2. Navigate to a page with ClerkProvider (e.g., /signin, NOT /)
 * 3. Use password strategy for real test users, or email_code for +clerk_test emails
 *
 * @see https://clerk.com/docs/testing/playwright/test-helpers
 */
export async function signInUser(
  page: Page,
  {
    username = process.env.E2E_CLERK_USER_USERNAME,
    password = process.env.E2E_CLERK_USER_PASSWORD,
  }: { username?: string; password?: string } = {}
) {
  if (!username) {
    throw new ClerkTestError(
      'E2E test user credentials not configured. Set E2E_CLERK_USER_USERNAME.',
      'MISSING_CREDENTIALS'
    );
  }

  // Verify that clerkSetup() succeeded in global setup
  if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    throw new ClerkTestError(
      'Clerk testing setup was not successful. Tests requiring authentication will be skipped.',
      'CLERK_SETUP_FAILED'
    );
  }

  // Set up Clerk testing token BEFORE navigation
  // This is required for the testing token to be included in Clerk's FAPI requests
  await setupClerkTestingToken({ page });

  // Navigate to a page that loads ClerkProvider
  // IMPORTANT: The marketing page (/) does NOT have ClerkProvider, but /signin does
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });

  // Wait briefly for the page to settle and Clerk JS to start loading
  await page.waitForTimeout(1000);

  try {
    // Use the official Clerk testing helper
    // For testing with a real test user that has a password, use password strategy
    if (password) {
      // Password authentication works with any identifier (email or username)
      await clerk.signIn({
        page,
        signInParams: { strategy: 'password', identifier: username, password },
      });
    } else if (username.includes('+clerk_test')) {
      // For test emails with +clerk_test suffix, use email_code strategy
      // The testing token bypasses the actual email verification
      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'email_code',
          identifier: username,
        },
      });
    } else {
      throw new ClerkTestError(
        'E2E_CLERK_USER_PASSWORD is required for non-test email addresses. ' +
          'Either provide a password or use an email with +clerk_test suffix.',
        'MISSING_CREDENTIALS'
      );
    }
  } catch (error) {
    // Check if Clerk JS even loaded
    const clerkLoaded = await page
      .evaluate(() => {
        return typeof (window as { Clerk?: unknown }).Clerk !== 'undefined';
      })
      .catch(() => false);

    if (!clerkLoaded) {
      throw new ClerkTestError(
        'Clerk failed to initialize. This may be due to network issues loading Clerk JS from CDN.',
        'CLERK_NOT_READY'
      );
    }

    // Re-throw the original error if Clerk was loaded but signIn failed
    throw error;
  }

  // After sign-in, navigate to the dashboard to verify authentication
  // The signin page doesn't automatically redirect in test mode
  await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

  // Wait for page to stabilize after React 19 transient hooks error
  // There's a known React 19 bug (facebook/react#33580) that causes a transient
  // "Rendered more hooks than during the previous render" error during hydration.
  // The error appears briefly then "magically disappears" as the page stabilizes.
  await expect(async () => {
    const bodyText = await page.locator('body').innerText();
    // The page should not show the error message once stabilized
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('client-side exception');
  }).toPass({ timeout: 20000, intervals: [500, 1000, 2000, 3000, 5000] });

  // Verify we're authenticated by checking for dashboard elements
  const userButton = page.locator('[data-clerk-element="userButton"]');
  const userMenu = page.locator('[data-testid="user-menu"]');
  const dashboardHeader = page.locator('[data-testid="dashboard-header"]');

  await expect(userButton.or(userMenu).or(dashboardHeader)).toBeVisible({
    timeout: 15000,
  });

  return page;
}

/**
 * Signs out the current user
 */
export async function signOutUser(page: Page) {
  // Click user button/menu
  const userButton = page.locator('[data-clerk-element="userButton"]');
  if (await userButton.isVisible()) {
    await userButton.click();

    // Click sign out option
    const signOutButton = page.locator('button:has-text("Sign out")');
    await signOutButton.click();
  } else {
    // Fallback: navigate to sign-out URL
    await page.goto('/sign-out');
  }

  // Wait for sign out to complete
  await page.waitForURL(url => !url.pathname.includes('/app/dashboard'), {
    timeout: 10000,
  });
}

/**
 * Checks if a user is currently authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.locator('[data-clerk-element="userButton"]').waitFor({
      state: 'visible',
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a test context with authentication setup
 * Use this in beforeEach hooks for tests that require authentication
 */
export async function setupAuthenticatedTest(page: Page) {
  const hasTestCredentials =
    process.env.E2E_CLERK_USER_USERNAME && process.env.E2E_CLERK_USER_PASSWORD;

  if (!hasTestCredentials) {
    console.warn(
      '⚠ Skipping authenticated test - no test user credentials configured'
    );
    throw new ClerkTestError(
      'Test user credentials not configured',
      'MISSING_CREDENTIALS'
    );
  }

  await signInUser(page);
  return page;
}
