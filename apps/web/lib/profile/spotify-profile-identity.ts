import 'server-only';

import { and, sql as drizzleSql, eq, ne } from 'drizzle-orm';
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
