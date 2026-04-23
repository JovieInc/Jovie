import { HOSTNAME, STAGING_HOSTNAMES } from '@/constants/domains';

export interface PathCategory {
  needsNonce: boolean;
  isProtectedPath: boolean;
  isAuthPath: boolean;
  isAuthCallbackPath: boolean;
  isSensitiveAPI: boolean;
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
 * Categorize a pathname once for all routing decisions.
 * Eliminates redundant path matching throughout the middleware.
 */
export function categorizePath(pathname: string): PathCategory {
  const isAuthPath =
    pathname === '/signin' ||
    pathname === '/sign-in' ||
    pathname === '/signup' ||
    pathname === '/sign-up';

  const isAuthCallbackPath =
    pathname === '/sso-callback' ||
    pathname === '/signup/sso-callback' ||
    pathname === '/signin/sso-callback' ||
    pathname === '/sign-up/sso-callback' ||
    pathname === '/sign-in/sso-callback';

  const isAppShellPath = pathname === '/app' || pathname.startsWith('/app/');
  const isAccountPath = matchesRoute(pathname, '/account');
  const isBillingPath = matchesRoute(pathname, '/billing');
  const isOnboardingPath = matchesRoute(pathname, '/onboarding');
  const isWaitlistPath = matchesRoute(pathname, '/waitlist');

  const isProtectedPath =
    isAppShellPath ||
    isAccountPath ||
    isBillingPath ||
    isWaitlistPath ||
    isOnboardingPath;

  const needsNonce =
    pathname.startsWith('/api/') ||
    isAppShellPath ||
    isAccountPath ||
    isBillingPath ||
    isOnboardingPath ||
    isWaitlistPath;

  return {
    needsNonce,
    isProtectedPath,
    isAuthPath,
    isAuthCallbackPath,
    isSensitiveAPI: pathname.startsWith('/api/link/'),
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
export const DASHBOARD_URL = '/app';
