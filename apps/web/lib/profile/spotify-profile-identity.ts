import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';

/**
 * Serialize creator-profile decisions for one Spotify artist identity.
 *
 * The current database does not expose a schema-owned unique constraint for
 * creator_profiles.spotify_id. Every automatic-profile create and onboarding
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
