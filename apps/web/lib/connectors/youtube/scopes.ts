/** Least-privilege scopes for channel import, thumbnail updates, and analytics. */
export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const;

export const YOUTUBE_OAUTH_SCOPE_STRING = YOUTUBE_OAUTH_SCOPES.join(' ');
