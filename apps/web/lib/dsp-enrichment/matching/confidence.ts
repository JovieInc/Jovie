/**
 * Confidence Scoring for DSP Artist Matching
 *
 * Calculates confidence scores for artist match candidates based on
 * multiple signals: ISRC matches, UPC matches, name similarity,
 * follower ratios, and genre overlap.
 */

import type {
  ArtistMatchCandidate,
  AutoConfirmThresholds,
  ConfidenceWeights,
  ScoredArtistMatch,
} from '../types';
import {
  DEFAULT_AUTO_CONFIRM_THRESHOLDS,
  DEFAULT_CONFIDENCE_WEIGHTS,
} from '../types';
import { artistNameSimilarity } from './name-similarity';

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculate ISRC match score.
 *
 * Based on the percentage of checked tracks that had ISRC matches.
 * More matches = higher confidence.
 *
 * @param matchingIsrcCount - Number of ISRCs that matched
 * @param totalTracksChecked - Total tracks checked for matches
 * @returns Score between 0 and 1
 */
export function calculateIsrcMatchScore(
  matchingIsrcCount: number,
  totalTracksChecked: number
): number {
  if (totalTracksChecked === 0) return 0;

  // Calculate match ratio
  const ratio = matchingIsrcCount / totalTracksChecked;

  // Apply a curve that rewards higher match rates
  // At 50% match rate, score is ~0.71
  // At 80% match rate, score is ~0.89
  // At 100% match rate, score is 1.0
  return Math.sqrt(ratio);
}

/**
 * Calculate UPC match score.
 *
 * UPC matches are album-level, so fewer are expected but they're
 * strong signals when present.
 *
 * @param matchingUpcCount - Number of UPCs that matched
 * @param expectedAlbumCount - Expected number of albums (estimate)
 * @returns Score between 0 and 1
 */
export function calculateUpcMatchScore(
  matchingUpcCount: number,
  expectedAlbumCount = 5
): number {
  if (matchingUpcCount === 0) return 0;

  // UPC matches are less common but valuable
  // 1 match = 0.5, 2 matches = 0.71, 3+ = higher
  const ratio = Math.min(matchingUpcCount / expectedAlbumCount, 1);
  return Math.sqrt(ratio);
}

/**
 * Calculate name similarity score.
 *
 * Uses Jaro-Winkler similarity on normalized artist names.
 *
 * @param localName - Local artist name
 * @param externalName - External DSP artist name
 * @returns Score between 0 and 1
 */
export function calculateNameSimilarityScore(
  localName: string,
  externalName: string
): number {
  return artistNameSimilarity(localName, externalName);
}

/**
 * Calculate follower ratio score.
 *
 * Compares follower counts between platforms to see if they're
 * in a reasonable range (within 10x of each other).
 *
 * @param localFollowers - Follower count on local/source platform
 * @param externalFollowers - Follower count on external platform
 * @returns Score between 0 and 1
 */
export function calculateFollowerRatioScore(
  localFollowers: number | null | undefined,
  externalFollowers: number | null | undefined
): number {
  // If either count is missing, return neutral score
  if (!localFollowers || !externalFollowers) {
    return 0.5;
  }

  // Calculate the ratio (always >= 1)
  const ratio =
    localFollowers > externalFollowers
      ? localFollowers / externalFollowers
      : externalFollowers / localFollowers;

  // Score based on how close the ratio is to 1:1
  // Ratio of 1 = 1.0, ratio of 2 = 0.85, ratio of 5 = 0.58, ratio of 10 = 0.37
  // Beyond 10x difference, score drops significantly
  if (ratio <= 1) return 1;
  if (ratio >= 10) return 0.1;

  // Logarithmic decay
  return 1 - Math.log10(ratio);
}

/**
 * Calculate genre overlap score.
 *
 * Compares genres between local and external artist profiles.
 *
 * @param localGenres - Genres from local profile
 * @param externalGenres - Genres from external profile
 * @returns Score between 0 and 1
 */
export function calculateGenreOverlapScore(
  localGenres: string[] | null | undefined,
  externalGenres: string[] | null | undefined
): number {
  // If either is missing, return neutral score
  if (!localGenres?.length || !externalGenres?.length) {
    return 0.5;
  }

  // Normalize genres for comparison
  const normalizedLocal = new Set(localGenres.map(g => g.toLowerCase().trim()));
  const normalizedExternal = new Set(
    externalGenres.map(g => g.toLowerCase().trim())
  );

  // Calculate overlap
  let overlap = 0;
  for (const genre of normalizedLocal) {
    if (normalizedExternal.has(genre)) {
      overlap++;
    }
  }

  // Calculate Jaccard similarity
  const union = new Set([...normalizedLocal, ...normalizedExternal]);
  if (union.size === 0) return 0.5;

  return overlap / union.size;
}

