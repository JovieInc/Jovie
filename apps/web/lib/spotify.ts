/**
 * Spotify API client
 *
 * @deprecated Import from '@/lib/spotify' (directory module) instead.
 * This file re-exports for backwards compatibility.
 *
 * @example
 * ```typescript
 * // New way (preferred)
 * import { searchSpotifyArtists, getSpotifyArtistAlbums } from '@/lib/spotify';
 *
 * // Old way (still works)
 * import { searchSpotifyArtists } from '@/lib/spotify.ts';
 * ```
 */

// Re-export everything from the new module structure
export {
  // Types
  type AlbumIncludeGroup,
  buildSpotifyAlbumUrl,
  // Utils
  buildSpotifyArtistUrl,
  buildSpotifyTrackUrl,
  type GetArtistAlbumsOptions,
  generateReleaseSlug,
  getBestSpotifyImage,
  // Albums
  getSpotifyAlbum,
  getSpotifyAlbums,
  getSpotifyArtist,
  getSpotifyArtistAlbums,
  // Auth
  getSpotifyToken,
  mapSpotifyAlbumType,
  parseSpotifyReleaseDate,
  type SpotifyAlbum,
  type SpotifyAlbumFull,
  type SpotifyAlbumsResponse,
  type SpotifyArtist,
  type SpotifyImage,
  type SpotifySearchResponse,
  type SpotifyTokenResponse,
  type SpotifyTrack,
  // Artists
  searchSpotifyArtists,
} from './spotify/index';
