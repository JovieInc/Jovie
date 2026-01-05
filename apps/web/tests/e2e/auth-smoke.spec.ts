import { expect, test } from '@playwright/test';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { signInUser } from '../helpers/clerk-auth';
import {
  resetOnboarding,
  setOnboardingComplete,
} from '../helpers/onboarding-toggle';
import { setWaitlistState } from '../helpers/waitlist-toggle';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

function hasStatsigKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY);
}

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
    Boolean(process.env.DATABASE_URL)
  );
}

async function enableSpotifyOnlyGate(page: import('@playwright/test').Page) {
  if (!hasStatsigKey()) return;

  await page.evaluate(async gateName => {
    const w = window as unknown as {
      __STATSIG_OVERRIDES__?: Record<string, boolean>;
    };
    w.__STATSIG_OVERRIDES__ = {
      ...(w.__STATSIG_OVERRIDES__ ?? {}),
      [gateName]: true,
    };
  }, STATSIG_FLAGS.AUTH_SPOTIFY_ONLY);
}

/**
 * Auth smoke tests
 *
 * Verifies authentication flows work correctly.
 *
 * Hardened for reliability:
 * - Uses consistent timeout constants
 * - Uses shared monitoring utilities
 * - Enhanced error diagnostics
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
      // Handle both /signin and /sign-in URL patterns
      await expect(page).toHaveURL(/\/sign-?in/, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('signin UI is spotify-only when gate enabled @smoke', async ({
    page,
  }, testInfo) => {
    if (!hasRealClerkConfig()) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/signin');

      if (hasStatsigKey()) {
        await enableSpotifyOnlyGate(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }

      // Spotify should be present
      await expect(
        page.getByRole('button', { name: /continue with spotify/i })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Google/email should not be present when gate is enabled
      if (hasStatsigKey()) {
        await expect(
          page.getByRole('button', { name: /continue with google/i })
        ).toHaveCount(0);

        await expect(
          page.getByRole('button', { name: /continue with email/i })
        ).toHaveCount(0);
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('signed-in funnel routes deterministically via waitlist + onboarding @smoke', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);

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
});
