/**
 * Shared client for GET /api/profile/capture-dismissal.
 *
 * Multiple profile components (PAC card, inline notifications CTA) need the
 * same suppression state on page load. Deduplicate into one in-flight +
 * cached request per artist so the server sees a single status check per
 * page view (the endpoint increments a session counter when suppressed, so
 * duplicate fetches also double-counted sessions).
 */

export interface CaptureDismissalStatus {
  readonly suppressed?: boolean;
  readonly sessionCount?: number;
  readonly nextEligibleAt?: string | null;
}

const statusCache = new Map<string, Promise<CaptureDismissalStatus | null>>();

export function getCaptureDismissalStatus(
  artistId: string
): Promise<CaptureDismissalStatus | null> {
  const cached = statusCache.get(artistId);
  if (cached) return cached;

  const request = fetch(
    `/api/profile/capture-dismissal?artist_id=${encodeURIComponent(artistId)}`,
    { credentials: 'same-origin' }
  )
    .then(res =>
      res.ok ? (res.json() as Promise<CaptureDismissalStatus>) : null
    )
    .catch(() => null);

  statusCache.set(artistId, request);
  return request;
}

/** Drop the cached status (e.g. after a successful dismissal POST). */
export function invalidateCaptureDismissalStatus(artistId: string): void {
  statusCache.delete(artistId);
}
