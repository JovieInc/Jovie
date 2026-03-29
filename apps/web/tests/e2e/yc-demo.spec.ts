/**
 * YC Demo — Automated Screen Recording
 *
 * Walks through the Jovie onboarding flow at a watchable pace,
 * recording video via Playwright's built-in capture. Tim narrates
 * over the resulting .webm separately.
 *
 * Run: doppler run -- pnpm --filter web demo:record
 *
 * Uses Dua Lipa as the demo artist for guaranteed multi-DSP enrichment.
 * Injects text overlay captions per scene for context without audio.
 */

import { expect, type Page, test } from '@playwright/test';

import {
  buildValidOnboardingHandle,
  countPopulatedDspFields,
  createFreshUser,
  ensureDbUser,
  hasRealEnv,
  interceptTrackingCalls,
  type MultiDspEnrichmentState,
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
/*  Caption overlay helpers                                             */
/* ------------------------------------------------------------------ */

async function injectCaptionOverlay(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-caption')) return;
    const el = document.createElement('div');
    el.id = 'demo-caption';
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '12px 24px',
      background: 'rgba(0,0,0,0.75)',
      color: 'white',
      fontSize: '20px',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: '500',
      borderRadius: '12px',
      zIndex: '99999',
      transition: 'opacity 0.3s ease',
      opacity: '0',
      pointerEvents: 'none',
      backdropFilter: 'blur(8px)',
      letterSpacing: '-0.01em',
    });
    document.body.appendChild(el);
  });
}

async function setCaption(page: Page, text: string) {
  await page.evaluate(t => {
    const el = document.getElementById('demo-caption');
    if (!el) return;
    if (t) {
      el.textContent = t;
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
    }
  }, text);
}

