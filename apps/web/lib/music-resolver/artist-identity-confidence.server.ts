import 'server-only';

import { and, sql as drizzleSql, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';
import {
  type ArtistIdentityConfidence,
  type ArtistIdentityMatchEvidence,
  type ArtistIdentityQualityMetrics,
  scoreArtistIdentity,
  summarizeArtistIdentity,
} from './artist-identity-confidence';

/** Match source for a row created only to ask the owner to confirm. */
export const ARTIST_IDENTITY_CHECK_SOURCE = 'identity_check' as const;

const profileColumns = {
  id: creatorProfiles.id,
  displayName: creatorProfiles.displayName,
  spotifyId: creatorProfiles.spotifyId,
  spotifyUrl: creatorProfiles.spotifyUrl,
  appleMusicId: creatorProfiles.appleMusicId,
  deezerId: creatorProfiles.deezerId,
  tidalId: creatorProfiles.tidalId,
  soundcloudId: creatorProfiles.soundcloudId,
  youtubeMusicId: creatorProfiles.youtubeMusicId,
  musicbrainzId: creatorProfiles.musicbrainzId,
};

type ProfileRow = {
  [K in keyof typeof profileColumns]: string | null;
} & { id: string };

function boundIds(profile: ProfileRow) {
  return {
    spotify: profile.spotifyId,
    apple_music: profile.appleMusicId,
    deezer: profile.deezerId,
    tidal: profile.tidalId,
    soundcloud: profile.soundcloudId,
    youtube_music: profile.youtubeMusicId,
    musicbrainz: profile.musicbrainzId,
  };
}

async function loadMatches(
  profileIds: readonly string[]
): Promise<Map<string, ArtistIdentityMatchEvidence[]>> {
  const byProfile = new Map<string, ArtistIdentityMatchEvidence[]>();
  if (!profileIds.length) return byProfile;
  const rows = await db
    .select({
      creatorProfileId: dspArtistMatches.creatorProfileId,
      providerId: dspArtistMatches.providerId,
      externalArtistId: dspArtistMatches.externalArtistId,
      status: dspArtistMatches.status,
      matchSource: dspArtistMatches.matchSource,
      confidenceScore: dspArtistMatches.confidenceScore,
      matchingIsrcCount: dspArtistMatches.matchingIsrcCount,
    })
    .from(dspArtistMatches)
    .where(inArray(dspArtistMatches.creatorProfileId, [...profileIds]));
  for (const row of rows) {
    const list = byProfile.get(row.creatorProfileId) ?? [];
    list.push({
      providerId: row.providerId,
      externalArtistId: row.externalArtistId,
      status: row.status,
      matchSource: row.matchSource,
      confidenceScore:
        row.confidenceScore === null ? null : Number(row.confidenceScore),
      matchingIsrcCount: row.matchingIsrcCount,
    });
    byProfile.set(row.creatorProfileId, list);
  }
  return byProfile;
}

/** Other profiles sharing the normalized display name but bound to another artist. */
async function countSameNameCollisions(profile: ProfileRow): Promise<number> {
  const name = profile.displayName?.trim().toLowerCase();
  if (!name || !profile.spotifyId) return 0;
  const [row] = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(creatorProfiles)
    .where(
      and(
        ne(creatorProfiles.id, profile.id),
        drizzleSql`lower(trim(${creatorProfiles.displayName})) = ${name}`,
        drizzleSql`${creatorProfiles.spotifyId} is not null`,
        ne(creatorProfiles.spotifyId, profile.spotifyId)
      )
    );
  return row?.count ?? 0;
}

export interface ProfileArtistIdentity extends ArtistIdentityConfidence {
  readonly profileId: string;
}

/**
 * Right-artist confidence for one profile. Per-profile certification reads
 * this instead of trusting `auto_confirmed` rows.
 */
export async function getArtistIdentityConfidence(
  profileId: string
): Promise<ProfileArtistIdentity | null> {
  const [profile] = await db
    .select(profileColumns)
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!profile) return null;
  const matches = (await loadMatches([profile.id])).get(profile.id) ?? [];
  return {
    profileId: profile.id,
    ...scoreArtistIdentity({
      boundIds: boundIds(profile),
      matches,
      sameNameCollisions: await countSameNameCollisions(profile),
    }),
  };
}

/**
 * Below the bar, put the bound Spotify artist on the owner's existing DSP
 * suggestion surface so they confirm it in-product. Never overwrites an owner
 * decision (confirmed/rejected) or an evidenced machine match.
 */
export async function requestArtistIdentityConfirmation(
  identity: ProfileArtistIdentity
): Promise<'requested' | 'not_needed' | 'no_spotify_identity'> {
  if (identity.decision !== 'needs_confirmation') return 'not_needed';
  const [profile] = await db
    .select(profileColumns)
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, identity.profileId))
    .limit(1);
  if (!profile?.spotifyId) return 'no_spotify_identity';
  const now = new Date();
  const url =
    profile.spotifyUrl ??
    `https://open.spotify.com/artist/${profile.spotifyId}`;
  await db
    .insert(dspArtistMatches)
    .values({
      creatorProfileId: profile.id,
      providerId: 'spotify',
      externalArtistId: profile.spotifyId,
      externalArtistName: profile.displayName,
      externalArtistUrl: url,
      status: 'suggested',
      matchSource: ARTIST_IDENTITY_CHECK_SOURCE,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dspArtistMatches.creatorProfileId, dspArtistMatches.providerId],
      set: {
        externalArtistId: profile.spotifyId,
        externalArtistUrl: url,
        status: 'suggested',
        confirmedAt: null,
        matchSource: ARTIST_IDENTITY_CHECK_SOURCE,
        updatedAt: now,
      },
      // Only evidence-free machine rows are demoted to a question.
      where: and(
        inArray(dspArtistMatches.status, ['suggested', 'auto_confirmed']),
        isNull(dspArtistMatches.confidenceScore),
        eq(dspArtistMatches.matchingIsrcCount, 0)
      ),
    });
  logger.info('Requested owner confirmation of artist identity', {
    profileId: profile.id,
    score: identity.score,
    reasons: identity.reasons,
  });
  return 'requested';
}

/** Match-quality metrics over claimed profiles, for Summer. */
export async function readArtistIdentityQuality(): Promise<
  ArtistIdentityQualityMetrics & { readonly observedAt: string }
> {
  const profiles = await db
    .select(profileColumns)
    .from(creatorProfiles)
    .where(eq(creatorProfiles.isClaimed, true));
  const matches = await loadMatches(profiles.map(profile => profile.id));
  const names = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const name = profile.displayName?.trim().toLowerCase();
    if (!name || !profile.spotifyId) continue;
    const ids = names.get(name) ?? new Set<string>();
    ids.add(profile.spotifyId);
    names.set(name, ids);
  }
  const results = profiles.map(profile => {
    const name = profile.displayName?.trim().toLowerCase();
    const ids = name ? names.get(name) : undefined;
    return scoreArtistIdentity({
      boundIds: boundIds(profile),
      matches: matches.get(profile.id) ?? [],
      sameNameCollisions: ids ? ids.size - 1 : 0,
    });
  });
  return {
    ...summarizeArtistIdentity(results),
    observedAt: new Date().toISOString(),
  };
}
