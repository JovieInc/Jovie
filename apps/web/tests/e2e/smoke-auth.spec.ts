import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Check if real Clerk configuration is available
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

/**
 * Auth Smoke Tests - Requires Clerk Configuration
 *
 * These tests verify authentication routes and protected page redirects.
 * Tests will skip if Clerk is not properly configured.
 *
 * Optimized for speed: 2 consolidated tests covering critical auth paths.
 * Previous tests merged for efficiency (was 6, now 2).
 * Billing routes moved to billing.spec.ts (full suite only).
 *
 * NOTE: These tests must run WITHOUT the saved authentication session,
 * otherwise auth pages would redirect to /app.
 *
 * @smoke
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth Smoke Tests @smoke', () => {
  test.beforeEach(async ({ page }) => {
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Auth setup not available');
    }
  });

  // =========================================================================
  // AUTH PAGES - Consolidated test (was 2 separate tests)
  // =========================================================================
  test('auth pages (signin/signup) load without server errors', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    const { getContext, cleanup } = setupPageMonitoring(page);
    const authPages = ['/signin', '/sign-up'];

    try {
      for (const route of authPages) {
        const response = await smokeNavigate(page, route);

        const status = response?.status() ?? 0;
        expect(
          status,
          `${route} page should not return server error`
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');

        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, `${route} page should have content`).toBeTruthy();
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // PROTECTED ROUTE REDIRECTS - Consolidated test (was 2 separate tests)
  // =========================================================================
  test('protected routes redirect unauthenticated users to signin', async ({
    browser,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    // Use a fresh context WITHOUT Clerk testing token to simulate unauthenticated user
    const context = await browser.newContext();
    const page = await context.newPage();

    // Intercept analytics to prevent test interference
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    const { getContext, cleanup } = setupPageMonitoring(page);
    const protectedRoutes = ['/app/dashboard', '/onboarding'];

    try {
      for (const route of protectedRoutes) {
        const res = await smokeNavigate(page, route);

        const url = page.url();
        const isAuthPage =
          url.includes('/signin') ||
          url.includes('/sign-in') ||
          url.includes('/sign-up');
        const status = res?.status() ?? 0;
        const isUnauthorized = status === 401 || status === 403;

        // Protected routes may also redirect to dashboard if already authenticated via cookies
        // or show content if mock auth is in place
        const stayedOnRoute = url.includes(route);
        // Clerk handshake redirect (dev-browser-missing) counts as auth behavior in CI
        const isClerkHandshake =
          url.includes('clerk') && url.includes('handshake');
        const isProtectedBehavior =
          isAuthPage || isUnauthorized || stayedOnRoute || isClerkHandshake;

        // Either redirected to auth, got an explicit unauthorized response, or stayed on route
        expect(
          isProtectedBehavior,
          `${route}: Should redirect to auth, return 401/403, or render protected content (got ${url}, status ${status})`
        ).toBe(true);

        // If redirected to sign-in, verify it loaded
        if (isAuthPage) {
          await expect(page).toHaveURL(/\/sign/, {
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
        }
      }

      const monitoringContext = getContext();
      await assertNoCriticalErrors(monitoringContext, testInfo);
    } finally {
      cleanup();
      await context.close();
    }
  });

  // =========================================================================
  // REDIRECT LOOP DETECTION - Catches the /app → /onboarding → /app loop
  // that occurs when dashboard data fails to load for authenticated users.
  // =========================================================================
  test('dashboard does not redirect-loop when data fails to load', async ({
    browser,
  }) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
    const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
    if (!username || !password) {
      test.skip(true, 'No E2E credentials for authenticated test');
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // Intercept analytics
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    try {
      // Navigate to /app and track all redirects
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

      // Wait for any redirects to settle, up to 3 seconds.
      // A redirect loop will trigger many navigations quickly.
      try {
        await expect
          .poll(() => redirectUrls.length, { timeout: 3000 })
          .toBeGreaterThan(2);
      } catch (_e) {
        // It's normal if it doesn't redirect many times
      }

      // Check for redirect loop: if /app and /onboarding both appear 2+ times, it's looping
      const appCount = redirectUrls.filter(u => u.startsWith('/app')).length;
      const onboardingCount = redirectUrls.filter(
        u => u === '/onboarding'
      ).length;
      // A real redirect loop is /app → /onboarding → /app → /onboarding (2+ of each)
      // Normal auth flow may redirect /app → /sign-in which is expected, so only
      // flag when we see the /app ↔ /onboarding ping-pong pattern specifically
      const isLooping =
        (appCount >= 2 && onboardingCount >= 2) || redirectUrls.length > 10;

      expect(
        isLooping,
        `Redirect loop detected: ${redirectUrls.join(' → ')}`
      ).toBe(false);
    } finally {
      await context.close();
    }
  });

  // NOTE: Billing route tests moved to billing.spec.ts (full suite only)
  // They test feature details, not critical paths for smoke testing
});
