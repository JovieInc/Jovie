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
import {
  extractMusicFetchLinks,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { logger } from '@/lib/utils/logger';
import {
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
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
// Field + Link Mapping
// ============================================================================

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

  // Check availability — throw so the job fails and retries
  if (!isMusicFetchAvailable()) {
    throw new Error('MusicFetch API token not configured');
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
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    result.errors.push('Creator profile not found');
    return result;
  }

  // Call MusicFetch API — throw so the job fails and retries
  const artistData = await fetchArtistBySpotifyUrl(spotifyUrl);
  if (!artistData) {
    throw new Error('MusicFetch API returned no data');
  }

  // Map DSP services to profile fields
  const dspUpdates = mapMusicFetchProfileFields(
    artistData,
    profile,
    spotifyUrl
  );

  // Respect user's explicit avatar lock — don't overwrite a manually set photo
  if (profile.avatarLockedByUser) {
    delete dspUpdates.avatarUrl;
  }

  const dspFieldNames = Object.keys(dspUpdates);

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
  const socialLinks = extractMusicFetchLinks(
    artistData,
    spotifyUrl,
    'musicfetch_artist_lookup'
  );
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
