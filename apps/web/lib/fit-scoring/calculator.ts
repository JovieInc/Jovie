/**
 * Fit Score Calculator
 *
 * Calculates a 0-100 ICP fit score for creator profiles to prioritize GTM outreach.
 * Higher scores indicate better fit for the Jovie platform.
 *
 * Scoring criteria:
 * - Uses link-in-bio product: +15 points
 * - Paid tier (no branding): +20 points
 * - Uses music-specific tools: +10 points
 * - Has Spotify profile: +15 points
 * - Spotify popularity (proxy for monthly listeners): 0-15 points
 * - Release recency: 0-10 points
 * - Target genre match: +5 points
 *
 * Max score: 100 points
 */

import type { FitScoreBreakdown } from '@/lib/db/schema/profiles';

/** Current version of the scoring algorithm */
export const FIT_SCORE_VERSION = 1;

/** Point values for each scoring criterion */
export const SCORE_WEIGHTS = {
  USES_LINK_IN_BIO: 15,
  PAID_TIER: 20,
  USES_MUSIC_TOOLS: 10,
  HAS_SPOTIFY: 15,
  SPOTIFY_POPULARITY_MAX: 15,
  RELEASE_RECENCY_6MO: 10,
  RELEASE_RECENCY_1YR: 5,
  GENRE_MATCH: 5,
} as const;

/** Platforms considered as "link-in-bio" products */
export const LINK_IN_BIO_PLATFORMS = new Set([
  'linktree',
  'beacons',
  'laylo',
  'koji',
  'bio.link',
  'linkr.bio',
  'stan.store',
  'hoo.be',
  'milkshake',
  'campsite.bio',
]);

/** Music-specific smart link tools - indicates higher intent */
export const MUSIC_TOOL_PLATFORMS = new Set([
  'linkfire',
  'toneden',
  'featurefm',
  'laylo', // Laylo is music-focused
  'distrokid', // DistroKid hyperfollow
  'songwhip',
  'odesli', // song.link / odesli
]);

/** Target genres for cohort matching (electronic/DJ focus) */
export const TARGET_GENRES = new Set([
  // Core electronic genres
  'electronic',
  'edm',
  'house',
  'deep house',
  'tech house',
  'progressive house',
  'techno',
  'trance',
  'dubstep',
  'drum and bass',
  'dnb',
  'd&b',
  'jungle',
  'breakbeat',
  'electro',
  'electronica',
  // DJ-related
  'dj',
  'club',
  'dance',
  'dance pop',
  // Sub-genres
  'bass music',
  'future bass',
  'tropical house',
  'melodic house',
  'melodic techno',
  'ambient',
  'downtempo',
  'chillwave',
  'synthwave',
  'retrowave',
  'lo-fi house',
  'uk garage',
  'garage',
  'grime',
  'hardstyle',
  'hardcore',
  'psytrance',
  'minimal',
  'minimal techno',
]);

/**
 * Input data for calculating a fit score.
 * All fields are optional - score will be calculated based on available data.
 */
export interface FitScoreInput {
  /** Platform the profile was ingested from (e.g., 'linktree', 'beacons') */
  ingestionSourcePlatform?: string | null;
  /** Whether the link-in-bio has branding removed (paid tier indicator) */
  hasPaidTier?: boolean;
  /** Platform IDs of social links detected on the profile */
  socialLinkPlatforms?: string[];
  /** Whether the profile has a Spotify ID */
  hasSpotifyId?: boolean;
  /** Spotify popularity score (0-100) */
  spotifyPopularity?: number | null;
  /** Artist genres from Spotify */
  genres?: string[] | null;
  /** Most recent release date */
  latestReleaseDate?: Date | null;
}

/**
 * Result of a fit score calculation
 */
export interface FitScoreResult {
  /** Total fit score (0-100) */
  score: number;
  /** Detailed breakdown of points per criterion */
  breakdown: FitScoreBreakdown;
}

/**
 * Calculate the fit score for a creator profile.
 *
 * @param input - Available data about the creator
 * @returns Calculated score and detailed breakdown
 */
