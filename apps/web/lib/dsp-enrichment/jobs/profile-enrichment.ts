/**
 * Profile Enrichment Job Processor
 *
 * Enriches creator profiles with data from connected DSPs:
 * - Profile photos (stored as avatar candidates)
 * - Display names
 * - Follower counts
 * - Genre data
 *
 * Respects user locks on avatar and display name.
 * Uses confidence scoring to prioritize DSP sources.
 */

import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db } from '@/lib/db';
import {
  creatorAvatarCandidates,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

import {
  extractAppleMusicImageUrls,
  extractDeezerImageUrls,
  extractSpotifyImageUrls,
  getAppleMusicArtist,
  getDeezerArtist,
  getSpotifyArtistProfile,
  isAppleMusicAvailable,
  isDeezerAvailable,
  isSpotifyAvailable,
} from '../providers';
import type { DspImageUrls, DspProviderId } from '../types';

// ============================================================================
// Payload Schema
// ============================================================================

export const profileEnrichmentPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  /** Which DSPs to fetch data from. Defaults to all available. */
  targetProviders: z
    .array(z.enum(['spotify', 'apple_music', 'deezer']))
    .optional(),
  /** Force refresh even if data exists. Defaults to false. */
  forceRefresh: z.boolean().optional().default(false),
});

export type ProfileEnrichmentPayload = z.infer<
  typeof profileEnrichmentPayloadSchema
>;

// ============================================================================
// Types
// ============================================================================

export interface ProfileEnrichmentResult {
  creatorProfileId: string;
  enrichedFrom: DspProviderId[];
  avatarCandidatesAdded: number;
  profileUpdated: boolean;
  errors: string[];
}

interface DspArtistData {
  providerId: DspProviderId;
  name: string;
  imageUrls: DspImageUrls | null;
  followers: number | null;
  genres: string[] | null;
  externalUrl: string | null;
}

// ============================================================================
// DSP Confidence Scores for Avatar Selection
// ============================================================================

/**
 * Priority scores for avatar source platforms.
 * Higher scores indicate more authoritative sources.
 */
const DSP_AVATAR_CONFIDENCE: Record<DspProviderId, number> = {
  spotify: 0.95, // Primary DSP, high-quality images
  apple_music: 0.9, // High-quality, professional images
  deezer: 0.85, // Good quality, wide coverage
  youtube_music: 0.8, // YouTube artist images
  tidal: 0.75, // High-fidelity focused
  soundcloud: 0.7, // More indie/DIY
  amazon_music: 0.7, // Less artist-focused
  musicbrainz: 0.6, // Community-sourced, variable quality
};

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch artist data from Spotify.
 */
async function fetchSpotifyData(
  spotifyId: string
): Promise<DspArtistData | null> {
  if (!isSpotifyAvailable()) {
    return null;
  }

  try {
    const artist = await getSpotifyArtistProfile(spotifyId);
    if (!artist) return null;

    return {
      providerId: 'spotify',
      name: artist.name,
      imageUrls: extractSpotifyImageUrls(artist.images),
      followers: artist.followers.total,
      genres: artist.genres,
      externalUrl: artist.external_urls.spotify,
    };
  } catch (error) {
    logger.warn('Failed to fetch Spotify data', { spotifyId, error });
    return null;
  }
}

/**
 * Fetch artist data from Apple Music.
 */
async function fetchAppleMusicData(
  appleMusicId: string
): Promise<DspArtistData | null> {
  if (!isAppleMusicAvailable()) {
    return null;
  }

  try {
    const artist = await getAppleMusicArtist(appleMusicId);
    if (!artist) return null;

    return {
      providerId: 'apple_music',
      name: artist.attributes.name,
      imageUrls: extractAppleMusicImageUrls(artist.attributes.artwork),
      followers: null, // Apple Music doesn't expose follower counts
      genres: artist.attributes.genreNames ?? null,
      externalUrl: artist.attributes.url,
    };
  } catch (error) {
    logger.warn('Failed to fetch Apple Music data', { appleMusicId, error });
    return null;
  }
}

/**
 * Fetch artist data from Deezer.
 */
async function fetchDeezerData(
  deezerId: string
): Promise<DspArtistData | null> {
  if (!isDeezerAvailable()) {
    return null;
  }

  try {
    const artist = await getDeezerArtist(deezerId);
    if (!artist) return null;

    return {
      providerId: 'deezer',
      name: artist.name,
      imageUrls: extractDeezerImageUrls(artist),
      followers: artist.nb_fan ?? null,
      genres: null, // Deezer doesn't return genres on artist endpoint
      externalUrl: artist.link,
    };
  } catch (error) {
    logger.warn('Failed to fetch Deezer data', { deezerId, error });
    return null;
  }
}

// ============================================================================
// Avatar Candidate Management
// ============================================================================

/**
 * Store an avatar candidate from a DSP.
 */
