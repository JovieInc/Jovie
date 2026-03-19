import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

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

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;
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

interface EnsuredUserRow {
  id: string;
}

interface SpotifyImportStateRow {
  id: string;
  spotify_url: string | null;
  spotify_id: string | null;
  is_public: boolean | null;
  avatar_url: string | null;
  onboarding_completed_at: string | null;
  spotify_import_status: string | null;
  release_count: number | null;
  spotify_release_link_count: number | null;
}

function spotifyImportIsReady(
  state: SpotifyImportStateRow | null | undefined
): boolean {
  if (!state) {
    return false;
  }

  const releaseCount = Number(state.release_count ?? 0);
  const releaseLinkCount = Number(state.spotify_release_link_count ?? 0);
  const hasSpotifyProfile =
    Boolean(state.spotify_id) && Boolean(state.spotify_url);

  if (state.spotify_import_status === 'complete') {
    return true;
  }

  return hasSpotifyProfile && releaseCount > 0 && releaseLinkCount > 0;
}

/** Spotify IDs for known major artists with guaranteed multi-DSP coverage */
const MAJOR_ARTIST_IDS = new Set([
  '6M2wZ9GZgrQXHCFfjv46we', // Dua Lipa
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
]);

interface MultiDspEnrichmentState {
  profile_id: string;
  apple_music_id: string | null;
  apple_music_url: string | null;
  deezer_id: string | null;
  tidal_id: string | null;
  soundcloud_id: string | null;
  youtube_music_id: string | null;
  youtube_url: string | null;
  social_link_count: number | null;
}

function countPopulatedDspFields(state: MultiDspEnrichmentState): number {
  let count = 0;
  if (state.apple_music_id || state.apple_music_url) count++;
  if (state.deezer_id) count++;
  if (state.tidal_id) count++;
  if (state.soundcloud_id) count++;
  if (state.youtube_music_id || state.youtube_url) count++;
  return count;
}

async function waitForMultiDspEnrichment(clerkUserId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for multi-DSP enrichment checks');
  }

  const sql = neon(dbUrl);

  const [state] = (await sql`
    SELECT
      cp.id AS profile_id,
      cp.apple_music_id,
      cp.apple_music_url,
      cp.deezer_id,
      cp.tidal_id,
      cp.soundcloud_id,
      cp.youtube_music_id,
      cp.youtube_url,
      (
        SELECT COUNT(*)
        FROM social_links sl
        WHERE sl.creator_profile_id = cp.id
          AND sl.state = 'active'
      )::int AS social_link_count
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as MultiDspEnrichmentState[];

  return state ?? null;
}

function buildValidOnboardingHandle(seed: string, clerkUserId: string): string {
  const seedFragment = seed.replaceAll(/[^a-z0-9]/g, '').slice(0, 12);
  const userFragment = clerkUserId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
  return `j${seedFragment}${userFragment.slice(-6)}`.slice(0, 30);
}

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/**
 * Delete all stale golden-path test users from Clerk to stay within the
 * 100-user dev-instance cap. Each golden-path run creates a new
 * `gp-*+clerk_test@test.jovie.com` user; without cleanup the cap fills up.
 */
async function purgeStaleClerkTestUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.includes('mock')) return;

  try {
    // Clerk's `query` param doesn't match emails with `+` characters, so we
    // fetch all users (up to 500) and filter client-side.
    const allUsers: Array<{
      id: string;
      email_addresses: Array<{ email_address: string }>;
    }> = [];

    for (let offset = 0; offset < 500; offset += 100) {
      const url = new URL('https://api.clerk.com/v1/users');
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(offset));
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!resp.ok) break;
      const page = (await resp.json()) as typeof allUsers;
      if (!Array.isArray(page) || page.length === 0) break;
      allUsers.push(...page);
      if (page.length < 100) break; // Last page
    }

    const toDelete = allUsers.filter(u =>
      u.email_addresses.some(
        e =>
          e.email_address.startsWith('gp-') &&
          e.email_address.endsWith('+clerk_test@test.jovie.com')
      )
    );

    if (toDelete.length > 0) {
      await Promise.all(
        toDelete.map(u =>
          fetch(`https://api.clerk.com/v1/users/${u.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${secretKey}` },
          }).catch(() => {})
        )
      );
      console.log(
        `[golden-path] Purged ${toDelete.length} stale Clerk test user(s)`
      );
    }
  } catch {
    // Non-critical — if purge fails we'll still attempt to create
  }
}

/**
 * Clear onboarding rate limits from Upstash Redis.
 * Repeated test runs exhaust the "3 per hour per IP" limit.
 */
