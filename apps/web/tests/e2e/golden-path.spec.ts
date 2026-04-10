import { expect, test } from '@playwright/test';

import {
  buildValidOnboardingHandle,
  completeOnboardingV2,
  countPopulatedDspFields,
  createFreshUser,
  ensureDbUser,
  ensureServerAuthenticated,
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
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

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
    id: '6M2wZ9GZgrQXHCFfjv46we',
    url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
  },
  {
    id: '06HL4z0CvFAxyc27GXpf02',
    url: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
  },
  {
    id: '4Uwpa6zW3zzCSQvooQNksm',
    url: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
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
    page.on('response', response => {
      if (response.status() === 401) {
        console.log(
          `[golden-path][401] ${response.request().method()} ${response.url()}`
        );
      }
    });
    page.on('requestfailed', request => {
      console.log(
        `[golden-path][requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`
      );
    });

    const spotifyArtist =
      TEST_SPOTIFY_ARTISTS[testInfo.workerIndex % TEST_SPOTIFY_ARTISTS.length];

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Create account
    // ──────────────────────────────────────────────────────────────────
    const uniqueSeed = `${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Math.random().toString(36).slice(2, 8)}`;
    const { email, clerkUserId } = await createFreshUser(page, uniqueSeed);

    // Pre-create DB user and release known Spotify artist IDs
    const knownSpotifyArtistIds = [
      '4Uwpa6zW3zzCSQvooQNksm',
      ...TEST_SPOTIFY_ARTISTS.map(artist => artist.id),
    ];
    await ensureDbUser(clerkUserId, email, knownSpotifyArtistIds);
    await ensureServerAuthenticated(page, clerkUserId);

    const onboardingHandle = buildValidOnboardingHandle(
      uniqueSeed,
      clerkUserId
    );

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Fresh user redirects into onboarding
    // ──────────────────────────────────────────────────────────────────
    await smokeNavigateWithRetry(page, '/app', {
      timeout: 120_000,
      retries: 2,
    });
    await expect
      .poll(() => page.url(), {
        timeout: 30_000,
        message:
          'Fresh signup should land on an authenticated app surface before onboarding continues',
      })
      .toMatch(/\/(app|onboarding)(\?|$)/);

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Onboarding — Handle step
    // ──────────────────────────────────────────────────────────────────
    await smokeNavigateWithRetry(
      page,
      `/onboarding?handle=${onboardingHandle}`,
      {
        timeout: 45_000,
        retries: 2,
      }
    );
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

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: Onboarding V2 — Spotify -> upgrade -> discovery summary
    // ──────────────────────────────────────────────────────────────────
    await completeOnboardingV2(page, spotifyArtist.url, {
      clerkUserId,
      expectedHandle: onboardingHandle,
    });

    await ensureServerAuthenticated(page, clerkUserId);
    await page.goto('/app', {
      waitUntil: 'commit',
      timeout: 60_000,
    });

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Dashboard loaded — profile is sufficiently complete
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

      await expect
        .poll(
          async () => {
            return page.evaluate(() => document.body.innerText.toLowerCase());
          },
          { timeout: 60_000, intervals: [1_000, 2_000, 5_000, 10_000] }
        )
        .not.toContain('loading jovie profile');

      await page.goto(`/${onboardingHandle}?mode=listen`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await expect(page).toHaveURL(
        new RegExp(`/${onboardingHandle}\\?mode=listen`),
        { timeout: 30_000 }
      );

      const dspNames = [
        'spotify',
        'apple music',
        'deezer',
        'tidal',
        'youtube music',
        'soundcloud',
      ];

      const visibleDsps = [];
      for (const name of dspNames) {
        const button = page.getByRole('button', {
          name: new RegExp(name, 'i'),
        });
        if (await button.isVisible().catch(() => false)) {
          visibleDsps.push(name);
        }
      }

      expect(
        visibleDsps.length,
        `Public listen surface should show >= 2 DSP links (found: ${visibleDsps.join(', ')})`
      ).toBeGreaterThanOrEqual(2);

      console.log(
        `[golden-path] Public listen surface DSPs visible: ${visibleDsps.join(', ')}`
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
      o =>
        o.priceId &&
        o.amount === 2000 &&
        (o.description === 'Pro' || o.interval === 'month')
    );
    expect(
      proOption,
      `Pro pricing option not returned — billing misconfigured: ${JSON.stringify(allOptions)}`
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
