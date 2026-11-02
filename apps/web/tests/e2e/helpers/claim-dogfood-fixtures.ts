import { neon } from '@neondatabase/serverless';
import type { Page } from '@playwright/test';
import {
  SHARED_E2E_ARTIST_POOL,
  selectUnclaimedCertArtist,
} from '@/lib/synthetic/prodcert-artist-fixture';

/**
 * Fixture artists for the $12 claim dogfood (never real artists).
 *
 * Unclaimed, non-public profiles with synthetic 22-char Spotify ids and a
 * stored follower count. The claim entry and the onboarding connect read the
 * stored count first (lib/claim/claim-verification.server.ts lookupArtistReach),
 * so neither branch calls Spotify. Search results are served by the test
 * (page.route on /api/spotify/search), so no real artist is ever offered.
 */
export const DOGFOOD_LOW_REACH_ARTIST = {
  id: '0DogfoodLowReachFixt01',
  handle: 'dogfood-fixture-low-reach',
  name: 'Dogfood Fixture Low Reach',
  followers: 1_200,
} as const;

export const DOGFOOD_HIGH_REACH_ARTIST = {
  id: '0DogfoodHighReachFixt1',
  handle: 'dogfood-fixture-high-reach',
  name: 'Dogfood Fixture High Reach',
  followers: 75_000,
} as const;

export type DogfoodArtist =
  | typeof DOGFOOD_LOW_REACH_ARTIST
  | typeof DOGFOOD_HIGH_REACH_ARTIST;

export function dogfoodSql() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes('dummy')) {
    throw new Error('DATABASE_URL is required for the claim dogfood fixtures');
  }
  return neon(url);
}

/** Idempotent: (re)creates both fixture artists as unclaimed, unlinked rows. */
export async function seedDogfoodArtists(): Promise<void> {
  const sql = dogfoodSql();
  for (const artist of [DOGFOOD_LOW_REACH_ARTIST, DOGFOOD_HIGH_REACH_ARTIST]) {
    await sql`
      INSERT INTO creator_profiles (
        creator_type, username, username_normalized, display_name,
        spotify_id, spotify_followers, is_claimed, is_public
      ) VALUES (
        'artist', ${artist.handle}, ${artist.handle}, ${artist.name},
        ${artist.id}, ${artist.followers}, false, false
      )
      ON CONFLICT (username_normalized) WHERE username_normalized IS NOT NULL
      DO UPDATE SET
        spotify_id = EXCLUDED.spotify_id,
        spotify_followers = EXCLUDED.spotify_followers,
        display_name = EXCLUDED.display_name,
        is_claimed = false,
        user_id = NULL,
        is_public = false,
        updated_at = now()
    `;
  }
}

/** Serve fixture artists from the artist search, so no real artist appears. */
export async function routeDogfoodArtistSearch(
  page: Page,
  artists: readonly DogfoodArtist[]
): Promise<void> {
  await page.route('**/api/spotify/search**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        artists.map(artist => ({
          id: artist.id,
          name: artist.name,
          url: `https://open.spotify.com/artist/${artist.id}`,
          followers: artist.followers,
          popularity: 1,
          isClaimed: false,
        }))
      ),
    })
  );
}

/** Read the claim-verification record on the persona's active profile. */
export async function readActiveClaimVerification(email: string): Promise<{
  profileId: string;
  spotifyId: string | null;
  record: {
    status?: string;
    paidAt?: string | null;
    decidedAt?: string | null;
    refundId?: string | null;
    acquisitionId?: string | null;
  } | null;
}> {
  const sql = dogfoodSql();
  const [row] = await sql`
    SELECT cp.id AS profile_id, cp.spotify_id,
           cp.settings -> 'claimVerification' AS record
    FROM users u
    JOIN creator_profiles cp ON cp.id = u.active_profile_id
    WHERE u.email = ${email}
    LIMIT 1
  `;
  if (!row) throw new Error(`No active profile for ${email}`);
  return {
    profileId: row.profile_id as string,
    spotifyId: (row.spotify_id as string | null) ?? null,
    record: (row.record as Record<string, string | null> | null) ?? null,
  };
}

