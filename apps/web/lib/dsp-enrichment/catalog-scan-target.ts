import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { resolveSpotifyArtistIdentity } from '@/lib/spotify/artist-id';

const validArtistId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9]{22}$/.test(id);

/** Bind scans to canonical profile data or an explicit artist confirmation. */
export async function getBoundSpotifyArtistId(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<string | null> {
  const [profile] = await tx
    .select({
      spotifyId: creatorProfiles.spotifyId,
      spotifyUrl: creatorProfiles.spotifyUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);
  if (!profile) return null;

  const [match] = await tx
    .select({
      externalArtistId: dspArtistMatches.externalArtistId,
      status: dspArtistMatches.status,
    })
    .from(dspArtistMatches)
    .where(
      and(
        eq(dspArtistMatches.creatorProfileId, creatorProfileId),
        eq(dspArtistMatches.providerId, 'spotify')
      )
    )
    .limit(1);

  // Legacy profiles keep only spotify_url. Resolve the exact ID from either
  // structured field. Conflicting IDs grant no authority of their own; only an
  // explicit confirmation of one of the stored IDs settles which one it is.
  const identity = resolveSpotifyArtistIdentity([
    profile.spotifyId,
    profile.spotifyUrl,
  ]);
  if (identity.status === 'conflict') {
    const stored = [profile.spotifyId, profile.spotifyUrl].map(
      field => resolveSpotifyArtistIdentity([field]).spotifyArtistId
    );
    return match?.status === 'confirmed' &&
      validArtistId(match.externalArtistId) &&
      stored.includes(match.externalArtistId)
      ? match.externalArtistId
      : null;
  }
  const canonical = validArtistId(identity.spotifyArtistId)
    ? identity.spotifyArtistId
    : null;
  if (
    match?.status === 'rejected' &&
    (!canonical || match.externalArtistId === canonical)
  )
    return null;
  if (match?.status === 'confirmed') {
    if (!validArtistId(match.externalArtistId)) return null;
    if (canonical && canonical !== match.externalArtistId) return null;
    return match.externalArtistId;
  }
  // Suggested and auto-confirmed discovery alone are not scan authority.
  return canonical;
}
