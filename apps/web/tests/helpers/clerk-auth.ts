import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

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
 * Check if email is a Clerk test email (passwordless auth)
 */
export function isClerkTestEmail(email: string): boolean {
  return email.includes('+clerk_test');
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
 * Per-test Clerk sign-in for tests that need fresh authentication.
 *
 * Most tests should rely on the shared storageState from auth.setup.ts instead.
 * Use this only when a test needs to re-authenticate (e.g., after sign-out,
 * or to sign in as a different user).
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

  // Clear any existing session cookies to avoid using stale JWTs
  // Clerk JWTs expire after 60 seconds, so stored sessions are usually invalid
  const cookies = await page.context().cookies();
  const clerkCookies = cookies.filter(
    cookie =>
      cookie.name.startsWith('__session') ||
      cookie.name.startsWith('__client') ||
      cookie.name.startsWith('__clerk')
  );
  if (clerkCookies.length > 0) {
    await page
      .context()
      .clearCookies({ name: new RegExp('^__(session|client|clerk)') });
  }

  // Set up Clerk testing token BEFORE navigation
  // This is required for the testing token to be included in Clerk's FAPI requests
  await setupClerkTestingToken({ page });

  // Navigate to a page that loads ClerkProvider
  // IMPORTANT: The marketing page (/) does NOT have ClerkProvider, but /signin does
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });

  // Wait for Clerk JS to load from CDN before calling clerk.signIn()
  // The @clerk/testing library has a hard 30s timeout for window.Clerk.loaded.
  // Pre-waiting here prevents that timeout from being eaten by Turbopack compilation.
  await page
    .waitForFunction(() => !!(window as any).Clerk?.loaded, { timeout: 60_000 })
    .catch(() => {
      // If Clerk still hasn't loaded, let clerk.signIn() handle the error
    });

  try {
    // Use the official Clerk testing helper
    // The @clerk/testing library has built-in support for email_code strategy
    // with +clerk_test emails (automatically uses code 424242)
    if (username.includes('+clerk_test')) {
      // For test emails with +clerk_test suffix, use email_code strategy
      await clerk.signIn({
        page,
        signInParams: { strategy: 'email_code', identifier: username },
      });
    } else if (password) {
      // For real test users with passwords, try password strategy first,
      // then fall back to email_code if the Clerk instance disabled passwords
      try {
        await clerk.signIn({
          page,
          signInParams: {
            strategy: 'password',
            identifier: username,
            password,
          },
        });
      } catch (strategyError) {
        const strategyMsg =
          strategyError instanceof Error
            ? strategyError.message
            : String(strategyError);
        if (strategyMsg.toLowerCase().includes('strategy')) {
          console.log(
            '  Password strategy not available, falling back to email_code'
          );
          await clerk.signIn({
            page,
            signInParams: { strategy: 'email_code', identifier: username },
          });
        } else {
          throw strategyError;
        }
      }
    } else {
      throw new ClerkTestError(
        'E2E_CLERK_USER_PASSWORD is required for non-test email addresses. ' +
          'Either provide a password or use an email with +clerk_test suffix.',
        'MISSING_CREDENTIALS'
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Handle "already signed in" — testing token may auto-authenticate
    if (msg.includes('already signed in')) {
      console.log('  Already signed in via testing token, continuing...');
      // Continue to verification below
    } else {
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
  }

  // After sign-in, navigate to the dashboard profile page to verify authentication
  // The signin page doesn't automatically redirect in test mode
  // Use DASHBOARD_PROFILE (which exists) instead of PROFILE (which 404s)
  await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000, // Turbopack cold compilation can take 60-90+ seconds
  });

  // Dismiss Next.js dev error overlay and wait for page to stabilize
  // Handles React hydration mismatches (nonce attr) and transient hooks errors
  await expect(async () => {
    // Dismiss error overlay if present
    const overlay = page.locator(
      '[data-nextjs-dialog-overlay], [data-nextjs-toast]'
    );
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    // Click "Try again" on error boundary if present
    const tryAgain = page.locator('button:has-text("Try again")');
    if (await tryAgain.isVisible({ timeout: 500 }).catch(() => false)) {
      await tryAgain.click();
      await page.waitForTimeout(1000);
    }
    // Verify dashboard element is visible
    const dashNav = page.locator('nav[aria-label="Dashboard navigation"]');
    const userButton = page.locator('[data-clerk-element="userButton"]');
    await expect(dashNav.or(userButton)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 30000, intervals: [1000, 2000, 5000, 10000] });

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
  await page.waitForURL(url => !url.pathname.includes(APP_ROUTES.DASHBOARD), {
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
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  // For +clerk_test emails, password is not required
  // For regular emails, password is required
  const hasTestCredentials =
    username && (username.includes('+clerk_test') || password);

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
