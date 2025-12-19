import { env } from '@/lib/env';

// Spotify API configuration
const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;

export class SpotifyApiError extends Error {
  status?: number;
  retryAfterMs?: number | null;

  constructor(message: string, status?: number, retryAfterMs?: number | null) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

export class SpotifyRateLimitError extends SpotifyApiError {
  constructor(message: string, retryAfterMs?: number | null) {
    super(message, 429, retryAfterMs);
    this.name = 'SpotifyRateLimitError';
  }
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyArtist {
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

export interface SpotifyPagedResponse<T> {
  items: T[];
  next: string | null;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: string;
  album_group?: string;
  release_date?: string;
  release_date_precision?: string;
  total_tracks?: number;
  images?: Array<{ url: string; height?: number; width?: number }>;
  external_urls?: { spotify?: string };
}

export interface SpotifyAlbumDetails extends SpotifyAlbum {
  artists?: Array<{ id?: string; name: string }>;
  external_ids?: { upc?: string };
  tracks?: SpotifyPagedResponse<SpotifyAlbumTrack>;
}

export interface SpotifyAlbumTrack {
  id: string;
  name: string;
  track_number?: number;
  disc_number?: number;
  duration_ms?: number;
  explicit?: boolean;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  artists?: Array<{ id?: string; name: string }>;
}

export interface SpotifyTrackDetails extends SpotifyAlbumTrack {
  external_ids?: { isrc?: string };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

// Get Spotify access token
async function getSpotifyToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

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
    const expiresAt = Date.now() + Math.max(data.expires_in - 60, 30) * 1000;

    tokenCache = {
      token: data.access_token,
      expiresAt,
    };

    return data.access_token;
  } catch {
    return null;
  }
}

export async function getSpotifyTokenOrThrow(): Promise<string> {
  const token = await getSpotifyToken();
  if (!token) {
    throw new SpotifyApiError('Spotify credentials are not configured');
  }
  return token;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * 1000 : null;
}

export async function spotifyFetch<T>(url: string, token: string): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      throw new SpotifyRateLimitError(
        'Spotify rate limit exceeded',
        retryAfterMs
      );
    }

    if (!response.ok) {
      throw new SpotifyApiError(
        `Spotify request failed with status ${response.status}`,
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SpotifyApiError) throw error;
    throw new SpotifyApiError(
      error instanceof Error ? error.message : 'Unknown Spotify API error'
    );
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
    const data = await spotifyFetch<SpotifySearchResponse>(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
      )}&type=artist&limit=${limit}`,
      token
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
  const token = await getSpotifyToken();
  if (!token) {
    return null;
  }

  try {
    return await spotifyFetch<SpotifyArtist>(
      `https://api.spotify.com/v1/artists/${artistId}`,
      token
    );
  } catch {
    return null;
  }
}

// Build Spotify artist URL from artist ID
export function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

export function buildSpotifyAlbumUrl(albumId: string): string {
  return `https://open.spotify.com/album/${albumId}`;
}

export function buildSpotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}
