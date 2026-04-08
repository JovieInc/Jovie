import { expect, test } from '@playwright/test';
import {
  advanceOnboardingAfterArtistSelection,
  buildValidOnboardingHandle,
  createFreshUser,
  ensureDbUser,
  hasRealEnv,
  interceptTrackingCalls,
  purgeStaleClerkTestUsers,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';

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
  id: '59NJtiWq8nISIJjDtITQyt',
  url: 'https://open.spotify.com/artist/59NJtiWq8nISIJjDtITQyt',
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

    const onboardingHandle = buildValidOnboardingHandle(
      uniqueSeed,
      clerkUserId
    );

    // Navigate to onboarding
    await page.goto(`/onboarding?handle=${onboardingHandle}`, {
      waitUntil: 'commit',
      timeout: 45_000,
    });

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

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 20_000 });
    await continueBtn.click();

    // Artist search step
    const artistInput = page.getByPlaceholder(/search.*artist.*spotify/i);
    await expect(artistInput).toBeVisible({ timeout: 60_000 });
    await artistInput.fill(TEST_SPOTIFY_ARTIST.url);

    // Profile review or direct to dashboard
    const reviewDisplayName = page.locator('#onboarding-display-name');
    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });

    const reviewStepOrDashboard =
      await advanceOnboardingAfterArtistSelection(page);

    if (reviewStepOrDashboard === 'review') {
      const initialDisplayName = await reviewDisplayName.inputValue();
      if (initialDisplayName.trim().length === 0) {
        await reviewDisplayName.fill('Golden Path App Artist');
      }
      const dashboardExit = await Promise.race([
        goToDashboardBtn
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => 'button' as const)
          .catch(() => null),
        page
          .waitForURL(/\/app/, { timeout: 10_000 })
          .then(() => 'dashboard' as const)
          .catch(() => null),
      ]);

      if (dashboardExit === 'button') {
        await expect(goToDashboardBtn).toBeEnabled({ timeout: 10_000 });
        await goToDashboardBtn.click();
      }
    }

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

    // Navigate to chat and verify welcome message
    await page.goto('/app/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Verify the career highlights prompt appears inside a chat message, not sidebar/labels
    const welcomeMessage = page
      .locator('[data-role="assistant"]')
      .filter({ hasText: /career highlights/i })
      .first();
    await expect(welcomeMessage).toBeVisible({ timeout: 30_000 });
  });
});

/* ------------------------------------------------------------------ */
/*  Section B: Core app flows (authenticated, shared auth state)      */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Core App Flows', { tag: '@golden-path' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('releases page loads', async ({ page }) => {
    await page.goto('/app/releases', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/releases/, { timeout: 15_000 });
    // Verify no error page
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('audience page loads', async ({ page }) => {
    await page.goto('/app/audience', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/audience/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('presence page loads', async ({ page }) => {
    await page.goto('/app/presence', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/presence/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('earnings page loads', async ({ page }) => {
    await page.goto('/app/earnings', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/earnings/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('artist profile settings loads with career highlights field', async ({
    page,
  }) => {
    await page.goto('/app/settings/artist-profile', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/settings\/artist-profile/, {
      timeout: 15_000,
    });

    // Career highlights field should be present
    const careerHighlightsField = page.locator('#careerHighlights');
    await expect(careerHighlightsField).toBeVisible({ timeout: 15_000 });
  });

  test('career highlights field saves successfully', async ({ page }) => {
    await page.goto('/app/settings/artist-profile', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const careerHighlightsField = page.locator('#careerHighlights');
    await expect(careerHighlightsField).toBeVisible({ timeout: 15_000 });

    const testValue = `Golden path test ${Date.now()}`;
    await careerHighlightsField.fill(testValue);

    // Trigger save via blur and wait for the network response
    const savePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard/profile') &&
        response.request().method() === 'PATCH',
      { timeout: 10_000 }
    );
    await careerHighlightsField.blur();
    await savePromise;

    // Reload and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    const reloadedField = page.locator('#careerHighlights');
    await expect(reloadedField).toBeVisible({ timeout: 15_000 });
    await expect(reloadedField).toHaveValue(testValue, { timeout: 10_000 });
  });
});

/* ------------------------------------------------------------------ */
/*  Section C: Chat (authenticated, shared auth state)                */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Chat', { tag: '@golden-path' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('chat page loads', async ({ page }) => {
    await page.goto('/app/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/app\/chat/, { timeout: 15_000 });
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('user can send a message and receive a response', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/app/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Find the chat input
    const chatInput = page
      .getByPlaceholder(/message/i)
      .or(page.locator('textarea[data-testid="chat-input"]'))
      .or(page.locator('textarea').first());
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Count existing assistant messages before sending
    const assistantLocator = page
      .locator('[data-role="assistant"]')
      .or(page.locator('.assistant-message'));
    const countBefore = await assistantLocator.count();

    // Send a test message
    await chatInput.fill('Hello, can you help me?');
    await chatInput.press('Enter');

    // Wait for a NEW assistant response (count must increase)
    await expect
      .poll(async () => assistantLocator.count(), { timeout: 30_000 })
      .toBeGreaterThan(countBefore);
  });

  test('audio dictation toggle is present', async ({ page }) => {
    await page.goto('/app/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Look for microphone / dictation button
    const dictationToggle = page
      .getByRole('button', { name: /dictation|microphone|voice|audio/i })
      .or(page.locator('[data-testid="dictation-toggle"]'))
      .or(page.locator('button[aria-label*="icrophone"]'));
    await expect(dictationToggle).toBeVisible({ timeout: 15_000 });
  });
});