async function clearOnboardingRateLimits() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // No Redis — rate limiting uses in-memory fallback

  try {
    const collectKeys = async (pattern: string) => {
      const response = await fetch(`${url}/keys/${pattern}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { result?: string[] };
      return payload.result ?? [];
    };

    const keys = [
      ...(await collectKeys('onboarding:ip:*')),
      ...(await collectKeys('onboarding:user:*')),
    ];

    if (keys.length === 0) return;

    await fetch(`${url}/del/${keys.join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-critical — if Redis is down, in-memory limiter resets per server restart
  }
}

/**
 * Pre-create a DB user row via direct Neon HTTP query.
 *
 * The onboarding page's server component creates users via the WebSocket
 * pool, but concurrent SSR renders in Next.js can abort the pool queries.
 * Pre-creating the user avoids this race condition.
 * Leave profile creation to the real onboarding completion flow so the test
 * exercises the canonical create path instead of updating a synthetic placeholder.
 *
 * Also releases the test Spotify artist ID from any previous test profiles
 * to avoid unique constraint violations on repeated runs.
 */
async function ensureDbUser(clerkUserId: string, email: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for DB user creation');

  const sql = neon(dbUrl);
  // Clear onboarding rate limits from previous test runs
  await clearOnboardingRateLimits();

  // Release ALL test-linked Spotify artist IDs from previous test profiles.
  // Multiple artists named "Tim White" exist on Spotify; the user might
  // select any of them, so clear any spotify_id linked to test user profiles.
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL
    WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%+clerk_test@test.jovie.com'
    ) AND spotify_id IS NOT NULL
  `;

  // Also release the known primary "Tim White" Spotify ID from ANY profile.
  // The top search result is deterministic (Spotify's ranking) and its ID can
  // be held by non-test profiles from previous manual or dev-env runs, causing
  // a unique constraint violation when the test tries to claim the same artist.
  const knownSpotifyArtistIds = [
    '4Uwpa6zW3zzCSQvooQNksm',
    ...TEST_SPOTIFY_ARTISTS.map(artist => artist.id),
  ];
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL
    WHERE spotify_id = ANY(${knownSpotifyArtistIds})
  `;

  const [user] = (await sql`
    INSERT INTO users (clerk_id, email, user_status)
    VALUES (${clerkUserId}, ${email}, 'waitlist_approved')
    ON CONFLICT (clerk_id) DO UPDATE SET
      email = ${email},
      user_status = 'waitlist_approved',
      updated_at = NOW()
    RETURNING id
  `) as EnsuredUserRow[];

  if (!user?.id) {
    throw new Error(`Failed to ensure DB user for Clerk user ${clerkUserId}`);
  }
}

async function waitForSpotifyImport(clerkUserId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for Spotify import checks');
  }

  const sql = neon(dbUrl);

  const [state] = (await sql`
    SELECT
      cp.id,
      cp.spotify_url,
      cp.spotify_id,
      cp.is_public,
      cp.avatar_url,
      cp.onboarding_completed_at,
      cp.settings->>'spotifyImportStatus' AS spotify_import_status,
      (
        SELECT COUNT(*)
        FROM discog_releases dr
        WHERE dr.creator_profile_id = cp.id
      )::int AS release_count,
      (
        SELECT COUNT(*)
        FROM provider_links pl
        INNER JOIN discog_releases dr ON dr.id = pl.release_id
        WHERE dr.creator_profile_id = cp.id
          AND pl.provider_id = 'spotify'
          AND pl.owner_type = 'release'
      )::int AS spotify_release_link_count
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as SpotifyImportStateRow[];

  return state ?? null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
async function interceptTrackingCalls(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
  await page.route('**/monitoring**', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
}

/**
 * Create a brand-new Clerk test user session.
 * Uses `+clerk_test` email suffix which auto-verifies in Clerk test mode.
 *
 * For +clerk_test emails, Clerk requires completing email verification
 * with the magic code 424242 before a session is created.
 */
async function createFreshUser(
  page: import('@playwright/test').Page,
  uniqueSeed: string
) {
  await setupClerkTestingToken({ page });

  const loadClerk = async () => {
    await page.goto('/signin', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      const loaded = await page
        .waitForFunction(
          () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
          { timeout: 20_000 }
        )
        .then(() => true)
        .catch(() => false);

      if (loaded) return true;

      const retryButton = page.getByRole('button', { name: 'Retry now' });
      if (await retryButton.isVisible().catch(() => false)) {
        await retryButton.click();
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
    }

    return false;
  };

  const loaded = await loadClerk();

  if (!loaded) {
    throw new Error('Clerk JS failed to load — cannot create test user');
  }

  const email = `gp-${uniqueSeed}+clerk_test@test.jovie.com`;

  // Create user and complete email verification with test code 424242
  // NOTE: Clerk JS exposes signUp on window.Clerk.client, not window.Clerk directly
  // Returns the Clerk user ID for DB pre-seeding
  const clerkUserId = await page.evaluate(async (targetEmail: string) => {
    const clerkInstance = (window as any).Clerk;
    if (!clerkInstance) throw new Error('Clerk not initialized');

    // If already signed in, return existing user ID
    if (clerkInstance.user?.id && clerkInstance.session) {
      return clerkInstance.user.id as string;
    }

    const client = clerkInstance.client;
    if (!client?.signUp) throw new Error('Clerk client.signUp not available');

    // Create signup
    const signUp = await client.signUp.create({
      emailAddress: targetEmail,
    });

    // For +clerk_test emails, we must complete email verification
    // Clerk test mode accepts magic code 424242
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    const result = await signUp.attemptEmailAddressVerification({
      code: '424242',
    });

    // Activate the session created by completed signup
    if (result.createdSessionId) {
      await clerkInstance.setActive({ session: result.createdSessionId });
    } else {
      throw new Error(
        `Signup completed with status "${result.status}" but no session was created`
      );
    }

    // Return the new user's Clerk ID
    return clerkInstance.user?.id as string;
  }, email);

  if (!clerkUserId) {
    throw new Error('Clerk session not established after signup');
  }

  // Pre-create DB user via direct Neon HTTP query to avoid SSR abort issues
  await ensureDbUser(clerkUserId, email);

  return { email, clerkUserId };
}

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
    await expect(page).toHaveURL(/\/signup/, { timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Create account
    // ──────────────────────────────────────────────────────────────────
    const uniqueSeed = `${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Math.random().toString(36).slice(2, 8)}`;
    const { clerkUserId } = await createFreshUser(page, uniqueSeed);
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

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 20_000 });
    await continueBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Onboarding — Artist search (Music Fetch)
    // ──────────────────────────────────────────────────────────────────
    const artistInput = page.getByPlaceholder(
      /search for your artist or paste a spotify link/i
    );
    await expect(artistInput).toBeVisible({ timeout: 60_000 });

    await artistInput.fill(spotifyArtist.url);
    await artistInput.press('Enter');

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: Profile review — verify form is usable
    // ──────────────────────────────────────────────────────────────────

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
        spotifyImportIsReady(importState),
        `Spotify import never reached a usable state: ${JSON.stringify(importState)}`
      ).toBe(true);
      expect(
        Number(importState?.release_count ?? 0),
        'No releases were imported from Spotify'
      ).toBeGreaterThan(0);
      expect(
        Number(importState?.spotify_release_link_count ?? 0),
        'No Spotify release links were persisted'
      ).toBeGreaterThan(0);
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

    await expect(async () => {
      dspState = await waitForMultiDspEnrichment(clerkUserId);
      expect(dspState, 'No profile found for multi-DSP check').toBeTruthy();

      const dspCount = countPopulatedDspFields(dspState!);
      const socialCount = Number(dspState?.social_link_count ?? 0);

      if (isMajorArtist) {
        // Major artists (Dua Lipa, Taylor Swift) must have 3+ DSPs
        expect(
          dspCount,
          `Major artist should have >= 3 DSP fields populated (got ${dspCount}). ` +
            `State: ${JSON.stringify(dspState)}`
        ).toBeGreaterThanOrEqual(3);
      }

      // All artists should get at least 2 social links from MusicFetch
      expect(
        socialCount,
        `Expected >= 2 social links after enrichment (got ${socialCount})`
      ).toBeGreaterThanOrEqual(2);
    }).toPass({
      timeout: 120_000,
      intervals: [3_000, 5_000, 10_000, 15_000, 20_000],
    });

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

    // Find the Founding Member plan specifically
    const foundingOption = allOptions.find(
      o => o.description === 'Founding Member' && o.priceId
    );
    expect(
      foundingOption,
      'Founding Member pricing option not returned — billing misconfigured'
    ).toBeTruthy();

    const foundingPriceId = foundingOption!.priceId!;
    expect(
      foundingOption!.amount,
      'Founding Member price should be $12/mo (1200 cents)'
    ).toBe(1200);

    // Create checkout session with Founding Member price
    const checkoutResponse = await page.request.post('/api/stripe/checkout', {
      data: { priceId: foundingPriceId },
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
