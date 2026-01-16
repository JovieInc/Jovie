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
 * @smoke
 */
test.describe('Auth Smoke Tests @smoke', () => {
  // =========================================================================
  // AUTH PAGES - Consolidated test (was 2 separate tests)
  // =========================================================================
  test('auth pages (signin/signup) load without server errors', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

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
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);
    const protectedRoutes = ['/app/dashboard', '/onboarding'];

    try {
      for (const route of protectedRoutes) {
        const res = await smokeNavigate(page, route);

        const url = page.url();
        const isAuthPage = url.includes('/signin') || url.includes('/sign-in');
        const status = res?.status() ?? 0;
        const isUnauthorized = status === 401 || status === 403;

        // Either redirected to auth or got an explicit unauthorized response.
        expect(
          isAuthPage || isUnauthorized,
          `${route}: Should redirect to auth or return 401/403`
        ).toBe(true);

        // If redirected to sign-in, verify it loaded; otherwise assert 401/403 explicitly.
        if (isAuthPage) {
          await expect(page).toHaveURL(/\/sign-?in/, {
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
          expect(
            res?.ok(),
            `${route}: Sign-in page should respond OK`
          ).toBeTruthy();
        } else {
          expect([401, 403]).toContain(status);
        }
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  // NOTE: Billing route tests moved to billing.spec.ts (full suite only)
  // They test feature details, not critical paths for smoke testing
});
