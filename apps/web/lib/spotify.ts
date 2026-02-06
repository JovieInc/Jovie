import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

// Spotify API configuration
const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: Array<{ url: string; height: number; width: number }>;
  popularity: number;
  followers?: { total: number };
}

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
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

export interface SpotifyAlbumFull extends SpotifyAlbum {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    next: string | null;
  };
  label: string;
  popularity: number;
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

// Get Spotify access token
async function getSpotifyToken(): Promise<string | null> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return null;
    }

    const data: SpotifyTokenResponse = await response.json();
    return data.access_token;
  } catch {
    return null;
  }
}

// Search for artists on Spotify
export async function searchSpotifyArtists(
  query: string,
  limit: number = 5
): Promise<SpotifyArtist[]> {
  const token = await getSpotifyToken();
  if (!token) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
      )}&type=artist&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data: SpotifySearchResponse = await response.json();
    return data.artists.items;
  } catch {
    return [];
  }
}

// Get artist details from Spotify
export async function getSpotifyArtist(
  artistId: string
): Promise<SpotifyArtist | null> {
  const token = await getSpotifyToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
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
  const token = await getSpotifyToken();
  if (!token) {
    return [];
  }

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

      const response = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/albums?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        await captureError(
          'Spotify artist albums API error',
          new Error(`Status ${response.status}: ${errorText}`),
          {
            artistId,
            status: response.status,
            operation: 'getSpotifyArtistAlbums',
          }
        );
        break;
      }

      const data: SpotifyAlbumsResponse = await response.json();
      albums.push(...data.items);

      // Check if there are more albums to fetch
      if (data.next && albums.length < data.total) {
        offset += limit;
      } else {
        hasMore = false;
      }

      // Safety limit to prevent infinite loops
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
  const token = await getSpotifyToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/albums/${albumId}?market=${market}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      await captureError(
        'Spotify album API error',
        new Error(`Status ${response.status}`),
        {
          albumId,
          status: response.status,
          operation: 'getSpotifyAlbum',
        }
      );
      return null;
    }

    return await response.json();
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
  const token = await getSpotifyToken();
  if (!token || albumIds.length === 0) {
    return [];
  }

  // Spotify API allows max 20 albums per request
  const chunks: string[][] = [];
  for (let i = 0; i < albumIds.length; i += 20) {
    chunks.push(albumIds.slice(i, i + 20));
  }

  const albums: SpotifyAlbumFull[] = [];

  try {
    for (const chunk of chunks) {
      const response = await fetch(
        `https://api.spotify.com/v1/albums?ids=${chunk.join(',')}&market=${market}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        await captureError(
          'Spotify albums batch API error',
          new Error(`Status ${response.status}`),
          {
            albumIds: chunk,
            status: response.status,
            operation: 'getSpotifyAlbums',
          }
        );
        continue;
      }

      const data: { albums: SpotifyAlbumFull[] } = await response.json();
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

  // Sort by height descending and return the largest
  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
  return sorted[0]?.url ?? null;
}

/**
 * Generate a URL-safe slug from a release title
 */
export function generateReleaseSlug(title: string, spotifyId: string): string {
  // Guard against undefined to prevent runtime errors
  if (!title || !spotifyId) return '';

  const slugified = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 50);

  // Append short ID for uniqueness
  const shortId = spotifyId.slice(-6);
  return `${slugified}-${shortId}`;
}
