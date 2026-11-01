import { NextResponse } from 'next/server';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { STATIC_TOP_LEVEL_ROUTE_SEGMENTS } from './static-top-level-route-segments';

/**
 * Fresh publication gate for ISR-cached public profiles (JOV-8629 §6.2).
 *
 * `/<username>` (and its `?mode=` rewrites, RSC and prefetch requests, which
 * share the path) is served from the one-hour ISR cache. Before any of those
 * responses can leave the CDN, the proxy asks the uncached
 * /api/profile-publication endpoint whether the handle is published right
 * now. Missing, withdrawn, renamed-away and deleted handles get a 404 without
 * the cached body; a failed or slow decision gets a 503. A cached success can
 * therefore never authorize a later request.
 *
 * Only single-segment, username-shaped paths that are not reserved and not a
 * real top-level route are gated (STATIC_TOP_LEVEL_ROUTE_SEGMENTS is held equal
 * to the app directory by its guard test).
 */

export const PROFILE_PUBLICATION_DECISION_PATH = '/api/profile-publication';
const PROFILE_PUBLICATION_DECISION_TIMEOUT_MS = 2_500;

/**
 * Handles `app/[username]/page.tsx` renders from a built-in fixture without
 * reading storage (the reserved `/unfazed` capture profile and the screen-cert
 * smart-link fixture). The exemption applies only on a managed fixture runtime
 * (E2E/smoke env) and never on a real production deployment, so a DB-backed
 * profile with one of these handles always goes through the gate in production.
 */
const FIXTURE_RENDERED_HANDLES: ReadonlySet<string> = new Set([
  'unfazed',
  'jovie-screen-fixture',
]);

function isFixtureRuntime(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false;
  return (
    process.env.PUBLIC_NOAUTH_SMOKE === '1' ||
    process.env.NEXT_PUBLIC_E2E_MODE === '1'
  );
}

export function isProfilePublicationCandidate(segment: string): boolean {
  const handle = segment.toLowerCase();
  return (
    handle.length >= USERNAME_MIN_LENGTH &&
    handle.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(handle) &&
    !isReservedUsername(handle) &&
    !STATIC_TOP_LEVEL_ROUTE_SEGMENTS.has(handle)
  );
}

/** Returns the handle a request would render through `app/[username]/page.tsx`, if any. */
export function getGatedProfileHandle(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(segments[0] ?? '');
  } catch {
    return null;
  }
  return isProfilePublicationCandidate(segment) ? segment.toLowerCase() : null;
}

function unavailableResponse(): NextResponse {
  return new NextResponse('Profile temporarily unavailable', {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Retry-After': '5',
    },
  });
}

function notPublishedResponse(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/**
 * Returns a terminal response when the cached profile body must not be
 * served, or null when the handle is published (or the path is not a
 * profile).
 */
function decisionRequestHeaders(
  cookieHeader: string | null,
  bypassHeader: string | null
): Record<string, string> {
  const headers: Record<string, string> = {};
  // Forwarded so protected deployments let the same-origin subrequest
  // through; the endpoint itself reads no visitor state.
  if (cookieHeader) headers.cookie = cookieHeader;
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || bypassHeader;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  return headers;
}

export async function gateProfilePublicationAtEdge(
  pathname: string,
  origin: string,
  cookieHeader: string | null,
  bypassHeader: string | null = null
): Promise<NextResponse | null> {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return null;
  }
  const handle = getGatedProfileHandle(pathname);
  if (!handle) return null;
  if (FIXTURE_RENDERED_HANDLES.has(handle) && isFixtureRuntime()) return null;

  const decisionUrl = new URL(PROFILE_PUBLICATION_DECISION_PATH, origin);
  decisionUrl.searchParams.set('username', handle);
  try {
    const response = await fetch(decisionUrl, {
      cache: 'no-store',
      headers: decisionRequestHeaders(cookieHeader, bypassHeader),
      signal: AbortSignal.timeout(PROFILE_PUBLICATION_DECISION_TIMEOUT_MS),
    });
    if (!response.ok) return unavailableResponse();
    const payload = (await response.json()) as { published?: unknown };
    if (payload?.published === true) return null;
    if (payload?.published === false) return notPublishedResponse();
    return unavailableResponse();
  } catch {
    return unavailableResponse();
  }
}
