/**
 * YC Demo — Automated Screen Recording
 *
 * Walks through the Jovie onboarding flow at a watchable pace,
 * recording video via Playwright's built-in capture. Tim narrates
 * over the resulting .webm separately.
 *
 * Run: pnpm --filter web demo:record
 *
 * Uses Dua Lipa as the demo artist for guaranteed multi-DSP enrichment.
 */

import { expect, test } from '@playwright/test';

import {
  buildValidOnboardingHandle,
  countPopulatedDspFields,
  createFreshUser,
  ensureDbUser,
  hasRealEnv,
  interceptTrackingCalls,
  type MultiDspEnrichmentState,
  purgeStaleClerkTestUsers,
  spotifyImportIsReady,
  waitForMultiDspEnrichment,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';

/* ------------------------------------------------------------------ */
/*  Demo-specific constants                                             */
/* ------------------------------------------------------------------ */

const DEMO_SPOTIFY_ARTIST = {
  id: '6M2wZ9GZgrQXHCFfjv46we', // Dua Lipa — guaranteed multi-DSP
  url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
};

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('YC Demo Recording', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }
    await interceptTrackingCalls(page);
  });

  test('full onboarding demo — signup to public profile', async ({ page }) => {
    test.setTimeout(300_000);

    // Cleanup before demo
    await purgeStaleClerkTestUsers();

    // ──────────────────────────────────────────────────────────────────
    // SCENE 1: Landing page
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const signupCta = page
      .locator('#handle-input')
      .or(page.locator('a[href*="/signup"]').first());
    await expect(signupCta.first()).toBeVisible({ timeout: 20_000 });

    // Pause for voiceover: "Here's the Jovie landing page..."
    await page.waitForTimeout(2_000);

    // ──────────────────────────────────────────────────────────────────
    // SCENE 2: Sign up
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/signup', {
      waitUntil: 'commit',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/signup/, { timeout: 30_000 });

    const uniqueSeed = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { email, clerkUserId } = await createFreshUser(page, uniqueSeed);

    // Pre-create DB user and release the Dua Lipa Spotify ID
    await ensureDbUser(clerkUserId, email, [DEMO_SPOTIFY_ARTIST.id]);

    const onboardingHandle = buildValidOnboardingHandle(
      uniqueSeed,
      clerkUserId
    );

    // ──────────────────────────────────────────────────────────────────
    // SCENE 3: Onboarding — Handle step
    // ──────────────────────────────────────────────────────────────────
    await page.goto(`/onboarding?handle=${onboardingHandle}`, {
      waitUntil: 'commit',
      timeout: 45_000,
    });
    await expect(
      page.locator('[data-testid="onboarding-form-wrapper"]')
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('[data-onboarding-client-ready="true"]')
    ).toBeVisible({ timeout: 20_000 });

    const handleEl = page.getByLabel('Enter your desired handle');
    await expect(handleEl).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await handleEl.inputValue()).trim(), {
        timeout: 20_000,
        message: 'Handle input should contain the seeded onboarding handle',
      })
      .toBe(onboardingHandle);

    // Pause for voiceover: "Pick your handle..."
    await page.waitForTimeout(1_000);

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 20_000 });
    await continueBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // SCENE 4: Connect Spotify
    // ──────────────────────────────────────────────────────────────────
    const artistInput = page.getByPlaceholder(
      /search for your artist or paste a spotify link/i
    );
    await expect(artistInput).toBeVisible({ timeout: 60_000 });

    await artistInput.fill(DEMO_SPOTIFY_ARTIST.url);
    await artistInput.press('Enter');

    // ──────────────────────────────────────────────────────────────────
    // SCENE 5: THE AHA MOMENT — Enrichment appears
    // ──────────────────────────────────────────────────────────────────
    // Race: review step visible OR direct /app redirect
    const reviewDisplayName = page.locator('#onboarding-display-name');
    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });

    const reviewStepOrDashboard = await Promise.race([
      reviewDisplayName
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => 'review' as const)
        .catch(() => null),
      page
        .waitForURL(/\/app/, { timeout: 30_000 })
        .then(() => 'dashboard' as const)
        .catch(() => null),
    ]);

    if (reviewStepOrDashboard === 'review') {
      // Display name should be pre-set by completeOnboarding
      const initialDisplayName = await reviewDisplayName.inputValue();
      if (initialDisplayName.trim().length === 0) {
        await reviewDisplayName.fill('Demo Artist');
      }
      await expect
        .poll(
          async () => (await reviewDisplayName.inputValue()).trim().length,
          {
            timeout: 15_000,
            message: 'Display name should have a value',
          }
        )
        .toBeGreaterThan(0);

      // Check bio enrichment (fire-and-forget — warn, don't fail)
      const bio = page.locator('#onboarding-bio');
      const bioPopulated = await bio
        .inputValue()
        .then(v => v.trim().length > 0)
        .catch(() => false);

      if (!bioPopulated) {
        await page.waitForTimeout(5_000);
        const bioRetry = await bio
          .inputValue()
          .then(v => v.trim().length > 0)
          .catch(() => false);

        if (!bioRetry) {
          console.warn(
            '[yc-demo] WARN: Enrichment did not populate bio — ' +
              'expected when DB pool is unreliable in test env'
          );
        }
      }

      // Pause for voiceover: "Look — name, photo, bio, all automatic..."
      await page.waitForTimeout(4_000);

      // Navigate to dashboard
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
      } else {
        await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
      }
    } else {
      // Direct redirect — poll DB for completion
      await expect
        .poll(
          async () => {
            const currentState = await waitForSpotifyImport(clerkUserId);
            return currentState?.onboarding_completed_at ? 'ready' : 'pending';
          },
          {
            timeout: 60_000,
            intervals: [2_000, 5_000, 10_000, 15_000],
            message:
              'Expected onboarding to complete even if the final app transition is slow',
          }
        )
        .toBe('ready');

      if (!page.url().includes('/app')) {
        await page.goto('/app', {
          waitUntil: 'commit',
          timeout: 60_000,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // SCENE 6: Dashboard
    // ──────────────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    let importState: Awaited<ReturnType<typeof waitForSpotifyImport>> | null =
      null;
    await expect(async () => {
      importState = await waitForSpotifyImport(clerkUserId);
      expect(importState, 'No profile found for test user').toBeTruthy();
      expect(
        spotifyImportIsReady(importState),
        `Spotify import not ready: ${JSON.stringify(importState)}`
      ).toBe(true);
      expect(
        Number(importState?.release_count ?? 0),
        'No releases imported'
      ).toBeGreaterThan(0);
      expect(
        Number(importState?.spotify_release_link_count ?? 0),
        'No Spotify release links'
      ).toBeGreaterThan(0);
      expect(importState?.is_public, 'Profile not public').toBe(true);
      expect(
        importState?.onboarding_completed_at,
        'Onboarding not completed'
      ).toBeTruthy();
    }).toPass({
      timeout: 90_000,
      intervals: [2_000, 5_000, 10_000, 15_000],
    });

    console.log('[yc-demo] Spotify import state:', JSON.stringify(importState));

    // Pause for voiceover: "The dashboard shows all their releases..."
    await page.waitForTimeout(2_000);

    // ──────────────────────────────────────────────────────────────────
    // SCENE 7: Public profile
    // ──────────────────────────────────────────────────────────────────
    await page.goto(`/${onboardingHandle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for multi-DSP enrichment (Dua Lipa is a major artist)
    let dspState: Awaited<ReturnType<typeof waitForMultiDspEnrichment>> | null =
      null;

    await expect(async () => {
      dspState = await waitForMultiDspEnrichment(clerkUserId);
      expect(dspState, 'No profile found for multi-DSP check').toBeTruthy();

      const dspCount = countPopulatedDspFields(dspState!);
      const socialCount = Number(dspState?.social_link_count ?? 0);

      // Dua Lipa must have 3+ DSPs
      expect(
        dspCount,
        `Major artist should have >= 3 DSP fields (got ${dspCount})`
      ).toBeGreaterThanOrEqual(3);

      expect(
        socialCount,
        `Expected >= 2 social links (got ${socialCount})`
      ).toBeGreaterThanOrEqual(2);
    }).toPass({
      timeout: 120_000,
      intervals: [3_000, 5_000, 10_000, 15_000, 20_000],
    });

    const finalDspState = dspState as MultiDspEnrichmentState | null;
    const dspCount = finalDspState ? countPopulatedDspFields(finalDspState) : 0;

    // Reload so SSR includes enriched DSP data
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Verify DSP buttons render on the page
    const body = await page.evaluate(() =>
      document.body.innerText.toLowerCase()
    );
    const dspNames = [
      'spotify',
      'apple music',
      'deezer',
      'tidal',
      'youtube music',
      'soundcloud',
    ];
    const visibleDsps = dspNames.filter(name => body.includes(name));

    expect(
      visibleDsps.length,
      `Profile page should show >= 2 DSP links (found: ${visibleDsps.join(', ')})`
    ).toBeGreaterThanOrEqual(2);

    console.log(
      `[yc-demo] Profile DSPs: ${visibleDsps.join(', ')} (${dspCount} fields in DB)`
    );

    // Pause for voiceover: "Every platform, every smart link — automatic."
    await page.waitForTimeout(3_000);
  });

  test.afterEach(async ({ page }) => {
    const video = page.video();
    expect(video, 'Video recording must be active').toBeTruthy();
    if (video) {
      await video.saveAs('test-results/yc-demo.webm');
    }
  });
});
