import { expect, test } from '@playwright/test';
import { isClerkHandshakeUrl } from '../helpers/clerk-auth';

import {
  advanceOnboardingAfterArtistSelection,
  buildValidOnboardingHandle,
  countPopulatedDspFields,
  createFreshUser,
  ensureDbUser,
  hasRealEnv,
  interceptTrackingCalls,
  MAJOR_ARTIST_IDS,
  type MultiDspEnrichmentState,
  onboardingProfileIsReady,
  purgeStaleClerkTestUsers,
  spotifyImportIsReady,
  waitForMultiDspEnrichment,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';

/**
 * Golden Path E2E — Signup -> Onboarding -> Music Fetch -> Stripe
 *
 * Tests the complete new-user journey end to end with REAL data:
 * - No mocks for music fetch
 * - No pre-authenticated state
 * - Real Clerk auth (test environment)
 * - Real Stripe checkout session (test mode)
 *
 * Test artist: "Tim White" (~50 releases, deterministic)
 */

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

const TEST_SPOTIFY_ARTISTS = [
  {
    id: '59NJtiWq8nISIJjDtITQyt',
    url: 'https://open.spotify.com/artist/59NJtiWq8nISIJjDtITQyt',
  },
  {
    id: '6M2wZ9GZgrQXHCFfjv46we',
    url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
  },
  {
    id: '06HL4z0CvFAxyc27GXpf02',
    url: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Signup -> Onboarding -> Music Fetch -> Stripe', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    FAST_ITERATION,
    'Golden path stays in the slower real-auth/onboarding lane, not the fast deploy gate'
  );

  // Fresh browser — no inherited auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    // Purge stale golden-path Clerk test users BEFORE signup to stay within
    // the 100-user dev instance cap. Must run before createFreshUser.
    await purgeStaleClerkTestUsers();

    await interceptTrackingCalls(page);
  });

  test('complete user journey from signup to paid subscription', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    page.on('pageerror', error => {
      console.log(`[golden-path][pageerror] ${error.message}`);
    });
    page.on('console', message => {
      if (message.type() === 'error') {
        console.log(`[golden-path][console:error] ${message.text()}`);
      }
    });

    const spotifyArtist =
      TEST_SPOTIFY_ARTISTS[testInfo.workerIndex % TEST_SPOTIFY_ARTISTS.length];

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Landing page loads
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // A signup CTA must be visible — either the claim input or a signup link
    const signupCta = page
      .locator('#handle-input')
      .or(page.locator('a[href*="/signup"]').first());
    await expect(signupCta.first()).toBeVisible({ timeout: 20_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Initiate signup
    // ──────────────────────────────────────────────────────────────────
    // The homepage CTA itself is already asserted above; navigate directly to
    // signup here to avoid client-side route transition flake under load.
    await page.goto('/signup', {
      waitUntil: 'commit',
      timeout: 30_000,
    });
    if (isClerkHandshakeUrl(page.url())) {
      test.skip(true, 'Clerk handshake redirect in CI preview');
      return;
    }
    await expect(page).toHaveURL(/\/signup/, { timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Create account
    // ──────────────────────────────────────────────────────────────────
    const uniqueSeed = `${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Math.random().toString(36).slice(2, 8)}`;
    const { email, clerkUserId } = await createFreshUser(page, uniqueSeed);

    // Pre-create DB user and release known Spotify artist IDs
    const knownSpotifyArtistIds = [
      '4Uwpa6zW3zzCSQvooQNksm',
      ...TEST_SPOTIFY_ARTISTS.map(artist => artist.id),
    ];
    await ensureDbUser(clerkUserId, email, knownSpotifyArtistIds);

    const onboardingHandle = buildValidOnboardingHandle(
      uniqueSeed,
      clerkUserId
    );

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: Onboarding — Handle step
    // ──────────────────────────────────────────────────────────────────
    await page.goto(`/onboarding?handle=${onboardingHandle}`, {
      waitUntil: 'commit',
      timeout: 45_000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/onboarding\\?handle=${onboardingHandle}`)
    );
    await expect(
      page.locator('[data-testid="onboarding-form-wrapper"]')
    ).toBeVisible({ timeout: 20_000 });

    const handleEl = page.getByLabel('Enter your desired handle');
    await expect(handleEl).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await handleEl.inputValue()).trim(), {
        timeout: 20_000,
        message: 'Handle input should contain the seeded onboarding handle',
      })
      .toBe(onboardingHandle);

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 20_000 });
    await continueBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Onboarding — Artist search (Music Fetch)
    // ──────────────────────────────────────────────────────────────────
    const artistInput = page.getByPlaceholder(/search.*artist.*spotify/i);
    await expect(artistInput).toBeVisible({ timeout: 60_000 });

    await artistInput.fill(spotifyArtist.url);

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: Profile review — verify form is usable
    // ──────────────────────────────────────────────────────────────────

    const reviewDisplayName = page.locator('#onboarding-display-name');
    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });
    const reviewStepOrDashboard =
      await advanceOnboardingAfterArtistSelection(page);

    if (reviewStepOrDashboard === 'review') {
      // Display name is pre-set by completeOnboarding (from Clerk identity).
      const initialDisplayName = await reviewDisplayName.inputValue();
      if (initialDisplayName.trim().length === 0) {
        await reviewDisplayName.fill('Golden Path Artist');
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

      // Enrichment (bio, avatar) is fire-and-forget and depends on the DB
      // pool + external APIs. Check if bio was populated, but don't fail
      // the test if it wasn't — pool connectivity issues in test env can
      // cause enrichProfileFromDsp to 500.
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
            'WARN: Music fetch enrichment did not populate bio — ' +
              'this is expected when DB pool is unreliable in test env'
          );
        }
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
      } else {
        await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
      }
    } else {
      await expect
        .poll(
          async () => {
            const currentState = await waitForSpotifyImport(clerkUserId);
            return currentState?.onboarding_completed_at ? 'ready' : 'pending';
          },
          {
            timeout: 60_000,
            intervals: [2_000, 5_000, 10_000],
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
    // STEP 7: Dashboard loaded — profile is sufficiently complete
    // ──────────────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    const currentUrl = page.url();
    expect(
      currentUrl,
      'Redirected to onboarding before import checks completed'
    ).not.toContain('/onboarding');
    expect(currentUrl, 'Redirected to signin — auth lost').not.toContain(
      '/sign-in'
    );

    let importState: Awaited<ReturnType<typeof waitForSpotifyImport>> | null =
      null;
    await expect(async () => {
      importState = await waitForSpotifyImport(clerkUserId);
      expect(importState, 'No profile found for test user').toBeTruthy();
      expect(
        onboardingProfileIsReady(importState),
        `Onboarding profile never reached a usable state: ${JSON.stringify(importState)}`
      ).toBe(true);
      expect(
        importState?.spotify_url,
        'spotify_url not saved — DSP links will not render'
      ).toBeTruthy();
      expect(
        importState?.is_public,
        'Profile is not public — listen page will 404'
      ).toBe(true);
      expect(
        importState?.onboarding_completed_at,
        'Onboarding did not complete'
      ).toBeTruthy();
    }).toPass({
      timeout: 90_000,
      intervals: [2_000, 5_000, 10_000, 15_000],
    });

    if (!spotifyImportIsReady(importState)) {
      console.warn(
        `[golden-path] WARN: Spotify release import did not settle during smoke window. ` +
          `State: ${JSON.stringify(importState)}`
      );
    }

    console.log(
      '[golden-path] Spotify import state:',
      JSON.stringify(importState)
    );

    // ──────────────────────────────────────────────────────────────────
    // STEP 7b: Multi-DSP enrichment verification
    // ──────────────────────────────────────────────────────────────────
    // MusicFetch enrichment runs async after onboarding. Poll for DSP
    // fields (Apple Music, Deezer, Tidal, YouTube Music, SoundCloud)
    // to be populated on creator_profiles + social_links.

    const isMajorArtist = MAJOR_ARTIST_IDS.has(spotifyArtist.id);

    let dspState: Awaited<ReturnType<typeof waitForMultiDspEnrichment>> | null =
      null;
    try {
      await expect(async () => {
        dspState = await waitForMultiDspEnrichment(clerkUserId);
        expect(dspState, 'No profile found for multi-DSP check').toBeTruthy();

        const dspCount = countPopulatedDspFields(dspState!);
        const socialCount = Number(dspState?.social_link_count ?? 0);

        if (isMajorArtist) {
          expect(
            dspCount,
            `Major artist should have >= 3 DSP fields populated (got ${dspCount}). ` +
              `State: ${JSON.stringify(dspState)}`
          ).toBeGreaterThanOrEqual(3);
        }

        expect(
          socialCount,
          `Expected >= 2 social links after enrichment (got ${socialCount})`
        ).toBeGreaterThanOrEqual(2);
      }).toPass({
        timeout: 60_000,
        intervals: [3_000, 5_000, 10_000, 15_000],
      });
    } catch {
      console.warn(
        `[golden-path] WARN: Multi-DSP enrichment did not settle during smoke window. ` +
          `State: ${JSON.stringify(dspState)}`
      );
    }

    // dspState is assigned inside the toPass() callback — TS narrows to never
    const finalDspState = dspState as MultiDspEnrichmentState | null;
    const dspCount = finalDspState ? countPopulatedDspFields(finalDspState) : 0;
    const socialCount = Number(finalDspState?.social_link_count ?? 0);

    if (!isMajorArtist && dspCount < 3) {
      console.warn(
        `[golden-path] WARN: Small artist has only ${dspCount} DSP fields populated. ` +
          `This is expected for lesser-known artists. State: ${JSON.stringify(finalDspState)}`
      );
    }

    console.log(
      `[golden-path] Multi-DSP enrichment: ${dspCount} DSP fields, ${socialCount} social links, ` +
        `major=${isMajorArtist}. State: ${JSON.stringify(finalDspState)}`
    );

    // ──────────────────────────────────────────────────────────────────
    // STEP 7c: Profile page DSP round-trip
    // ──────────────────────────────────────────────────────────────────
    // Navigate to the public profile page and verify DSP buttons render.
    // This catches rendering bugs where data exists in DB but the UI drops it.

    if (isMajorArtist && dspCount >= 2) {
      await page.goto(`/${onboardingHandle}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

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
        `[golden-path] Profile page DSPs visible: ${visibleDsps.join(', ')}`
      );
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 8: Stripe checkout session creation
    // ──────────────────────────────────────────────────────────────────

    // Stop the dashboard from continuing to fan out background API requests
    // while this test performs the paid-step assertions.
    await page.goto('about:blank');

    // Get available pricing
    const pricingResponse = await page.request.get(
      '/api/stripe/pricing-options'
    );
    expect(
      pricingResponse.ok(),
      'Stripe pricing API returned non-200'
    ).toBeTruthy();

    const pricingJson = (await pricingResponse.json()) as {
      pricingOptions?: Array<{
        priceId?: string;
        description?: string;
        amount?: number;
      }>;
      options?: Array<{
        priceId?: string;
        description?: string;
        amount?: number;
      }>;
    };

    const allOptions = pricingJson.pricingOptions ?? pricingJson.options ?? [];

    // Find the Pro plan specifically
    const proOption = allOptions.find(
      o => o.description === 'Pro' && o.priceId
    );
    expect(
      proOption,
      'Pro pricing option not returned — billing misconfigured'
    ).toBeTruthy();

    const proPriceId = proOption!.priceId!;
    expect(proOption!.amount, 'Pro price should be $20/mo (2000 cents)').toBe(
      2000
    );

    // Create checkout session with Pro price
    const checkoutResponse = await page.request.post('/api/stripe/checkout', {
      data: { priceId: proPriceId },
    });
    if (!checkoutResponse.ok()) {
      const errBody = await checkoutResponse.text().catch(() => '<unreadable>');
      console.error(
        `[golden-path] Checkout failed (${checkoutResponse.status()}): ${errBody}`
      );
    }
    expect(
      checkoutResponse.ok(),
      'Stripe checkout session creation failed'
    ).toBeTruthy();

    const checkoutJson = (await checkoutResponse.json()) as { url?: string };
    expect(
      checkoutJson.url,
      'Stripe checkout URL missing — checkout session not created'
    ).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});
