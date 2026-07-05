import { APP_ROUTES } from '@/constants/routes';

export interface ClerkBypassPathInfo {
  isAuthCallbackPath: boolean;
  isAuthPath: boolean;
  isProtectedPath: boolean;
}

interface ClerkCookieLike {
  name: string;
  value: string;
}

const CLERK_REQUIRED_EXACT_PATHS = [
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.AUTH_CALLBACK,
  APP_ROUTES.AUTH_START,
  '/__clerk',
  '/monitoring',
] as const;

const CLERK_REQUIRED_PREFIXES = [
  `${APP_ROUTES.DASHBOARD}/`,
  '/trpc',
  '/__clerk/',
  '/monitoring/',
] as const;

// DOCUMENTATION-ONLY: these prefixes are no longer load-bearing.
// The catch-all for /api/ above protects all API routes by default.
// Kept as a reference of known authenticated APIs.
const _AUTHENTICATED_API_PREFIXES = [
  '/api/account',
  '/api/admin',
  '/api/billing',
  '/api/chat',
  '/api/dashboard',
  '/api/dsp',
  '/api/images',
  '/api/mobile',
  '/api/metadata-submissions',
  '/api/onboarding',
  '/api/pre-save',
  '/api/promo-downloads',
  '/api/referrals',
  '/api/stripe',
  '/api/suggestions',
  '/api/waitlist',
  '/api/wallet',
] as const;

const PUBLIC_API_EXACT_PATHS = [
  '/api/auth/native/exchange',
  '/api/profile/view',
  '/api/stripe/pricing-options',
] as const;

const PUBLIC_API_PREFIXES = ['/api/dev/test-auth/'] as const;

/**
 * Public — returns true when the path absolutely requires Clerk middleware to
 * have populated request context before route handlers run. Used both for the
 * per-request bypass decision AND for the cold-start "Clerk config missing"
 * fallback in proxy.ts, so those two code paths can't diverge.
 */
export function isClerkRequiredPath(
  pathname: string,
  pathInfo: ClerkBypassPathInfo
) {
  if (
    pathInfo.isProtectedPath ||
    pathInfo.isAuthPath ||
    pathInfo.isAuthCallbackPath
  ) {
    return true;
  }

  // Public API routes explicitly do NOT need Clerk.
  if (
    PUBLIC_API_EXACT_PATHS.includes(
      pathname as (typeof PUBLIC_API_EXACT_PATHS)[number]
    ) ||
    PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
  ) {
    return false;
  }

  // Default-deny for all other /api/ routes: any API path not explicitly
  // listed as public requires Clerk middleware context. This prevents new
  // API routes from silently bypassing auth during Clerk config outages.
  // Previously, only routes in AUTHENTICATED_API_PREFIXES were protected,
  // meaning a new route not yet added to the list would fall through.
  if (pathname.startsWith('/api/') || pathname === '/api') {
    return true;
  }

  // Keep this Clerk-specific subset aligned with categorizePath() in proxy.ts.
  // Duplicating the minimal matcher here avoids coupling this utility to proxy.
  return (
    CLERK_REQUIRED_EXACT_PATHS.includes(
      pathname as (typeof CLERK_REQUIRED_EXACT_PATHS)[number]
    ) || CLERK_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix))
  );
}

function hasActiveClerkCookie(cookie: ClerkCookieLike) {
  if (cookie.name === '__session') {
    return cookie.value.trim().length > 0;
  }

  if (cookie.name === '__client_uat') {
    const value = cookie.value.trim();
    return value.length > 0 && value !== '0';
  }

  return false;
}

export function shouldBypassClerkForRequest(options: {
  allowAuthRouteBypass?: boolean;
  cookies: Iterable<ClerkCookieLike>;
  forceBypass?: boolean;
  pathInfo: ClerkBypassPathInfo;
  pathname: string;
}) {
  if (options.forceBypass === true) {
    return true;
  }

  const allowAuthRouteBypass = options.allowAuthRouteBypass === true;

  // Public API routes must be able to answer as signed-out requests without
  // entering Clerk's handshake/rewrite flow. Route handlers own auth for
  // protected APIs, while authenticated callers still keep Clerk enabled
  // below because they carry active Clerk cookies.
  const authBypassPathInfo = allowAuthRouteBypass
    ? {
        ...options.pathInfo,
        isAuthPath: false,
      }
    : options.pathInfo;

  if (isClerkRequiredPath(options.pathname, authBypassPathInfo)) {
    return false;
  }

  for (const cookie of options.cookies) {
    if (hasActiveClerkCookie(cookie)) {
      return false;
    }
  }

  return true;
}
