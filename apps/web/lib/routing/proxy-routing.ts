import { HOSTNAME, STAGING_HOSTNAMES } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { isReservedUsername } from '@/lib/validation/username-core';

export interface PathCategory {
  needsNonce: boolean;
  isProtectedPath: boolean;
  isAuthPath: boolean;
  isAuthCallbackPath: boolean;
  isSensitiveAPI: boolean;
  /** Public profile candidate username (single-segment, non-reserved). Null for all non-profile paths including /start, /pricing, /about, /investors etc. */
  publicProfileCandidate: string | null;
}

export interface HostInfo {
  isMainHost: boolean;
  isDevOrPreview: boolean;
  isMeetJovie: boolean;
  isSupportHost: boolean;
  isInvestorPortal: boolean;
}

/** Check if pathname matches a route (exact or prefix) */
export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

// Legacy subdomain set — kept for redirect to /investor-portal
const INVESTOR_HOSTNAMES = new Set([
  `investors.${HOSTNAME}`,
  'investors.localhost',
  'investors.jov.ie',
]);

/**
 * Derive single-segment root routes from APP_ROUTES (e.g. /start, /pricing,
 * /about, /investors, /support, /app, /billing, ...). These are never usernames.
 * Adding a new top-level route to APP_ROUTES automatically reserves it here.
 * This replaces the previous hand-maintained MIDDLEWARE_SYSTEM_SEGMENTS list
 * for app-level routes and fixes the public-profile route-classification bug.
 */
function getAppRoutesReservedSegments(): Set<string> {
  const segments = new Set<string>();
  for (const value of Object.values(APP_ROUTES)) {
    if (typeof value !== 'string' || !value.startsWith('/')) continue;
    const rest = value.slice(1);
    if (rest.length > 0 && !rest.includes('/')) {
      segments.add(rest);
    }
  }
  return segments;
}

const APP_ROUTES_RESERVED = getAppRoutesReservedSegments();

// True system/Next.js/security paths (never app routes, never usernames).
const SYSTEM_RESERVED_SEGMENTS = new Set([
  '.env',
  '_next',
  'favicon.ico',
  'og',
  'go',
  'out',
  '__clerk',
  'clerk',
  'phpmyadmin',
  'sidebar-demo',
  'sentry-example-page',
  'sentry-example-api',
  'investor-portal',
  'wordpress',
  'wp',
  'wp-admin',
  'xmlrpc.php',
]);

// Auth single-segment paths (some not enumerated in APP_ROUTES).
const AUTH_RESERVED_SEGMENTS = new Set([
  APP_ROUTES.SIGNIN.slice(1),
  APP_ROUTES.SIGNUP.slice(1),
  APP_ROUTES.SIGNIN_HYPHEN.slice(1),
  APP_ROUTES.SIGNUP_HYPHEN.slice(1),
  APP_ROUTES.SSO_CALLBACK.slice(1),
  APP_ROUTES.AUTH_RETURN.slice(1),
  APP_ROUTES.DESKTOP_AUTH.slice(1),
  APP_ROUTES.MOBILE_AUTH_RETURN.slice(1),
]);

const ALL_RESERVED_ROOT_SEGMENTS = new Set<string>([
  ...SYSTEM_RESERVED_SEGMENTS,
  ...AUTH_RESERVED_SEGMENTS,
  ...APP_ROUTES_RESERVED,
]);

/** True when a single-segment path is a known app/system route (not a handle). */
export function isDedicatedRootSegment(segment: string): boolean {
  return ALL_RESERVED_ROOT_SEGMENTS.has(segment);
}

/**
 * Returns the candidate username for a public profile path, or null.
 * Pure, synchronous, edge-compatible, fully testable.
 * /start, /pricing, /about, /investors, /waitlist, /app etc. all return null.
 */
export function getPublicProfileCandidate(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  // Profile routes are a single path segment (no subroutes like /username/claim)
  if (parts.length !== 1) return null;

  const segment = parts[0];
  if (ALL_RESERVED_ROOT_SEGMENTS.has(segment)) return null;
  if (isReservedUsername(segment)) return null;

  // Username bounds from lib/validation/username-core.ts
  if (segment.length < 3 || segment.length > 30) return null;

  // Basic character check (mirrors USERNAME_PATTERN) — no content filter needed
  // here; invalid/non-existent usernames simply return no DB rows.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/.test(segment))
    return null;

  return segment;
}