/**
 * Stand-in for the onboarding attach step: store the `awaiting_payment`
 * request exactly as `requestClaimVerification` does for an unpaid buyer.
 * The four guarded attach points are unit-tested; the live onboarding chat
 * is not deterministic enough for a daily browser run.
 */
export async function requestDogfoodClaimVerification(
  profileId: string,
  artist: DogfoodArtist,
  acquisitionId: string
): Promise<void> {
  const sql = dogfoodSql();
  const record = {
    schema: 'jovie-claim-verification/v1',
    status: 'awaiting_payment',
    spotifyArtistId: artist.id,
    artistName: artist.name,
    reach: {
      signal: 'spotify_followers',
      value: artist.followers,
      threshold: 50_000,
    },
    requestedAt: new Date().toISOString(),
    paidAt: null,
    acquisitionId,
  };
  await sql`
    UPDATE creator_profiles
    SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{claimVerification}', ${JSON.stringify(record)}::jsonb),
        updated_at = now()
    WHERE id = ${profileId}
  `;
}

/** Put a decided request back to pending (so approve and reject both run). */
export async function resetDogfoodClaimToPending(
  profileId: string
): Promise<void> {
  const sql = dogfoodSql();
  await sql`
    UPDATE creator_profiles
    SET settings = jsonb_set(
          settings,
          '{claimVerification}',
          (settings -> 'claimVerification')
            - 'decidedAt' - 'decidedBy' - 'decisionReason' - 'refundId'
            || '{"status":"pending_verification"}'::jsonb
        ),
        updated_at = now()
    WHERE id = ${profileId}
  `;
}

/** Undo everything the high-reach run wrote on the persona's profile. */
export async function clearDogfoodClaim(
  profileId: string,
  artist: DogfoodArtist
): Promise<void> {
  const sql = dogfoodSql();
  await sql`
    UPDATE creator_profiles
    SET settings = coalesce(settings, '{}'::jsonb) - 'claimVerification',
        spotify_id = CASE WHEN spotify_id = ${artist.id} THEN NULL ELSE spotify_id END,
        spotify_url = CASE WHEN spotify_id = ${artist.id} THEN NULL ELSE spotify_url END,
        updated_at = now()
    WHERE id = ${profileId}
  `;
  await sql`
    DELETE FROM ovie_operating_kv
    WHERE key LIKE 'summer-card:%'
      AND value ->> 'idempotencyKey' = ${`claim-verification_${profileId}`}
  `;
}

