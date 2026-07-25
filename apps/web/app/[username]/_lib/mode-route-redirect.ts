import { NextResponse } from 'next/server';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileModeHref } from '@/features/profile/registry';

type RedirectSourceSearchParams = {
  readonly source?: string | string[];
};

function normalizeSource(
  source: string | string[] | undefined
): string | undefined {
  if (typeof source === 'string' && source.length > 0) {
    return source;
  }

  if (Array.isArray(source)) {
    return source.find(value => value.length > 0);
  }

  return undefined;
}

export function getProfileModeRedirectHref(
  username: string,
  searchParams: RedirectSourceSearchParams | undefined,
  mode: Exclude<ProfileMode, 'profile'>
) {
  const source = normalizeSource(searchParams?.source);
  const searchSuffix = source
    ? `source=${encodeURIComponent(source)}`
    : undefined;

  return getProfileModeHref(username, mode, searchSuffix);
}

export function getRouteRedirectSearchParams(searchParams: URLSearchParams) {
  const sourceValues = searchParams.getAll('source').filter(Boolean);

  if (sourceValues.length === 0) {
    return undefined;
  }

  return {
    source: sourceValues.length === 1 ? sourceValues[0] : sourceValues,
  } satisfies RedirectSourceSearchParams;
}

/**
 * Hard HTTP 307 response for the legacy mode redirect sinks
 * (/{username}/tour|tip|listen|releases|music|subscribe).
 *
 * These MUST be route handlers, not pages calling `redirect()`: the
 * segment's loading.tsx streams the shell (status 200) before a page-level
 * `redirect()` throws, so a page sink can only deliver a client-side
 * streamed redirect — never the hard 307 the sinks promise. A route handler
 * owns the whole response, so the 307 + Location header are authoritative.
 */
export function profileModeRedirectResponse(
  requestUrl: string,
  username: string,
  searchParams: RedirectSourceSearchParams | undefined,
  mode: Exclude<ProfileMode, 'profile'>
): NextResponse {
  const href = searchParams
    ? getProfileModeRedirectHref(username, searchParams, mode)
    : getProfileModeHref(username, mode);
  return NextResponse.redirect(new URL(href, requestUrl), 307);
}
