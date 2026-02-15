/**
 * MusicFetch Enrichment Job Processor
 *
 * Enriches creator profiles with cross-platform DSP links and social profiles
 * using MusicFetch.io. Given a Spotify artist URL, discovers the artist's
 * profiles across 30+ platforms and saves DSP IDs, social links, and bio.
 *
 * Triggered after a user connects their Spotify profile during onboarding.
 */

import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import type { ExtractedLink } from '@/lib/ingestion/types';
import { logger } from '@/lib/utils/logger';

import {
  extractAppleMusicId,
  extractDeezerId,
  extractSoundcloudId,
  extractTidalId,
  extractYoutubeMusicId,
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
  type MusicFetchArtistResult,
} from '../providers/musicfetch';

// ============================================================================
// Payload Schema
// ============================================================================

export const musicFetchEnrichmentPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  spotifyUrl: z.string().url(),
  dedupKey: z.string(),
});

export type MusicFetchEnrichmentPayload = z.infer<
  typeof musicFetchEnrichmentPayloadSchema
>;

// ============================================================================
// Result Type
// ============================================================================

export interface MusicFetchEnrichmentResult {
  creatorProfileId: string;
  dspFieldsUpdated: string[];
  socialLinksInserted: number;
  socialLinksUpdated: number;
  errors: string[];
}

// ============================================================================
// DSP Mapping
// ============================================================================

/**
 * Map MusicFetch services to creator profile DSP fields.
 * Only sets fields that are currently null — never overwrites existing values.
 */
function mapDspFields(
  result: MusicFetchArtistResult,
  existingProfile: {
    appleMusicUrl: string | null;
    appleMusicId: string | null;
    youtubeUrl: string | null;
    youtubeMusicId: string | null;
    deezerId: string | null;
    tidalId: string | null;
    soundcloudId: string | null;
  }
): Record<string, string> {
  const updates: Record<string, string> = {};
  const services = result.services;

  // Apple Music
  if (!existingProfile.appleMusicId && services.appleMusic?.url) {
    const id = extractAppleMusicId(services.appleMusic.url);
    if (id) {
      updates.appleMusicId = id;
    }
    if (!existingProfile.appleMusicUrl) {
      updates.appleMusicUrl = services.appleMusic.url;
    }
  }

  // Deezer
  if (!existingProfile.deezerId && services.deezer?.url) {
    const id = extractDeezerId(services.deezer.url);
    if (id) {
      updates.deezerId = id;
    }
  }

  // Tidal
  if (!existingProfile.tidalId && services.tidal?.url) {
    const id = extractTidalId(services.tidal.url);
    if (id) {
      updates.tidalId = id;
    }
  }

  // SoundCloud
  if (!existingProfile.soundcloudId && services.soundcloud?.url) {
    const id = extractSoundcloudId(services.soundcloud.url);
    if (id) {
      updates.soundcloudId = id;
    }
  }

  // YouTube / YouTube Music
  if (!existingProfile.youtubeUrl) {
    const ytUrl = services.youtube?.url || services.youtubeMusic?.url;
    if (ytUrl) {
      updates.youtubeUrl = ytUrl;
    }
  }
  if (!existingProfile.youtubeMusicId && services.youtubeMusic?.url) {
    const id = extractYoutubeMusicId(services.youtubeMusic.url);
    if (id) {
      updates.youtubeMusicId = id;
    }
  }

  return updates;
}

/**
 * Extract social links from MusicFetch services.
 * Returns links for platforms that map to social_links (not DSP profile fields).
 */
