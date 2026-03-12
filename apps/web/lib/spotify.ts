import { captureError } from '@/lib/error-tracking';
import {
  getSpotifyArtist as getSpotifyArtistFromClient,
  getSpotifyArtistsBatch as getSpotifyArtistsBatchFromClient,
  spotifyClient,
} from '@/lib/spotify/client';

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: Array<{ url: string; height: number; width: number }>;
  popularity: number;
  followers?: { total: number };
}

// Spotify Album types
export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: 'album' | 'single' | 'compilation';
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  total_tracks: number;
  popularity?: number;
  images: SpotifyImage[];
  external_urls: {
    spotify: string;
  };
  uri: string;
  artists: Array<{
    id: string;
    name: string;
    external_urls: { spotify: string };
  }>;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  track_number: number;
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: {
    spotify: string;
  };
  uri: string;
  preview_url: string | null;
  external_ids?: {
    isrc?: string;
  };
  artists: Array<{
    id: string;
    name: string;
  }>;
}

export interface SpotifyTrackFull extends SpotifyTrack {
  external_ids?: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
}

export interface SpotifyAlbumFull extends SpotifyAlbum {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    next: string | null;
  };
  label: string;
  popularity: number;
  genres?: string[];
  copyrights: Array<{ text: string; type: string }>;
  external_ids?: {
    upc?: string;
  };
}

interface SpotifyAlbumsResponse {
  items: SpotifyAlbum[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

// Search for artists on Spotify
export async function searchSpotifyArtists(
  query: string,
  limit: number = 5
): Promise<SpotifyArtist[]> {
  try {
    const data = await spotifyClient.requestJson<SpotifySearchResponse>(
      `/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`
    );

    return data.artists.items;
  } catch {
    return [];
  }
}

// Get artist details from Spotify
export async function getSpotifyArtist(
  artistId: string
): Promise<SpotifyArtist | null> {
  return (await getSpotifyArtistFromClient(artistId)) as SpotifyArtist | null;
}

/**
 * Get multiple artists in a single request (max 50 per chunk).
 * Uses the Spotify /artists?ids= batch endpoint.
 */
export async function getSpotifyArtistsBatch(
  artistIds: string[]
): Promise<SpotifyArtist[]> {
  return (await getSpotifyArtistsBatchFromClient(artistIds)) as SpotifyArtist[];
}

// Build Spotify artist URL from artist ID
export function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

// Build Spotify album URL from album ID
export function buildSpotifyAlbumUrl(albumId: string): string {
  return `https://open.spotify.com/album/${albumId}`;
}

// Build Spotify track URL from track ID
export function buildSpotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Get all albums for an artist from Spotify
 * Fetches singles, albums, and compilations
 */
export async function getSpotifyArtistAlbums(
  artistId: string,
  options: {
    includeGroups?: ('album' | 'single' | 'compilation' | 'appears_on')[];
    limit?: number;
    market?: string;
  } = {}
): Promise<SpotifyAlbum[]> {
  const includeGroups = options.includeGroups ?? [
    'album',
    'single',
    'compilation',
  ];
  const limit = options.limit ?? 50;
  const market = options.market ?? 'US';

  const albums: SpotifyAlbum[] = [];
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const params = new URLSearchParams({
        include_groups: includeGroups.join(','),
        limit: String(limit),
        offset: String(offset),
        market,
      });

      const data = await spotifyClient.requestJson<SpotifyAlbumsResponse>(
        `/artists/${artistId}/albums?${params}`
      );
      albums.push(...data.items);

      if (data.next && albums.length < data.total) {
        offset += limit;
      } else {
        hasMore = false;
      }

      if (albums.length >= 500) {
        hasMore = false;
      }
    }

    return albums;
  } catch (error) {
    await captureError('Failed to fetch Spotify artist albums', error, {
      artistId,
      operation: 'getSpotifyArtistAlbums',
    });
    return [];
  }
}

/**
 * Get full album details including tracks
 */
export async function getSpotifyAlbum(
  albumId: string,
  market: string = 'US'
): Promise<SpotifyAlbumFull | null> {
  try {
    return await spotifyClient.requestJson<SpotifyAlbumFull>(
      `/albums/${albumId}?market=${market}`
    );
  } catch (error) {
    await captureError('Failed to fetch Spotify album', error, {
      albumId,
      operation: 'getSpotifyAlbum',
    });
    return null;
  }
}

/**
 * Get multiple albums in a single request (max 20)
 */
export async function getSpotifyAlbums(
  albumIds: string[],
  market: string = 'US'
): Promise<SpotifyAlbumFull[]> {
  if (albumIds.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < albumIds.length; i += 20) {
    chunks.push(albumIds.slice(i, i + 20));
  }

  const albums: SpotifyAlbumFull[] = [];

  try {
    for (const chunk of chunks) {
      const data = await spotifyClient.requestJson<{
        albums: SpotifyAlbumFull[];
      }>(`/albums?ids=${chunk.join(',')}&market=${market}`);
      albums.push(...data.albums.filter(Boolean));
    }

    return albums;
  } catch (error) {
    await captureError('Failed to fetch Spotify albums batch', error, {
      albumIdsCount: albumIds.length,
      operation: 'getSpotifyAlbums',
    });
    return [];
  }
}

/**
 * Get multiple tracks in a single request (max 50)
 */
export async function getSpotifyTracks(
  trackIds: string[],
  market: string = 'US'
): Promise<SpotifyTrackFull[]> {
  if (trackIds.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    chunks.push(trackIds.slice(i, i + 50));
  }

  console.info(
    `[spotify] getSpotifyTracks: fetching ${trackIds.length} track(s) in ${chunks.length} chunk(s)`
  );

  const tracks: SpotifyTrackFull[] = [];

  try {
    for (const chunk of chunks) {
      const data = await spotifyClient.requestJson<{
        tracks: SpotifyTrackFull[];
      }>(`/tracks?ids=${chunk.join(',')}&market=${market}`);
      tracks.push(...data.tracks.filter(Boolean));
    }

    return tracks;
  } catch (error) {
    await captureError('Failed to fetch Spotify tracks batch', error, {
      trackIdsCount: trackIds.length,
      operation: 'getSpotifyTracks',
    });
    return [];
  }
}

/**
 * Map Spotify album_type to our release type
 */
export function mapSpotifyAlbumType(
  albumType: SpotifyAlbum['album_type']
): 'single' | 'ep' | 'album' | 'compilation' {
  switch (albumType) {
    case 'single':
      return 'single';
    case 'compilation':
      return 'compilation';
    case 'album':
    default:
      return 'album';
  }
}

/**
 * Parse Spotify release date to Date object
 * Handles year, month, and day precision
 */
export function parseSpotifyReleaseDate(
  releaseDate: string,
  precision: SpotifyAlbum['release_date_precision']
): Date {
  switch (precision) {
    case 'year':
      return new Date(`${releaseDate}-01-01`);
    case 'month':
      return new Date(`${releaseDate}-01`);
    case 'day':
    default:
      return new Date(releaseDate);
  }
}

/**
 * Get the best quality artwork URL from Spotify images
 */
export function getBestSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
  return sorted[0]?.url ?? null;
}

/**
 * Generate a URL-safe slug from a release title
 */
export function generateReleaseSlug(title: string, spotifyId: string): string {
  if (!title || !spotifyId) return '';

  const slugified = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 50);

  const shortId = spotifyId.slice(-6);
  return `${slugified}-${shortId}`;
}

export {
  isSpotifyAvailable,
  type SearchArtistResult,
  spotifyClient,
} from '@/lib/spotify/client';
