/**
 * Fit Scoring Module
 *
 * Provides ICP fit scoring for creator profiles to prioritize GTM outreach.
 */

export {
  calculateFitScore,
  FIT_SCORE_VERSION,
  type FitScoreInput,
  type FitScoreResult,
  isLinkInBioPlatform,
  isMusicToolPlatform,
  isTargetGenre,
  LINK_IN_BIO_PLATFORMS,
  MUSIC_TOOL_PLATFORMS,
  SCORE_WEIGHTS,
  TARGET_GENRES,
} from './calculator';

export {
  calculateAndStoreFitScore,
  calculateMissingFitScores,
  getTopFitProfiles,
  recalculateAllFitScores,
  updatePaidTierScore,
} from './service';

export {
  type EnrichmentResult,
  enrichMissingSpotifyData,
  enrichProfileWithSpotify,
  getEnrichmentQueue,
} from './spotify-enrichment';