async function clearCaption(page: Page) {
  await setCaption(page, '');
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('YC Demo Recording', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    // Production guard — refuse to create test users in prod
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (dbUrl.includes('production') || dbUrl.includes('prod')) {
      test.skip(
        true,
        'Refusing to run demo recording against production database'
      );
    }
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

    await injectCaptionOverlay(page);
    // Pause for voiceover: "Here's the Jovie landing page..."
    await page.waitForTimeout(2_000);

    // ──────────────────────────────────────────────────────────────────
    // SCENE 2: Sign up
    // ──────────────────────────────────────────────────────────────────
    await setCaption(page, 'Signing up...');
    await page.goto('/signup', {
      waitUntil: 'commit',
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/signup/, { timeout: 30_000 });

    const uniqueSeed = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { email, clerkUserId } = await createFreshUser(page, uniqueSeed);
    await clearCaption(page);

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
    // Wait for the onboarding form to render and the handle input to be populated
    const handleEl = page.getByLabel('Enter your desired handle');
    await expect(handleEl).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await handleEl.inputValue()).trim(), {
        timeout: 30_000,
        message: 'Handle input should contain the seeded onboarding handle',
      })
      .toBe(onboardingHandle);

    // Pause for voiceover: "Pick your handle..."
    await page.waitForTimeout(1_000);

    // Wait for the Continue button to finish loading and become enabled
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 30_000 });
    await continueBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // SCENE 4: Connect Spotify
    // ──────────────────────────────────────────────────────────────────
    await injectCaptionOverlay(page);
    await setCaption(page, 'Connecting Spotify...');
    const artistInput = page.getByPlaceholder(
      /search.*artist.*paste.*spotify/i
    );
    await expect(artistInput).toBeVisible({ timeout: 60_000 });

    await artistInput.fill(DEMO_SPOTIFY_ARTIST.url);
    // Trigger search — use click on a search button or press Enter
    await artistInput.press('Enter').catch(() => {
      // Enter may not work if there's no form — the fill may auto-trigger
    });

    // ──────────────────────────────────────────────────────────────────
    // SCENE 5: THE AHA MOMENT — Spotify connected, enrichment appears
    // ──────────────────────────────────────────────────────────────────
    // Wait for "Spotify is connected" confirmation or review step
    const spotifyConnected = page.getByRole('heading', {
      name: /spotify.*connected/i,
    });
    const reviewDisplayName = page.locator('#onboarding-display-name');

    const connectionResult = await Promise.race([
      spotifyConnected
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'connected' as const)
        .catch(() => null),
      reviewDisplayName
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'review' as const)
        .catch(() => null),
      page
        .waitForURL(/\/app/, { timeout: 60_000 })
        .then(() => 'dashboard' as const)
        .catch(() => null),
    ]);

    await injectCaptionOverlay(page);
    await setCaption(
      page,
      'Instant enrichment — name, photo, bio, all automatic'
    );
    // Pause for voiceover: "Look — enrichment happening in real-time..."
    await page.waitForTimeout(4_000);
    await clearCaption(page);

    // Navigate to dashboard from whatever state we're in
    if (connectionResult === 'connected' || connectionResult === 'review') {
      // Click Continue to proceed to dashboard
      const continueBtn = page.getByRole('button', { name: /continue/i });
      const goToDashboardBtn = page.getByRole('button', {
        name: /go to dashboard/i,
      });

      const navBtn = await Promise.race([
        continueBtn
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => continueBtn)
          .catch(() => null),
        goToDashboardBtn
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => goToDashboardBtn)
          .catch(() => null),
      ]);

      if (navBtn) {
        await expect(navBtn).toBeEnabled({ timeout: 10_000 });
        await navBtn.click();
      }
    }

    // Ensure we reach the dashboard
    if (!page.url().includes('/app')) {
      // Poll for onboarding completion then navigate
      await expect
        .poll(
          async () => {
            const currentState = await waitForSpotifyImport(clerkUserId);
            return currentState?.onboarding_completed_at ? 'ready' : 'pending';
          },
          {
            timeout: 60_000,
            intervals: [2_000, 5_000, 10_000, 15_000],
            message: 'Expected onboarding to complete',
          }
        )
        .toBe('ready');

      await page.goto('/app', {
        waitUntil: 'commit',
        timeout: 60_000,
      });
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

    await injectCaptionOverlay(page);
    await setCaption(page, 'Every release, every platform');
    // Pause for voiceover: "The dashboard shows all their releases..."
    await page.waitForTimeout(2_000);
    await clearCaption(page);

    // ──────────────────────────────────────────────────────────────────
    // SCENE 7: Public profile
    // ──────────────────────────────────────────────────────────────────
    await page.goto(`/${onboardingHandle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Best-effort wait for multi-DSP enrichment (don't fail the recording if slow)
    let dspState: Awaited<ReturnType<typeof waitForMultiDspEnrichment>> | null =
      null;

    try {
      await expect(async () => {
        dspState = await waitForMultiDspEnrichment(clerkUserId);
        const dspCount = dspState ? countPopulatedDspFields(dspState) : 0;
        expect(dspCount).toBeGreaterThanOrEqual(1);
      }).toPass({
        timeout: 30_000,
        intervals: [3_000, 5_000, 10_000],
      });
    } catch {
      console.warn(
        '[yc-demo] Multi-DSP enrichment still in progress — proceeding with available data'
      );
    }

    const finalDspState = dspState as MultiDspEnrichmentState | null;
    const dspCount = finalDspState ? countPopulatedDspFields(finalDspState) : 0;

    // Reload so SSR includes whatever enriched data is available
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });

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

    console.log(
      `[yc-demo] Profile DSPs: ${visibleDsps.join(', ')} (${dspCount} fields in DB)`
    );

    await injectCaptionOverlay(page);
    await setCaption(page, 'Your public artist page');
    // Pause for voiceover: "Every platform, every smart link — automatic."
    await page.waitForTimeout(3_000);
    await clearCaption(page);

    // Save video — must happen before page context closes
    const video = page.video();
    if (video) {
      await page.close();
      await video.saveAs('test-results/yc-demo.webm');
      console.log('[yc-demo] Video saved to test-results/yc-demo.webm');
    }
  });
});
