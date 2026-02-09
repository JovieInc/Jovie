import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';
import {
  AUDIENCE_ANON_COOKIE,
  AUDIENCE_IDENTIFIED_COOKIE,
} from '@/constants/app';
import { PROFILE_HOSTNAME } from '@/constants/domains';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import type { ProxyUserState } from '@/lib/auth/proxy-state';
import { getUserState, isKnownActiveUser } from '@/lib/auth/proxy-state';
import { captureError } from '@/lib/error-tracking';
import {
  buildContentSecurityPolicy,
  buildContentSecurityPolicyReportOnly,
  SCRIPT_NONCE_HEADER,
} from '@/lib/security/content-security-policy';
import {
  buildReportingEndpointsHeader,
  buildReportToHeader,
  getCspReportUri,
} from '@/lib/security/csp-reporting';
import { ensureSentry } from '@/lib/sentry/ensure';
import { createBotResponse } from '@/lib/utils/bot-detection';

// ============================================================================
// Single Domain Architecture
// ============================================================================
// - jov.ie: Everything (marketing, auth, profiles, dashboard at /app/*)
// - meetjovie.com: 301 redirects to jov.ie (kept for email marketing only)
// ============================================================================

// Pre-compiled regex for bot detection (O(1) vs O(n) array iteration)
const META_BOT_REGEX =
  /facebookexternalhit|facebot|facebook|instagram|whatsapp/i;
const SENSITIVE_API_REGEX = /^\/api\/link\//;

/**
 * Fast bot detection using pre-compiled regex
 */
function detectMetaBot(userAgent: string): boolean {
  return META_BOT_REGEX.test(userAgent);
}

// ============================================================================
// Path Categorization (computed once per request)
// ============================================================================

interface PathCategory {
  needsNonce: boolean;
  isAppPath: boolean;
  isDashboardPath: boolean;
  isSettingsPath: boolean;
  isProtectedPath: boolean;
  isAuthPath: boolean;
  isAuthCallbackPath: boolean;
  isSensitiveAPI: boolean;
}

/** Check if pathname matches a route (exact or prefix) */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Check if pathname matches any of the given routes */
function matchesAnyRoute(pathname: string, routes: readonly string[]): boolean {
  return routes.some(route => matchesRoute(pathname, route));
}

// Route groups for path categorization
const DASHBOARD_ROUTES = [
  '/app/profile',
  '/app/contacts',
  '/app/releases',
  '/app/tour-dates',
  '/app/audience',
  '/app/earnings',
  '/app/links',
  '/app/chat',
  '/app/analytics',
] as const;

const SETTINGS_ROUTES = [
  '/app/settings',
  '/app/admin',
  '/app/billing',
  '/app/account',
] as const;

/**
 * Categorize a pathname once for all routing decisions.
 * Eliminates redundant path matching throughout the middleware.
 */
function categorizePath(pathname: string): PathCategory {
  // Auth paths
  const isAuthPath =
    pathname === '/signin' ||
    pathname === '/sign-in' ||
    pathname === '/signup' ||
    pathname === '/sign-up';

  const isAuthCallbackPath =
    pathname === '/sso-callback' ||
    pathname === '/signup/sso-callback' ||
    pathname === '/signin/sso-callback';

  // Dashboard paths (used for app subdomain rewrites)
  const isDashboardPath = matchesAnyRoute(pathname, DASHBOARD_ROUTES);

  // Settings-like paths
  const isSettingsPath = matchesAnyRoute(pathname, SETTINGS_ROUTES);

  // Onboarding/waitlist paths
  const isOnboardingPath = matchesRoute(pathname, '/onboarding');
  const isWaitlistPath = matchesRoute(pathname, '/waitlist');

  // Protected paths (require auth)
  const isProtectedPath =
    isDashboardPath || isSettingsPath || isWaitlistPath || isOnboardingPath;

  // App paths (dashboard and protected routes at /app/*)
  const isAppPath =
    pathname === '/' ||
    isDashboardPath ||
    isSettingsPath ||
    isOnboardingPath ||
    isWaitlistPath ||
    pathname === '/monitoring' ||
    pathname.startsWith('/monitoring/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/app/');

  // Paths that need CSP nonce (app/protected routes, not marketing)
  const needsNonce =
    pathname.startsWith('/api/') ||
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    isSettingsPath ||
    isOnboardingPath ||
    isWaitlistPath;

  // Sensitive API paths for bot blocking
  const isSensitiveAPI = SENSITIVE_API_REGEX.test(pathname);

  return {
    needsNonce,
    isAppPath,
    isDashboardPath,
    isSettingsPath,
    isProtectedPath,
    isAuthPath,
    isAuthCallbackPath,
    isSensitiveAPI,
  };
}

