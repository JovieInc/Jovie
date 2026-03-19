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
import { setAllEnrichmentStatuses } from '@/lib/dsp-enrichment/enrichment-status';
import {
  extractMusicFetchLinks,
  type MusicFetchProfileFieldState,
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

async function loadMusicFetchData(
  spotifyUrl: string
): Promise<MusicFetchArtistResult | null> {
  if (!isMusicFetchAvailable()) return null;

  const [result] = await Promise.allSettled([
    fetchArtistBySpotifyUrl(spotifyUrl),
  ]);

  if (result.status === 'rejected') {
    await captureError(
      'MusicFetch failed during onboarding enrichment',
      result.reason,
      { spotifyUrl }
    );
    return null;
  }

  return result.value;
}

async function loadSpotifyArtistIfNeeded(
  spotifyArtistId: string,
  _profile: {
    displayNameLocked: boolean | null;
    displayName: string | null;
    avatarLockedByUser: boolean | null;
    avatarUrl: string | null;
    genres: string[] | null;
    spotifyFollowers: number | null;
    spotifyPopularity: number | null;
  },
  _musicFetch: MusicFetchArtistResult | null
): Promise<Awaited<ReturnType<typeof getSpotifyArtistProfile>> | null> {
  // Always fetch Spotify artist metadata during onboarding so we can persist
  // genres/followers/popularity even when MusicFetch already provided
  // display name or image fields.
  if (!spotifyArtistId) return null;

  const [result] = await Promise.allSettled([
    getSpotifyArtistProfile(spotifyArtistId),
  ]);

  if (result.status === 'rejected') {
    await captureError(
      'Spotify artist fetch failed during onboarding enrichment',
      result.reason,
      { spotifyArtistId }
    );
    return null;
  }

  return result.value;
}

function buildEnrichmentUpdates(
  profile: MusicFetchProfileFieldState & {
    displayNameLocked: boolean | null;
    displayName: string | null;
    usernameNormalized: string;
    username: string;
  },
  musicFetch: MusicFetchArtistResult | null,
  artist: Awaited<ReturnType<typeof getSpotifyArtistProfile>> | null,
  spotifyUrl: string,
  spotifyArtistId: string,
  result: EnrichedProfileData,
  profileUpdates: Partial<typeof creatorProfiles.$inferInsert>
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

  // Display name from MusicFetch first, then Spotify fallback.
  // During onboarding, always overwrite unless user explicitly locked it.
  // The displayName at this point is either the handle or a Clerk-derived
  // name — neither is the artist's real name.
  const enrichedName = musicFetch?.name ?? artist?.name;
  if (enrichedName && !profile.displayNameLocked) {
    profileUpdates.displayName = enrichedName;
    result.name = enrichedName;
  }

  // Bio from MusicFetch (if not already set)
  if (musicFetch?.bio && !profile.bio) {
    profileUpdates.bio = musicFetch.bio;
    result.bio = musicFetch.bio;
  }

  // Genres, followers, popularity from Spotify
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

  // Save Spotify URL and ID so DSP links render on the public profile
  if (spotifyUrl) profileUpdates.spotifyUrl = spotifyUrl;
  if (spotifyArtistId) profileUpdates.spotifyId = spotifyArtistId;
}

async function applyImageEnrichmentIfNeeded(
  profile: {
    id: string;
    avatarLockedByUser: boolean | null;
    avatarUrl: string | null;
  },
  musicFetch: MusicFetchArtistResult | null,
  artist: Awaited<ReturnType<typeof getSpotifyArtistProfile>> | null,
  spotifyArtistId: string,
  result: EnrichedProfileData,
  profileUpdates: Partial<typeof creatorProfiles.$inferInsert>
): Promise<void> {
  if (profile.avatarLockedByUser || profile.avatarUrl) return;
  const imageUrl =
    musicFetch?.image?.url ?? getBestSpotifyImageUrl(artist?.images ?? []);
  if (!imageUrl) return;
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
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      usernameNormalized: creatorProfiles.usernameNormalized,
      username: creatorProfiles.username,
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

  // Set all enrichment sub-statuses to 'enriching' at the start
  await setAllEnrichmentStatuses(db, profile.id, 'enriching');

  const result: EnrichedProfileData = {
    name: profile.displayName,
    imageUrl: profile.avatarUrl,
    bio: profile.bio,
    genres: [],
    followers: null,
  };

  // Fetch MusicFetch and Spotify data in parallel for speed
  const [musicFetch, artist] = await Promise.all([
    loadMusicFetchData(spotifyUrl),
    loadSpotifyArtistIfNeeded(spotifyArtistId, profile, null),
  ]);

  // Build profile updates
  const profileUpdates: Partial<typeof creatorProfiles.$inferInsert> = {};
  buildEnrichmentUpdates(
    profile,
    musicFetch,
    artist,
    spotifyUrl,
    spotifyArtistId,
    result,
    profileUpdates
  );

  // Remove raw avatarUrl from mapping — onboarding handles avatar
  // separately via applyImageEnrichmentIfNeeded (upload to blob storage).
  delete profileUpdates.avatarUrl;

  // Upload profile image from MusicFetch first, then Spotify fallback.
  await applyImageEnrichmentIfNeeded(
    profile,
    musicFetch,
    artist,
    spotifyArtistId,
    result,
    profileUpdates
  );

  // Apply profile updates — wrapped in try/catch so we still return
  // enriched data to the client even if the DB write fails.
  try {
    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updatedAt = new Date();
      await db
        .update(creatorProfiles)
        .set(profileUpdates)
        .where(eq(creatorProfiles.id, profile.id));
    }

    // Process social links from MusicFetch
    if (musicFetch) {
      await processMusicFetchSocialLinks(
        profile,
        musicFetch,
        spotifyUrl,
        result
      );
    }
  } catch (error) {
    await captureError(
      'Failed to persist enrichment updates during onboarding',
      error,
      { profileId: profile.id, spotifyArtistId }
    );
  }

  return result;
}
