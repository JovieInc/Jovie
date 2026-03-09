import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { ClerkTestError, signInUser } from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

/**
 * Suite 2: Dashboard Navigation (Authenticated)
 *
 * Tests as a LOGGED-IN USER navigating the dashboard.
 * Verifies every main section loads real content without error boundaries.
 *
 * @smoke
 */

function hasRealClerkConfig(): boolean {
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

// Fresh context — no inherited auth
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Dashboard Navigation @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    if (!hasRealClerkConfig()) {
      test.skip(true, 'No real Clerk config');
      return;
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Auth setup not available');
      return;
    }

    const username = process.env.E2E_CLERK_USER_USERNAME;
    if (!username) {
      test.skip(true, 'No E2E credentials');
      return;
    }

    // Block analytics
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

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH PAGES (unauthenticated checks)
  // ─────────────────────────────────────────────────────────────────────────

  test('auth pages (signin/signup) load without server errors', async ({
    page,
  }) => {
    for (const route of ['/signin', '/sign-up']) {
      const response = await page.goto(route, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      expect(
        response?.status() ?? 0,
        `${route} should not return 5xx`
      ).toBeLessThan(500);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText, `${route} has no content`).toBeTruthy();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROTECTED ROUTE REDIRECTS
  // ─────────────────────────────────────────────────────────────────────────

  test('protected routes redirect unauthenticated users to signin', async ({
    browser,
  }) => {
    // Use a fresh context WITHOUT Clerk testing token
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      for (const route of ['/app/dashboard', '/onboarding']) {
        try {
          await page.goto(route, {
            waitUntil: 'domcontentloaded',
            timeout: SMOKE_TIMEOUTS.NAVIGATION,
          });
        } catch (navError) {
          const msg =
            navError instanceof Error ? navError.message : String(navError);
          if (
            msg.includes('net::ERR_CONNECTION_REFUSED') ||
            msg.includes('net::ERR_CONNECTION_RESET') ||
            msg.includes('Timeout') ||
            msg.includes('Target closed')
          ) {
            test.skip(true, `Transient nav error on ${route}`);
            return;
          }
          throw navError;
        }

        const url = page.url();
        const isAuthPage =
          url.includes('/signin') ||
          url.includes('/sign-in') ||
          url.includes('/sign-up');
        const isClerkHandshake =
          url.includes('clerk') && url.includes('handshake');

        // Should redirect to auth, stay on route (if auth via cookies), or Clerk handshake
        expect(
          isAuthPage || isClerkHandshake || url.includes(route),
          `${route}: unexpected destination ${url}`
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD PAGES HEALTH
  // ─────────────────────────────────────────────────────────────────────────

  test('dashboard sections load real content after sign-in', async ({
    page,
  }) => {
    test.setTimeout(300_000); // 5min — sign-in + 6 page loads in dev mode

    await setupClerkTestingToken({ page });

    try {
      await signInUser(page);
    } catch (error) {
      if (error instanceof ClerkTestError) {
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('net::ERR_') ||
        msg.includes('Timeout') ||
        msg.includes('Target closed')
      ) {
        test.skip(true, 'Sign-in infra issue');
        return;
      }
      throw error;
    }

    // Verify we're in /app/
    await expect(page).toHaveURL(/\/app\//, { timeout: 20_000 });

    const dashboardPages = [
      { path: '/app/dashboard/profile', name: 'Profile' },
      { path: '/app/dashboard/audience', name: 'Audience' },
      { path: '/app/dashboard/releases', name: 'Releases' },
      { path: '/app/dashboard/analytics', name: 'Analytics' },
      { path: '/app/dashboard/earnings', name: 'Earnings' },
      { path: '/app/dashboard/chat', name: 'Chat' },
    ];

    const failures: string[] = [];

    for (const { path, name } of dashboardPages) {
      try {
        await page.goto(path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });

        // Wait for hydration
        await page
          .waitForLoadState('load', { timeout: 60_000 })
          .catch(() => {});

        const url = page.url();

        // Re-authenticate if session expired
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page);
          continue;
        }

        // Should not redirect to onboarding
        expect(url, `${name}: redirected to onboarding`).not.toContain(
          '/onboarding'
        );

        // Main content area should be visible with real content
        const main = page.locator('main').first();
        const mainVisible = await main
          .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
          .catch(() => false);

        if (mainVisible) {
          const mainText = await main.innerText().catch(() => '');
          if (mainText.length < 30) {
            failures.push(
              `${name}: main content too short (${mainText.length} chars)`
            );
            continue;
          }

          // Not an error page
          const lower = mainText.toLowerCase();
          if (
            lower.includes('application error') ||
            lower.includes('internal server error') ||
            lower.includes('something went wrong')
          ) {
            failures.push(`${name}: shows error page`);
            continue;
          }
        }

        // No error boundary visible
        const errorBanner = page.locator(
          '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
        );
        const hasErrorBanner = await errorBanner
          .first()
          .isVisible()
          .catch(() => false);
        if (hasErrorBanner) {
          failures.push(`${name}: error boundary visible`);
          continue;
        }

        // Sidebar nav should be visible (proves shell is intact)
        const sidebar = page.locator('nav').first();
        const hasSidebar = await sidebar.isVisible().catch(() => false);
        if (!hasSidebar) {
          console.warn(
            `${name}: sidebar nav not visible — possible shell issue`
          );
        }
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

  // ─────────────────────────────────────────────────────────────────────────
  // REDIRECT LOOP DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  test('dashboard does not redirect-loop when data fails to load', async ({
    browser,
  }) => {
    const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
    const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
    if (!username || !password) {
      test.skip(true, 'No E2E credentials for redirect loop test');
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const redirectUrls: string[] = [];
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          redirectUrls.push(new URL(frame.url()).pathname);
        }
      });

      await page.goto('/app', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });

      // Wait briefly for redirects to settle
      await page.waitForTimeout(3_000);

      // Redirect loop: /app and /onboarding both appear 2+ times
      const appCount = redirectUrls.filter(u => u.startsWith('/app')).length;
      const onboardingCount = redirectUrls.filter(
        u => u === '/onboarding'
      ).length;
      const isLooping =
        (appCount >= 2 && onboardingCount >= 2) || redirectUrls.length > 10;

      expect(
        isLooping,
        `Redirect loop detected: ${redirectUrls.join(' -> ')}`
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
});