function extractSocialLinks(result: MusicFetchArtistResult): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const services = result.services;

  // Instagram
  if (services.instagram?.url) {
    links.push({
      url: services.instagram.url,
      platformId: 'instagram',
      sourcePlatform: 'musicfetch',
      evidence: {
        sources: ['musicfetch'],
        signals: ['musicfetch_artist_lookup'],
      },
    });
  }

  // TikTok
  if (services.tiktok?.url) {
    links.push({
      url: services.tiktok.url,
      platformId: 'tiktok',
      sourcePlatform: 'musicfetch',
      evidence: {
        sources: ['musicfetch'],
        signals: ['musicfetch_artist_lookup'],
      },
    });
  }

  // Bandcamp (stored as social link, not a DSP profile field)
  if (services.bandcamp?.url) {
    links.push({
      url: services.bandcamp.url,
      platformId: 'bandcamp',
      sourcePlatform: 'musicfetch',
      evidence: {
        sources: ['musicfetch'],
        signals: ['musicfetch_artist_lookup'],
      },
    });
  }

  return links;
}

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a MusicFetch enrichment job.
 *
 * 1. Calls MusicFetch.io with the Spotify artist URL
 * 2. Maps DSP services to profile fields (only sets null fields)
 * 3. Creates social_links entries for Instagram, TikTok, etc.
 * 4. Updates bio if the profile has none
 */
export async function processMusicFetchEnrichmentJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<MusicFetchEnrichmentResult> {
  const payload = musicFetchEnrichmentPayloadSchema.parse(jobPayload);
  const { creatorProfileId, spotifyUrl } = payload;

  const result: MusicFetchEnrichmentResult = {
    creatorProfileId,
    dspFieldsUpdated: [],
    socialLinksInserted: 0,
    socialLinksUpdated: 0,
    errors: [],
  };

  // Check availability
  if (!isMusicFetchAvailable()) {
    result.errors.push('MusicFetch API token not configured');
    return result;
  }

  // Fetch existing profile
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      displayNameLocked: creatorProfiles.displayNameLocked,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      bio: creatorProfiles.bio,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      appleMusicId: creatorProfiles.appleMusicId,
      youtubeUrl: creatorProfiles.youtubeUrl,
      youtubeMusicId: creatorProfiles.youtubeMusicId,
      deezerId: creatorProfiles.deezerId,
      tidalId: creatorProfiles.tidalId,
      soundcloudId: creatorProfiles.soundcloudId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    result.errors.push('Creator profile not found');
    return result;
  }

  // Call MusicFetch API
  const artistData = await fetchArtistBySpotifyUrl(spotifyUrl);
  if (!artistData) {
    result.errors.push('MusicFetch API returned no data');
    return result;
  }

  // Map DSP services to profile fields
  const dspUpdates = mapDspFields(artistData, profile);
  const dspFieldNames = Object.keys(dspUpdates);

  // Update bio if profile has none
  if (!profile.bio && artistData.bio) {
    dspUpdates.bio = artistData.bio;
    dspFieldNames.push('bio');
  }

  // Apply profile DSP updates
  if (dspFieldNames.length > 0) {
    await tx
      .update(creatorProfiles)
      .set({
        ...dspUpdates,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));

    result.dspFieldsUpdated = dspFieldNames;

    logger.info('MusicFetch enrichment: updated profile DSP fields', {
      creatorProfileId,
      fields: dspFieldNames,
    });
  }

  // Extract and merge social links
  const socialLinks = extractSocialLinks(artistData);
  if (socialLinks.length > 0) {
    const mergeResult = await normalizeAndMergeExtraction(
      tx,
      {
        id: profile.id,
        usernameNormalized: profile.usernameNormalized,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        avatarLockedByUser: profile.avatarLockedByUser,
        displayNameLocked: profile.displayNameLocked,
      },
      {
        links: socialLinks,
        sourcePlatform: 'musicfetch',
        sourceUrl: spotifyUrl,
      }
    );

    result.socialLinksInserted = mergeResult.inserted;
    result.socialLinksUpdated = mergeResult.updated;

    logger.info('MusicFetch enrichment: merged social links', {
      creatorProfileId,
      inserted: mergeResult.inserted,
      updated: mergeResult.updated,
    });
  }

  return result;
}
