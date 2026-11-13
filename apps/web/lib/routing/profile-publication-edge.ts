import { NextResponse } from 'next/server';
import { readProfilePublished } from '@/lib/profile/publication-read';
import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';
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
 * responses can leave the CDN, the proxy reads the handle's publication from
 * storage right now (one Neon HTTP query, no function hop: the earlier
 * same-origin /api/profile-publication subrequest added ~140ms median and
 * ~550ms tails to every profile document). Missing, withdrawn, renamed-away and deleted handles get a 404 without
 * the cached body; a failed or slow decision gets a 503. A cached success can
 * therefore never authorize a later request.
 *
 * Only single-segment, username-shaped paths that are not reserved and not a
 * real top-level route are gated (STATIC_TOP_LEVEL_ROUTE_SEGMENTS is held equal
 * to the app directory by its guard test).
 */

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

/**
 * Rewrite destination for gated handles: the dedicated DYNAMIC
 * `app/[username]/profile-miss/page.tsx` route, whose notFound() renders the
 * branded `app/[username]/not-found.tsx` boundary server-side with a real
 * 404 status and Next's automatic NonIndex noindex meta (JOV-10267). The
 * destination must stay a non-prerendered route: notFound() thrown during a
 * prerendered ISR route's fallback render serves Next's flight-only
 * `__next_error__` shell instead — no branded body, no robots meta
 * (observed on production and the daily ci.yml dispatch, 2026-11-12).
 */
const PROFILE_MISS_REWRITE_SEGMENTS = 'profile-miss';

function notPublishedResponse(
  handle: string,
  request: ProfilePublicationGateRequest
): NextResponse {
  // Navigation requests get the branded profile 404 (JOV-10267): rewrite
  // into the guarded private render destination instead of serving a bare
  // text body. The cached profile body is still never sent — the rewrite
  // never touches the ISR entry for /<handle>.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const missUrl = new URL(
      `/${encodeURIComponent(handle)}/${PROFILE_MISS_REWRITE_SEGMENTS}`,
      request.nextUrl.origin
    );
    return NextResponse.rewrite(missUrl, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/** The slice of the proxy request the publication gate needs. */
export interface ProfilePublicationGateRequest {
  readonly method: string;
  readonly nextUrl: URL;
}

// Mirrors next.config.js's profileQueryModePattern; the shape pins in
// public-profile-page.test.ts keep the two in sync.
const PROFILE_QUERY_MODES = new Set([
  'listen',
  'pay',
  'subscribe',
  'about',
  'contact',
  'tour',
  'releases',
  'tip',
]);

/**
 * JOV-12081: a published profile's `?mode=` view must render through the
 * guarded mode-render marker destination, but the next.config afterFiles
 * rewrite that owns this never applies to the prerendered profile route
 * (`?mode=listen` silently rendered the home document), and beforeFiles
 * rewrites are contractually reserved for the /hud interceptors — a
 * `/:username`-sourced beforeFiles rewrite would hijack concrete
 * single-segment pages that carry a mode query. The proxy runs per request
 * ahead of the ISR cache, so the rewrite happens here, URL unchanged.
 * The rewrite is bounded to the (handle, mode) pairs the mode-render route
 * actually prerenders (`aliasBudgetProfileModeParams`, the same constant its
 * generateStaticParams consumes). The route's ISR fallback render for a
 * handle the build did not prerender serves a 404, not the profile: the
 * production-faithful Golden Path polled a freshly claimed, published,
 * exempt profile at `/{handle}?mode=listen` for 180 s on run 43433399178 and
 * every response was 404 (JOV-12481, regressed by the unbounded rewrite),
 * while the canonical `/[username]` render of the same handle works. Any
 * other handle keeps the canonical render — the pre-JOV-12081 behavior,
 * which is what production serves today — until the fallback-render defect
 * is fixed with deployment-level evidence.
 */
const PRERENDERED_PROFILE_MODE_PARAMS: ReadonlySet<string> = new Set(
  aliasBudgetProfileModeParams().map(
    param => `${param.username}:${param.profileMode}`
  )
);

export function getProfileModeQueryRewrite(
  request: ProfilePublicationGateRequest
): NextResponse | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const handle = getGatedProfileHandle(request.nextUrl.pathname);
  if (!handle) return null;
  const mode = request.nextUrl.searchParams.get('mode');
  if (!mode || !PROFILE_QUERY_MODES.has(mode)) return null;
  if (!PRERENDERED_PROFILE_MODE_PARAMS.has(`${handle}:${mode}`)) return null;
  const rewriteUrl = new URL(
    `/${encodeURIComponent(handle)}/profile-mode-render/${mode}/__profile-mode-alias`,
    request.nextUrl.origin
  );
  return NextResponse.rewrite(rewriteUrl);
}

/**
 * Returns a terminal response when the cached profile body must not be
 * served, or null when the handle is published (or the path is not a
 * profile).
 */
/**
 * Returns a terminal response when the cached profile body must not be
 * served, or null when the handle is published (or the path is not a
 * profile).
 */
export async function gateProfilePublicationAtEdge(
  request: ProfilePublicationGateRequest,
  readPublished: (handle: string) => Promise<boolean> = readProfilePublished
): Promise<NextResponse | null> {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return null;
  }
  const handle = getGatedProfileHandle(request.nextUrl.pathname);
  if (!handle) return null;
  if (FIXTURE_RENDERED_HANDLES.has(handle) && isFixtureRuntime()) return null;
  try {
    return (await readPublished(handle))
      ? null
      : notPublishedResponse(handle, request);
  } catch {
    return unavailableResponse();
  }
}