// ============================================================================
// Host Detection (cached per request)
// ============================================================================

interface HostInfo {
  isMainHost: boolean;
  isDevOrPreview: boolean;
  isMeetJovie: boolean;
}

/**
 * Analyze hostname once for all routing decisions.
 * Single domain architecture: everything on jov.ie.
 */
function analyzeHost(hostname: string): HostInfo {
  const isDevOrPreview =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('vercel.app') ||
    hostname.startsWith('main.');

  const isMainHost =
    hostname === PROFILE_HOSTNAME ||
    hostname === `www.${PROFILE_HOSTNAME}` ||
    hostname === `main.${PROFILE_HOSTNAME}` ||
    isDevOrPreview;

  const isMeetJovie =
    hostname === 'meetjovie.com' || hostname === 'www.meetjovie.com';

  return { isMainHost, isDevOrPreview, isMeetJovie };
}

/** Dashboard is always at /app in single-domain architecture */
const DASHBOARD_URL = '/app';

const CLERK_SENSITIVE_PATTERNS = [
  'dummy',
  'mock',
  '1234567890',
  'test-key',
  'placeholder',
] as const;

function isMockOrMissingClerkConfig(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!publishableKey || !secretKey) return true;

  const publishableLower = publishableKey.toLowerCase();
  const secretLower = secretKey.toLowerCase();

  return CLERK_SENSITIVE_PATTERNS.some(
    pattern =>
      publishableLower.includes(pattern) || secretLower.includes(pattern)
  );
}

/**
 * Generate a cryptographic nonce for CSP.
 * Uses loop instead of spread operator to reduce GC pressure.
 */
function generateNonce(): string {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  let binary = '';
  for (let i = 0; i < 16; i++) {
    binary += String.fromCharCode(nonceBytes[i]);
  }
  return btoa(binary);
}

