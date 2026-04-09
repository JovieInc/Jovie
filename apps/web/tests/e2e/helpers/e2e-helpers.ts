/**
 * Shared E2E test helpers extracted from golden-path.spec.ts.
 *
 * Used by both golden-path and yc-demo specs. All functions use
 * direct Neon HTTP queries (not the pool) to avoid SSR abort races.
 */

import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { neon } from '@neondatabase/serverless';
import type { Page } from '@playwright/test';
import { ensureClerkTestUser } from '@/lib/testing/test-user-provision.server';
import { setTestAuthBypassSession } from '@/tests/helpers/clerk-auth';

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

export const REQUIRED_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

export function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface EnsuredUserRow {
  id: string;
}

export interface SpotifyImportStateRow {
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

export interface MultiDspEnrichmentState {
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

export interface DemoReleaseLookup {
  id: string;
  slug: string;
  title: string | null;
  releaseDate?: string | null;
}

/** Spotify IDs for known major artists with guaranteed multi-DSP coverage */
export const MAJOR_ARTIST_IDS = new Set([
  '6M2wZ9GZgrQXHCFfjv46we', // Dua Lipa
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
]);

/* ------------------------------------------------------------------ */
/*  Spotify import helpers                                              */
/* ------------------------------------------------------------------ */

export function spotifyImportIsReady(
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

export function onboardingProfileIsReady(
  state: SpotifyImportStateRow | null | undefined
): boolean {
  if (!state) {
    return false;
  }

  return Boolean(
    state.spotify_id &&
      state.spotify_url &&
      state.is_public &&
      state.onboarding_completed_at
  );
}

export function countPopulatedDspFields(
  state: MultiDspEnrichmentState
): number {
  let count = 0;
  if (state.apple_music_id || state.apple_music_url) count++;
  if (state.deezer_id) count++;
  if (state.tidal_id) count++;
  if (state.soundcloud_id) count++;
  if (state.youtube_music_id || state.youtube_url) count++;
  return count;
}

export async function waitForSpotifyImport(clerkUserId: string) {
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

export async function waitForMultiDspEnrichment(clerkUserId: string) {
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

export async function advanceOnboardingAfterArtistSelection(
  page: Page,
  timeoutMs = 120_000
): Promise<'checkout' | 'dashboard' | 'importing' | 'review'> {
  const deadline = Date.now() + timeoutMs;
  const reviewDisplayName = page.locator('#onboarding-display-name');
  const reviewGoToDashboard = page.getByRole('button', {
    name: /go to dashboard/i,
  });
  const actionButtons = [
    page.getByRole('button', { name: /^Continue$/i }),
    page.getByRole('button', { name: /^Continue free$/i }),
    page.getByRole('button', { name: /^Finish setup$/i }),
    page.getByRole('button', { name: /^Open dashboard$/i }),
  ];

  while (Date.now() < deadline) {
    if (/\/app(?:\/|$|\?)/.test(page.url())) {
      return 'dashboard';
    }

    if (/\/onboarding\/checkout(?:\/|$|\?)/.test(page.url())) {
      return 'checkout';
    }

    if (
      (await reviewDisplayName.isVisible().catch(() => false)) ||
      (await reviewGoToDashboard.isVisible().catch(() => false))
    ) {
      return 'review';
    }

    let clicked = false;
    for (const button of actionButtons) {
      const candidate = button.first();
      if (
        (await candidate.isVisible().catch(() => false)) &&
        (await candidate.isEnabled().catch(() => false))
      ) {
        try {
          await candidate.click({ timeout: 3_000 });
          clicked = true;
          break;
        } catch {
          continue;
        }
      }
    }

    await page.waitForTimeout(clicked ? 500 : 1_000);
  }

  if (
    page.url().includes('/onboarding') &&
    page.url().includes('resume=spotify')
  ) {
    return 'importing';
  }

  throw new Error(
    `Onboarding did not reach review or dashboard after artist selection. Current URL: ${page.url()}`
  );
}

export async function advanceOnboardingToArtistSelection(
  page: Page,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const artistInput = page.getByPlaceholder(/search.*artist.*spotify/i);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  while (Date.now() < deadline) {
    if (await artistInput.isVisible().catch(() => false)) {
      return;
    }

    const candidate = continueButton.first();
    if (
      (await candidate.isVisible().catch(() => false)) &&
      (await candidate.isEnabled().catch(() => false))
    ) {
      try {
        await candidate.click({ timeout: 3_000 });
      } catch {
        // Ignore transient re-render races and keep polling.
      }
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(
    `Onboarding did not reach artist selection. Current URL: ${page.url()}`
  );
}

export async function getFirstReleaseForUser(
  clerkUserId: string
): Promise<DemoReleaseLookup | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for release lookup');
  }

  const sql = neon(dbUrl);

  const [preferredRelease] = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
      AND (dr.release_date IS NULL OR dr.release_date <= NOW())
      AND EXISTS (
        SELECT 1
        FROM provider_links pl
        WHERE pl.release_id = dr.id
          AND pl.owner_type = 'release'
      )
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
    LIMIT 1
  `) as DemoReleaseLookup[];

  if (preferredRelease) {
    return preferredRelease;
  }

  const [fallbackRelease] = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
    LIMIT 1
  `) as DemoReleaseLookup[];

  return fallbackRelease ?? null;
}

export async function getTopDemoReleasesForUser(
  clerkUserId: string,
  limit = 3
): Promise<DemoReleaseLookup[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for release lookup');
  }

  const sql = neon(dbUrl);
  const rows = (await sql`
    SELECT
      dr.id,
      dr.slug,
      dr.title,
      dr.release_date::text AS "releaseDate"
    FROM discog_releases dr
    INNER JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    ORDER BY COALESCE(dr.release_date, dr.created_at) DESC, dr.created_at DESC
  `) as DemoReleaseLookup[];

  const deduped: DemoReleaseLookup[] = [];
  const seenTitles = new Set<string>();

  for (const row of rows) {
    const title = row.title?.trim();
    if (!title || seenTitles.has(title)) {
      continue;
    }
    seenTitles.add(title);
    deduped.push(row);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

export async function getDemoUserHandle(
  clerkUserId: string
): Promise<string | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL required for demo handle lookup');
  }

  const sql = neon(dbUrl);

  const [row] = (await sql`
    SELECT cp.username
    FROM creator_profiles cp
    INNER JOIN users u ON u.id = cp.user_id
    WHERE u.clerk_id = ${clerkUserId}
    LIMIT 1
  `) as Array<{ username: string | null }>;

  return row?.username ?? null;
}

/* ------------------------------------------------------------------ */
/*  Handle generation                                                   */
/* ------------------------------------------------------------------ */

export function buildValidOnboardingHandle(
  seed: string,
  clerkUserId: string
): string {
  const seedFragment = seed.replaceAll(/[^a-z0-9]/g, '').slice(0, 12);
  const userFragment = clerkUserId.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
  return `j${seedFragment}${userFragment.slice(-6)}`.slice(0, 30);
}

/* ------------------------------------------------------------------ */
/*  Clerk user management                                               */
/* ------------------------------------------------------------------ */

/**
 * Delete all stale golden-path test users from Clerk to stay within the
 * 100-user dev-instance cap. Each test run creates a new
 * `gp-*+clerk_test@test.jovie.com` user; without cleanup the cap fills up.
 */
export async function purgeStaleClerkTestUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.includes('mock')) return;

