/**
 * Route Detection Utility
 *
 * This module provides comprehensive route detection utilities for determining
 * whether the current page should use the lite (public) or full (dashboard)
 * Sentry SDK configuration.
 *
 * Route Classification:
 * - DASHBOARD: Authenticated user areas - full SDK with Replay and Profiling
 * - PUBLIC: Public-facing pages - lite SDK for optimal LCP performance
 * - API: Server-side API routes - not applicable for client SDK
 *
 * @module lib/sentry/route-detector
 */

/**
 * Route type enum for classification
 */
export type RouteType = 'dashboard' | 'public' | 'api';

/**
 * Detailed route classification result
 */
export interface RouteClassification {
  /**
   * The detected route type
   */
  type: RouteType;

  /**
   * Whether the route should use the full SDK (with Replay/Profiling)
   */
  useFullSdk: boolean;

  /**
   * Whether the route should use the lite SDK (core error tracking only)
   */
  useLiteSdk: boolean;

  /**
   * The matched pattern that classified this route, if any
   */
  matchedPattern?: string;

  /**
   * Whether this is a dynamic route (contains route parameters)
   */
  isDynamic: boolean;

  /**
   * Whether this is a Next.js route group path
   */
  isRouteGroup: boolean;
}

/**
 * Dashboard route prefixes - authenticated areas requiring full SDK features.
 * These routes benefit from Session Replay for debugging user issues.
 */
const DASHBOARD_ROUTES = [
  '/app', // Main dashboard and all nested routes
  '/account', // Account management
  '/billing', // Billing and subscription management
  '/onboarding', // User onboarding flow
  '/sso-callback', // SSO authentication callback
  '/artist-selection', // Artist selection (authenticated flow)
] as const;

/**
 * Explicit public route prefixes - unauthenticated areas using lite SDK.
 * These routes prioritize LCP performance over debugging features.
 */
const PUBLIC_ROUTES = [
  '/artists', // Artists directory
  '/waitlist', // Waitlist signup page
  '/claim', // Profile claim flow
  '/go', // Short link redirects
  '/r', // Short link redirects (alternative)
  '/out', // Outbound link tracking
  '/loader-preview', // Loader preview page
  '/sandbox', // Development sandbox
  '/sidebar-demo', // Demo pages
  '/spinner-test', // Test pages
  '/sentry-example-page', // Sentry test page
] as const;

/**
 * Next.js route groups that are public (the parentheses are stripped from URLs).
 * These are used for internal detection when analyzing route structures.
 */
const PUBLIC_ROUTE_GROUPS = [
  '(auth)', // Authentication pages (signin, signup)
  '(marketing)', // Marketing pages (blog, pricing, etc.)
  '(dynamic)', // Dynamic content (legal pages)
] as const;

/**
 * API route prefix - server-side routes not relevant for client SDK
 */
const API_ROUTE_PREFIX = '/api';

/**
 * Ingest route prefix - special analytics ingestion endpoint
 */
const INGEST_ROUTE_PREFIX = '/ingest';

/**
 * Normalizes a pathname for consistent matching.
 * - Converts to lowercase
 * - Removes trailing slashes (except for root)
 * - Trims whitespace
 *
 * @param pathname - The raw pathname to normalize
 * @returns The normalized pathname
 */
