import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const validAppleArtistId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && /^\d{4,15}$/.test(id);

/** Parse the numeric artist ID from an Apple Music artist URL. */
export function parseAppleMusicArtistId(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'music.apple.com' && host !== 'itunes.apple.com') return null;
  const match = /\/artist\/(?:[^/]+\/)?(?:id)?(\d+)\/?$/.exec(parsed.pathname);
  return match && validAppleArtistId(match[1]) ? match[1] : null;
}

/**
 * Apple Music artist the profile has authority over, mirroring the Spotify
 * scan target: canonical profile data or an explicit confirmation. A rejected
 * match, or profile fields that disagree, fail closed.
 */
export async function getBoundAppleMusicArtistId(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<string | null> {
  const [profile] = await tx
    .select({
      appleMusicId: creatorProfiles.appleMusicId,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
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
        eq(dspArtistMatches.providerId, 'apple_music')
      )
    )
    .limit(1);

  const fromId = validAppleArtistId(profile.appleMusicId)
    ? profile.appleMusicId
    : null;
  const fromUrl = parseAppleMusicArtistId(profile.appleMusicUrl);
  if (fromId && fromUrl && fromId !== fromUrl) return null;
  const canonical = fromId ?? fromUrl;

  if (
    match?.status === 'rejected' &&
    (!canonical || match.externalArtistId === canonical)
  )
    return null;
  if (match?.status === 'confirmed') {
    if (!validAppleArtistId(match.externalArtistId)) return null;
    if (canonical && canonical !== match.externalArtistId) return null;
    return match.externalArtistId;
  }
  // Suggested and auto-confirmed discovery alone are not import authority.
  return canonical;
}
