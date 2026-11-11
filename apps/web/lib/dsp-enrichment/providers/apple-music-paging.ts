/** Album page cap per artist: 10 pages of 100 covers any real catalog. */
export const MAX_ALBUM_PAGES = 10;

/**
 * MusicKit's `next` cursor is a path like `/v1/catalog/us/artists/1/albums?offset=100`.
 * Returns the path to request next (without `/v1`, keeping the page size), or
 * null when there is no next page or the cursor is not an API path.
 */
export function nextAlbumsPath(
  next: string | undefined,
  limit: number
): string | null {
  if (!next?.startsWith('/v1/')) return null;
  const path = next.slice('/v1'.length);
  if (/[?&]limit=/.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}limit=${limit}`;
}
