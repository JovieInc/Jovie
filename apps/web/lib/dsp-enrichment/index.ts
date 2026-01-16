/**
 * DSP Enrichment System
 *
 * Cross-platform artist matching, profile enrichment,
 * and new release detection.
 */

export type {
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
} from './circuit-breakers';

// Circuit breakers (server-only)
export {
  appleMusicCircuitBreaker,
  deezerCircuitBreaker,
  getAllCircuitBreakerStats,
  getCircuitBreakerForProvider,
  musicBrainzCircuitBreaker,
  resetAllCircuitBreakers,
} from './circuit-breakers';

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

// Types and constants
export * from './types';
