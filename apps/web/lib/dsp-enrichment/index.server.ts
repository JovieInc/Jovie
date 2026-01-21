/**
 * DSP Enrichment System - Server-Only Exports
 *
 * This module contains server-only code that must NOT be imported
 * in client bundles. All exports here interact with external APIs,
 * database, or use server-only dependencies.
 *
 * @module dsp-enrichment/server
 */

import 'server-only';

export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';
// Circuit breakers (server-only)
export {
  appleMusicCircuitBreaker,
  CircuitBreaker,
  CircuitOpenError,
  deezerCircuitBreaker,
  getAllCircuitBreakerStats,
  getCircuitBreakerForProvider,
  musicBrainzCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuit-breakers';
export type {
  LocalArtistData,
  LocalTrackData,
  MatchingResult,
} from './matching';
// Matching algorithm (server-only)
export {
  // ISRC aggregation
  aggregateIsrcMatches,
  // Name similarity
  areArtistNamesSimilar,
  artistNameSimilarity,
  // Confidence scoring
  calculateConfidenceScore,
  calculateFollowerRatioScore,
  calculateGenreOverlapScore,
  calculateIsrcMatchScore,
  calculateNameSimilarityScore,
  calculateUpcMatchScore,
  // Orchestration
  convertAppleMusicToIsrcMatches,
  enrichCandidatesWithProfiles,
  filterByMinMatches,
  getBestCandidate,
  jaroWinklerSimilarity,
  mergeUpcMatches,
  normalizeArtistName,
  orchestrateMatching,
  refineConfidenceScore,
  scoreAndRankCandidates,
  selectTracksForMatching,
  validateMatch,
} from './matching';

// Providers (server-only)
export {
  // Apple Music Provider
  APPLE_MUSIC_DEFAULT_STOREFRONT,
  APPLE_MUSIC_MAX_ISRC_BATCH_SIZE,
  AppleMusicError,
  AppleMusicNotConfiguredError,
  bulkLookupAppleMusicByIsrc,
  clearAppleMusicTokenCache,
  extractAppleMusicBio,
  extractAppleMusicExternalUrls,
  extractAppleMusicImageUrls,
  getAppleMusicArtist,
  getAppleMusicArtistAlbums,
  getAppleMusicAuthHeaders,
  getAppleMusicStats,
  getAppleMusicToken,
  isAppleMusicAvailable,
  isAppleMusicConfigured,
  lookupAppleMusicByIsrc,
  lookupAppleMusicByUpc,
  searchAppleMusicArtist,
} from './providers';
