import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  assertValidPageState,
  isCriticalNetworkFailure,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  waitForUrlStable,
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
 * Consolidates:
 * - auth-smoke.spec.ts (signin/signup pages, dashboard redirect)
 * - smoke.onboarding.spec.ts (dashboard/onboarding redirects)
 * - smoke.billing.spec.ts (billing/account page redirects)
 *
 * @smoke
 */
test.describe('Auth Smoke Tests @smoke', () => {
  // =========================================================================
  // AUTH PAGE TESTS
  // =========================================================================
  test.describe('Auth Pages', () => {
    test('signin page loads without server errors', async ({
      page,
    }, testInfo) => {
      if (!hasRealClerkConfig()) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(page, '/signin');

        const status = response?.status() ?? 0;
        expect(
          status,
          'Signin page should not return server error'
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');

        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Signin page should have content').toBeTruthy();

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('signup page loads without server errors', async ({
      page,
    }, testInfo) => {
      if (!hasRealClerkConfig()) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(page, '/sign-up');

        const status = response?.status() ?? 0;
        expect(
          status,
          'Signup page should not return server error'
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');

        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Signup page should have content').toBeTruthy();

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });

  // =========================================================================
  // PROTECTED ROUTE REDIRECT TESTS
  // =========================================================================
  test.describe('Protected Route Redirects', () => {
    test('unauthenticated /app/dashboard redirects to /signin', async ({
      page,
    }, testInfo) => {
      if (!hasRealClerkConfig()) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const res = await smokeNavigate(page, '/app/dashboard');

        await expect(page).toHaveURL(/\/signin/, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        expect(
          res?.ok(),
          'Expected the sign-in page to respond OK'
        ).toBeTruthy();

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('unauthenticated /onboarding redirects to auth', async ({
      page,
    }, testInfo) => {
      if (!hasRealClerkConfig()) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const res = await smokeNavigate(page, '/onboarding');

        const url = page.url();
        const isAuthPage = url.includes('/signin') || url.includes('/sign-in');
        const status = res?.status() ?? 0;

        // Either redirected to auth or got a valid response
        expect(
          isAuthPage || status < 500,
          'Should redirect to auth or respond without error'
        ).toBe(true);

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });

  // =========================================================================
  // BILLING ROUTE TESTS
  // =========================================================================
  test.describe('Billing Routes', () => {
    test('/billing redirects or loads without errors', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await smokeNavigate(page, '/billing');

        await waitForUrlStable(
          page,
          url =>
            url.pathname.includes('/signin') ||
            url.pathname.includes('/signup') ||
            url.pathname.includes('/billing')
        );

        const { isOnAuthPage } = await assertValidPageState(page, {
          expectedPaths: ['/billing'],
          allowAuthRedirect: true,
        });

        // In mock Clerk mode, redirect to sign-in is sufficient
        if (isOnAuthPage) {
          await expect(page.locator('body')).toBeVisible();
          return;
        }

        const context = getContext();
        const criticalFailures =
          context.networkDiagnostics.failedResponses.filter(
            isCriticalNetworkFailure
          );
        expect(
          criticalFailures.length,
          `Critical API failures: ${JSON.stringify(criticalFailures)}`
        ).toBe(0);

        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('/account redirects or loads without errors', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await smokeNavigate(page, '/account');

        await waitForUrlStable(
          page,
          url =>
            url.pathname.includes('/signin') ||
            url.pathname.includes('/signup') ||
            url.pathname.includes('/account')
        );

        const { isOnAuthPage } = await assertValidPageState(page, {
          expectedPaths: ['/account'],
          allowAuthRedirect: true,
        });

        if (isOnAuthPage) {
          await expect(page.locator('body')).toBeVisible();
          return;
        }

        const context = getContext();
        const criticalFailures =
          context.networkDiagnostics.failedResponses.filter(
            isCriticalNetworkFailure
          );
        expect(criticalFailures.length).toBe(0);

        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('/billing/success redirects or loads without errors', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await smokeNavigate(page, '/billing/success');

        await waitForUrlStable(
          page,
          url =>
            url.pathname.includes('/signin') ||
            url.pathname.includes('/signup') ||
            url.pathname.includes('/billing/success')
        );

        const { isOnAuthPage, isOnExpectedPath } = await assertValidPageState(
          page,
          {
            expectedPaths: ['/billing/success'],
            allowAuthRedirect: true,
          }
        );

        if (isOnAuthPage) {
          await expect(page.locator('body')).toBeVisible();
          return;
        }

        if (isOnExpectedPath) {
          await page.waitForLoadState('domcontentloaded');
          const bodyText = await page.textContent('body');
          expect(bodyText).toBeTruthy();
          expect(
            bodyText?.length,
            'Page should have meaningful content'
          ).toBeGreaterThan(100);
        }

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('/billing/cancel redirects or loads without errors', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await smokeNavigate(page, '/billing/cancel');

        await waitForUrlStable(
          page,
          url =>
            url.pathname.includes('/signin') ||
            url.pathname.includes('/signup') ||
            url.pathname.includes('/billing/cancel')
        );

        const { isOnAuthPage, isOnExpectedPath } = await assertValidPageState(
          page,
          {
            expectedPaths: ['/billing/cancel'],
            allowAuthRedirect: true,
          }
        );

        if (isOnAuthPage) {
          await expect(page.locator('body')).toBeVisible();
          return;
        }

        if (isOnExpectedPath) {
          const bodyText = await page.textContent('body');
          const hasCancelContent =
            bodyText !== null &&
            (bodyText.toLowerCase().includes('cancel') ||
              bodyText.toLowerCase().includes('dashboard') ||
              bodyText.toLowerCase().includes('worry'));
          expect(
            hasCancelContent,
            'Cancel page should have relevant content'
          ).toBe(true);
        }

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });
});
