import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const validArtistId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9]{22}$/.test(id);

/** Bind scans to canonical profile data or an explicit artist confirmation. */
export async function getBoundSpotifyArtistId(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<string | null> {
  const [profile] = await tx
    .select({ spotifyId: creatorProfiles.spotifyId })
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

  const canonical = validArtistId(profile.spotifyId) ? profile.spotifyId : null;
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
