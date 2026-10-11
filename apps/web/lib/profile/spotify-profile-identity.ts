import 'server-only';

import { and, desc, sql as drizzleSql, eq, ne } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/**
 * Serialize creator-profile decisions for one Spotify artist identity.
 *
 * Keep the database unique constraint as a final backstop. Every guarded
 * automatic-profile create and onboarding
 * attach in this lane takes the same transaction-scoped lock before its final
 * exact-ID recheck, so concurrent requests cannot create a second winner.
 */
export async function lockSpotifyProfileIdentity(
  tx: DbOrTransaction,
  spotifyArtistId: string
): Promise<void> {
  await tx.execute(
    drizzleSql`SELECT pg_advisory_xact_lock(hashtext('jovie:creator-profile-spotify'), hashtext(${spotifyArtistId}))`
  );
}

export class SpotifyProfileIdentityConflictError extends Error {
  readonly errorCode = 'SPOTIFY_IDENTITY_CONFLICT';
  readonly status = 409;

  constructor() {
    super(
      'This Spotify artist already has a Jovie profile. Sign in with the original account or use the verified profile claim flow. Choosing another handle will not resolve this conflict.'
    );
    this.name = 'SpotifyProfileIdentityConflictError';
  }
}

/** Caller must hold a transaction through the guarded write. Never adopt a conflict. */
export async function assertSpotifyProfileIdentityAvailable(
  tx: DbOrTransaction,
  spotifyArtistId: string,
  currentProfileId: string | null
): Promise<void> {
  await lockSpotifyProfileIdentity(tx, spotifyArtistId);
  const [conflict] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, spotifyArtistId),
        currentProfileId ? ne(creatorProfiles.id, currentProfileId) : undefined
      )
    )
    .limit(1);
  if (conflict) throw new SpotifyProfileIdentityConflictError();
}

/** Read-only mirror of materialization admission; matching an artist grants no ownership. */
export async function hasSpotifyProfileIdentityConflict(
  tx: DbOrTransaction,
  spotifyArtistId: string,
  verifiedAppUserId: string | null
): Promise<boolean> {
  // Use the same preferred profile as claim-profile.ts. An account cannot
  // replace its bound artist or silently adopt another exact-ID row.
  const [existingProfile] = verifiedAppUserId
    ? await tx
        .select({
          id: creatorProfiles.id,
          spotifyId: creatorProfiles.spotifyId,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, verifiedAppUserId))
        .orderBy(
          desc(creatorProfiles.isClaimed),
          desc(creatorProfiles.onboardingCompletedAt),
          desc(creatorProfiles.updatedAt)
        )
        .limit(1)
    : [];
  if (
    existingProfile?.spotifyId &&
    existingProfile.spotifyId !== spotifyArtistId
  ) {
    return true;
  }
  const [conflict] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, spotifyArtistId),
        existingProfile ? ne(creatorProfiles.id, existingProfile.id) : undefined
      )
    )
    .limit(1);
  return Boolean(conflict);
}