async function storeAvatarCandidate(
  tx: DbOrTransaction,
  creatorProfileId: string,
  providerId: DspProviderId,
  imageUrls: DspImageUrls,
  sourceUrl: string | null
): Promise<boolean> {
  const confidence = DSP_AVATAR_CONFIDENCE[providerId] ?? 0.5;
  const avatarUrl = imageUrls.large || imageUrls.original || imageUrls.medium;

  if (!avatarUrl) {
    return false;
  }

  try {
    await tx
      .insert(creatorAvatarCandidates)
      .values({
        creatorProfileId,
        sourcePlatform: providerId,
        sourceUrl,
        avatarUrl,
        confidenceScore: String(confidence),
      })
      .onConflictDoUpdate({
        target: [
          creatorAvatarCandidates.creatorProfileId,
          creatorAvatarCandidates.avatarUrl,
        ],
        set: {
          confidenceScore: String(confidence),
          sourceUrl,
          updatedAt: new Date(),
        },
      });

    return true;
  } catch (error) {
    logger.warn('Failed to store avatar candidate', {
      creatorProfileId,
      providerId,
      error,
    });
    return false;
  }
}

/**
 * Get the best avatar candidate for a profile.
 */
async function getBestAvatarCandidate(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<{ avatarUrl: string; sourcePlatform: string } | null> {
  const [candidate] = await tx
    .select({
      avatarUrl: creatorAvatarCandidates.avatarUrl,
      sourcePlatform: creatorAvatarCandidates.sourcePlatform,
    })
    .from(creatorAvatarCandidates)
    .where(eq(creatorAvatarCandidates.creatorProfileId, creatorProfileId))
    .orderBy(drizzleSql`${creatorAvatarCandidates.confidenceScore} DESC`)
    .limit(1);

  return candidate ?? null;
}

// ============================================================================
// Profile Update Logic
// ============================================================================

async function updateAvatarIfNeeded(
  tx: DbOrTransaction,
  creatorProfileId: string,
  existingProfile: { avatarUrl: string | null; avatarLockedByUser: boolean },
  updates: Record<string, unknown>
): Promise<boolean> {
  if (existingProfile.avatarLockedByUser || existingProfile.avatarUrl) {
    return false;
  }

  const bestAvatar = await getBestAvatarCandidate(tx, creatorProfileId);
  if (!bestAvatar) {
    return false;
  }

  updates.avatarUrl = bestAvatar.avatarUrl;
  return true;
}

function updateDisplayNameIfNeeded(
  dspData: DspArtistData[],
  existingProfile: { displayName: string | null; displayNameLocked: boolean },
  updates: Record<string, unknown>
): boolean {
  if (existingProfile.displayNameLocked || existingProfile.displayName) {
    return false;
  }

  const spotifyData = dspData.find(d => d.providerId === 'spotify');
  const appleMusicData = dspData.find(d => d.providerId === 'apple_music');
  const deezerData = dspData.find(d => d.providerId === 'deezer');

  const bestName =
    spotifyData?.name || appleMusicData?.name || deezerData?.name;
  if (!bestName) {
    return false;
  }

  updates.displayName = bestName;
  return true;
}

function updateFollowerCountIfNeeded(
  dspData: DspArtistData[],
  updates: Record<string, unknown>
): boolean {
  const spotifyData = dspData.find(d => d.providerId === 'spotify');
  if (!spotifyData?.followers || spotifyData.followers <= 0) {
    return false;
  }

  updates.spotifyFollowers = spotifyData.followers;
  return true;
}

function updateGenresIfNeeded(
  dspData: DspArtistData[],
  existingProfile: { genres: string[] | null },
  updates: Record<string, unknown>
): boolean {
  if (existingProfile.genres && existingProfile.genres.length > 0) {
    return false;
  }

  const allGenres = new Set<string>();
  for (const data of dspData) {
    if (data.genres) {
      for (const genre of data.genres) {
        allGenres.add(genre.toLowerCase());
      }
    }
  }

  if (allGenres.size === 0) {
    return false;
  }

  updates.genres = Array.from(allGenres).slice(0, 10);
  return true;
}

/**
 * Update profile with enriched data, respecting user locks.
 */
async function updateProfileFromDspData(
  tx: DbOrTransaction,
  creatorProfileId: string,
  dspData: DspArtistData[],
  existingProfile: {
    avatarUrl: string | null;
    avatarLockedByUser: boolean;
    displayName: string | null;
    displayNameLocked: boolean;
    spotifyFollowers: number | null;
    genres: string[] | null;
  }
): Promise<boolean> {
  const updates: Record<string, unknown> = {};

  const avatarUpdated = await updateAvatarIfNeeded(
    tx,
    creatorProfileId,
    existingProfile,
    updates
  );
  const displayNameUpdated = updateDisplayNameIfNeeded(
    dspData,
    existingProfile,
    updates
  );
  const followersUpdated = updateFollowerCountIfNeeded(dspData, updates);
  const genresUpdated = updateGenresIfNeeded(dspData, existingProfile, updates);

  const hasUpdates =
    avatarUpdated || displayNameUpdated || followersUpdated || genresUpdated;

  if (hasUpdates) {
    updates.updatedAt = new Date();
    await tx
      .update(creatorProfiles)
      .set(updates)
      .where(eq(creatorProfiles.id, creatorProfileId));
  }

  return hasUpdates;
}

// ============================================================================
// Job Processor
// ============================================================================

async function fetchDspDataInParallel(
  profile: {
    spotifyId: string | null;
    appleMusicId: string | null;
    deezerId: string | null;
  },
  providers: string[]
): Promise<DspArtistData[]> {
  const dspData: DspArtistData[] = [];
  const fetchPromises: Promise<void>[] = [];

  if (providers.includes('spotify') && profile.spotifyId) {
    fetchPromises.push(
      fetchSpotifyData(profile.spotifyId).then(data => {
        if (data) dspData.push(data);
      })
    );
  }

  if (providers.includes('apple_music') && profile.appleMusicId) {
    fetchPromises.push(
      fetchAppleMusicData(profile.appleMusicId).then(data => {
        if (data) dspData.push(data);
      })
    );
  }

  if (providers.includes('deezer') && profile.deezerId) {
    fetchPromises.push(
      fetchDeezerData(profile.deezerId).then(data => {
        if (data) dspData.push(data);
      })
    );
  }

  await Promise.allSettled(fetchPromises);
  return dspData;
}

async function storeAvatarCandidatesFromDsp(
  tx: DbOrTransaction,
  creatorProfileId: string,
  dspData: DspArtistData[]
): Promise<{ candidatesAdded: number; enrichedFrom: DspProviderId[] }> {
  let candidatesAdded = 0;
  const enrichedFrom: DspProviderId[] = [];

  for (const data of dspData) {
    if (data.imageUrls) {
      const stored = await storeAvatarCandidate(
        tx,
        creatorProfileId,
        data.providerId,
        data.imageUrls,
        data.externalUrl
      );
      if (stored) {
        candidatesAdded++;
        enrichedFrom.push(data.providerId);
      }
    }
  }

  return { candidatesAdded, enrichedFrom };
}

function shouldSkipEnrichment(
  profile: {
    avatarUrl: string | null;
    displayName: string | null;
    spotifyFollowers: number | null;
  },
  forceRefresh: boolean
): boolean {
  if (forceRefresh) return false;
  return Boolean(
    profile.avatarUrl && profile.displayName && profile.spotifyFollowers
  );
}

/**
 * Process a profile enrichment job.
 *
 * Fetches artist data from connected DSPs and updates the profile
 * with photos, names, and metadata.
 *
 * @param tx - Database transaction
 * @param jobPayload - Job payload
 * @returns Enrichment result
 */
export async function processProfileEnrichmentJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<ProfileEnrichmentResult> {
  const payload = profileEnrichmentPayloadSchema.parse(jobPayload);
  const { creatorProfileId, targetProviders, forceRefresh } = payload;

  const result: ProfileEnrichmentResult = {
    creatorProfileId,
    enrichedFrom: [],
    avatarCandidatesAdded: 0,
    profileUpdated: false,
    errors: [],
  };

  // Fetch existing profile
  const [profile] = await tx
    .select({
      spotifyId: creatorProfiles.spotifyId,
      appleMusicId: creatorProfiles.appleMusicId,
      deezerId: creatorProfiles.deezerId,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      displayName: creatorProfiles.displayName,
      displayNameLocked: creatorProfiles.displayNameLocked,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      genres: creatorProfiles.genres,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    result.errors.push('Creator profile not found');
    return result;
  }

  if (shouldSkipEnrichment(profile, forceRefresh)) {
    result.errors.push(
      'Profile already enriched (use forceRefresh to override)'
    );
    return result;
  }

  const providers = targetProviders ?? ['spotify', 'apple_music', 'deezer'];
  const dspData = await fetchDspDataInParallel(profile, providers);

  if (dspData.length === 0) {
    result.errors.push('No DSP data could be fetched');
    return result;
  }

  const { candidatesAdded, enrichedFrom } = await storeAvatarCandidatesFromDsp(
    tx,
    creatorProfileId,
    dspData
  );
  result.avatarCandidatesAdded = candidatesAdded;
  result.enrichedFrom = enrichedFrom;

  const profileUpdated = await updateProfileFromDspData(
    tx,
    creatorProfileId,
    dspData,
    profile
  );
  result.profileUpdated = profileUpdated;

  return result;
}

/**
 * Process enrichment job with standalone database operations.
 * Used when called from API routes.
 * The neon-http driver does not support transactions.
 */
export async function processProfileEnrichmentJobStandalone(
  jobPayload: unknown
): Promise<ProfileEnrichmentResult> {
  return processProfileEnrichmentJob(db, jobPayload);
}

/**
 * Enrich profile from a single DSP.
 * Convenience function for targeted enrichment.
 */
export async function enrichProfileFromDsp(
  creatorProfileId: string,
  providerId: 'spotify' | 'apple_music' | 'deezer'
): Promise<ProfileEnrichmentResult> {
  return processProfileEnrichmentJobStandalone({
    creatorProfileId,
    targetProviders: [providerId],
  });
}
