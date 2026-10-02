/**
 * Least-privilege scopes for channel import, thumbnail updates, analytics,
 * and posting human-approved comment replies (`youtube.force-ssl`).
 */
export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
] as const;

export const YOUTUBE_OAUTH_SCOPE_STRING = YOUTUBE_OAUTH_SCOPES.join(' ');