  try {
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
      if (page.length < 100) break;
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
      console.log(`[e2e] Purged ${toDelete.length} stale Clerk test user(s)`);
    }
  } catch {
    // Non-critical — if purge fails we'll still attempt to create
  }
}

/**
 * Clear onboarding rate limits from Upstash Redis.
 * Repeated test runs exhaust the "3 per hour per IP" limit.
 */
export async function clearOnboardingRateLimits() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

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
 *
 * Also releases the test Spotify artist ID from any previous test profiles
 * to avoid unique constraint violations on repeated runs.
 *
 * @param knownSpotifyArtistIds - Additional Spotify IDs to release from
 *   previous test profiles (beyond the standard test user email match).
 */
export async function ensureDbUser(
  clerkUserId: string,
  email: string,
  knownSpotifyArtistIds: string[] = []
) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for DB user creation');

  const sql = neon(dbUrl);
  await clearOnboardingRateLimits();

  // Release ALL test-linked Spotify artist IDs from previous test profiles.
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL
    WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%+clerk_test@test.jovie.com'
    ) AND spotify_id IS NOT NULL
  `;

  // Also release specific known Spotify IDs from ANY profile.
  if (knownSpotifyArtistIds.length > 0) {
    await sql`
      UPDATE creator_profiles
      SET spotify_id = NULL, spotify_url = NULL
      WHERE spotify_id = ANY(${knownSpotifyArtistIds})
    `;
  }

  // Bypass mode authenticates via test cookies, but the server only knows the
  // unique per-run email if we seed the matching DB row up front. Without
  // this, getCachedCurrentUser() falls back to the shared browse test persona
  // and onboarding submits against a mismatched identity.
  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    const [user] = (await sql`
      INSERT INTO users (clerk_id, email, name, user_status)
      VALUES (${clerkUserId}, ${email}, 'Golden Path', 'waitlist_approved')
      ON CONFLICT (clerk_id) DO UPDATE SET
        email = ${email},
        name = 'Golden Path',
        user_status = 'waitlist_approved',
        updated_at = NOW()
      RETURNING id
    `) as EnsuredUserRow[];

    if (!user?.id) {
      throw new Error(`Failed to ensure DB user for Clerk user ${clerkUserId}`);
    }

    return;
  }

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

/* ------------------------------------------------------------------ */
/*  Page helpers                                                        */
/* ------------------------------------------------------------------ */

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
export async function interceptTrackingCalls(page: Page) {
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
export async function createFreshUser(page: Page, uniqueSeed: string) {
  const email = `gp-${uniqueSeed}+clerk_test@test.jovie.com`;

  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    const clerkUserId = await ensureClerkTestUser({
      email,
      username: `gp-${uniqueSeed}`.replaceAll(/[^a-z0-9-]/gi, '').slice(0, 32),
      firstName: 'Golden',
      lastName: 'Path',
      metadata: { source: 'e2e-smoke-bypass' },
    });

    await setTestAuthBypassSession(page, null, clerkUserId);
    return { email, clerkUserId };
  }

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

  const clerkUserId = await page.evaluate(async (targetEmail: string) => {
    const clerkInstance = (window as any).Clerk;
    if (!clerkInstance) throw new Error('Clerk not initialized');

    if (clerkInstance.user?.id && clerkInstance.session) {
      return clerkInstance.user.id as string;
    }

    const client = clerkInstance.client;
    if (!client?.signUp) throw new Error('Clerk client.signUp not available');

    const signUp = await client.signUp.create({
      emailAddress: targetEmail,
    });

    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    const result = await signUp.attemptEmailAddressVerification({
      code: '424242',
    });

    if (result.createdSessionId) {
      await clerkInstance.setActive({ session: result.createdSessionId });
    } else {
      throw new Error(
        `Signup completed with status "${result.status}" but no session was created`
      );
    }

    return clerkInstance.user?.id as string;
  }, email);

  if (!clerkUserId) {
    throw new Error('Clerk session not established after signup');
  }

  return { email, clerkUserId };
}
