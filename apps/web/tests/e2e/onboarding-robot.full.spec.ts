import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import {
  clearOnboardingRateLimits,
  completeOnboardingV2,
  DEFAULT_ONBOARDING_SPOTIFY_ARTIST,
  ensureDbUser,
  ensureServerAuthenticated,
  hasRealEnv,
  interceptTrackingCalls,
  onboardingProfileIsReady,
  purgeStaleClerkTestUsers,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';
import {
  authenticateOnboardingRobotUser,
  buildOnboardingRobotHandle,
  buildOnboardingRobotRunId,
  cleanupOnboardingRobotUser,
  createOnboardingRobotUser,
  installOnboardingAnalyticsCapture,
  type OnboardingRobotUser,
  readOnboardingRobotState,
  shouldUseProductionRobotAuth,
  waitForOnboardingRobotEvents,
} from './helpers/onboarding-robot';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Onboarding Robot Full Synthetic', () => {
  test('creates a profile, verifies dashboard/public profile, and cleans up', async ({
    page,
  }, testInfo) => {
    test.setTimeout(420_000);

    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }

    const productionRobotAuth = shouldUseProductionRobotAuth();
    if (
      !productionRobotAuth &&
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1' &&
      process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true'
    ) {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    await installOnboardingAnalyticsCapture(page);
    await interceptTrackingCalls(page);
    if (!productionRobotAuth) {
      await purgeStaleClerkTestUsers();
      await clearOnboardingRateLimits();
    }

    const runId = buildOnboardingRobotRunId(
      `${Date.now().toString(36)}-${testInfo.workerIndex}`
    );
    let robotUser: OnboardingRobotUser | null = null;

    try {
      const createdUser = await createOnboardingRobotUser(page, runId);
      const handle = buildOnboardingRobotHandle(runId, createdUser.clerkUserId);
      robotUser = { ...createdUser, handle };

      await ensureDbUser(robotUser.clerkUserId, robotUser.email, {
        clearRateLimits: !productionRobotAuth,
        knownSpotifyArtistIds: productionRobotAuth
          ? []
          : [DEFAULT_ONBOARDING_SPOTIFY_ARTIST.id],
      });
      await authenticateOnboardingRobotUser(page, robotUser);
      await ensureServerAuthenticated(page, robotUser.clerkUserId);

      await smokeNavigateWithRetry(
        page,
        `${APP_ROUTES.ONBOARDING}?handle=${encodeURIComponent(handle)}`,
        {
          retries: 2,
          timeout: 90_000,
        }
      );
      await expect(
        page.locator('[data-testid="onboarding-form-wrapper"]')
      ).toBeVisible({ timeout: 30_000 });

      await completeOnboardingV2(page, DEFAULT_ONBOARDING_SPOTIFY_ARTIST.url, {
        clerkUserId: robotUser.clerkUserId,
        expectedHandle: handle,
      });

      const importState = await waitForSpotifyImport(robotUser.clerkUserId);
      expect(onboardingProfileIsReady(importState)).toBe(true);

      await ensureServerAuthenticated(page, robotUser.clerkUserId);
      await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
        retries: 2,
        timeout: 120_000,
      });
      await expect(page).toHaveURL(/\/app(?:\/|$|\?)/, { timeout: 30_000 });
      await expect(page.locator('main')).not.toBeEmpty({ timeout: 20_000 });

      await waitForOnboardingRobotEvents(page, [
        ONBOARDING_FUNNEL_EVENTS.AUTH_COMPLETED,
        ONBOARDING_FUNNEL_EVENTS.PROFILE_CREATED,
        ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED,
      ]);

      const profileResponse = await page.goto(`/${handle}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      expect(profileResponse, 'public profile response').not.toBeNull();
      expect(profileResponse?.status()).toBeLessThan(400);
      await expect(page.locator('body')).not.toContainText(
        /profile not found|something went wrong/i
      );

      await ensureServerAuthenticated(page, robotUser.clerkUserId);
      const welcomeChatResponse = await page.request.post(
        '/api/onboarding/welcome-chat',
        { data: {} }
      );
      expect(welcomeChatResponse.ok()).toBe(true);
      const welcomeChatPayload = (await welcomeChatResponse.json()) as {
        conversationId?: string;
        route?: string;
      };
      expect(welcomeChatPayload.conversationId).toBeTruthy();
      expect(welcomeChatPayload.route).toMatch(/^\/app\/chat\//);

      const state = await readOnboardingRobotState(page);
      console.log(
        `[Synthetic][onboarding-robot] full scenario=profile-create run=${runId} handle=${handle} url=${state.url} events=${state.events
          .map(entry => entry.event)
          .join(',')}`
      );
    } finally {
      if (robotUser) {
        await cleanupOnboardingRobotUser(robotUser);
      }
    }
  });
});
