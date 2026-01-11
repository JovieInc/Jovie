import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

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
 * Auth Smoke Tests
 *
 * Minimal tests to verify authentication routes work correctly.
 * Complex authenticated flow tests are in nightly/auth-flows.spec.ts.
 *
 * @smoke
 */
test.describe('Auth smoke @smoke', () => {
  test('signed-out /app/dashboard redirects to /signin @smoke', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/app/dashboard');
      await expect(page).toHaveURL(/\/signin/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('signin page loads without server errors @smoke', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await smokeNavigate(page, '/signin');

      const status = response?.status() ?? 0;
      expect(status, 'Signin page should not return server error').toBeLessThan(
        500
      );

      // Wait for page to render
      await page.waitForLoadState('domcontentloaded');

      // Should have some content
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent, 'Signin page should have content').toBeTruthy();

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('signup page loads without server errors @smoke', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await smokeNavigate(page, '/sign-up');

      const status = response?.status() ?? 0;
      expect(status, 'Signup page should not return server error').toBeLessThan(
        500
      );

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