export function normalizePathname(pathname: string): string {
  let normalized = pathname.trim().toLowerCase();

  // Remove trailing slash unless it's the root path
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Checks if a pathname matches a route prefix.
 * Handles exact matches and prefix matches with path separator.
 *
 * @param pathname - The pathname to check (should be normalized)
 * @param prefix - The route prefix to match against
 * @returns true if the pathname matches the prefix
 */
function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  const normalizedPrefix = prefix.toLowerCase();
  return (
    pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`)
  );
}

/**
 * Checks if a pathname is an API route.
 *
 * @param pathname - The pathname to check
 * @returns true if it's an API route
 *
 * @example
 * isApiRoute('/api/users') // true
 * isApiRoute('/app/dashboard') // false
 */
export function isApiRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    matchesRoutePrefix(normalized, API_ROUTE_PREFIX) ||
    matchesRoutePrefix(normalized, INGEST_ROUTE_PREFIX)
  );
}

/**
 * Checks if a pathname is a dashboard route that requires full SDK.
 *
 * @param pathname - The pathname to check
 * @returns true if it's a dashboard route
 *
 * @example
 * isDashboardRoute('/app/dashboard') // true
 * isDashboardRoute('/billing/success') // true
 * isDashboardRoute('/artists') // false
 */
export function isDashboardRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  // API routes are not dashboard routes
  if (isApiRoute(normalized)) {
    return false;
  }

  // Check against dashboard route prefixes
  for (const route of DASHBOARD_ROUTES) {
    if (matchesRoutePrefix(normalized, route)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a pathname is an explicitly defined public route.
 *
 * @param pathname - The pathname to check
 * @returns true if it's an explicitly defined public route
 *
 * @example
 * isExplicitPublicRoute('/artists/featured') // true
 * isExplicitPublicRoute('/waitlist') // true
 * isExplicitPublicRoute('/beyonce') // false (username, not explicit)
 */
export function isExplicitPublicRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  // Home page is always public
  if (normalized === '/') {
    return true;
  }

  // Check against explicit public route prefixes
  for (const route of PUBLIC_ROUTES) {
    if (matchesRoutePrefix(normalized, route)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a pathname is a public user profile route (dynamic username).
 * These are routes like /[username] that are public artist profiles.
 *
 * @param pathname - The pathname to check
 * @returns true if it's a profile route
 *
 * @example
 * isProfileRoute('/beyonce') // true
 * isProfileRoute('/taylor-swift/listen') // true
 * isProfileRoute('/app/dashboard') // false
 */
export function isProfileRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  // Skip root, API, and explicitly known routes
  if (normalized === '/' || isApiRoute(normalized)) {
    return false;
  }

  // Get the first path segment
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  const firstSegment = segments[0];

  // Check if it matches any known route prefix (dashboard or public)
  const allKnownPrefixes = [
    ...DASHBOARD_ROUTES.map(r => r.slice(1).toLowerCase()),
    ...PUBLIC_ROUTES.map(r => r.slice(1).toLowerCase()),
    'api',
    'ingest',
  ];

  // If the first segment is not a known prefix, it's likely a username
  return !allKnownPrefixes.includes(firstSegment);
}

/**
 * Checks if a pathname is any type of public route (explicit or profile).
 *
 * @param pathname - The pathname to check
 * @returns true if it's a public route
 *
 * @example
 * isPublicRoute('/') // true
 * isPublicRoute('/artists') // true
 * isPublicRoute('/beyonce') // true (profile)
 * isPublicRoute('/app/dashboard') // false
 */
export function isPublicRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  // API routes are not public client routes
  if (isApiRoute(normalized)) {
    return false;
  }

  // Dashboard routes are not public
  if (isDashboardRoute(normalized)) {
    return false;
  }

  // Everything else is public (explicit public routes or profiles)
  return true;
}

/**
 * Detects if a pathname contains dynamic route segments.
 * Dynamic segments in Next.js are denoted by brackets (e.g., [username], [...slug]).
 *
 * Note: This function analyzes the pathname pattern, not the actual URL.
 * In actual URLs, the dynamic segments are replaced with real values.
 *
 * @param pathname - The pathname to check
 * @returns true if it appears to be a dynamic route pattern
 */
export function hasDynamicSegments(pathname: string): boolean {
  return /\[[^\]]*\]/.test(pathname);
}

/**
 * Checks if a pathname appears to be a Next.js route group pattern.
 * Route groups are wrapped in parentheses (e.g., (marketing), (auth)).
 *
 * @param pathname - The pathname to check
 * @returns true if it contains route group syntax
 */
export function isRouteGroupPath(pathname: string): boolean {
  return /\([^)]*\)/.test(pathname);
}

/**
 * Provides comprehensive classification of a route.
 * Returns detailed information about the route type and SDK requirements.
 *
 * @param pathname - The pathname to classify
 * @returns Complete route classification with type and SDK recommendations
 *
 * @example
 * classifyRoute('/app/dashboard')
 * // { type: 'dashboard', useFullSdk: true, useLiteSdk: false, ... }
 *
 * classifyRoute('/beyonce')
 * // { type: 'public', useFullSdk: false, useLiteSdk: true, isDynamic: true, ... }
 */
export function classifyRoute(pathname: string): RouteClassification {
  const normalized = normalizePathname(pathname);
  const isDynamic = isProfileRoute(normalized);
  const isRouteGroup = isRouteGroupPath(pathname);

  // Check for API routes first
  if (isApiRoute(normalized)) {
    return {
      type: 'api',
      useFullSdk: false,
      useLiteSdk: false,
      matchedPattern: normalized.startsWith('/api') ? '/api/*' : '/ingest/*',
      isDynamic: false,
      isRouteGroup: false,
    };
  }

  // Check for dashboard routes
  if (isDashboardRoute(normalized)) {
    // Find the matched pattern
    let matchedPattern: string | undefined;
    for (const route of DASHBOARD_ROUTES) {
      if (matchesRoutePrefix(normalized, route)) {
        matchedPattern = `${route}/*`;
        break;
      }
    }

    return {
      type: 'dashboard',
      useFullSdk: true,
      useLiteSdk: false,
      matchedPattern,
      isDynamic: false,
      isRouteGroup: false,
    };
  }

  // Everything else is public
  let matchedPattern: string | undefined;

  // Check explicit public routes
  for (const route of PUBLIC_ROUTES) {
    if (matchesRoutePrefix(normalized, route)) {
      matchedPattern = `${route}/*`;
      break;
    }
  }

  // If no explicit match and it's a profile route
  if (!matchedPattern && isDynamic) {
    matchedPattern = '/[username]/*';
  }

  // Home page
  if (normalized === '/') {
    matchedPattern = '/';
  }

  return {
    type: 'public',
    useFullSdk: false,
    useLiteSdk: true,
    matchedPattern,
    isDynamic,
    isRouteGroup,
  };
}

/**
 * Gets the recommended Sentry SDK mode for a given pathname.
 * This is a convenience function that maps route classification to SDK mode.
 *
 * @param pathname - The pathname to check
 * @returns 'full' for dashboard routes, 'lite' for public routes, 'none' for API routes
 *
 * @example
 * getSdkMode('/app/dashboard') // 'full'
 * getSdkMode('/beyonce') // 'lite'
 * getSdkMode('/api/users') // 'none'
 */
export function getSdkMode(pathname: string): 'lite' | 'full' | 'none' {
  const classification = classifyRoute(pathname);

  if (classification.type === 'api') {
    return 'none';
  }

  return classification.useFullSdk ? 'full' : 'lite';
}

/**
 * Gets the current pathname from the browser window.
 * Returns undefined if not in a browser environment.
 *
 * @returns The current pathname or undefined
 */
export function getCurrentPathname(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.location.pathname;
}

/**
 * Gets the route classification for the current page.
 * Returns undefined if not in a browser environment.
 *
 * @returns The route classification or undefined
 */
export function getCurrentRouteClassification():
  | RouteClassification
  | undefined {
  const pathname = getCurrentPathname();
  if (!pathname) {
    return undefined;
  }
  return classifyRoute(pathname);
}

/**
 * Checks if the current page should use the full SDK.
 * Returns false if not in a browser environment.
 *
 * @returns true if the current page should use full SDK
 */
export function shouldUseFullSdk(): boolean {
  const pathname = getCurrentPathname();
  if (!pathname) {
    return false;
  }
  return isDashboardRoute(pathname);
}

/**
 * Checks if the current page should use the lite SDK.
 * Returns true if not in a browser environment (safe default).
 *
 * @returns true if the current page should use lite SDK
 */
export function shouldUseLiteSdk(): boolean {
  const pathname = getCurrentPathname();
  if (!pathname) {
    return true;
  }
  return isPublicRoute(pathname);
}

/**
 * Export route configuration for use in other modules
 */
export const ROUTE_CONFIG = {
  dashboardRoutes: DASHBOARD_ROUTES,
  publicRoutes: PUBLIC_ROUTES,
  publicRouteGroups: PUBLIC_ROUTE_GROUPS,
  apiPrefix: API_ROUTE_PREFIX,
  ingestPrefix: INGEST_ROUTE_PREFIX,
} as const;
