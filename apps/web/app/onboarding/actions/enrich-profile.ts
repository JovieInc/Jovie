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
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import {
  getBestSpotifyImageUrl,
  getSpotifyArtistProfile,
} from '@/lib/dsp-enrichment/providers/spotify';
import { captureError } from '@/lib/error-tracking';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import type { ExtractedLink } from '@/lib/ingestion/types';
import { logger } from '@/lib/utils/logger';
import { uploadRemoteAvatar } from './avatar';

export interface EnrichedProfileData {
  name: string | null;
  imageUrl: string | null;
  bio: string | null;
  genres: string[];
  followers: number | null;
}

/** Social platforms to extract from MusicFetch */
const SOCIAL_PLATFORM_MAPPINGS = [
  { serviceKey: 'instagram', platformId: 'instagram' },
  { serviceKey: 'tiktok', platformId: 'tiktok' },
  { serviceKey: 'bandcamp', platformId: 'bandcamp' },
] as const;

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

  // Fetch Spotify artist data and MusicFetch data in parallel
  const [spotifyArtist, musicFetchData] = await Promise.allSettled([
    getSpotifyArtistProfile(spotifyArtistId),
    isMusicFetchAvailable()
      ? fetchArtistBySpotifyUrl(spotifyUrl)
      : Promise.resolve(null),
  ]);

  const artist =
    spotifyArtist.status === 'fulfilled' ? spotifyArtist.value : null;
  const musicFetch =
    musicFetchData.status === 'fulfilled' ? musicFetchData.value : null;

  if (spotifyArtist.status === 'rejected') {
    await captureError(
      'Spotify artist fetch failed during onboarding enrichment',
      spotifyArtist.reason,
      { spotifyArtistId }
    );
  }

  if (musicFetchData.status === 'rejected') {
    await captureError(
      'MusicFetch failed during onboarding enrichment',
      musicFetchData.reason,
      { spotifyUrl }
    );
  }

  // Build profile updates
  const profileUpdates: Partial<typeof creatorProfiles.$inferInsert> = {};

  // Display name from Spotify (if not locked and not already set)
  if (artist?.name && !profile.displayNameLocked && !profile.displayName) {
    profileUpdates.displayName = artist.name;
    result.name = artist.name;
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

  // Upload Spotify artist image as profile photo
  if (artist?.images && !profile.avatarLockedByUser && !profile.avatarUrl) {
    const bestImageUrl = getBestSpotifyImageUrl(artist.images);
    if (bestImageUrl) {
      try {
        const cookieStore = await cookies();
        const cookieHeader = cookieStore.toString();
        const uploaded = await uploadRemoteAvatar({
          imageUrl: bestImageUrl,
          cookieHeader,
          maxRetries: 2,
        });

        if (uploaded) {
          profileUpdates.avatarUrl = uploaded.blobUrl;
          result.imageUrl = uploaded.blobUrl;

          logger.info('Spotify artist image uploaded during onboarding', {
            profileId: profile.id,
            spotifyArtistId,
          });
        }
      } catch (error) {
        await captureError(
          'Failed to upload Spotify artist image during onboarding',
          error,
          { profileId: profile.id, spotifyArtistId }
        );
      }
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
    const socialLinks: ExtractedLink[] = SOCIAL_PLATFORM_MAPPINGS.flatMap(
      ({ serviceKey, platformId }) => {
        const url = musicFetch.services[serviceKey]?.url;
        if (!url) return [];
        return [
          {
            url,
            platformId,
            sourcePlatform: 'musicfetch' as const,
            evidence: {
              sources: ['musicfetch'],
              signals: ['onboarding_enrichment'],
            },
          },
        ];
      }
    );

    if (socialLinks.length > 0) {
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
  }

  return result;
}
