/**
 * DSP Enrichment Providers
 *
 * API clients for various Digital Service Providers (DSPs).
 * Each provider implements ISRC lookups, artist matching,
 * and profile enrichment.
 */

// Apple Music MusicKit Provider
export {
  AppleMusicError,
  AppleMusicNotConfiguredError,
  bulkLookupByIsrc as bulkLookupAppleMusicByIsrc,
  DEFAULT_STOREFRONT as APPLE_MUSIC_DEFAULT_STOREFRONT,
  extractBio as extractAppleMusicBio,
  extractExternalUrls as extractAppleMusicExternalUrls,
  extractImageUrls as extractAppleMusicImageUrls,
  getAppleMusicStats,
  getArtist as getAppleMusicArtist,
  getArtistAlbums as getAppleMusicArtistAlbums,
  isAppleMusicAvailable,
  lookupByIsrc as lookupAppleMusicByIsrc,
  lookupByUpc as lookupAppleMusicByUpc,
  MAX_ISRC_BATCH_SIZE as APPLE_MUSIC_MAX_ISRC_BATCH_SIZE,
  searchArtist as searchAppleMusicArtist,
} from './apple-music';

// Apple Music Auth
export {
  clearAppleMusicTokenCache,
  getAppleMusicAuthHeaders,
  getAppleMusicToken,
  isAppleMusicConfigured,
} from './apple-music-auth';