export async function readClaimCard(
  profileId: string
): Promise<{ status?: string; title?: string } | null> {
  const sql = dogfoodSql();
  const [row] = await sql`
    SELECT value FROM ovie_operating_kv
    WHERE key LIKE 'summer-card:%'
      AND value ->> 'idempotencyKey' = ${`claim-verification_${profileId}`}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return (
    (row?.value as { status?: string; title?: string } | undefined) ?? null
  );
}

export async function readFunnelStages(
  acquisitionId: string
): Promise<string[]> {
  const sql = dogfoodSql();
  const rows = await sql`
    SELECT stage FROM acquisition_journey_stages
    WHERE acquisition_id = ${acquisitionId}::uuid
    ORDER BY occurred_at
  `;
  return rows.map(row => row.stage as string);
}

/** Drop the synthetic journey so dogfood runs never count as real visitors. */
export async function revokeDogfoodJourney(
  acquisitionId: string
): Promise<void> {
  const sql = dogfoodSql();
  await sql`
    UPDATE acquisition_journeys
    SET consent_state = 'revoked', consent_revoked_at = now(), updated_at = now()
    WHERE id = ${acquisitionId}::uuid
  `;
}

/**
 * Admin decisions need a passkey step-up on the exact session
 * (lib/admin/mfa.ts). The test-auth bypass admin cannot run a WebAuthn
 * ceremony, so the test grants a 10-minute step-up to the bypass session id
 * (`sess_test_bypass_<users.id>`, lib/auth/cached.ts) in the test database
 * only, and removes it afterwards. The bypass never runs on preview or
 * production deployments (lib/auth/test-mode.ts).
 */
export async function grantDogfoodAdminStepUp(
  adminEmail: string
): Promise<() => Promise<void>> {
  const sql = dogfoodSql();
  const [user] =
    await sql`SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1`;
  if (!user) throw new Error('No admin test user for step-up');
  const sessionId = `sess_test_bypass_${user.id as string}`;
  const id = `dogfood-step-up-${user.id as string}`;
  await sql`
    INSERT INTO ba_verifications (id, identifier, value, expires_at)
    VALUES (${id}, ${`admin-step-up:${sessionId}`}, 'dogfood',
            now() + interval '10 minutes')
    ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at
  `;
  return async () => {
    await sql`DELETE FROM ba_verifications WHERE id = ${id}`;
  };
}

/**
 * Repair a persona whose stored subscription no longer exists in Stripe test
 * mode (an interrupted earlier run). Test database only.
 */
export async function resetDogfoodBilling(email: string): Promise<void> {
  const sql = dogfoodSql();
  await sql`
    UPDATE users
    SET is_pro = false, plan = 'free', stripe_subscription_id = NULL,
        billing_version = billing_version + 1, updated_at = now()
    WHERE email = ${email}
  `;
}

/* ------------------------------------------------------------------ */
/*  Golden-path fixture artist lifecycle                                */
/* ------------------------------------------------------------------ */

/**
 * Email pattern for golden-path test accounts; only their bindings are
 * ever released by the self-cleaning teardown.
 */
export const GOLDEN_PATH_TEST_EMAIL_LIKE = 'gp-%+e2e@test.jovie.com';

/** Broader golden-path account pattern (Clerk may rewrite +e2e to +clerk_test). */
export const GOLDEN_PATH_TEST_PROFILE_EMAIL_LIKE = 'gp-%@test.jovie.com';

/**
 * Release all creator_profiles spotify bindings owned by golden-path test
 * accounts. Called in beforeAll (to clear stale runs) and afterAll (teardown).
 * Keeps the fixture pool clean so subsequent runs never hit ownership_conflict:v1.
 */
export async function releaseGoldenPathTestBindings(
  sql: ReturnType<typeof neon>
): Promise<void> {
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL, updated_at = NOW()
    WHERE spotify_id IS NOT NULL
      AND user_id IN (
        SELECT id FROM users WHERE email LIKE ${GOLDEN_PATH_TEST_EMAIL_LIKE}
      )
  `;
}

/**
 * Unpublish profiles owned by golden-path test accounts so finished runs never
 * leave public test profiles behind. Idempotent, never deletes, never touches
 * non-golden-path rows. The broader sweep (all test-account classes) is
 * `scripts/cleanup-test-profiles.ts`.
 */
export async function unpublishGoldenPathTestProfiles(
  sql: ReturnType<typeof neon>
): Promise<void> {
  await sql`
    UPDATE creator_profiles
    SET is_public = false, updated_at = NOW()
    WHERE is_public = true
      AND user_id IN (
        SELECT id FROM users WHERE email LIKE ${GOLDEN_PATH_TEST_PROFILE_EMAIL_LIKE}
      )
  `;
}

/**
 * Release any stale golden-path bindings then select the first artist from
 * SHARED_E2E_ARTIST_POOL whose Spotify id has no bound creator_profiles row.
 */
export async function selectGoldenPathArtist(
  sql: ReturnType<typeof neon>
): Promise<{ id: string; name: string; url: string }> {
  await releaseGoldenPathTestBindings(sql);
  return selectUnclaimedCertArtist(SHARED_E2E_ARTIST_POOL, async spotifyId => {
    const rows =
      await sql`SELECT 1 FROM creator_profiles WHERE spotify_id = ${spotifyId} LIMIT 1`;
    return rows.length > 0;
  }).then(a => ({ id: a.spotifyId, name: a.name, url: a.url }));
}
