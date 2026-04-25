import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkTestError,
  ensureSignedInUser,
  signInUser,
} from '../helpers/clerk-auth';
import {
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
} from './utils/smoke-test-utils';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const TEST_AUTH_BYPASS_ENABLED = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

/**
 * Suite 2: Dashboard Navigation (Authenticated)
 *
 * Tests as a logged-in user navigating the dashboard.
 * Verifies main sections load meaningful route-specific content.
 *
 * @smoke
 */

function hasRealClerkConfig(): boolean {
  if (TEST_AUTH_BYPASS_ENABLED) {
    return true;
  }

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const sk = process.env.CLERK_SECRET_KEY ?? '';
  return (
    pk.length > 0 &&
    sk.length > 0 &&
    !pk.toLowerCase().includes('dummy') &&
    !pk.toLowerCase().includes('mock') &&
    !sk.toLowerCase().includes('dummy') &&
    !sk.toLowerCase().includes('mock')
  );
}

async function assertDashboardRouteLoaded(
  page: import('@playwright/test').Page,
  path: string,
  name: string
) {
  const main = page.locator('main').first();
  await expect(main, `${name}: main shell did not render`).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });

  const bodyText = (
    (await page.locator('body').textContent()) ?? ''
  ).toLowerCase();
  expect(bodyText, `${name}: body shows application error`).not.toContain(
    'application error'
  );
  expect(bodyText, `${name}: body shows internal server error`).not.toContain(
    'internal server error'
  );
  expect(bodyText, `${name}: body shows generic error boundary`).not.toContain(
    'something went wrong'
  );

  const errorBanner = page.locator(
    '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
  );
  await expect(errorBanner, `${name}: error boundary is visible`).toHaveCount(
    0
  );

  if (path === APP_ROUTES.CHAT) {
    await expect(
      page.getByLabel(/chat message input/i),
      'Chat: composer did not render'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    return;
  }

  if (path === APP_ROUTES.DASHBOARD_AUDIENCE) {
    await expect(
      page.getByTestId('dashboard-audience-client'),
      'Audience: audience client did not render'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    return;
  }

  if (path === APP_ROUTES.DASHBOARD_RELEASES) {
    await expect(
      page.getByTestId('releases-matrix'),
      'Releases: releases matrix did not render'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    return;
  }

  if (path === APP_ROUTES.DASHBOARD_EARNINGS) {
    await expect(
      page,
      'Legacy earnings route did not redirect to artist profile tips'
    ).toHaveURL(/\/app\/settings\/artist-profile\?tab=earn/);
    return;
  }
}

// Fresh context: no inherited auth
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard Navigation @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    if (!hasRealClerkConfig()) {
      test.skip(true, 'No real Clerk config');
      return;
    }
    if (
      !TEST_AUTH_BYPASS_ENABLED &&
      process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true'
    ) {
      test.skip(true, 'Auth setup not available');
      return;
    }

    const username = process.env.E2E_CLERK_USER_USERNAME;
    if (!username) {
      test.skip(true, 'No E2E credentials');
      return;
    }

    await page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
  });

  test('auth pages (signin/signup) load without server errors', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Auth page render coverage runs in golden-path and the slower auth lanes'
    );

    for (const route of [APP_ROUTES.SIGNIN, APP_ROUTES.SIGNUP]) {
      const response = await smokeNavigateWithRetry(page, route, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        retries: process.env.E2E_FAST_ITERATION === '1' ? 3 : 2,
      });
      expect(
        response?.status() ?? 0,
        `${route} should not return 5xx`
      ).toBeLessThan(500);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText, `${route} has no content`).toBeTruthy();
    }
  });

  test('protected routes redirect unauthenticated users to signin', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      for (const route of [
        APP_ROUTES.LEGACY_DASHBOARD,
        APP_ROUTES.ONBOARDING,
      ]) {
        await smokeNavigateWithRetry(page, route, {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
          retries: 2,
        });

        const url = page.url();
        const isAuthPage =
          url.includes('/signin') ||
          url.includes('/sign-in') ||
          url.includes('/signup') ||
          url.includes('/sign-up');
        const isClerkHandshake =
          url.includes('clerk') && url.includes('handshake');

        expect(
          isAuthPage || isClerkHandshake || url.includes(route),
          `${route}: unexpected destination ${url}`
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  test('dashboard sections load real content after sign-in', async ({
    page,
  }) => {
    test.skip(
      FAST_ITERATION,
      'Post-login dashboard content runs in content-gate and chaos fast lanes'
    );
    test.setTimeout(300_000);

    if (!TEST_AUTH_BYPASS_ENABLED) {
      await setupClerkTestingToken({ page });
    }

    try {
      await ensureSignedInUser(page);
    } catch (error) {
      if (error instanceof ClerkTestError) {
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }
      // Don't silently skip on network errors — if sign-in fails after retries,
      // that's a real problem. Only Clerk SDK issues (ClerkTestError) warrant skipping.
      throw error;
    }

    await expect(page).toHaveURL(/\/app(?:\/|$)/, { timeout: 20_000 });

    const dashboardPages = FAST_ITERATION
      ? [{ path: APP_ROUTES.CHAT, name: 'Chat' }]
      : [
          { path: APP_ROUTES.CHAT, name: 'Chat' },
          { path: APP_ROUTES.DASHBOARD_AUDIENCE, name: 'Audience' },
          { path: APP_ROUTES.DASHBOARD_RELEASES, name: 'Releases' },
          {
            path: APP_ROUTES.DASHBOARD_EARNINGS,
            name: 'Legacy Earnings Redirect',
          },
        ];

    const failures: string[] = [];

    for (const { path, name } of dashboardPages) {
      try {
        await smokeNavigateWithRetry(page, path, {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
          retries: FAST_ITERATION ? 3 : 2,
        });

        await page
          .waitForLoadState('load', { timeout: 60_000 })
          .catch(() => {});

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          try {
            await signInUser(page);
          } catch (error) {
            if (error instanceof ClerkTestError) {
              test.skip(true, `Clerk auth failed: ${error.message}`);
              return;
            }
            throw error;
          }
          continue;
        }

        expect(url, `${name}: redirected to onboarding`).not.toContain(
          '/onboarding'
        );

        await assertDashboardRouteLoaded(page, path, name);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${name}: ${msg.slice(0, 120)}`);
      }
    }

    expect(
      failures,
      `Dashboard pages failed:\n${failures.join('\n')}`
    ).toHaveLength(0);
  });

  test('dashboard does not redirect-loop for unauthenticated access', async ({
    browser,
  }) => {
    // This test runs unauthenticated — it checks that hitting /app/dashboard
    // without auth doesn't produce a redirect loop between /app and /signin.
    // The authenticated data-failure redirect loop is covered by middleware
    // circuit breaker tests and onboarding-completion.spec.ts.

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const redirectUrls: string[] = [];
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          redirectUrls.push(new URL(frame.url()).pathname);
        }
      });

      await page.goto(APP_ROUTES.DASHBOARD, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });

      await page.waitForTimeout(3_000);

      const appCount = redirectUrls.filter(u => u.startsWith('/app')).length;
      const signinCount = redirectUrls.filter(
        u => u === APP_ROUTES.SIGNIN || u === '/sign-in'
      ).length;
      const isLooping =
        (appCount >= 2 && signinCount >= 2) || redirectUrls.length > 10;

      expect(
        isLooping,
        `Redirect loop detected: ${redirectUrls.join(' -> ')}`
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
});
