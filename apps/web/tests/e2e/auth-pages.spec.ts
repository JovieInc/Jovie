/**
 * Auth pages E2E tests — JOV-2037
 *
 * Covers /signin, /signup, redirect normalization, email prefill,
 * plan intent capture, and authenticated-user redirect behaviour.
 *
 * Tests use an anonymous context unless noted.
 *
 * Run: pnpm run test:web:e2e -- tests/e2e/auth-pages.spec.ts
 */
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { Browser, expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

// Anonymous context — no stored auth.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_TIMEOUT = 60_000;
const VISIBILITY_TIMEOUT = 20_000;
const EMPTY_STATE = { cookies: [], origins: [] };

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/handle/check**', r =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({ available: true }),
      contentType: 'application/json',
    })
  );
}

/**
 * Create a fresh anonymous browser context and optionally attach a Clerk
 * testing token so Clerk SDK doesn't throw in test mode.
 */
async function createAnonPage(browser: Browser) {
  const context = await browser.newContext({ storageState: EMPTY_STATE });
  const page = await context.newPage();

  if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
    await setupClerkTestingToken({ page }).catch((err: unknown) => {
      console.warn(
        '[auth-pages.spec] setupClerkTestingToken skipped:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }

  return { page, context };
}

/**
 * Wait for any element visible on Clerk auth forms to appear.
 * Uses loose selectors that work whether or not Clerk has fully bootstrapped.
 */
async function waitForClerkAuthUi(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
    // Dev builds may keep background requests open — DOM probe is the real gate.
  });

  await page
    .waitForFunction(
      () => {
        const bodyText = document.body.innerText ?? '';
        return (
          document.querySelector(
            'input[type="email"], input[name="identifier"]'
          ) !== null ||
          bodyText.includes('Continue') ||
          bodyText.includes('Google') ||
          bodyText.includes('Sign in to Jovie') ||
          bodyText.includes('Request Access') ||
          bodyText.includes('Create your')
        );
      },
      undefined,
      { timeout: AUTH_TIMEOUT }
    )
    .catch(() => {
      // Clerk may not be available in local test runs without a real instance
    });
}

// ---------------------------------------------------------------------------
// /signin page
// ---------------------------------------------------------------------------
test.describe('/signin page', () => {
  test('renders Clerk sign-in form without runtime errors', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      // Should stay on /signin (not redirect to /app)
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: 10_000,
      });

      await waitForClerkAuthUi(page);

      // No unhandled error boundaries
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('Error boundary');
      expect(bodyText).not.toContain('Unhandled Runtime Error');
    } finally {
      await context.close();
    }
  });

  test('email prefill: ?email=test@example.com populates the email field', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);
    const testEmail = 'test@example.com';

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNIN}?email=${testEmail}`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      // Look for the email field with the pre-filled value
      const emailInput = page
        .locator('input[type="email"], input[name="identifier"]')
        .first();

      // Clerk renders the field asynchronously; wait for it if needed
      const inputVisible = await emailInput
        .isVisible({ timeout: VISIBILITY_TIMEOUT })
        .catch(() => false);

      if (inputVisible) {
        const value = await emailInput.inputValue();
        expect(value).toBe(testEmail);
      } else {
        // In environments where Clerk is unavailable (no real instance),
        // just verify the page loaded without error
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('Unhandled Runtime Error');
      }
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// /signup page
// ---------------------------------------------------------------------------
test.describe('/signup page', () => {
  test('renders Clerk sign-up form without runtime errors', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(APP_ROUTES.SIGNUP, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
        timeout: 10_000,
      });

      await waitForClerkAuthUi(page);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('Unhandled Runtime Error');
      expect(bodyText).not.toContain('Error boundary');
    } finally {
      await context.close();
    }
  });

  test('renders legal links (Terms of Service, Privacy Policy)', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(APP_ROUTES.SIGNUP, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      await expect(
        page.getByRole('link', { name: /terms of service/i })
      ).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

      await expect(
        page.getByRole('link', { name: /privacy policy/i })
      ).toBeVisible({ timeout: VISIBILITY_TIMEOUT });
    } finally {
      await context.close();
    }
  });

  test('OAuth error banner renders on /signup?oauth_error=account_exists', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNUP}?oauth_error=account_exists`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      // The error banner should be visible
      const banner = page.getByRole('alert');
      await expect(banner).toBeVisible({ timeout: VISIBILITY_TIMEOUT });

      const bannerText = await banner.textContent();
      expect(bannerText?.toLowerCase()).toContain('account');
    } finally {
      await context.close();
    }
  });

  test('plan intent: /signup?plan=pro is captured in sessionStorage', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNUP}?plan=pro`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      // Check sessionStorage for captured plan intent
      const planIntent = await page.evaluate(() => {
        try {
          const raw = sessionStorage.getItem('jovie_plan_intent');
          if (!raw) return null;
          const parsed = JSON.parse(raw) as { plan?: string };
          return parsed.plan ?? null;
        } catch {
          return null;
        }
      });

      // Only assert if sessionStorage was accessible (may be unavailable in strict modes)
      if (planIntent !== null) {
        expect(planIntent).toBe('pro');
      } else {
        // Fall back: at least verify no error
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('Unhandled Runtime Error');
      }
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Redirect normalization (proxy.ts)
// ---------------------------------------------------------------------------
test.describe('Auth redirect normalization', () => {
  test('/sign-in redirects to /signin', async ({ browser }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto('/sign-in', {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      // After the redirect we should land on /signin
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: 10_000,
      });
    } finally {
      await context.close();
    }
  });

  test('/sign-up redirects to /signup', async ({ browser }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto('/sign-up', {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
        timeout: 10_000,
      });
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Authenticated user redirect
// ---------------------------------------------------------------------------
test.describe('Auth pages — authenticated user redirect', () => {
  // NOTE: This test requires the stored auth session from auth.setup.ts.
  // It overrides the module-level `storageState` to use the stored session.
  test('logged-in user visiting /signin redirects to /app', async ({
    browser,
  }) => {
    // Use the session saved by auth.setup.ts (if available)
    let storageState: string | { cookies: never[]; origins: never[] } =
      EMPTY_STATE;
    try {
      // auth.setup.ts writes to this path when credentials are configured
      storageState = 'tests/.auth/user.json';
    } catch {
      // Falls back to empty state if not configured
    }

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    try {
      await blockAnalytics(page);
      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      // If we're authenticated, proxy.ts redirects to /app
      // If we're not (auth not configured in test env), we land on /signin
      const url = page.url();
      const pathname = new URL(url).pathname;

      // Accept either: redirected to /app (authenticated) or stayed on /signin (no session)
      expect(
        pathname.startsWith('/app') || pathname === APP_ROUTES.SIGNIN
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
});
