/**
 * DSP Artist Matching Orchestrator
 *
 * Coordinates the artist matching process across DSPs.
 * Takes local artist data and finds matching profiles on
 * external platforms using ISRC-based matching and confidence scoring.
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import type {
  AppleMusicTrack,
  DeezerTrack,
  DspProviderId,
  IsrcMatchResult,
  MusicBrainzRecording,
  ScoredArtistMatch,
} from '../types';
import { scoreAndRankCandidates } from './confidence';
import {
  aggregateIsrcMatches,
  enrichCandidatesWithProfiles,
  filterByMinMatches,
} from './isrc-aggregator';

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  calculateConfidenceScore,
  calculateFollowerRatioScore,
  calculateGenreOverlapScore,
  calculateIsrcMatchScore,
  calculateNameSimilarityScore,
  calculateUpcMatchScore,
  refineConfidenceScore,
  scoreAndRankCandidates,
} from './confidence';
export {
  aggregateIsrcMatches,
  enrichCandidatesWithProfiles,
  filterByMinMatches,
  getBestCandidate,
  mergeUpcMatches,
} from './isrc-aggregator';
export {
  areArtistNamesSimilar,
  artistNameSimilarity,
  jaroWinklerSimilarity,
  normalizeArtistName,
} from './name-similarity';

// ============================================================================
// Constants
// ============================================================================

/** Minimum confidence score for a valid match */
const MIN_VALID_CONFIDENCE = 0.3;

/** Minimum name similarity for validation without strong ISRC evidence */
const MIN_NAME_SIMILARITY_FOR_VALIDATION = 0.5;

/** Minimum ISRC matches to override low name similarity */
const MIN_ISRC_MATCHES_FOR_NAME_OVERRIDE = 3;

/** Default maximum tracks to select for ISRC matching */
const DEFAULT_MAX_TRACKS_FOR_MATCHING = 20;

// ============================================================================
// Types
// ============================================================================

/**
 * Local track data needed for matching
 */
export interface LocalTrackData {
  id: string;
  title: string;
  isrc: string | null;
  upc?: string | null;
  /** Release date for prioritization (ISO string or Date) */
  releaseDate?: string | Date | null;
}

/**
 * Local artist data needed for matching
 */
export interface LocalArtistData {
  id: string;
  name: string;
  spotifyId?: string | null;
  followers?: number | null;
  genres?: string[] | null;
}

/**
 * Result of the matching process
 */
export interface MatchingResult {
  providerId: DspProviderId;
  bestMatch: ScoredArtistMatch | null;
  allCandidates: ScoredArtistMatch[];
  tracksChecked: number;
  matchesFound: number;
  errors: string[];
}

// ============================================================================
// ISRC Match Conversion
// ============================================================================

/**
 * Convert Apple Music track results to ISRC match results.
 */
export function convertAppleMusicToIsrcMatches(
  trackMap: Map<string, AppleMusicTrack>,
  localTracks: LocalTrackData[]
): IsrcMatchResult[] {
  const matches: IsrcMatchResult[] = [];

  for (const localTrack of localTracks) {
    if (!localTrack.isrc) continue;

    const normalizedIsrc = localTrack.isrc.toUpperCase();
    const appleMusicTrack = trackMap.get(normalizedIsrc);

    if (appleMusicTrack) {
      // Extract artist from relationships or attributes
      const artistData = appleMusicTrack.relationships?.artists?.data?.[0];
      const artistId = artistData?.id;

      // Skip tracks without a valid artist ID - we can't aggregate without it
      if (!artistId) {
        Sentry.addBreadcrumb({
          category: 'dsp-matching',
          message: `Skipping ISRC: missing artist ID`,
          level: 'warning',
          data: { isrc: normalizedIsrc },
        });
        continue;
      }

      const artistName =
        appleMusicTrack.attributes?.artistName ?? 'Unknown Artist';

      matches.push({
        isrc: normalizedIsrc,
        localTrackId: localTrack.id,
        localTrackTitle: localTrack.title,
        matchedTrack: {
          id: appleMusicTrack.id,
          title: appleMusicTrack.attributes?.name ?? 'Unknown',
          artistId,
          artistName,
        },
      });
    }
  }

  return matches;
}

