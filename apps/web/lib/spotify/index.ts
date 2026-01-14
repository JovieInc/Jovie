/**
 * Spotify Module Index
 *
 * Re-exports all Spotify-related utilities and types.
 * Import from '@/lib/spotify' for a clean API.
 */

// Circuit breaker for fault tolerance
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  CircuitOpenError,
  type CircuitState,
  spotifyCircuitBreaker,
} from './circuit-breaker';
// Client and API functions
export {
  getSpotifyArtist,
  isSpotifyAvailable,
  type SearchArtistResult,
  searchSpotifyArtists,
  spotifyClient,
} from './client';

// Environment and configuration
export {
  getSpotifyConfig,
  getSpotifyEnv,
  isSpotifyConfigured,
  requireSpotifyConfig,
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_API_BASE,
  SPOTIFY_DEFAULT_TIMEOUT_MS,
  SPOTIFY_TOKEN_LIFETIME_MS,
  SPOTIFY_TOKEN_REFRESH_BUFFER_MS,
  type SpotifyConfig,
  type SpotifyEnv,
  validateSpotifyConfigOnStartup,
  validateSpotifyEnv,
} from './env';

// Retry utilities
export {
  calculateDelay,
  type RetryConfig,
  type RetryResult,
  retryAsync,
  SPOTIFY_RETRY_CONFIG,
  withRetry,
} from './retry';

// Data sanitization
export {
  ALLOWED_EXTERNAL_DOMAINS,
  ALLOWED_IMAGE_HOSTS,
  type RawSpotifyArtist,
  type SanitizedArtist,
  sanitizeArtistData,
  sanitizeBio,
  sanitizeExternalUrls,
  sanitizeImageUrl,
  sanitizeName,
  sanitizeSearchResult,
  sanitizeSpotifyUrl,
  sanitizeText,
} from './sanitize';
