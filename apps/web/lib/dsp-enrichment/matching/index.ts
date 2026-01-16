/**
 * DSP Artist Matching Orchestrator
 *
 * Coordinates the artist matching process across DSPs.
 * Takes local artist data and finds matching profiles on
 * external platforms using ISRC-based matching and confidence scoring.
 */

import 'server-only';

import type {
  AppleMusicTrack,
  DspProviderId,
  IsrcMatchResult,
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
      const artistId = artistData?.id ?? 'unknown';
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
  maxTracks = 20
): LocalTrackData[] {
  // Filter to tracks with ISRCs
  const tracksWithIsrc = tracks.filter(t => t.isrc && t.isrc.trim().length > 0);

  // If we have fewer than max, return all
  if (tracksWithIsrc.length <= maxTracks) {
    return tracksWithIsrc;
  }

  // Otherwise, take a sample prioritizing variety
  // In a real implementation, we'd prioritize recent releases
  return tracksWithIsrc.slice(0, maxTracks);
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
  if (match.confidenceScore < 0.3) {
    return { valid: false, reason: 'Confidence score too low' };
  }

  // Check name similarity isn't suspiciously low
  if (match.confidenceBreakdown.nameSimilarityScore < 0.5) {
    // Allow if we have strong ISRC matches
    if (match.matchingIsrcs.length < 3) {
      return { valid: false, reason: 'Name mismatch with few ISRC matches' };
    }
  }

  // Check that we have at least one ISRC match
  if (match.matchingIsrcs.length === 0) {
    return { valid: false, reason: 'No ISRC matches' };
  }

  return { valid: true };
}
