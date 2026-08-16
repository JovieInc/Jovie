/**
 * Shared client for GET /api/profile/capture-dismissal.
 *
 * Multiple profile components (PAC card, inline notifications CTA) need the
 * same suppression state on page load. Deduplicate into one in-flight +
 * cached request per artist so the server sees a single status check per
 * page view (the endpoint increments a session counter when suppressed, so
 * duplicate fetches also double-counted sessions).
 */

import { DEMO_PROFILE_ID } from '@/lib/demo-personas';

export interface CaptureDismissalStatus {
  readonly suppressed?: boolean;
  readonly sessionCount?: number;
  readonly nextEligibleAt?: string | null;
  readonly degraded?: boolean;
  readonly clientFallback?: boolean;
}

interface CaptureDismissalAcceptance {
  readonly accepted?: boolean;
  readonly degraded?: boolean;
  readonly nextEligibleAt?: string | null;
}

const CLIENT_FALLBACK_PREFIX = 'jv_capture_dismissal';
const CLIENT_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const statusCache = new Map<string, Promise<CaptureDismissalStatus | null>>();

function fallbackKey(artistId: string) {
  return `${CLIENT_FALLBACK_PREFIX}:${artistId}`;
}

function readClientFallback(
  artistId: string,
  now = Date.now()
): CaptureDismissalStatus | null {
  try {
    const raw = globalThis.localStorage?.getItem(fallbackKey(artistId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { nextEligibleAt?: unknown };
    const expiresAt =
      typeof parsed.nextEligibleAt === 'string'
        ? Date.parse(parsed.nextEligibleAt)
        : Number.NaN;
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + CLIENT_FALLBACK_MAX_AGE_MS
    ) {
      globalThis.localStorage?.removeItem(fallbackKey(artistId));
      return null;
    }
    return {
      suppressed: true,
      nextEligibleAt: new Date(expiresAt).toISOString(),
      degraded: true,
      clientFallback: true,
    };
  } catch {
    return null;
  }
}

function persistClientFallback(
  artistId: string,
  nextEligibleAt: string,
  now = Date.now()
): boolean {
  const requestedExpiry = Date.parse(nextEligibleAt);
  if (!Number.isFinite(requestedExpiry) || requestedExpiry <= now) return false;
  const boundedExpiry = Math.min(
    requestedExpiry,
    now + CLIENT_FALLBACK_MAX_AGE_MS
  );
  try {
    globalThis.localStorage?.setItem(
      fallbackKey(artistId),
      JSON.stringify({ nextEligibleAt: new Date(boundedExpiry).toISOString() })
    );
    return true;
  } catch {
    return false;
  }
}

export function getCaptureDismissalStatus(
  artistId: string
): Promise<CaptureDismissalStatus | null> {
  // Demo previews render the profile UI without a backing artist row; the
  // endpoint would reject the lookup with 400 (JOV-4932).
  if (artistId === DEMO_PROFILE_ID) return Promise.resolve(null);

  const cached = statusCache.get(artistId);
  if (cached) return cached;

  const clientFallback = readClientFallback(artistId);

  const request = fetch(
    `/api/profile/capture-dismissal?artist_id=${encodeURIComponent(artistId)}`,
    { credentials: 'same-origin' }
  )
    .then(async res => {
      const serverStatus = res.ok
        ? ((await res.json()) as CaptureDismissalStatus)
        : null;
      if (serverStatus?.suppressed) return serverStatus;
      return clientFallback ?? serverStatus;
    })
    .catch(() => clientFallback);

  statusCache.set(artistId, request);
  return request;
}

/** Drop the cached status (e.g. after a successful dismissal POST). */
export function invalidateCaptureDismissalStatus(artistId: string): void {
  statusCache.delete(artistId);
}

/**
 * Persist an accepted degraded dismissal for the same seven-day window as the
 * durable server record. Storage is origin-bound and expiry-clamped so a bad
 * response can never create an unbounded client suppression.
 */
export async function handleCaptureDismissalResponse(
  artistId: string,
  response: Response
): Promise<void> {
  if (!response.ok) return;

  let acceptance: CaptureDismissalAcceptance | null = null;
  try {
    acceptance = (await response.json()) as CaptureDismissalAcceptance;
  } catch {
    // Older healthy responses may not include a JSON acceptance contract.
  }

  if (
    acceptance?.accepted === true &&
    acceptance.degraded === true &&
    typeof acceptance.nextEligibleAt === 'string'
  ) {
    persistClientFallback(artistId, acceptance.nextEligibleAt);
  }
  invalidateCaptureDismissalStatus(artistId);
}
