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
 * Polls until Clerk is ready, with configurable timeout.
 * Returns true if Clerk initialized, false if timeout exceeded.
 */
async function waitForClerkReady(
  page: Page,
  { timeout = 30000, pollInterval = 500 } = {}
): Promise<boolean> {
  const maxAttempts = Math.ceil(timeout / pollInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isReady = await page
      .evaluate(() => {
        // @ts-expect-error - Clerk is attached to window at runtime
        return !!(window.Clerk && window.Clerk.isReady());
      })
      .catch(() => false);

    if (isReady) return true;
    await page.waitForTimeout(pollInterval);
  }

  return false;
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
 * Authenticates a user in Clerk for E2E tests
 * This function handles the complete sign-in flow
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

  // Set up Clerk testing token to bypass bot protection
  await setupClerkTestingToken({ page });

  // Initialize app and Clerk on the page
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for Clerk to be ready with retry logic for CDN issues
  const clerkReady = await waitForClerkReady(page, { timeout: 30000 });

  if (!clerkReady) {
    throw new ClerkTestError(
      'Clerk failed to initialize. This may be due to network issues loading Clerk JS from CDN.',
      'CLERK_NOT_READY'
    );
  }

  // Prefer the official Clerk testing helper.
  // If the identifier is an email, use token-based sign-in.
  if (username.includes('@')) {
    await clerk.signIn({ page, emailAddress: username });
  } else {
    if (!password) {
      throw new ClerkTestError(
        'E2E_CLERK_USER_PASSWORD is required when signing in with a non-email identifier.',
        'MISSING_CREDENTIALS'
      );
    }

    await clerk.signIn({
      page,
      signInParams: { strategy: 'password', identifier: username, password },
    });
  }

  // Verify we're authenticated by checking for user button or dashboard
  await expect(
    page.locator(
      '[data-clerk-element="userButton"], [data-testid="user-menu"], text="Dashboard"'
    )
  ).toBeVisible({ timeout: 10000 });

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
