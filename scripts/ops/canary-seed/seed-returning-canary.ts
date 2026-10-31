#!/usr/bin/env -S tsx

/**
 * Seed the production certification canaries from the versioned spec in
 * `lib/synthetic/returning-canary-seed-spec.ts`.
 *
 *   - returning-creator canary: real artist identity + catalog, imported by
 *     the product's own onboarding importer (`runOnboardingCatalogImport`,
 *     the same path a /start claim uses), not hand-written rows.
 *   - chat-health canary: profile-only account the post-deploy chat check
 *     signs in as, so it never spends the returning canary's AI quota.
 *
 * Idempotent. Dry-run by default (reads and prints the planned writes; writes
 * nothing). Writes touch only rows owned by the two spec emails.
 *
 * `--only=chat-health` (or `--only=returning`) scopes the run to one canary so
 * the post-deploy cert pipelines can provision the chat-health canary alone,
 * without Spotify credentials and without depending on the returning canary
 * (JOV-10150).
 *
 *   cd apps/web && npx tsx --import ../../scripts/ops/canary-seed/shim-preload.mjs \
 *     ../../scripts/ops/canary-seed/seed-returning-canary.ts [--apply] [--only=chat-health]
 *
 * Needs DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (Doppler
 * jovie-web/prd; never printed).
 */

import { and, eq, ne } from 'drizzle-orm';
import { getDeterministicTestBetterAuthUserId } from '../../../apps/web/lib/auth/dev-test-auth-identity';
import { db } from '../../../apps/web/lib/db';
import { users } from '../../../apps/web/lib/db/schema/auth';
import { baUsers } from '../../../apps/web/lib/db/schema/better-auth';
import { creatorProfiles } from '../../../apps/web/lib/db/schema/profiles';
import {
  CANARY_SEED_SPEC_VERSION,
  type CanaryArtistData,
  type CanarySeedIdentity,
  CHAT_HEALTH_CANARY_SEED,
  chatHealthCanaryProfileSeedInput,
  isCanarySeedEmail,
  planCanaryProfileUpdate,
  RETURNING_CANARY_SEED,
} from '../../../apps/web/lib/synthetic/returning-canary-seed-spec';

const APPLY = process.argv.includes('--apply');

/** Optional scope: provision only one canary (JOV-10150). Default: both. */
const SCOPE = (() => {
  const scoped = process.argv.find(arg => arg.startsWith('--only='));
  if (!scoped) return 'all' as const;
  const scope = scoped.slice('--only='.length);
  if (scope !== 'returning' && scope !== 'chat-health') {
    throw new Error(
      `Unknown --only scope: ${scope} (expected 'returning' or 'chat-health')`
    );
  }
  return scope;
})();

function log(step: string, detail: unknown): void {
  console.log(`[canary-seed] ${step}`, JSON.stringify(detail));
}

async function loadOwned(spec: CanarySeedIdentity) {
  if (!isCanarySeedEmail(spec.email)) {
    throw new Error(`Refusing non-canary email ${spec.email}`);
  }
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      spotifyId: creatorProfiles.spotifyId,
      spotifyUrl: creatorProfiles.spotifyUrl,
      avatarUrl: creatorProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.email, spec.email))
    .limit(1);
  return row ?? null;
}

async function fetchArtist(
  spec: CanarySeedIdentity
): Promise<CanaryArtistData | null> {
  if (!spec.artist) return null;
  const { getSpotifyArtist } = await import('../../../apps/web/lib/spotify');
  const artist = await getSpotifyArtist(spec.artist.spotifyId);
  if (!artist?.name) {
    throw new Error(`Spotify returned no artist for ${spec.artist.spotifyId}`);
  }
  log('spotify-artist', { name: artist.name, id: artist.id });
  const best = artist.images
    ?.slice()
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return {
    imageUrl: best?.url ?? null,
    genres: artist.genres ?? [],
    followerCount: artist.followers?.total ?? 0,
    popularity: artist.popularity ?? 0,
  };
}

