/**
 * Route prefixes blocked outside explicit development environments.
 *
 * Used by proxy.ts for edge defence-in-depth and by contract tests to keep the
 * debug/test surface inventory explicit.
 */

export const PRODUCTION_BLOCKED_API_PREFIXES = [
  '/api/dev/',
  '/api/test/',
  '/api/sentry-example-api',
] as const;

export const PRODUCTION_BLOCKED_PAGE_PREFIXES = [
  '/dev/',
  '/exp/',
  '/sandbox',
  '/spinner-test',
  '/sentry-example-page',
  '/ui/',
] as const;

/** Exact page paths outside the prefix lists above. */
export const PRODUCTION_BLOCKED_PAGE_EXACT = [
  '/sandbox',
  '/spinner-test',
  '/sentry-example-page',
] as const;

/**
 * Routes that intentionally stay reachable outside development.
 * Keep this list tiny and justify every entry in code review.
 */
export const DEVELOPMENT_ROUTE_PROXY_ALLOWLIST = ['/sidebar-demo'] as const;

/**
 * API routes that carry their own env/auth gates and must not be short-circuited
 * by the blanket /api/dev proxy block.
 */
export const DEVELOPMENT_ROUTE_PROXY_API_ALLOWLIST = [
  '/api/dev/test-auth/mobile-provider-complete',
] as const;

export function isProxyAllowlistedDevelopmentRoute(pathname: string): boolean {
  return DEVELOPMENT_ROUTE_PROXY_ALLOWLIST.some(
    allowed => pathname === allowed || pathname.startsWith(`${allowed}/`)
  );
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) {
    return true;
  }

  if (prefix.endsWith('/')) {
    return pathname.startsWith(prefix);
  }

  return pathname.startsWith(`${prefix}/`);
}

export function isProductionBlockedDebugPath(pathname: string): boolean {
  if (isProxyAllowlistedDevelopmentRoute(pathname)) {
    return false;
  }

  if (
    DEVELOPMENT_ROUTE_PROXY_API_ALLOWLIST.some(
      allowed => pathname === allowed || pathname.startsWith(`${allowed}/`)
    )
  ) {
    return false;
  }

  if (
    PRODUCTION_BLOCKED_API_PREFIXES.some(prefix =>
      matchesRoutePrefix(pathname, prefix)
    )
  ) {
    return true;
  }

  if (PRODUCTION_BLOCKED_PAGE_EXACT.some(exactPath => pathname === exactPath)) {
    return true;
  }

  return PRODUCTION_BLOCKED_PAGE_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );
}
