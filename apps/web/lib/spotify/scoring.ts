/**
 * Spotify Algorithmic Neighbour Scoring
 *
 * Scores "Fans Also Like" artists relative to a target artist
 * to diagnose algorithmic positioning health.
 *
 * Scoring model:
 *   - popularity (0-100) is primary signal
 *   - followers is tiebreaker when popularity is within 5 points
 *   - genre overlap uses Jaccard index (intersection / union)
 *
 * Health score = % of neighbours that are BIGGER than target
 */

import type { SanitizedArtist } from './sanitize';

// ─── Types ───────────────────────────────────────────────

export type NeighbourSize = 'BIGGER' | 'SIMILAR' | 'SMALLER';

export type AuthenticityLevel = 'CLEAN' | 'CAUTION' | 'SUSPECT';

export interface AuthenticityFlag {
  level: AuthenticityLevel;
  reasons: string[];
}

export interface ScoredNeighbour {
  artist: SanitizedArtist;
  size: NeighbourSize;
  popularityDelta: number;
  followerDelta: number;
  genreOverlap: number;
  authenticity: AuthenticityFlag;
}

export interface AlgorithmHealthReport {
  targetArtist: SanitizedArtist;
  neighbours: ScoredNeighbour[];
  healthScore: number;
  summary: {
    bigger: number;
    similar: number;
    smaller: number;
    total: number;
  };
}

// ─── Scoring Functions ───────────────────────────────────

const POPULARITY_THRESHOLD = 5;

/**
 * Compare two artists and determine if the neighbour is bigger,
 * smaller, or similar to the target.
 *
 * Primary: popularity score (0-100)
 * Tiebreaker (within 5 points): follower count
 */
export function compareSize(
  targetPopularity: number,
  targetFollowers: number,
  neighbourPopularity: number,
  neighbourFollowers: number
): NeighbourSize {
  const popularityDelta = neighbourPopularity - targetPopularity;

  if (popularityDelta > POPULARITY_THRESHOLD) return 'BIGGER';
  if (popularityDelta < -POPULARITY_THRESHOLD) return 'SMALLER';

  // Within threshold: use followers as tiebreaker
  if (neighbourFollowers > targetFollowers) return 'BIGGER';
  if (neighbourFollowers < targetFollowers) return 'SMALLER';

  return 'SIMILAR';
}

/**
 * Compute genre overlap between two artists using Jaccard index.
 * Returns 0-1 (0 = no overlap, 1 = identical genres).
 */
export function computeGenreOverlap(
  genresA: string[],
  genresB: string[]
): number {
  if (genresA.length === 0 && genresB.length === 0) return 0;
  if (genresA.length === 0 || genresB.length === 0) return 0;

  const setA = new Set(genresA.map(g => g.toLowerCase()));
  const setB = new Set(genresB.map(g => g.toLowerCase()));

  let intersection = 0;
  for (const genre of setA) {
    if (setB.has(genre)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Assess authenticity of an artist based on available signals.
 *
 * Do No Harm: we must flag artists that may have botted followers/streams
 * so we don't recommend them for container playlists.
 *
 * Signals:
 * - High followers + near-zero popularity = likely botted
 * - No genres assigned despite significant followers = suspicious
 * - Extreme follower/popularity ratio = inflated metrics
 */
export function assessAuthenticity(artist: SanitizedArtist): AuthenticityFlag {
  const reasons: string[] = [];

  // Flag 1: High followers but near-zero popularity
  // A real artist with 5K+ followers should have at least popularity 5
  if (artist.followerCount > 5000 && artist.popularity < 5) {
    reasons.push('High followers but near-zero popularity');
  }

  // Flag 2: No genres despite significant following
  // Spotify assigns genres algorithmically from listener overlap.
  // No genres on an artist with 1K+ followers suggests artificial growth.
  if (artist.genres.length === 0 && artist.followerCount > 1000) {
    reasons.push('No genres despite significant followers');
  }

  // Flag 3: Extreme follower/popularity ratio (only when popularity >= 5
  // to avoid double-counting with Flag 1's near-zero popularity check)
  // Normal ratio: ~500-2000 followers per popularity point
  // Botted: 5000+ followers per popularity point
  if (artist.popularity >= 5) {
    const ratio = artist.followerCount / artist.popularity;
    if (ratio > 5000 && artist.followerCount > 2000) {
      reasons.push('Follower count vastly exceeds popularity signal');
    }
  }

  if (reasons.length >= 2) return { level: 'SUSPECT', reasons };
  if (reasons.length === 1) return { level: 'CAUTION', reasons };
  return { level: 'CLEAN', reasons: [] };
}

/**
 * Score a single neighbour relative to the target artist.
 */
export function scoreNeighbour(
  target: SanitizedArtist,
  neighbour: SanitizedArtist
): ScoredNeighbour {
  return {
    artist: neighbour,
    size: compareSize(
      target.popularity,
      target.followerCount,
      neighbour.popularity,
      neighbour.followerCount
    ),
    popularityDelta: neighbour.popularity - target.popularity,
    followerDelta: neighbour.followerCount - target.followerCount,
    genreOverlap: computeGenreOverlap(target.genres, neighbour.genres),
    authenticity: assessAuthenticity(neighbour),
  };
}

/**
 * Compute the Algorithm Health Score.
 * = (count of BIGGER neighbours / total neighbours) * 100
 *
 * Higher = more of your FAL is bigger artists = better algorithmic position.
 * Lower = you're stuck in a small-artist loop.
 */
export function computeHealthScore(neighbours: ScoredNeighbour[]): number {
  if (neighbours.length === 0) return 0;

  const bigger = neighbours.filter(n => n.size === 'BIGGER').length;
  return Math.round((bigger / neighbours.length) * 100);
}

/**
 * Generate a full Algorithm Health Report for an artist.
 */
export function generateHealthReport(
  targetArtist: SanitizedArtist,
  relatedArtists: SanitizedArtist[]
): AlgorithmHealthReport {
  const neighbours = relatedArtists.map(artist =>
    scoreNeighbour(targetArtist, artist)
  );

  // Sort: bigger first, then similar, then smaller
  const sizeOrder: Record<NeighbourSize, number> = {
    BIGGER: 0,
    SIMILAR: 1,
    SMALLER: 2,
  };
  neighbours.sort((a, b) => {
    const orderDiff = sizeOrder[a.size] - sizeOrder[b.size];
    if (orderDiff !== 0) return orderDiff;
    // Within same size group, sort by popularity delta (highest first)
    return b.popularityDelta - a.popularityDelta;
  });

  const summary = {
    bigger: neighbours.filter(n => n.size === 'BIGGER').length,
    similar: neighbours.filter(n => n.size === 'SIMILAR').length,
    smaller: neighbours.filter(n => n.size === 'SMALLER').length,
    total: neighbours.length,
  };

  return {
    targetArtist,
    neighbours,
    healthScore: computeHealthScore(neighbours),
    summary,
  };
}