/** Pure helper: does this path require the (expensive) audience block DB lookup? */
export function isPublicProfileAudienceBlockCandidate(
  pathname: string
): boolean {
  return getPublicProfileCandidate(pathname) !== null;
}

/**
 * Paths the proxy must NOT rewrite based on user state. The page component
 * handles its own auth/state logic.
 *
 * Moved here so the single route-policy module owns rewrite exemptions.
 */
export function isProxyRewriteExempt(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return true;
  if (pathname === '/app' || pathname.startsWith('/app/')) return true;
  if (pathname === APP_ROUTES.START) return true;
  if (pathname === APP_ROUTES.ONBOARDING) return true;
  if (pathname === APP_ROUTES.ONBOARDING_CHECKOUT) return true;
  if (pathname === APP_ROUTES.MOBILE_AUTH_RETURN) return true;
  return false;
}

/**
 * Categorize a pathname once for all routing decisions.
 * Eliminates redundant path matching throughout the middleware.
 * Now also owns public-profile candidate detection (derived from APP_ROUTES).
 */
export function categorizePath(pathname: string): PathCategory {
  const isAuthPath =
    pathname === APP_ROUTES.SIGNIN ||
    pathname === APP_ROUTES.SIGNIN_HYPHEN ||
    pathname === APP_ROUTES.SIGNUP ||
    pathname === APP_ROUTES.SIGNUP_HYPHEN;

  const isAuthCallbackPath =
    pathname === APP_ROUTES.AUTH_CALLBACK ||
    pathname === APP_ROUTES.LEGACY_APP_AUTH_CALLBACK ||
    pathname === APP_ROUTES.SSO_CALLBACK ||
    pathname === APP_ROUTES.SIGNUP_SSO_CALLBACK ||
    pathname === APP_ROUTES.SIGNIN_SSO_CALLBACK ||
    pathname === APP_ROUTES.SIGNUP_HYPHEN_SSO_CALLBACK ||
    pathname === APP_ROUTES.SIGNIN_HYPHEN_SSO_CALLBACK;

  const isAppShellPath = pathname === '/app' || pathname.startsWith('/app/');
  const isAccountPath = matchesRoute(pathname, '/account');
  const isBillingPath = matchesRoute(pathname, '/billing');
  const isOnboardingPath = matchesRoute(pathname, '/onboarding');
  const isOnboardingCheckoutPath = matchesRoute(
    pathname,
    '/onboarding/checkout'
  );
  const isWaitlistPath = matchesRoute(pathname, '/waitlist');
  const isDesktopAuthPath = pathname === APP_ROUTES.DESKTOP_AUTH;
  const isNativeAuthCompletePath = pathname === APP_ROUTES.AUTH_NATIVE_COMPLETE;
  const isStartPath = pathname === APP_ROUTES.START;

  const isProtectedPath =
    isAppShellPath ||
    isAccountPath ||
    isBillingPath ||
    isWaitlistPath ||
    isOnboardingCheckoutPath;

  const needsNonce =
    pathname.startsWith('/api/') ||
    isAppShellPath ||
    isAccountPath ||
    isAuthPath ||
    isAuthCallbackPath ||
    isBillingPath ||
    isDesktopAuthPath ||
    isNativeAuthCompletePath ||
    isOnboardingPath ||
    isStartPath ||
    isWaitlistPath;

  const publicProfileCandidate = getPublicProfileCandidate(pathname);

  return {
    needsNonce,
    isProtectedPath,
    isAuthPath,
    isAuthCallbackPath,
    isSensitiveAPI: pathname.startsWith('/api/link/'),
    publicProfileCandidate,
  };
}

/**
 * Analyze hostname once for all routing decisions.
 * Single domain architecture: everything on jov.ie.
 * Investor portal: /investor-portal (path-based, bypasses Clerk auth)
 */
export function analyzeHost(hostname: string): HostInfo {
  const isDevOrPreview =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('vercel.app') ||
    STAGING_HOSTNAMES.has(hostname);

  return {
    isDevOrPreview,
    isMainHost:
      hostname === HOSTNAME ||
      hostname === `www.${HOSTNAME}` ||
      STAGING_HOSTNAMES.has(hostname) ||
      isDevOrPreview,
    isMeetJovie:
      hostname === 'meetjovie.com' || hostname === 'www.meetjovie.com',
    isSupportHost: hostname === `support.${HOSTNAME}`,
    isInvestorPortal: INVESTOR_HOSTNAMES.has(hostname),
  };
}

/** Dashboard is always at /app in single-domain architecture */
export const DASHBOARD_URL = APP_ROUTES.DASHBOARD;
