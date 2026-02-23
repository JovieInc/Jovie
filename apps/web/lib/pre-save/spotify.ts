import { Buffer } from 'node:buffer';
import { env } from '@/lib/env-server';

const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function spotifyAuthHeader(): string {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify OAuth credentials are not configured');
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export function buildSpotifyAuthorizeUrl(state: string, redirectUri: string) {
  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set('client_id', env.SPOTIFY_CLIENT_ID ?? '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'user-library-modify user-read-email');
  url.searchParams.set('state', state);
  url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

export async function exchangeSpotifyCode(params: {
  code: string;
  redirectUri: string;
}): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: spotifyAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Spotify code exchange failed: ${response.status}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: spotifyAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function fetchSpotifyMe(accessToken: string): Promise<{
  id: string;
  email?: string;
}> {
  const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify /me failed: ${response.status}`);
  }

  return (await response.json()) as { id: string; email?: string };
}

export async function saveReleaseToSpotifyLibrary(params: {
  accessToken: string;
  spotifyReleaseId: string;
  isTrack: boolean;
}) {
  const endpoint = params.isTrack ? 'tracks' : 'albums';
  const key = params.isTrack ? 'ids' : 'ids';
  const url = `${SPOTIFY_API_BASE}/me/${endpoint}?${key}=${encodeURIComponent(params.spotifyReleaseId)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify save failed: ${response.status}`);
  }
}
