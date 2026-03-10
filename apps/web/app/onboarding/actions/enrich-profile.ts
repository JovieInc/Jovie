/**
 * Profile enrichment from DSP data during onboarding.
 *
 * Fetches artist data (name, image, bio, social links) from Spotify API
 * and MusicFetch API synchronously, then applies it to the creator profile.
 */

'use server';

import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  extractMusicFetchLinks,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';
import {
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import {
  getBestSpotifyImageUrl,
  getSpotifyArtistProfile,
} from '@/lib/dsp-enrichment/providers/spotify';
import { captureError } from '@/lib/error-tracking';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { logger } from '@/lib/utils/logger';
import { uploadRemoteAvatar } from './avatar';

export interface EnrichedProfileData {
  name: string | null;
  imageUrl: string | null;
  bio: string | null;
  genres: string[];
  followers: number | null;
}

async function uploadProfileImage(
  profileId: string,
  imageUrl: string,
  imageSource: 'musicfetch' | 'spotify',
  spotifyArtistId: string,
  result: EnrichedProfileData,
  profileUpdates: Partial<typeof creatorProfiles.$inferInsert>
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const uploaded = await uploadRemoteAvatar({
      imageUrl,
      cookieHeader: cookieStore.toString(),
      maxRetries: 2,
    });
    if (uploaded) {
      profileUpdates.avatarUrl = uploaded.blobUrl;
      result.imageUrl = uploaded.blobUrl;
      logger.info('Artist image uploaded during onboarding enrichment', {
        profileId,
        spotifyArtistId,
        source: imageSource,
      });
    }
  } catch (error) {
    await captureError(
      'Failed to upload artist image during onboarding enrichment',
      error,
      { profileId, spotifyArtistId }
    );
  }
}

async function processMusicFetchSocialLinks(
  profile: {
    id: string;
    usernameNormalized: string;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean | null;
    displayNameLocked: boolean | null;
  },
  musicFetch: MusicFetchArtistResult,
  spotifyUrl: string,
  result: EnrichedProfileData
): Promise<void> {
  const socialLinks = extractMusicFetchLinks(
    musicFetch,
    spotifyUrl,
    'onboarding_enrichment'
  );
  if (socialLinks.length === 0) return;
  try {
    await withDbSessionTx(async tx => {
      await normalizeAndMergeExtraction(
        tx,
        {
          id: profile.id,
          usernameNormalized: profile.usernameNormalized,
          avatarUrl: result.imageUrl ?? profile.avatarUrl,
          displayName: result.name ?? profile.displayName,
          avatarLockedByUser: profile.avatarLockedByUser,
          displayNameLocked: profile.displayNameLocked,
        },
        {
          links: socialLinks,
          sourcePlatform: 'musicfetch',
          sourceUrl: spotifyUrl,
        }
      );
    });
  } catch (error) {
    await captureError(
      'Failed to merge social links during onboarding enrichment',
      error,
      { profileId: profile.id }
    );
  }
}

type ExternalArtistData = {
  musicFetch: Awaited<ReturnType<typeof fetchArtistBySpotifyUrl>>;
  artist: Awaited<ReturnType<typeof getSpotifyArtistProfile>>;
};

type EnrichProfile = {
  displayNameLocked: boolean | null;
  displayName: string | null;
  avatarLockedByUser: boolean | null;
  avatarUrl: string | null;
};

async function fetchExternalArtistData(
  profile: EnrichProfile,
  spotifyUrl: string,
  spotifyArtistId: string
): Promise<ExternalArtistData> {
  let musicFetch: Awaited<ReturnType<typeof fetchArtistBySpotifyUrl>> = null;
  if (isMusicFetchAvailable()) {
    const [musicFetchResult] = await Promise.allSettled([
      fetchArtistBySpotifyUrl(spotifyUrl),
    ]);
    musicFetch =
      musicFetchResult.status === 'fulfilled' ? musicFetchResult.value : null;
    if (musicFetchResult.status === 'rejected') {
      await captureError(
        'MusicFetch failed during onboarding enrichment',
        musicFetchResult.reason,
        { spotifyUrl }
      );
    }
  }

  const needsSpotifyArtistData =
    (!profile.displayNameLocked && !profile.displayName && !musicFetch?.name) ||
    (!profile.avatarLockedByUser &&
      !profile.avatarUrl &&
      !musicFetch?.image?.url);

  const spotifyArtist = needsSpotifyArtistData
    ? await Promise.allSettled([getSpotifyArtistProfile(spotifyArtistId)])
    : [];

  const [spotifyResult] = spotifyArtist;
  const artist =
    spotifyResult?.status === 'fulfilled' ? spotifyResult.value : null;

  if (spotifyResult?.status === 'rejected') {
    await captureError(
      'Spotify artist fetch failed during onboarding enrichment',
      spotifyResult.reason,
      { spotifyArtistId }
    );
  }

  return { musicFetch, artist };
}

