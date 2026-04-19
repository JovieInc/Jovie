import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser } from '../helpers/clerk-auth';
import {
  buildValidOnboardingHandle,
  createFreshUser,
  ensureDbUser,
  ensureServerAuthenticated,
  hasRealEnv,
  interceptTrackingCalls,
  purgeStaleClerkTestUsers,
  seedOnboardedCreatorProfile,
} from './helpers/e2e-helpers';
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
  id: '4Uwpa6zW3zzCSQvooQNksm',
  url: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
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

    await seedOnboardedCreatorProfile({
      clerkUserId,
      handle: onboardingHandle,
      displayName: 'Golden Path',
      spotifyId: TEST_SPOTIFY_ARTIST.id,
      spotifyUrl: TEST_SPOTIFY_ARTIST.url,
    });

    await ensureServerAuthenticated(page, clerkUserId);
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      timeout: 60_000,
      retries: 2,
    });
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

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

  test.beforeEach(async ({ page }) => {
    await ensureSignedInUser(page);
  });

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
    await expect
      .poll(
        () => {
          const currentUrl = new URL(page.url());
          if (
            currentUrl.pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE &&
            currentUrl.searchParams.get('tab') === 'music'
          ) {
            return 'settings-music';
          }

          if (currentUrl.pathname === APP_ROUTES.PRESENCE) {
            return 'presence';
          }

          return currentUrl.pathname;
        },
        { timeout: 15_000 }
      )
      .toMatch(/presence|settings-music/);

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

    // Start waiting before editing so the test does not miss a fast save, and
    // allow extra time for local dev-route compilation on the first PUT.
    const saveResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard/profile') &&
        response.request().method() === 'PUT',
      { timeout: 60_000 }
    );
    await careerHighlightsField.fill(testValue);
    await careerHighlightsField.press('Tab');
    expect((await saveResponse).ok()).toBeTruthy();

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

  test.beforeEach(async ({ page }) => {
    await ensureSignedInUser(page);
  });

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

  test('user can send a message and receive a response', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);

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

    const profileResponse = await page.request.get('/api/dashboard/profile');
    expect(profileResponse.ok()).toBeTruthy();
    const profilePayload = (await profileResponse.json()) as {
      profile?: {
        usernameNormalized?: string | null;
      };
    };
    const expectedProfilePath = `/${profilePayload.profile?.usernameNormalized ?? ''}`;
    expect(profilePayload.profile?.usernameNormalized).toBeTruthy();

    // Use a deterministic command so this assertion is not gated on model latency.
    await chatInput.fill('preview profile');
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    const assistantMessages = page.locator('[data-role="assistant"]');
    const previousAssistantCount = await assistantMessages.count();
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
    await sendButton.click();

    await expect
      .poll(() => assistantMessages.count(), { timeout: 15_000 })
      .toBeGreaterThan(previousAssistantCount);
    await expect(assistantMessages.nth(previousAssistantCount)).toBeVisible({
      timeout: 15_000,
    });

    const previewPage = await popupPromise;
    await previewPage.waitForLoadState('domcontentloaded');
    await expect(previewPage).toHaveURL(
      new RegExp(`${expectedProfilePath.replace('/', '\\/')}([?#].*)?$`),
      { timeout: 15_000 }
    );
    await previewPage.close();

    await expect(assistantMessages.nth(previousAssistantCount)).toContainText(
      /profile/i
    );
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
