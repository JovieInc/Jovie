/**
 * Spotify API client
 *
 * Provides functions for interacting with the Spotify Web API
 * using client credentials flow for server-side operations.
 *
 * @example
 * ```typescript
 * import { searchSpotifyArtists, getSpotifyArtistAlbums } from '@/lib/spotify';
 *
 * const artists = await searchSpotifyArtists('Taylor Swift');
 * const albums = await getSpotifyArtistAlbums(artists[0].id);
 * ```
 */

// Album operations
export { getSpotifyAlbum, getSpotifyAlbums } from './albums';
// Artist operations
export {
  getSpotifyArtist,
  getSpotifyArtistAlbums,
  searchSpotifyArtists,
} from './artists';
// Auth (internal, but exposed for testing)
export { getSpotifyToken } from './auth';
// Types
export type {
  AlbumIncludeGroup,
  GetArtistAlbumsOptions,
  SpotifyAlbum,
  SpotifyAlbumFull,
  SpotifyAlbumsResponse,
  SpotifyArtist,
  SpotifyImage,
  SpotifySearchResponse,
  SpotifyTokenResponse,
  SpotifyTrack,
} from './types';

// Utilities
export {
  buildSpotifyAlbumUrl,
  buildSpotifyArtistUrl,
  buildSpotifyTrackUrl,
  generateReleaseSlug,
  getBestSpotifyImage,
  mapSpotifyAlbumType,
  parseSpotifyReleaseDate,
} from './utils';