/**
 * Convert Deezer track results to ISRC match results.
 */
export function convertDeezerToIsrcMatches(
  trackMap: Map<string, DeezerTrack>,
  localTracks: LocalTrackData[]
): IsrcMatchResult[] {
  const matches: IsrcMatchResult[] = [];
  for (const localTrack of localTracks) {
    if (!localTrack.isrc) continue;
    const normalizedIsrc = localTrack.isrc.toUpperCase();
    const deezerTrack = trackMap.get(normalizedIsrc);
    if (deezerTrack?.artist) {
      matches.push({
        isrc: normalizedIsrc,
        localTrackId: localTrack.id,
        localTrackTitle: localTrack.title,
        matchedTrack: {
          id: String(deezerTrack.id),
          title: deezerTrack.title,
          artistId: String(deezerTrack.artist.id),
          artistName: deezerTrack.artist.name,
        },
      });
    }
  }
  return matches;
}

/**
 * Convert MusicBrainz recording results to ISRC match results.
 */
export function convertMusicBrainzToIsrcMatches(
  recordingMap: Map<string, MusicBrainzRecording>,
  localTracks: LocalTrackData[]
): IsrcMatchResult[] {
  const matches: IsrcMatchResult[] = [];
  for (const localTrack of localTracks) {
    if (!localTrack.isrc) continue;
    const normalizedIsrc = localTrack.isrc.toUpperCase();
    const recording = recordingMap.get(normalizedIsrc);
    if (recording) {
      const artistCredit = recording['artist-credit']?.[0];
      if (!artistCredit?.artist) continue;
      matches.push({
        isrc: normalizedIsrc,
        localTrackId: localTrack.id,
        localTrackTitle: localTrack.title,
        matchedTrack: {
          id: recording.id,
          title: recording.title,
          artistId: artistCredit.artist.id,
          artistName: artistCredit.artist.name,
        },
      });
    }
  }
  return matches;
}

// ============================================================================
// Matching Orchestration
// ============================================================================

/**
 * Orchestrate the full matching process for a provider.
 *
 * Steps:
 * 1. Aggregate ISRC matches to artist level
 * 2. Filter by minimum match count
 * 3. Calculate confidence scores
 * 4. Determine best match and auto-confirm eligibility
 *
 * @param providerId - The DSP provider
 * @param isrcMatches - ISRC-level matches from the provider
 * @param localArtist - Local artist data
 * @param options - Additional options
 * @returns Matching result with best match and all candidates
 */
