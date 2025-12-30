/**
 * Spotify album operations
 */

import { getSpotifyToken } from './auth';
import type { SpotifyAlbumFull } from './types';

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
      console.error('Spotify API error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Spotify album:', error);
    return null;
  }
}

/**
 * Get multiple albums in a single request (max 20 per request)
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
        console.error('Spotify API error:', response.status);
        continue;
      }

      const data: { albums: SpotifyAlbumFull[] } = await response.json();
      albums.push(...data.albums.filter(Boolean));
    }

    return albums;
  } catch (error) {
    console.error('Failed to fetch Spotify albums:', error);
    return [];
  }
}
