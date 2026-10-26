/** Read by the edge rewrites on the NEXT visit (see profile-variant-rewrites). */
export const RETURNING_COOKIE = 'jv_returning';
export const RETURNING_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/** Expires the marker. Called on consent withdrawal (see consent.ts). */
export function clearReturningMarker(handle?: string): void {
  if (typeof document === 'undefined') return;
  const expired = 'Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = `${RETURNING_COOKIE}=; Path=/; Expires=${expired}`;
  if (handle) {
    document.cookie = `${RETURNING_COOKIE}=; Path=/${handle.toLowerCase()}; Expires=${expired}`;
  }
}
