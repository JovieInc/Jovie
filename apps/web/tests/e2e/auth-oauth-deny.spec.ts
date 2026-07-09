/**
 * Regression: oauth_error=access_denied banner renders on /signin and /signup
 *
 * Audit findings: #86, #26 (JOV-2182)
 * Tracks: JOV-2396
 *
 * These tests assert that when a user denies OAuth consent on the provider
 * screen and is redirected back with ?oauth_error=access_denied, a visible
 * [role=alert] banner is present — not silently swallowed.
 *
 * Run: pnpm run test:web:e2e -- tests/e2e/auth-oauth-deny.spec.ts
 */
import { Browser, expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

// Anonymous context — no stored auth.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_TIMEOUT = 60_000;
const BANNER_TIMEOUT = 20_000;
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

async function createAnonPage(browser: Browser) {
  const context = await browser.newContext({ storageState: EMPTY_STATE });
  const page = await context.newPage();

  // Clerk → Better Auth migration: setupClerkTestingToken removed.

  return { page, context };
}

// ---------------------------------------------------------------------------
// /signin?oauth_error=access_denied — banner must be present
// ---------------------------------------------------------------------------
test.describe('/signin — oauth_error=access_denied banner', () => {
  test('renders [role=alert] banner on /signin?oauth_error=access_denied', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNIN}?oauth_error=access_denied`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      // Page must stay on /signin
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: 10_000,
      });

      if (await isAuthUnavailable(page)) {
        // If auth is unavailable, at minimum verify no unhandled error
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('Unhandled Runtime Error');
        return;
      }

      // The oauth_error banner must be visible — regression guard for #86
      const banner = page.getByRole('alert').first();
      await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT });

      const bannerText = await banner.textContent();
      expect(bannerText?.toLowerCase()).toMatch(
        /cancel|deny|try again|different method/
      );
    } finally {
      await context.close();
    }
  });

  test('banner text mentions cancellation or retry on /signin?oauth_error=access_denied', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNIN}?oauth_error=access_denied`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      if (await isAuthUnavailable(page)) {
        console.log(
          '[auth-oauth-deny] Auth unavailable in test env — skipping banner text assertion'
        );
        return;
      }

      const banner = page.getByRole('alert').first();
      await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT });
      const bannerText = (await banner.textContent()) ?? '';
      // "Sign-in was cancelled. Try again, or pick a different method."
      expect(bannerText.toLowerCase()).toContain('sign-in was cancelled');
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// /signup?oauth_error=access_denied — banner must be present
// ---------------------------------------------------------------------------
test.describe('/signup — oauth_error=access_denied banner', () => {
  test('renders [role=alert] banner on /signup?oauth_error=access_denied', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNUP}?oauth_error=access_denied`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
        timeout: 10_000,
      });

      if (await isAuthUnavailable(page)) {
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('Unhandled Runtime Error');
        return;
      }

      // The oauth_error banner must be visible — regression guard for #26 / #86
      const banner = page.getByRole('alert').first();
      await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT });

      const bannerText = await banner.textContent();
      expect(bannerText?.toLowerCase()).toMatch(
        /cancel|deny|try again|different method/
      );
    } finally {
      await context.close();
    }
  });

  test('banner text mentions cancellation or retry on /signup?oauth_error=access_denied', async ({
    browser,
  }) => {
    const { page, context } = await createAnonPage(browser);

    try {
      await blockAnalytics(page);
      await page.goto(`${APP_ROUTES.SIGNUP}?oauth_error=access_denied`, {
        waitUntil: 'load',
        timeout: AUTH_TIMEOUT,
      });

      if (await isAuthUnavailable(page)) {
        console.log(
          '[auth-oauth-deny] Auth unavailable in test env — skipping banner text assertion'
        );
        return;
      }

      const banner = page.getByRole('alert').first();
      await expect(banner).toBeVisible({ timeout: BANNER_TIMEOUT });
      const bannerText = (await banner.textContent()) ?? '';
      // "Sign-in was cancelled. Try again, or pick a different method."
      expect(bannerText.toLowerCase()).toContain('sign-in was cancelled');
    } finally {
      await context.close();
    }
  });
});