// ============================================================================
// Main Confidence Calculator
// ============================================================================

/**
 * Calculate the overall confidence score for an artist match candidate.
 *
 * @param candidate - The artist match candidate
 * @param localArtistData - Data about the local artist for comparison
 * @param weights - Weights for each scoring component
 * @returns Scored artist match with confidence breakdown
 */
export function calculateConfidenceScore(
  candidate: ArtistMatchCandidate,
  localArtistData: {
    name: string;
    followers?: number | null;
    genres?: string[] | null;
  },
  weights: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS
): ScoredArtistMatch {
  // Calculate individual scores
  const isrcMatchScore = calculateIsrcMatchScore(
    candidate.matchingIsrcs.length,
    candidate.totalTracksChecked
  );

  const upcMatchScore = calculateUpcMatchScore(candidate.matchingUpcs.length);

  const nameSimilarityScore = calculateNameSimilarityScore(
    localArtistData.name,
    candidate.externalArtistName
  );

  // These require external data that may not be available yet
  // Will be refined during enrichment phase
  const followerRatioScore = 0.5; // Neutral until we fetch external data
  const genreOverlapScore = 0.5; // Neutral until we fetch external data

  // Calculate weighted total
  const confidenceScore =
    isrcMatchScore * weights.isrcMatch +
    upcMatchScore * weights.upcMatch +
    nameSimilarityScore * weights.nameSimilarity +
    followerRatioScore * weights.followerRatio +
    genreOverlapScore * weights.genreOverlap;

  // Determine if should auto-confirm
  const shouldAutoConfirm =
    confidenceScore >= DEFAULT_AUTO_CONFIRM_THRESHOLDS.minConfidenceScore &&
    candidate.matchingIsrcs.length >=
      DEFAULT_AUTO_CONFIRM_THRESHOLDS.minMatchingIsrcCount;

  return {
    ...candidate,
    confidenceScore,
    confidenceBreakdown: {
      isrcMatchScore,
      upcMatchScore,
      nameSimilarityScore,
      followerRatioScore,
      genreOverlapScore,
    },
    shouldAutoConfirm,
  };
}

/**
 * Refine confidence score with additional external artist data.
 *
 * Called after fetching artist profile from the DSP to incorporate
 * follower counts and genres into the confidence score.
 *
 * @param scoredMatch - Previously scored match
 * @param localArtistData - Local artist data
 * @param externalArtistData - Additional data from DSP
 * @param weights - Scoring weights
 * @returns Updated scored match
 */
export function refineConfidenceScore(
  scoredMatch: ScoredArtistMatch,
  localArtistData: {
    name: string;
    followers?: number | null;
    genres?: string[] | null;
  },
  externalArtistData: {
    followers?: number | null;
    genres?: string[] | null;
  },
  weights: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS,
  thresholds: AutoConfirmThresholds = DEFAULT_AUTO_CONFIRM_THRESHOLDS
): ScoredArtistMatch {
  // Recalculate follower and genre scores with real data
  const followerRatioScore = calculateFollowerRatioScore(
    localArtistData.followers,
    externalArtistData.followers
  );

  const genreOverlapScore = calculateGenreOverlapScore(
    localArtistData.genres,
    externalArtistData.genres
  );

  // Recalculate total with updated scores
  const confidenceScore =
    scoredMatch.confidenceBreakdown.isrcMatchScore * weights.isrcMatch +
    scoredMatch.confidenceBreakdown.upcMatchScore * weights.upcMatch +
    scoredMatch.confidenceBreakdown.nameSimilarityScore *
      weights.nameSimilarity +
    followerRatioScore * weights.followerRatio +
    genreOverlapScore * weights.genreOverlap;

  // Re-evaluate auto-confirm with refined score
  const shouldAutoConfirm =
    confidenceScore >= thresholds.minConfidenceScore &&
    scoredMatch.matchingIsrcs.length >= thresholds.minMatchingIsrcCount;

  return {
    ...scoredMatch,
    confidenceScore,
    confidenceBreakdown: {
      ...scoredMatch.confidenceBreakdown,
      followerRatioScore,
      genreOverlapScore,
    },
    shouldAutoConfirm,
  };
}

/**
 * Score and rank multiple candidates.
 *
 * @param candidates - Array of match candidates
 * @param localArtistData - Local artist data for comparison
 * @param weights - Scoring weights
 * @returns Array of scored matches, sorted by confidence (descending)
 */
export function scoreAndRankCandidates(
  candidates: ArtistMatchCandidate[],
  localArtistData: {
    name: string;
    followers?: number | null;
    genres?: string[] | null;
  },
  weights: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS
): ScoredArtistMatch[] {
  const scoredMatches = candidates.map(candidate =>
    calculateConfidenceScore(candidate, localArtistData, weights)
  );

  // Sort by confidence score (descending)
  scoredMatches.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return scoredMatches;
}