export function calculateFitScore(input: FitScoreInput): FitScoreResult {
  const now = new Date();
  const breakdown: FitScoreBreakdown = {
    usesLinkInBio: 0,
    paidTier: 0,
    usesMusicTools: 0,
    hasSpotify: 0,
    spotifyPopularity: 0,
    releaseRecency: 0,
    genreMatch: 0,
    meta: {
      calculatedAt: now.toISOString(),
      version: FIT_SCORE_VERSION,
    },
  };

  // 1. Uses link-in-bio product (+15)
  if (
    input.ingestionSourcePlatform &&
    LINK_IN_BIO_PLATFORMS.has(input.ingestionSourcePlatform.toLowerCase())
  ) {
    breakdown.usesLinkInBio = SCORE_WEIGHTS.USES_LINK_IN_BIO;
  }

  // 2. Paid tier on link-in-bio (+20)
  if (input.hasPaidTier) {
    breakdown.paidTier = SCORE_WEIGHTS.PAID_TIER;
  }

  // 3. Uses music-specific tools (+10)
  const musicToolsDetected: string[] = [];
  if (input.socialLinkPlatforms) {
    for (const platform of input.socialLinkPlatforms) {
      if (MUSIC_TOOL_PLATFORMS.has(platform.toLowerCase())) {
        musicToolsDetected.push(platform);
      }
    }
    if (musicToolsDetected.length > 0) {
      breakdown.usesMusicTools = SCORE_WEIGHTS.USES_MUSIC_TOOLS;
      breakdown.meta!.musicToolsDetected = musicToolsDetected;
    }
  }

  // 4. Has Spotify profile (+15)
  if (input.hasSpotifyId) {
    breakdown.hasSpotify = SCORE_WEIGHTS.HAS_SPOTIFY;
  }

  // 5. Spotify popularity as proxy for monthly listeners (0-15)
  // Map 0-100 popularity to 0-15 points with thresholds:
  // 0-19: 0 points (unknown/very small)
  // 20-39: 5 points (emerging)
  // 40-59: 10 points (established)
  // 60+: 15 points (significant)
  if (input.spotifyPopularity != null && input.spotifyPopularity > 0) {
    if (input.spotifyPopularity >= 60) {
      breakdown.spotifyPopularity = 15;
    } else if (input.spotifyPopularity >= 40) {
      breakdown.spotifyPopularity = 10;
    } else if (input.spotifyPopularity >= 20) {
      breakdown.spotifyPopularity = 5;
    }
    // 0-19 gets 0 points
  }

  // 6. Release recency (0-10)
  if (input.latestReleaseDate) {
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    breakdown.meta!.latestReleaseDate = input.latestReleaseDate.toISOString();

    if (input.latestReleaseDate >= sixMonthsAgo) {
      breakdown.releaseRecency = SCORE_WEIGHTS.RELEASE_RECENCY_6MO;
    } else if (input.latestReleaseDate >= oneYearAgo) {
      breakdown.releaseRecency = SCORE_WEIGHTS.RELEASE_RECENCY_1YR;
    }
    // Older than 1 year gets 0 points
  }

  // 7. Genre match (+5)
  if (input.genres && input.genres.length > 0) {
    const matchedGenres: string[] = [];
    for (const genre of input.genres) {
      const normalizedGenre = genre.toLowerCase().trim();
      if (TARGET_GENRES.has(normalizedGenre)) {
        matchedGenres.push(genre);
      }
    }
    if (matchedGenres.length > 0) {
      breakdown.genreMatch = SCORE_WEIGHTS.GENRE_MATCH;
      breakdown.meta!.matchedGenres = matchedGenres;
    }
  }

  // Calculate total score
  const score =
    breakdown.usesLinkInBio +
    breakdown.paidTier +
    breakdown.usesMusicTools +
    breakdown.hasSpotify +
    breakdown.spotifyPopularity +
    breakdown.releaseRecency +
    breakdown.genreMatch;

  return { score, breakdown };
}

/**
 * Check if a platform ID is a link-in-bio product.
 */
export function isLinkInBioPlatform(platformId: string): boolean {
  return LINK_IN_BIO_PLATFORMS.has(platformId.toLowerCase());
}

/**
 * Check if a platform ID is a music-specific tool.
 */
export function isMusicToolPlatform(platformId: string): boolean {
  return MUSIC_TOOL_PLATFORMS.has(platformId.toLowerCase());
}

/**
 * Check if a genre matches our target genres.
 */
export function isTargetGenre(genre: string): boolean {
  return TARGET_GENRES.has(genre.toLowerCase().trim());
}