async function handleRequest(req: NextRequest, userId: string | null) {
  try {
    const startTime = Date.now();
    const pathname = req.nextUrl.pathname;
    const hostname = req.nextUrl.hostname;

    // ========================================================================
    // Compute path and host info ONCE at the top
    // ========================================================================
    const pathInfo = categorizePath(pathname);
    const hostInfo = analyzeHost(hostname);

    // ========================================================================
    // Generate CSP nonce early and set on request headers
    // Next.js Server Components read the nonce from request headers via headers().get('x-nonce')
    // ========================================================================
    const requestHeaders = new Headers(req.headers);
    let nonce: string | null = null;

    if (pathInfo.needsNonce) {
      nonce = generateNonce();
      requestHeaders.set(SCRIPT_NONCE_HEADER, nonce);
      // Fire-and-forget Sentry initialization (non-blocking)
      ensureSentry().catch(() => {});
    }

    // ========================================================================
    // Early exits that don't need CSP or user state (no DB/Redis calls)
    // ========================================================================

    // Block Sentry example pages in production
    if (
      process.env.NODE_ENV === 'production' &&
      (pathname === '/sentry-example-page' ||
        pathname === '/api/sentry-example-api')
    ) {
      return NextResponse.rewrite(new URL('/404', req.url));
    }

    // Allow sidebar demo to bypass authentication
    if (pathname === '/sidebar-demo') {
      return NextResponse.next();
    }

    // Fast bot blocking using pre-compiled regex (no array iteration)
    if (pathInfo.isSensitiveAPI) {
      const userAgent = req.headers.get('user-agent') || '';
      if (detectMetaBot(userAgent)) {
        return createBotResponse(204);
      }
    }

    // 301 redirect ALL meetjovie.com traffic to jov.ie
    if (hostInfo.isMeetJovie) {
      const targetUrl = new URL(pathname, 'https://jov.ie');
      targetUrl.search = req.nextUrl.search;
      return NextResponse.redirect(targetUrl, 301);
    }

    // ========================================================================
    // Unauthenticated user handling (no getUserState call needed)
    // ========================================================================
    if (!userId) {
      // Normalize legacy auth paths
      if (pathname === '/sign-in') {
        const url = req.nextUrl.clone();
        url.pathname = '/signin';
        return NextResponse.redirect(url);
      }
      if (pathname === '/sign-up') {
        const url = req.nextUrl.clone();
        url.pathname = '/signup';
        return NextResponse.redirect(url);
      }

      // Check if path requires authentication
      const needsAuth = pathInfo.isProtectedPath;

      if (needsAuth) {
        const authPage = pathname === '/waitlist' ? '/signup' : '/signin';
        const authUrl = new URL(authPage, req.url);
        authUrl.searchParams.set('redirect_url', req.nextUrl.pathname);
        return NextResponse.redirect(authUrl);
      }

      // Unauthenticated user on public path - build response with CSP if needed
      return buildFinalResponse(
        req,
        NextResponse.next({ request: { headers: requestHeaders } }),
        pathInfo,
        startTime,
        null,
        nonce
      );
    }

    // ========================================================================
    // Authenticated user handling - SINGLE getUserState call
    // ========================================================================
    const isRSCPrefetch =
      req.headers.get('Next-Router-Prefetch') === '1' ||
      req.nextUrl.searchParams.has('_rsc');

    // Fetch user state ONCE for all authenticated routing decisions
    let userState: ProxyUserState | null = null;

    // Only page routes need user state — API routes don't make routing decisions
    const needsUserState = !pathname.startsWith('/api/');

    // Skip the getUserState call for RSC prefetch requests when the user is
    // already known-active from the in-memory cache. Active users don't need
    // routing intervention (no waitlist/onboarding rewrite), so the prefetch
    // can pass through immediately. The subsequent full navigation will still
    // call getUserState normally.
    const canSkipForPrefetch = isRSCPrefetch && isKnownActiveUser(userId);

    if (needsUserState && !canSkipForPrefetch) {
      userState = await getUserState(userId);
    }

    let res: NextResponse;

    // Handle authenticated user on auth pages (signin/signup)
    if (
      pathInfo.isAuthPath &&
      !pathInfo.isAuthCallbackPath &&
      !isRSCPrefetch &&
      userState
    ) {
      const redirectUrl = sanitizeRedirectUrl(
        req.nextUrl.searchParams.get('redirect_url')
      );

      if (userState.needsWaitlist) {
        return NextResponse.redirect(new URL('/waitlist', req.url));
      }
      if (userState.needsOnboarding) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }
      if (redirectUrl) {
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      }
      return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
    }

    // Route based on user state
    if (userState) {
      if (
        userState.needsWaitlist &&
        pathname !== '/waitlist' &&
        !pathname.startsWith('/api/')
      ) {
        res = NextResponse.rewrite(new URL('/waitlist', req.url), {
          request: { headers: requestHeaders },
        });
      } else if (
        userState.needsOnboarding &&
        pathname !== '/onboarding' &&
        !pathname.startsWith('/api/')
      ) {
        const onboardingJustCompleted =
          req.cookies.get('jovie_onboarding_complete')?.value === '1';

        if (onboardingJustCompleted) {
          res = NextResponse.next({ request: { headers: requestHeaders } });
          res.cookies.delete('jovie_onboarding_complete');
        } else {
          res = NextResponse.rewrite(new URL('/onboarding', req.url), {
            request: { headers: requestHeaders },
          });
        }
      } else if (
        !userState.needsWaitlist &&
        pathname === '/waitlist' &&
        !isRSCPrefetch
      ) {
        return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
      } else if (
        !userState.needsOnboarding &&
        pathname === '/onboarding' &&
        !isRSCPrefetch
      ) {
        return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
      } else if (
        (pathname === '/signin' || pathname === '/signup') &&
        !isRSCPrefetch
      ) {
        return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
      } else {
        // Single domain: no rewrites needed, routes are at their canonical paths
        res = NextResponse.next({ request: { headers: requestHeaders } });
      }
    } else {
      res = NextResponse.next({ request: { headers: requestHeaders } });
    }

    return buildFinalResponse(req, res, pathInfo, startTime, userId, nonce);
  } catch (error) {
    await captureError('Middleware error in proxy', error, {
      pathname: req.nextUrl.pathname,
      context: 'proxy_middleware',
    });
    return NextResponse.next();
  }
}

