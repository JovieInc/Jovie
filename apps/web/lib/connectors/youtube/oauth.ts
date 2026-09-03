import { env } from '@/lib/env-server';

export function youtubeOAuthRedirectUri(origin: string): string {
  const base =
    env.YOUTUBE_OAUTH_REDIRECT_URI_BASE ?? `${origin}/api/connectors/youtube`;
  return `${base.replace(/\/$/, '')}/callback`;
}
