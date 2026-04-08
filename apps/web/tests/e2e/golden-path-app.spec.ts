import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildValidOnboardingHandle,
  completeOnboardingV2,
  createFreshUser,
  ensureDbUser,
  ensureServerAuthenticated,
  hasRealEnv,
  interceptTrackingCalls,
  purgeStaleClerkTestUsers,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';
import { setTestUserPlan } from './helpers/plan-helpers';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Golden Path E2E — Core App Flows
 *
 * Covers post-onboarding flows: welcome message, core pages, settings,
 * and chat. Complements golden-path.spec.ts (signup → stripe).
 *
 * @tag golden-path
 */

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

const TEST_SPOTIFY_ARTIST = {
  id: '6M2wZ9GZgrQXHCFfjv46we',
  url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
};

/* ------------------------------------------------------------------ */
/*  Section A: Welcome message (fresh user, no auth state)            */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Welcome Message', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(FAST_ITERATION, 'Golden path stays in the slower real-auth lane');

  // Fresh browser — no inherited auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }
    await purgeStaleClerkTestUsers();
    await interceptTrackingCalls(page);
  });

  test('welcome message prompts for career highlights when field is empty', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    test.info().annotations.push({ type: 'tag', description: '@golden-path' });

    const uniqueSeed = `gp-app-${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 8)}`;
    const { email, clerkUserId } = await createFreshUser(page, uniqueSeed);

    const knownSpotifyArtistIds = [
      '4Uwpa6zW3zzCSQvooQNksm',
      TEST_SPOTIFY_ARTIST.id,
    ];
    await ensureDbUser(clerkUserId, email, knownSpotifyArtistIds);
    await ensureServerAuthenticated(page, clerkUserId);

    const onboardingHandle = buildValidOnboardingHandle(
      uniqueSeed,
      clerkUserId
    );

    // Navigate to onboarding
    await smokeNavigateWithRetry(
      page,
      `/onboarding?handle=${onboardingHandle}`,
      {
        timeout: 45_000,
        retries: 2,
      }
    );

    await expect(
      page.locator('[data-testid="onboarding-form-wrapper"]')
    ).toBeVisible({ timeout: 20_000 });

    // Handle step
    const handleEl = page.getByLabel('Enter your desired handle');
    await expect(handleEl).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await handleEl.inputValue()).trim(), {
        timeout: 20_000,
      })
      .toBe(onboardingHandle);

    await completeOnboardingV2(page, TEST_SPOTIFY_ARTIST.url, {
      clerkUserId,
      expectedHandle: onboardingHandle,
    });

    await ensureServerAuthenticated(page, clerkUserId);
    await page.goto('/app', {
      waitUntil: 'commit',
      timeout: 60_000,
    });

    // Wait for dashboard
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Wait for onboarding to complete
    await expect
      .poll(
        async () => {
          const state = await waitForSpotifyImport(clerkUserId);
          return state?.onboarding_completed_at ? 'ready' : 'pending';
        },
        { timeout: 60_000, intervals: [2_000, 5_000, 10_000] }
      )
      .toBe('ready');

    // Bootstrap the onboarding welcome thread directly, then verify the message.
    const welcomeChatResponse = await page.request.post(
      '/api/onboarding/welcome-chat',
      {
        data: {},
      }
    );
    expect(welcomeChatResponse.ok()).toBeTruthy();
    const welcomeChatPayload = (await welcomeChatResponse.json()) as {
      route?: string;
    };
    expect(welcomeChatPayload.route).toBeTruthy();

    await smokeNavigateWithRetry(page, welcomeChatPayload.route!, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/chat\/[^?]+/, {
      timeout: 30_000,
    });

    // Verify the career highlights prompt appears inside a chat message, not sidebar/labels
    const welcomeMessage = page
      .locator('[data-role="assistant"]')
      .filter({ hasText: /career highlights/i })
      .first();
    await expect(welcomeMessage).toBeVisible({ timeout: 60_000 });
  });
});

/* ------------------------------------------------------------------ */
/*  Section B: Core app flows (authenticated, shared auth state)      */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Core App Flows', { tag: '@golden-path' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('releases page loads', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD_RELEASES, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/dashboard\/releases/, {
      timeout: 15_000,
    });
    // Verify no error page
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('audience page loads', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD_AUDIENCE, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/dashboard\/audience/, {
      timeout: 15_000,
    });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('presence page loads', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.PRESENCE, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/presence/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('earnings page loads', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.EARNINGS, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/(earnings|settings\/artist-profile)/, {
      timeout: 15_000,
    });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('artist profile settings loads with career highlights field', async ({
    page,
  }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.SETTINGS_ARTIST_PROFILE, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/settings\/artist-profile/, {
      timeout: 15_000,
    });

    // Career highlights field should be present
    const careerHighlightsField = page.locator('#careerHighlights');
    await expect(careerHighlightsField).toBeVisible({ timeout: 15_000 });
  });

  test('career highlights field saves successfully', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.SETTINGS_ARTIST_PROFILE, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);

    const careerHighlightsField = page.locator('#careerHighlights');
    await expect(careerHighlightsField).toBeVisible({ timeout: 15_000 });

    const testValue = `Golden path test ${Date.now()}`;
    await careerHighlightsField.fill(testValue);

    // Trigger auto-save via blur, then verify persistence after reload.
    await careerHighlightsField.blur();
    await expect
      .poll(
        async () => {
          await page.reload({ waitUntil: 'commit', timeout: 60_000 });
          await waitForHydration(page);
          return page.locator('#careerHighlights').inputValue();
        },
        {
          timeout: 60_000,
          intervals: [2_000, 5_000, 10_000],
        }
      )
      .toBe(testValue);
  });
});

/* ------------------------------------------------------------------ */
/*  Section C: Chat (authenticated, shared auth state)                */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Chat', { tag: '@golden-path' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('chat page loads', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/app\/chat/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('user can send a message and receive a response', async ({ page }) => {
    test.setTimeout(60_000);

    await setTestUserPlan(page, 'pro');
    await page.reload({ waitUntil: 'networkidle' });

    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);

    // Find the chat input
    const chatInput = page
      .getByPlaceholder(/ask jovie|chat message/i)
      .or(page.locator('textarea[data-testid="chat-input"]'))
      .or(page.locator('textarea').first());
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Send a test message
    await chatInput.fill('Hello, can you help me?');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();

    const assistantResponse = page.locator(
      '[data-index="1"], [class*="animate-bounce"], [data-role="assistant"]'
    );
    await expect(assistantResponse.first()).toBeVisible({ timeout: 60_000 });
  });

  test('audio dictation toggle is present', async ({ page }) => {
    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: 60_000,
      retries: 2,
    });
    await waitForHydration(page);

    // Look for microphone / dictation button
    const dictationToggle = page
      .getByRole('button', {
        name: /dictate|dictation|microphone|voice|audio/i,
      })
      .or(page.locator('[data-testid="dictation-toggle"]'))
      .or(page.locator('button[aria-label*="icrophone"]'));
    await expect(dictationToggle).toBeVisible({ timeout: 15_000 });
  });
});
