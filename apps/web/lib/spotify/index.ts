/**
 * Spotify Module Index
 *
 * Re-exports all Spotify-related utilities and types.
 * Import from '@/lib/spotify' for a clean API.
 */

// Client and API functions
export {
  spotifyClient,
  isSpotifyAvailable,
  searchSpotifyArtists,
  getSpotifyArtist,
  type SearchArtistResult,
} from './client';

// Data sanitization
export {
  sanitizeArtistData,
  sanitizeSearchResult,
  sanitizeImageUrl,
  sanitizeSpotifyUrl,
  sanitizeExternalUrls,
  sanitizeText,
  sanitizeName,
  sanitizeBio,
  ALLOWED_IMAGE_HOSTS,
  ALLOWED_EXTERNAL_DOMAINS,
  type RawSpotifyArtist,
  type SanitizedArtist,
} from './sanitize';

// Environment and configuration
export {
  isSpotifyConfigured,
  validateSpotifyEnv,
  getSpotifyConfig,
  requireSpotifyConfig,
  getSpotifyEnv,
  validateSpotifyConfigOnStartup,
  SPOTIFY_API_BASE,
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_DEFAULT_TIMEOUT_MS,
  SPOTIFY_TOKEN_REFRESH_BUFFER_MS,
  SPOTIFY_TOKEN_LIFETIME_MS,
  type SpotifyEnv,
  type SpotifyConfig,
} from './env';
