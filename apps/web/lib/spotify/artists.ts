/**
 * Spotify artist operations
 */

import { getSpotifyToken } from './auth';
import type {
  GetArtistAlbumsOptions,
  SpotifyAlbum,
  SpotifyAlbumsResponse,
  SpotifyArtist,
  SpotifySearchResponse,
} from './types';

/**
 * Search for artists on Spotify
 */
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

/**
 * Get artist details from Spotify
 */
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

/**
 * Get all albums for an artist from Spotify
 * Fetches singles, albums, and compilations
 */
export async function getSpotifyArtistAlbums(
  artistId: string,
  options: GetArtistAlbumsOptions = {}
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
        console.error(
          'Spotify API error:',
          response.status,
          await response.text()
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
    console.error('Failed to fetch Spotify artist albums:', error);
    return [];
  }
}
