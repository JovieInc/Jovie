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
 * - Alternative DSP presence: +10 points
 * - Multi-DSP presence: +5 points
 * - Has contact email: +5 points
 * - Paid verification (Twitter/X, Instagram, Facebook, Threads): +10 points
 *
 * Max score: 100 points (capped)
 */

import type { FitScoreBreakdown } from '@/lib/db/schema/profiles';

/** Current version of the scoring algorithm */
export const FIT_SCORE_VERSION = 3;

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
  // Alternative platform bonuses (for non-Spotify profiles)
  HAS_ALTERNATIVE_DSP: 10, // Apple Music, SoundCloud, etc.
  MULTI_DSP_PRESENCE: 5, // Present on 3+ streaming platforms
  HAS_CONTACT_EMAIL: 5, // Contact email available (easier outreach)
  PAID_VERIFICATION: 10, // Verified on a paid-verification platform (Twitter/X, Instagram, Facebook, Threads)
} as const;

const SPOTIFY_POPULARITY_THRESHOLDS = [
  { min: 60, score: SCORE_WEIGHTS.SPOTIFY_POPULARITY_MAX },
  { min: 40, score: 10 },
  { min: 20, score: 5 },
];

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

/**
 * Platforms where verification requires a paid subscription.
 * Verified status on these platforms signals willingness/ability to pay.
 */