type ApplyProfileFields = Parameters<typeof mapMusicFetchProfileFields>[1] & {
  displayNameLocked: boolean | null;
  displayName: string | null;
  bio: string | null;
};

function applyEnrichedProfileFields(
  musicFetch: Awaited<ReturnType<typeof fetchArtistBySpotifyUrl>>,
  artist: Awaited<ReturnType<typeof getSpotifyArtistProfile>>,
  profile: ApplyProfileFields,
  result: EnrichedProfileData,
  profileUpdates: Partial<typeof creatorProfiles.$inferInsert>,
  spotifyUrl: string,
  spotifyArtistId: string
): void {
  if (musicFetch) {
    Object.assign(
      profileUpdates,
      mapMusicFetchProfileFields(
        musicFetch,
        profile,
        spotifyUrl,
        spotifyArtistId
      )
    );
  }

  const enrichedName = musicFetch?.name ?? artist?.name;
  if (enrichedName && !profile.displayNameLocked && !profile.displayName) {
    profileUpdates.displayName = enrichedName;
    result.name = enrichedName;
  }

  if (musicFetch?.bio && !profile.bio) {
    profileUpdates.bio = musicFetch.bio;
    result.bio = musicFetch.bio;
  }

  if (artist?.genres && artist.genres.length > 0) {
    profileUpdates.genres = artist.genres;
    result.genres = artist.genres;
  }
  if (artist?.followers) {
    profileUpdates.spotifyFollowers = artist.followers.total;
    result.followers = artist.followers.total;
  }
  if (artist?.popularity != null) {
    profileUpdates.spotifyPopularity = artist.popularity;
  }

  if (spotifyUrl) profileUpdates.spotifyUrl = spotifyUrl;
  if (spotifyArtistId) profileUpdates.spotifyId = spotifyArtistId;
}

/**
 * Enrich a creator profile from Spotify API + MusicFetch API.
 *
 * Called synchronously during onboarding after a user connects their
 * Spotify artist profile. Fetches and saves:
 * - Display name (from Spotify)
 * - Profile photo (from Spotify, uploaded to blob storage)
 * - Bio (from MusicFetch)
 * - Genres, followers, popularity (from Spotify)
 * - Social links (from MusicFetch)
 *
 * Returns the enriched data for display in the profile review step.
 */
export async function enrichProfileFromDsp(
  spotifyArtistId: string,
  spotifyUrl: string
): Promise<EnrichedProfileData> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Fetch profile via Clerk ID → users → creator_profiles join
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      displayNameLocked: creatorProfiles.displayNameLocked,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      bio: creatorProfiles.bio,
      usernameNormalized: creatorProfiles.usernameNormalized,
      spotifyUrl: creatorProfiles.spotifyUrl,
      spotifyId: creatorProfiles.spotifyId,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      appleMusicId: creatorProfiles.appleMusicId,
      youtubeUrl: creatorProfiles.youtubeUrl,
      youtubeMusicId: creatorProfiles.youtubeMusicId,
      deezerId: creatorProfiles.deezerId,
      tidalId: creatorProfiles.tidalId,
      soundcloudId: creatorProfiles.soundcloudId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(users.clerkId, userId), eq(creatorProfiles.isClaimed, true)))
    .limit(1);

  if (!profile) {
    throw new Error('Profile not found');
  }

  const result: EnrichedProfileData = {
    name: profile.displayName,
    imageUrl: profile.avatarUrl,
    bio: profile.bio,
    genres: [],
    followers: null,
  };

  const { musicFetch, artist } = await fetchExternalArtistData(
    profile,
    spotifyUrl,
    spotifyArtistId
  );

  const profileUpdates: Partial<typeof creatorProfiles.$inferInsert> = {};
  applyEnrichedProfileFields(
    musicFetch,
    artist,
    profile,
    result,
    profileUpdates,
    spotifyUrl,
    spotifyArtistId
  );

  // Upload profile image from MusicFetch first, then Spotify fallback.
  if (!profile.avatarLockedByUser && !profile.avatarUrl) {
    const imageUrl =
      musicFetch?.image?.url ?? getBestSpotifyImageUrl(artist?.images ?? []);
    if (imageUrl) {
      const imageSource = musicFetch?.image?.url ? 'musicfetch' : 'spotify';
      await uploadProfileImage(
        profile.id,
        imageUrl,
        imageSource,
        spotifyArtistId,
        result,
        profileUpdates
      );
    }
  }

  // Apply profile updates
  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updatedAt = new Date();
    await db
      .update(creatorProfiles)
      .set(profileUpdates)
      .where(eq(creatorProfiles.id, profile.id));
  }

  // Process social links from MusicFetch
  if (musicFetch) {
    await processMusicFetchSocialLinks(profile, musicFetch, spotifyUrl, result);
  }

  return result;
}
