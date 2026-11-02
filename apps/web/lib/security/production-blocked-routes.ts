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
  '/demo/',
  '/dev/',
  '/engineering/preview/',
  '/exp/',
  '/sandbox',
  '/spinner-test',
  '/sentry-example-page',
  '/ui/',
] as const;

/** Exact page paths outside the prefix lists above. */
export const PRODUCTION_BLOCKED_PAGE_EXACT = [
  '/demo',
  // Draft engineering stories (lib/engineering-publication.ts selectPreviewStories).
  '/engineering/preview',
  '/sandbox',
  '/spinner-test',
  '/sentry-example-page',
] as const;

/**
 * Production builds used by the Product Screenshots workflow still capture
 * exact catalog fixtures. Keep the inventory exact so the proxy can allow
 * only those pathnames for local screenshot automation, without reopening
 * other /demo or /exp routes. Query strings are not part of the match.
 */
export const PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS = [
  '/exp/shell-v1',
  '/demo',
  '/demo/audience',
  '/demo/showcase/analytics',
  '/demo/showcase/earnings',
  '/demo/showcase/links',
  '/demo/showcase/releases',
  '/demo/showcase/settings',
  '/demo/showcase/release-tracked-links',
  '/demo/showcase/release-landing',
  '/demo/showcase/release-presave',
  '/demo/showcase/release-tasks',
  '/demo/showcase/tim-white-profile',
  '/demo/showcase/music-ai-command',
  '/demo/showcase/shell-lyrics',
  '/demo/showcase/shell-library',
  '/demo/showcase/shell-track',
  '/demo/showcase/onboarding-handle',
  '/demo/showcase/onboarding-dsp',
  '/demo/showcase/onboarding-profile-review',
  '/demo/showcase/public-profile',
] as const;

/**
 * Routes that intentionally stay reachable outside development.
 * Keep this list tiny and justify every entry in code review.
 */
export const DEVELOPMENT_ROUTE_PROXY_ALLOWLIST = [
  '/sidebar-demo',
  // Intentional sales surface (JOV-7606): the demo video page stays reachable
  // in production while the rest of /demo is blocked. Its /demovideo alias is
  // outside the /demo prefix and needs no entry here.
  '/demo/video',
] as const;

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

export function isProductScreenshotCapturePath(pathname: string): boolean {
  return (PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS as readonly string[]).includes(
    pathname
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

interface ProductionBlockedDebugPathOptions {
  readonly allowProductScreenshotCaptureRoutes?: boolean;
}

/** Decode only for denial: encoded spellings never gain a fixture exemption. */
function debugDenialPaths(pathname: string): string[] | null {
  const paths = [pathname];
  let decoded = pathname;
  for (let depth = 0; depth < 3; depth++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      // A literal "%" left after a valid decode (e.g. /tim/100%25-real ->
      // /tim/100%-real) is the final form, not an evasion: every stage so far
      // is still checked. A malformed first pass stays fail-closed.
      return depth === 0 ? null : normalizedDenialPaths(paths, decoded);
    }
    if (next === decoded) return normalizedDenialPaths(paths, decoded);
    decoded = next;
    paths.push(decoded);
  }
  // Keep deeply encoded request paths fail-closed and bounded.
  try {
    if (decodeURIComponent(decoded) !== decoded) return null;
  } catch {
    return normalizedDenialPaths(paths, decoded);
  }
  return normalizedDenialPaths(paths, decoded);
}

function normalizedDenialPaths(
  paths: string[],
  decoded: string
): string[] | null {
  try {
    return [...paths, new URL('http://localhost' + decoded).pathname];
  } catch {
    return null;
  }
}

export function isProductionBlockedDebugPath(
  pathname: string,
  options: ProductionBlockedDebugPathOptions = {}
): boolean {
  const deniedPaths = debugDenialPaths(pathname);
  if (deniedPaths === null) return true;
  const literalPath = deniedPaths.every(path => path === pathname);

  if (literalPath && isProxyAllowlistedDevelopmentRoute(pathname)) {
    return false;
  }

  if (
    options.allowProductScreenshotCaptureRoutes === true &&
    isProductScreenshotCapturePath(pathname)
  ) {
    return false;
  }

  if (
    literalPath &&
    DEVELOPMENT_ROUTE_PROXY_API_ALLOWLIST.some(
      allowed => pathname === allowed || pathname.startsWith(`${allowed}/`)
    )
  ) {
    return false;
  }

  return deniedPaths.some(
    path =>
      PRODUCTION_BLOCKED_API_PREFIXES.some(prefix =>
        matchesRoutePrefix(path, prefix)
      ) ||
      (PRODUCTION_BLOCKED_PAGE_EXACT as readonly string[]).includes(path) ||
      PRODUCTION_BLOCKED_PAGE_PREFIXES.some(prefix => path.startsWith(prefix))
  );
}
