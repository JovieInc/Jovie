import { expect, test } from '@playwright/test';
import { signInUser } from '../../helpers/clerk-auth';
import {
  resetOnboarding,
  setOnboardingComplete,
} from '../../helpers/onboarding-toggle';
import { setWaitlistState } from '../../helpers/waitlist-toggle';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from '../utils/smoke-test-utils';

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

function canRunAuthenticatedFixtures(): boolean {
  return (
    hasRealClerkConfig() &&
    Boolean(process.env.E2E_CLERK_USER_USERNAME) &&
    Boolean(process.env.DATABASE_URL) &&
    process.env.CLERK_TESTING_SETUP_SUCCESS === 'true'
  );
}

/**
 * Auth Flow Tests - Nightly
 *
 * Comprehensive authentication flow tests that require real Clerk credentials
 * and database access. Too slow and complex for smoke tests.
 *
 * @nightly
 */
test.describe('Auth flows @nightly', () => {
  test('signed-in funnel routes deterministically via waitlist + onboarding', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    if (!canRunAuthenticatedFixtures()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await signInUser(page);

      // Case 1: waitlist not claimed -> /waitlist
      await setWaitlistState(page, 'new');
      await resetOnboarding(page);

      await smokeNavigate(page, '/app/dashboard');
      await expect(page).toHaveURL(/\/waitlist/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Case 2: waitlist claimed but onboarding reset -> /onboarding
      await setWaitlistState(page, 'claimed');
      await resetOnboarding(page);

      await smokeNavigate(page, '/app/dashboard');
      await expect(page).toHaveURL(/\/onboarding/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Case 3: waitlist claimed + onboarding complete -> /app/dashboard
      await setWaitlistState(page, 'claimed');
      await setOnboardingComplete(page);

      await smokeNavigate(page, '/app/dashboard');
      await expect(page).toHaveURL(/\/app\/dashboard/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