export function orchestrateMatching(
  providerId: DspProviderId,
  isrcMatches: IsrcMatchResult[],
  localArtist: LocalArtistData,
  options: {
    minIsrcMatches?: number;
    artistProfiles?: Map<
      string,
      { url?: string; imageUrl?: string; name?: string }
    >;
  } = {}
): MatchingResult {
  const { minIsrcMatches = 1, artistProfiles } = options;
  const errors: string[] = [];

  try {
    // Step 1: Aggregate ISRC matches to artist level
    let candidates = aggregateIsrcMatches(providerId, isrcMatches);

    // Step 2: Enrich with artist profile data if available
    if (artistProfiles) {
      candidates = enrichCandidatesWithProfiles(candidates, artistProfiles);
    }

    // Step 3: Filter by minimum matches
    candidates = filterByMinMatches(candidates, minIsrcMatches);

    // Step 4: Score and rank candidates
    const scoredCandidates = scoreAndRankCandidates(candidates, {
      name: localArtist.name,
      followers: localArtist.followers,
      genres: localArtist.genres,
    });

    // Step 5: Get best match
    const bestMatch = scoredCandidates.length > 0 ? scoredCandidates[0] : null;

    return {
      providerId,
      bestMatch,
      allCandidates: scoredCandidates,
      tracksChecked: isrcMatches.length,
      matchesFound: candidates.length,
      errors,
    };
  } catch (error) {
    errors.push(
      `Matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return {
      providerId,
      bestMatch: null,
      allCandidates: [],
      tracksChecked: isrcMatches.length,
      matchesFound: 0,
      errors,
    };
  }
}

/**
 * Parse a date value to a normalized timestamp.
 * Invalid dates (including NaN from unparsable strings) return 0.
 *
 * @param date - Date value to parse
 * @returns Normalized timestamp (0 for invalid/missing dates)
 */
function parseToTimestamp(date: string | Date | null | undefined): number {
  if (!date) return 0;

  const timestamp =
    date instanceof Date ? date.getTime() : new Date(date).getTime();

  // Check for NaN or invalid timestamps
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Sort tracks by release date descending (most recent first).
 * Tracks with valid dates come before tracks without dates.
 * Invalid/unparsable dates are treated as missing (sorted last).
 *
 * @param tracks - Tracks to sort
 * @returns New array sorted by release date
 */
function sortByReleaseDateDescending(
  tracks: LocalTrackData[]
): LocalTrackData[] {
  return [...tracks].sort((a, b) => {
    const dateA = parseToTimestamp(a.releaseDate);
    const dateB = parseToTimestamp(b.releaseDate);

    // Both have valid dates - sort descending
    if (dateA && dateB) return dateB - dateA;
    // Only A has date - A comes first
    if (dateA && !dateB) return -1;
    // Only B has date - B comes first
    if (!dateA && dateB) return 1;
    // Neither has date - maintain relative order
    return 0;
  });
}

/**
 * Select tracks for ISRC matching.
 *
 * Prioritizes recent releases and tracks with valid ISRCs.
 * Limits to a reasonable sample size to avoid API overuse.
 *
 * @param tracks - All available tracks
 * @param maxTracks - Maximum tracks to select (default 20)
 * @returns Selected tracks for matching
 */
export function selectTracksForMatching(
  tracks: LocalTrackData[],
  maxTracks = DEFAULT_MAX_TRACKS_FOR_MATCHING
): LocalTrackData[] {
  // Filter to tracks with ISRCs
  const tracksWithIsrc = tracks.filter(t => t.isrc && t.isrc.trim().length > 0);

  // If we have fewer than max, return all (still sorted for consistency)
  if (tracksWithIsrc.length <= maxTracks) {
    return sortByReleaseDateDescending(tracksWithIsrc);
  }

  // Sort by release date descending to prioritize recent releases
  const sorted = sortByReleaseDateDescending(tracksWithIsrc);

  return sorted.slice(0, maxTracks);
}

/**
 * Validate that a match is reasonable.
 *
 * Additional sanity checks beyond confidence scoring.
 *
 * @param match - The scored match to validate
 * @param _localArtist - Local artist data (unused but kept for future use)
 * @returns True if match passes validation
 */
export function validateMatch(
  match: ScoredArtistMatch,
  _localArtist: LocalArtistData
): { valid: boolean; reason?: string } {
  // Check minimum confidence
  if (match.confidenceScore < MIN_VALID_CONFIDENCE) {
    return { valid: false, reason: 'Confidence score too low' };
  }

  // Check name similarity isn't suspiciously low
  const hasLowNameSimilarity =
    match.confidenceBreakdown.nameSimilarityScore <
    MIN_NAME_SIMILARITY_FOR_VALIDATION;
  const hasStrongIsrcMatches =
    match.matchingIsrcs.length >= MIN_ISRC_MATCHES_FOR_NAME_OVERRIDE;

  if (hasLowNameSimilarity && !hasStrongIsrcMatches) {
    return { valid: false, reason: 'Name mismatch with few ISRC matches' };
  }

  // Check that we have at least one ISRC match
  if (match.matchingIsrcs.length === 0) {
    return { valid: false, reason: 'No ISRC matches' };
  }

  return { valid: true };
}
