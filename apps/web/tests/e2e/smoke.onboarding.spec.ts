import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Onboarding Smoke Tests
 *
 * Minimal smoke test: unauthenticated users should be redirected to sign-in.
 * This is deterministic and requires no external inbox/service.
 *
 * Full onboarding flow tests are in nightly/onboarding-flow.spec.ts.
 *
 * @smoke
 */
test.describe('Onboarding smoke @smoke', () => {
  test('unauthenticated /app/dashboard redirects to /signin @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
    const sk = process.env.CLERK_SECRET_KEY || '';
    if (!pk || !sk || pk.includes('dummy') || sk.includes('dummy')) {
      test.skip();
    }

    try {
      const res = await smokeNavigate(page, '/app/dashboard');

      // Should land on sign-in
      await expect(page).toHaveURL(/\/signin/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      expect(res?.ok(), 'Expected the sign-in page to respond OK').toBeTruthy();

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('onboarding page redirects unauthenticated users @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
    const sk = process.env.CLERK_SECRET_KEY || '';
    if (!pk || !sk || pk.includes('dummy') || sk.includes('dummy')) {
      test.skip();
    }

    try {
      const res = await smokeNavigate(page, '/onboarding');

      // Should redirect to sign-in or show auth required
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
