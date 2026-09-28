import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import {
  SPOTIFY_API_BASE,
  SPOTIFY_DEFAULT_TIMEOUT_MS,
} from '@/lib/spotify/env';

export interface SpotifyAccountProfile {
  readonly id: string;
  readonly label: string;
}

/**
 * Fetches the connected Spotify account's profile (`GET /me`). Used to label
 * connector accounts and as the canonical health check for the connection.
 */
export async function getSpotifyAccountProfile(input: {
  readonly accessToken: string;
  readonly fetcher?: typeof serverFetch;
}): Promise<SpotifyAccountProfile> {
  const fetcher = input.fetcher ?? serverFetch;
  const response = await fetcher(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    timeoutMs: SPOTIFY_DEFAULT_TIMEOUT_MS,
    context: 'Spotify account profile',
  });
  if (!response.ok) {
    throw new Error(`Spotify profile check failed with ${response.status}.`);
  }
  const data = (await response.json()) as {
    id?: string;
    email?: string;
    display_name?: string;
  };
  if (!data.id) throw new Error('Spotify profile response missing account id.');
  return {
    id: data.id,
    label: data.email ?? data.display_name ?? data.id,
  };
}