/**
 * Build the final response with CSP headers and cookies.
 * The nonce is pre-generated and set on request headers for Server Components.
 * Here we set it on response headers for the CSP policy.
 */
function buildFinalResponse(
  req: NextRequest,
  res: NextResponse,
  pathInfo: PathCategory,
  startTime: number,
  userId: string | null,
  nonce: string | null
): NextResponse {
  const pathname = req.nextUrl.pathname;

  // Set CSP headers using the pre-generated nonce
  // The nonce was already set on request headers for Server Components
  if (nonce && pathInfo.needsNonce) {
    res.headers.set(SCRIPT_NONCE_HEADER, nonce);
    res.headers.set(
      'Content-Security-Policy',
      buildContentSecurityPolicy({ nonce })
    );

    const cspReportUri = getCspReportUri();
    if (cspReportUri) {
      const reportOnlyPolicy = buildContentSecurityPolicyReportOnly({
        nonce,
        reportUri: cspReportUri,
      });
      if (reportOnlyPolicy) {
        res.headers.set(
          'Content-Security-Policy-Report-Only',
          reportOnlyPolicy
        );
        res.headers.set('Report-To', buildReportToHeader(cspReportUri));
        res.headers.set(
          'Reporting-Endpoints',
          buildReportingEndpointsHeader(cspReportUri)
        );
      }
    }
  }

  // Set audience tracking cookies
  if (!req.cookies.get(AUDIENCE_ANON_COOKIE)?.value) {
    res.cookies.set(AUDIENCE_ANON_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  if (userId && res.cookies.get(AUDIENCE_IDENTIFIED_COOKIE)?.value !== '1') {
    res.cookies.set(AUDIENCE_IDENTIFIED_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  // Performance monitoring
  const duration = Date.now() - startTime;
  res.headers.set('Server-Timing', `middleware;dur=${duration}`);

  if (pathname.startsWith('/api/')) {
    res.headers.set('X-API-Response-Time', `${duration}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${req.method} ${pathname} - ${duration}ms`);
    }
  }

  // Anti-indexing headers for link and API routes
  if (
    pathname.startsWith('/go/') ||
    pathname.startsWith('/out/') ||
    pathname.startsWith('/api/')
  ) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    res.headers.set('Referrer-Policy', 'no-referrer');
  }

  return res;
}

const clerkWrappedMiddleware = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  return handleRequest(req, userId);
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // Check if Clerk config is missing or mocked
  const clerkConfigMissing = isMockOrMissingClerkConfig();

  // In test mode, always bypass Clerk if config is missing
  if (process.env.NODE_ENV === 'test' && clerkConfigMissing) {
    return handleRequest(req, null);
  }

  // In production/dev, if Clerk config is missing, handle gracefully
  // This can happen during Vercel cold starts when env vars are temporarily unavailable
  if (clerkConfigMissing) {
    const pathname = req.nextUrl.pathname;
    const pathInfo = categorizePath(pathname);

    // For public routes (non-protected), proceed without auth
    // This allows the homepage, marketing pages, and public profiles to load
    if (!pathInfo.isProtectedPath) {
      return handleRequest(req, null);
    }

    // For protected routes, return a service unavailable error
    // This is better than crashing with an unhandled exception
    return new NextResponse(
      JSON.stringify({
        error: 'Service temporarily unavailable',
        message: 'Authentication service is initializing. Please try again.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '5',
        },
      }
    );
  }

  return clerkWrappedMiddleware(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals, all static files, and .well-known directory
    '/((?!_next|\.well-known|.*\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
