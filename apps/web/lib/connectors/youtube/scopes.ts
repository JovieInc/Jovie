/**
 * Least-privilege scopes and upload constraints for thumbnail changes.
 *
 * Google Cloud project requirements (Tim-provisioned OAuth client):
 * - Enable YouTube Data API v3
 * - Register redirect URI: `{YOUTUBE_OAUTH_REDIRECT_URI_BASE|/api/connectors/youtube}/callback`
 * - Reuses GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Custom thumbnail eligibility depends on channel verification status at Google.
 */

export const YOUTUBE_OAUTH_SCOPES = [
  /** Read channel + video metadata; required for list/get. */
  'https://www.googleapis.com/auth/youtube.readonly',
  /** Upload custom thumbnails via thumbnails.set. */
  'https://www.googleapis.com/auth/youtube.upload',
] as const;

export type YoutubeOauthScope = (typeof YOUTUBE_OAUTH_SCOPES)[number];

export function hasYouTubeThumbnailUploadScope(
  scopes: readonly string[]
): boolean {
  return scopes.includes('https://www.googleapis.com/auth/youtube.upload');
}

export function parseYouTubeChannelIdentity(value: unknown): {
  id: string;
  title: string | null;
} | null {
  if (!value || typeof value !== 'object') return null;
  const items = Reflect.get(value, 'items');
  if (!Array.isArray(items) || !items[0] || typeof items[0] !== 'object')
    return null;
  const id = Reflect.get(items[0], 'id');
  if (typeof id !== 'string' || id.length === 0) return null;
  const snippet = Reflect.get(items[0], 'snippet');
  const title =
    snippet && typeof snippet === 'object'
      ? Reflect.get(snippet, 'title')
      : null;
  return { id, title: typeof title === 'string' ? title : null };
}

/** Space-joined scope string for the OAuth authorize URL. */
export const YOUTUBE_OAUTH_SCOPE_STRING = YOUTUBE_OAUTH_SCOPES.join(' ');

/** Max image size for thumbnails.set (YouTube API: 2 MiB). */
export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export const YOUTUBE_THUMBNAIL_MIME_TYPES = [
  'image/jpeg',
  'image/png',
] as const;

export type YoutubeThumbnailMimeType =
  (typeof YOUTUBE_THUMBNAIL_MIME_TYPES)[number];
