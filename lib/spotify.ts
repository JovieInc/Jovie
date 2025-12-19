import { env } from '@/lib/env-server';

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
