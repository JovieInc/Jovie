import { env } from '@/lib/env-server';

export function spotifyOAuthRedirectUri(origin: string): string {
  const base =
    env.SPOTIFY_OAUTH_REDIRECT_URI_BASE ?? `${origin}/api/connectors/spotify`;
  return `${base.replace(/\/$/, '')}/callback`;
}
