/** Least-privilege Google scopes for channel readback and thumbnail upload. */
export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
] as const;

export const YOUTUBE_OAUTH_SCOPE_STRING = YOUTUBE_OAUTH_SCOPES.join(' ');