export const PAID_VERIFICATION_PLATFORMS = new Set([
  'twitter',
  'x',
  'instagram',
  'facebook',
  'threads',
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
  /** Whether we have a contact email for outreach */
  hasContactEmail?: boolean;
  /** Whether the profile has Apple Music presence */
  hasAppleMusicId?: boolean;
  /** Whether the profile has SoundCloud presence */
  hasSoundCloudId?: boolean;
  /** Number of DSP platforms linked */
  dspPlatformCount?: number;
  /** Platforms where the creator has paid verification (e.g., ['twitter', 'instagram']) */
  paidVerificationPlatforms?: string[];
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

function createInitialBreakdown(now: Date): FitScoreBreakdown {
  return {
    usesLinkInBio: 0,
    paidTier: 0,
    usesMusicTools: 0,
    hasSpotify: 0,
    spotifyPopularity: 0,
    releaseRecency: 0,
    genreMatch: 0,
    hasAlternativeDsp: 0,
    multiDspPresence: 0,
    hasContactEmail: 0,
    paidVerification: 0,
    meta: {
      calculatedAt: now.toISOString(),
      version: FIT_SCORE_VERSION,
    },
  };
}

function getLinkInBioScore(platform?: string | null) {
  if (!platform) return 0;
  return LINK_IN_BIO_PLATFORMS.has(platform.toLowerCase())
    ? SCORE_WEIGHTS.USES_LINK_IN_BIO
    : 0;
}

function getMusicToolsDetected(platforms?: string[]) {
  if (!platforms?.length) return [];
  return platforms.filter(platform =>
    MUSIC_TOOL_PLATFORMS.has(platform.toLowerCase())
  );
}

function getSpotifyPopularityScore(popularity?: number | null) {
  if (!popularity || popularity <= 0) return 0;
  const matchedThreshold = SPOTIFY_POPULARITY_THRESHOLDS.find(
    ({ min }) => popularity >= min
  );
  return matchedThreshold?.score ?? 0;
}

function getReleaseRecencyScore(
  latestReleaseDate: Date | null | undefined,
  now: Date
) {
  if (!latestReleaseDate) return 0;
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (latestReleaseDate >= sixMonthsAgo) {
    return SCORE_WEIGHTS.RELEASE_RECENCY_6MO;
  }

  if (latestReleaseDate >= oneYearAgo) {
    return SCORE_WEIGHTS.RELEASE_RECENCY_1YR;
  }

  return 0;
}

function getMatchedGenres(genres?: string[] | null) {
  if (!genres?.length) return [];
  return genres.filter(genre => TARGET_GENRES.has(genre.toLowerCase().trim()));
}

function getFitScoreTotal(breakdown: FitScoreBreakdown) {
  return (
    breakdown.usesLinkInBio +
    breakdown.paidTier +
    breakdown.usesMusicTools +
    breakdown.hasSpotify +
    breakdown.spotifyPopularity +
    breakdown.releaseRecency +
    breakdown.genreMatch +
    (breakdown.hasAlternativeDsp ?? 0) +
    (breakdown.multiDspPresence ?? 0) +
    (breakdown.hasContactEmail ?? 0) +
    (breakdown.paidVerification ?? 0)
  );
}

/**
 * Calculate the fit score for a creator profile.
 *
 * @param input - Available data about the creator
 * @returns Calculated score and detailed breakdown
 */
export function calculateFitScore(input: FitScoreInput): FitScoreResult {
  const now = new Date();
  const breakdown = createInitialBreakdown(now);

  // 1. Uses link-in-bio product (+15)
  breakdown.usesLinkInBio = getLinkInBioScore(input.ingestionSourcePlatform);

  // 2. Paid tier on link-in-bio (+20)
  if (input.hasPaidTier) {
    breakdown.paidTier = SCORE_WEIGHTS.PAID_TIER;
  }

  // 3. Uses music-specific tools (+10)
  const musicToolsDetected = getMusicToolsDetected(input.socialLinkPlatforms);
  if (musicToolsDetected.length > 0) {
    breakdown.usesMusicTools = SCORE_WEIGHTS.USES_MUSIC_TOOLS;
    breakdown.meta!.musicToolsDetected = musicToolsDetected;
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
  breakdown.spotifyPopularity = getSpotifyPopularityScore(
    input.spotifyPopularity
  );

  // 6. Release recency (0-10)
  if (input.latestReleaseDate) {
    breakdown.meta!.latestReleaseDate = input.latestReleaseDate.toISOString();
  }
  breakdown.releaseRecency = getReleaseRecencyScore(
    input.latestReleaseDate,
    now
  );

  // 7. Genre match (+5)
  const matchedGenres = getMatchedGenres(input.genres);
  if (matchedGenres.length > 0) {
    breakdown.genreMatch = SCORE_WEIGHTS.GENRE_MATCH;
    breakdown.meta!.matchedGenres = matchedGenres;
  }

  // 8. Alternative DSP presence (+10) - helps non-Spotify profiles score higher
  // Only awarded if no Spotify to avoid double-counting
  const alternativePlatforms: string[] = [];
  if (input.hasAppleMusicId) alternativePlatforms.push('apple_music');
  if (input.hasSoundCloudId) alternativePlatforms.push('soundcloud');

  if (!input.hasSpotifyId && alternativePlatforms.length > 0) {
    breakdown.hasAlternativeDsp = SCORE_WEIGHTS.HAS_ALTERNATIVE_DSP;
    breakdown.meta!.alternativeDspPlatforms = alternativePlatforms;
  }

  // 9. Multi-DSP presence (+5) - present on 3+ streaming platforms
  const dspCount = input.dspPlatformCount ?? 0;
  if (dspCount >= 3) {
    breakdown.multiDspPresence = SCORE_WEIGHTS.MULTI_DSP_PRESENCE;
    breakdown.meta!.dspPlatformCount = dspCount;
  }

  // 10. Has contact email (+5) - easier outreach
  if (input.hasContactEmail) {
    breakdown.hasContactEmail = SCORE_WEIGHTS.HAS_CONTACT_EMAIL;
  }

  // 11. Paid verification on social platforms (+10) - signals willingness/ability to pay
  // Platforms like Twitter/X, Instagram, Facebook, Threads require paid subscriptions for verification
  if (
    input.paidVerificationPlatforms &&
    input.paidVerificationPlatforms.length > 0
  ) {
    breakdown.paidVerification = SCORE_WEIGHTS.PAID_VERIFICATION;
    breakdown.meta!.paidVerificationPlatforms = input.paidVerificationPlatforms;
  }

  // Calculate total score (capped at 100)
  const score = Math.min(100, getFitScoreTotal(breakdown));

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
