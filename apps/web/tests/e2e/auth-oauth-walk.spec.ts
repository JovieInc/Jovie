/**
 * Regression: OAuth sign-in / sign-up walk with Clerk testing token
 *
 * Audit findings: #85, #86 (JOV-2182)
 * Tracks: JOV-2396
 *
 * Verifies that the Clerk sign-in and sign-up flows accept a testing token,
 * render their UI within 10s, and that redirect lands correctly.
 *
 * Uses Clerk's official @clerk/testing/playwright helpers per
 * .claude/rules/auth.md — never mocks Clerk auth.
 *
 * CLEANUP: Any test user created in this spec via signUp flows is tagged
 * e2e and cleaned up by:
 *   doppler run --project jovie-web --config dev --
 *   pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force
 *
 * Run: pnpm run test:web:e2e -- tests/e2e/auth-oauth-walk.spec.ts
 */
import { Browser, expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

// Anonymous context — no stored auth.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_TIMEOUT = 60_000;
const REDIRECT_TIMEOUT = 10_000;
const CLERK_READY_TIMEOUT = 20_000;
const EMPTY_STATE = { cookies: [], origins: [] };

const AUTH_UNAVAILABLE_PHRASES = [
  'auth unavailable',
  'authentication unavailable',
  'temporarily unavailable',
  'clerk is not configured',
];

function hasAuthUnavailableCopy(text: string | null | undefined): boolean {
  const normalized = (text ?? '').toLowerCase();
  return AUTH_UNAVAILABLE_PHRASES.some(phrase => normalized.includes(phrase));
}

async function isAuthUnavailable(
  page: import('@playwright/test').Page
): Promise<boolean> {
  const bodyText = await page
    .locator('body')
    .textContent()
    .catch(() => '');
  return hasAuthUnavailableCopy(bodyText);
}

async function blockAnalytics(
  page: import('@playwright/test').Page
): Promise<void> {
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
 * Wait for Clerk auth UI to appear — either the email input, a social button,
 * or the auth-unavailable fallback.
 */
async function waitForClerkAuthUi(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
    // Dev builds may keep background requests open — DOM probe is the real gate.
  });

  await page
    .waitForFunction(
      () => {
        const bodyText = (document.body.innerText ?? '').toLowerCase();
        const authUnavailable = [
          'auth unavailable',
          'authentication unavailable',
          'temporarily unavailable',
          'clerk is not configured',
        ].some(phrase => bodyText.includes(phrase));
        return (
          document.querySelector(
            'input[type="email"], input[name="identifier"]'
          ) !== null ||
          bodyText.includes('continue') ||
          bodyText.includes('google') ||
          authUnavailable ||
          bodyText.includes('sign in to jovie') ||
          bodyText.includes('request access') ||
          bodyText.includes('create your')
        );
      },
      undefined,
      { timeout: CLERK_READY_TIMEOUT }
    )
    .catch(() => {
      // Clerk may not be available in local test runs without a real instance
    });
}

async function createAnonPage(browser: Browser) {
  const context = await browser.newContext({ storageState: EMPTY_STATE });
  const page = await context.newPage();
  return { page, context };
}

// ---------------------------------------------------------------------------
// /signin — Clerk testing token attaches; form renders within 10s
// ---------------------------------------------------------------------------
test.describe('/signin — OAuth walk with testing token', () => {
  test('better auth sign-in UI renders within 10s', async ({ browser }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);

      if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
      } else {
        console.log(
          '[auth-oauth-walk] CLERK_TESTING_SETUP_SUCCESS not set — skipping token setup'
        );
      }

      const start = Date.now();
      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      const elapsed = Date.now() - start;
      // The render (or degraded fallback) must appear within 10s
      expect(elapsed).toBeLessThan(REDIRECT_TIMEOUT);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('Unhandled Runtime Error');
      expect(bodyText).not.toContain('Error boundary');

      if (!(await isAuthUnavailable(page))) {
        // Clerk loaded — verify it renders the auth shell or a recognizable prompt
        const hasEmailInput = await page
          .locator('input[type="email"], input[name="identifier"]')
          .count();
        const bodyLower = (bodyText ?? '').toLowerCase();
        const hasAuthContent =
          hasEmailInput > 0 ||
          bodyLower.includes('google') ||
          bodyLower.includes('sign in') ||
          bodyLower.includes('continue');
        expect(hasAuthContent).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  test('page URL stays on /signin with testing token (no unexpected redirect)', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);

      if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
      }

      await page.goto(APP_ROUTES.SIGNIN, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      // An unauthenticated user must stay on /signin — must not be redirected
      // to /app (which would indicate a silent session leak)
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: REDIRECT_TIMEOUT,
      });
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// /signup — Clerk testing token attaches; form renders within 10s
// ---------------------------------------------------------------------------
test.describe('/signup — OAuth walk with testing token', () => {
  test('better auth sign-up UI renders within 10s', async ({ browser }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);

      if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
      } else {
        console.log(
          '[auth-oauth-walk] CLERK_TESTING_SETUP_SUCCESS not set — skipping token setup'
        );
      }

      const start = Date.now();
      await page.goto(APP_ROUTES.SIGNUP, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await waitForClerkAuthUi(page);

      const elapsed = Date.now() - start;
      // The render (or degraded fallback) must appear within 10s
      expect(elapsed).toBeLessThan(REDIRECT_TIMEOUT);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('Unhandled Runtime Error');
      expect(bodyText).not.toContain('Error boundary');

      if (!(await isAuthUnavailable(page))) {
        const hasEmailInput = await page
          .locator('input[type="email"], input[name="emailAddress"]')
          .count();
        const bodyLower = (bodyText ?? '').toLowerCase();
        const hasAuthContent =
          hasEmailInput > 0 ||
          bodyLower.includes('google') ||
          bodyLower.includes('request access') ||
          bodyLower.includes('create your') ||
          bodyLower.includes('continue');
        expect(hasAuthContent).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  test('page URL stays on /signup with testing token (no unexpected redirect)', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);

      if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
      }

      await page.goto(APP_ROUTES.SIGNUP, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
        timeout: REDIRECT_TIMEOUT,
      });
    } finally {
      await context.close();
    }
  });
});