async function seedReturning(): Promise<void> {
  const spec = RETURNING_CANARY_SEED;
  const row = await loadOwned(spec);
  if (!row?.profileId) throw new Error('Returning canary has no profile');
  const artist = await fetchArtist(spec);
  const [bound] = spec.artist
    ? await db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.spotifyId, spec.artist.spotifyId),
            ne(creatorProfiles.id, row.profileId)
          )
        )
        .limit(1)
    : [];
  const [handleTaken] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, spec.handle),
        ne(creatorProfiles.id, row.profileId)
      )
    )
    .limit(1);
  if (handleTaken) throw new Error(`Handle ${spec.handle} is taken`);

  const plan = planCanaryProfileUpdate(
    spec,
    {
      profileId: row.profileId,
      ownerEmail: row.email ?? '',
      username: row.username,
      displayName: row.displayName,
      bio: row.bio,
      spotifyId: row.spotifyId,
      spotifyUrl: row.spotifyUrl,
      avatarUrl: row.avatarUrl,
    },
    artist,
    Boolean(bound)
  );
  log('returning-plan', { version: CANARY_SEED_SPEC_VERSION, plan });
  const set = plan[0]?.set;
  if (APPLY) {
    if (set) {
      await db
        .update(creatorProfiles)
        .set({
          ...(set.username ? { username: String(set.username) } : {}),
          ...(set.username_normalized
            ? { usernameNormalized: String(set.username_normalized) }
            : {}),
          ...(set.display_name
            ? { displayName: String(set.display_name) }
            : {}),
          ...(set.bio ? { bio: String(set.bio) } : {}),
          ...(set.spotify_id ? { spotifyId: String(set.spotify_id) } : {}),
          ...(set.spotify_url ? { spotifyUrl: String(set.spotify_url) } : {}),
          ...(set.avatar_url ? { avatarUrl: String(set.avatar_url) } : {}),
          ...(artist
            ? {
                genres: [...artist.genres],
                spotifyFollowers: artist.followerCount,
                spotifyPopularity: artist.popularity,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(creatorProfiles.id, row.profileId),
            eq(creatorProfiles.userId, row.userId)
          )
        );
    }
    await db
      .update(users)
      .set({ name: spec.displayName, updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    // The signed-in shell reads the Better Auth user name (sidebar avatar),
    // so keep it in step with the app user. Keyed by the canary's own email.
    await db
      .update(baUsers)
      .set({ name: spec.displayName, updatedAt: new Date() })
      .where(eq(baUsers.email, spec.email));
    const { runOnboardingCatalogImport } = await import(
      '../../../apps/web/lib/onboarding/catalog-import.server'
    );
    const result = await runOnboardingCatalogImport({
      profileId: row.profileId,
      spotifyArtistId: spec.artist?.spotifyId ?? '',
      spotifyArtistUrl: spec.artist?.url ?? '',
      userId: row.userId,
    });
    log('catalog-import', result);
  }
}

async function seedChatHealth(): Promise<void> {
  const spec = CHAT_HEALTH_CANARY_SEED;
  const existing = await loadOwned(spec);
  if (existing?.profileId) {
    log('chat-health', { state: 'exists', profileId: existing.profileId });
    return;
  }
  log('chat-health', { state: 'missing', willCreate: APPLY });
  if (!APPLY) return;
  const {
    ensureBetterAuthTestUser,
    ensureCreatorProfileRecord,
    ensureUserProfileClaim,
    ensureUserRecord,
    setActiveProfileForUser,
  } = await import('../../../apps/web/lib/testing/test-user-provision.server');
  const baId = await ensureBetterAuthTestUser({
    email: spec.email,
    fullName: spec.displayName,
  });
  // Production reality (JOV-10150): the first email-OTP sign-in auto-creates
  // the Better Auth user with its own id, which differs from the deterministic
  // local-dev id. `ensureBetterAuthTestUser` resolves the existing row by
  // email, and every step below keys off that resolved identity — so a
  // differing id is a notice, not a refusal.
  if (baId !== getDeterministicTestBetterAuthUserId(spec.email)) {
    log('chat-health', {
      state: 'existing-better-auth-id',
      note: 'resolved by email; differs from the deterministic local-dev id',
    });
  }
  const user = await ensureUserRecord(db, {
    clerkId: baId,
    betterAuthUserId: baId,
    email: spec.email,
    name: spec.displayName,
    userStatus: 'active',
    isAdmin: false,
    isPro: false,
    plan: 'free',
    billingUpdatedAt: new Date(),
  });
  await db
    .update(users)
    .set({ accountClass: 'internal' })
    .where(eq(users.id, user.id));
  const profileId = await ensureCreatorProfileRecord(db, {
    userId: user.id,
    creatorType: 'artist',
    ...chatHealthCanaryProfileSeedInput(new Date()),
  });
  await ensureUserProfileClaim(db, user.id, profileId);
  await setActiveProfileForUser(db, user.id, profileId);
  log('chat-health', { state: 'created', profileId });
}

async function main(): Promise<void> {
  log('start', {
    version: CANARY_SEED_SPEC_VERSION,
    apply: APPLY,
    scope: SCOPE,
  });
  if (SCOPE === 'all' || SCOPE === 'returning') await seedReturning();
  if (SCOPE === 'all' || SCOPE === 'chat-health') await seedChatHealth();
  log('done', { apply: APPLY });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(
      '[canary-seed] failed',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  });
