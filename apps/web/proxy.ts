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
import { getUserState } from '@/lib/auth/proxy-state';
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
import { createBotResponse, detectBot } from '@/lib/utils/bot-detection';

// ============================================================================
// Multi-Domain Routing Configuration
// ============================================================================
// - jov.ie (PROFILE_HOSTNAME): Marketing homepage + Public creator profiles
// - app.jov.ie (APP_HOSTNAME): Dashboard + App (authenticated)
// - meetjovie.com: 301 redirects to jov.ie (kept for email marketing only)
// ============================================================================

/**
 * Check if a hostname matches the profile domain (jov.ie)
 */
function isProfileHost(hostname: string): boolean {
  return (
    hostname === PROFILE_HOSTNAME ||
    hostname === `www.${PROFILE_HOSTNAME}` ||
    hostname === `main.${PROFILE_HOSTNAME}`
  );
}

/**
 * Check if a hostname matches the app subdomain (app.jov.ie)
 */
function isAppSubdomain(hostname: string): boolean {
  return (
    hostname === 'app.jov.ie' ||
    (isDevOrPreview(hostname) && hostname.startsWith('app.'))
  );
}

/**
 * Check if we're in a development/preview environment
 */
function isDevOrPreview(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('vercel.app') ||
    hostname.startsWith('main.')
  );
}

/**
 * Get the dashboard URL based on environment.
 * In production on app.jov.ie, dashboard is at '/'.
 * In dev/preview, dashboard is at '/app'.
 */
function getDashboardUrl(hostname: string): string {
  if (isDevOrPreview(hostname) && !isAppSubdomain(hostname)) {
    return '/app';
  }
  return '/';
}

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

const generateNonce = () => {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  return btoa(String.fromCharCode(...nonceBytes));
};

async function handleRequest(req: NextRequest, userId: string | null) {
  try {
    // Start performance timing
    const startTime = Date.now();

    const requestHeaders = new Headers(req.headers);

    // Conservative bot blocking - only on sensitive API endpoints
    const pathname = req.nextUrl.pathname;
    const isSensitiveAPI = pathname.startsWith('/api/link/');

    // Only generate a per-request CSP nonce for app/protected routes.
    // Marketing pages are intended to be statically cached and should not
    // depend on request-specific headers.
    const needsNonce =
      pathname.startsWith('/api/') ||
      pathname === '/app' ||
      pathname.startsWith('/app/') ||
      pathname === '/admin' ||
      pathname.startsWith('/admin/') ||
      pathname === '/onboarding' ||
      pathname.startsWith('/onboarding/') ||
      pathname === '/settings' ||
      pathname.startsWith('/settings/') ||
      pathname === '/billing' ||
      pathname.startsWith('/billing/') ||
      pathname === '/account' ||
      pathname.startsWith('/account/') ||
      pathname === '/waitlist' ||
      pathname.startsWith('/waitlist/');

    const nonce = needsNonce ? generateNonce() : null;
    if (nonce) {
      await ensureSentry();
      requestHeaders.set(SCRIPT_NONCE_HEADER, nonce);
    }

    const contentSecurityPolicy = nonce
      ? buildContentSecurityPolicy({ nonce })
      : null;

    // Compute CSP report URI once and pass to report-only builder
    const cspReportUri = nonce ? getCspReportUri() : null;
    const contentSecurityPolicyReportOnly = nonce
      ? buildContentSecurityPolicyReportOnly({
          nonce,
          reportUri: cspReportUri,
        })
      : null;

    // Block Sentry example pages in production (dev-only testing routes)
    if (
      process.env.NODE_ENV === 'production' &&
      (pathname === '/sentry-example-page' ||
        pathname === '/api/sentry-example-api')
    ) {
      return NextResponse.rewrite(new URL('/404', req.url), {
        request: { headers: requestHeaders },
      });
    }

    // Allow sidebar demo to bypass authentication
    if (pathname === '/sidebar-demo') {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (isSensitiveAPI) {
      const botResult = detectBot(req, pathname);

      // Only block Meta crawlers on sensitive API endpoints to avoid anti-cloaking penalties
      if (botResult.shouldBlock) {
        return createBotResponse(204);
      }
    }

    // ========================================================================
    // Multi-Domain Routing
    // ========================================================================
    const hostname = req.nextUrl.hostname;

    // 301 redirect ALL meetjovie.com traffic to jov.ie (kept for email marketing only)
    if (hostname === 'meetjovie.com' || hostname === 'www.meetjovie.com') {
      const targetUrl = new URL(pathname, 'https://jov.ie');
      targetUrl.search = req.nextUrl.search;
      return NextResponse.redirect(targetUrl, 301);
    }

    // Skip domain routing in development/preview environments
    if (!isDevOrPreview(hostname)) {
      // app.jov.ie: Only allow app paths (no /app prefix)
      if (isAppSubdomain(hostname)) {
        // Redirect /dashboard to / (dashboard is at root on app.jov.ie)
        // This handles SSO callbacks that redirect to /app/dashboard → app.jov.ie/dashboard
        // Note: Only redirect exact /dashboard, NOT /dashboard/* paths (those routes live at /app/dashboard/*)
        if (pathname === '/dashboard') {
          const targetUrl = new URL('https://app.jov.ie');
          targetUrl.pathname = '/';
          targetUrl.search = req.nextUrl.search;
          return NextResponse.redirect(targetUrl, 301);
        }

        const appPaths = [
          '/', // Dashboard at root
          '/analytics',
          '/audience',
          '/contacts',
          '/earnings',
          '/links',
          '/profile',
          '/releases',
          '/settings',
          '/admin',
          '/onboarding',
          '/billing',
          '/account',
          '/waitlist',
          '/monitoring', // Sentry tunnel endpoint
        ];

        const isAppPath =
          appPaths.some(p => pathname === p || pathname.startsWith(`${p}/`)) ||
          pathname.startsWith('/api/') ||
          pathname.startsWith('/app/'); // Allow /app/* paths on app.jov.ie for RSC requests

        if (!isAppPath) {
          // Redirect non-app paths to root jov.ie
          return NextResponse.redirect(
            new URL(pathname, 'https://jov.ie'),
            301
          );
        }
        // Continue to auth middleware below
      }

      // jov.ie root: Marketing + Profiles
      if (isProfileHost(hostname)) {
        // Redirect app paths to app subdomain (legacy /app/* or direct app paths)
        const appPaths = [
          '/settings',
          '/admin',
          '/analytics',
          '/audience',
          '/contacts',
          '/earnings',
          '/links',
          '/profile',
          '/releases',
          '/account',
          '/billing',
        ];
        if (
          appPaths.some(p => pathname === p || pathname.startsWith(`${p}/`))
        ) {
          return NextResponse.redirect(
            new URL(pathname, 'https://app.jov.ie'),
            301
          );
        }

        // Legacy /app/* prefix redirect
        if (pathname.startsWith('/app/')) {
          const withoutPrefix = pathname.replace(/^\/app/, '');
          return NextResponse.redirect(
            new URL(withoutPrefix, 'https://app.jov.ie'),
            301
          );
        }
      }
    }

    let res: NextResponse;

    const isAuthPath =
      pathname === '/signin' ||
      pathname === '/sign-in' ||
      pathname === '/signup' ||
      pathname === '/sign-up';

    const isAuthCallbackPath =
      pathname === '/sso-callback' ||
      pathname === '/signup/sso-callback' ||
      pathname === '/signin/sso-callback';

    // Detect RSC prefetch requests - these should NOT trigger redirects
    // RSC prefetch happens when Link components preload routes in the background
    // Redirecting prefetch requests causes "too many redirects" errors
    // Note: RSC header alone indicates RSC navigation, not prefetch
    // Only Next-Router-Prefetch='1' or _rsc param indicates actual prefetch
    const isRSCPrefetch =
      req.headers.get('Next-Router-Prefetch') === '1' ||
      req.nextUrl.searchParams.has('_rsc');

    // Let SSO callback routes complete without middleware interference
    // The AuthenticateWithRedirectCallback component will handle routing based on user state
    // Skip redirects for RSC prefetch requests to avoid "too many redirects" errors
    if (userId && isAuthPath && !isAuthCallbackPath && !isRSCPrefetch) {
      // Check complete user state to determine where authenticated user should go
      const userState = await getUserState(userId);
      // Sanitize redirect_url to strip hash fragments and validate path
      const redirectUrl = sanitizeRedirectUrl(
        req.nextUrl.searchParams.get('redirect_url')
      );

      // If user needs waitlist/onboarding, send them there (ignore redirect_url)
      if (userState.needsWaitlist) {
        res = NextResponse.redirect(new URL('/waitlist', req.url));
      } else if (userState.needsOnboarding) {
        res = NextResponse.redirect(new URL('/onboarding', req.url));
      } else if (redirectUrl) {
        // User is fully active - honor sanitized redirect_url for things like /claim/token
        res = NextResponse.redirect(new URL(redirectUrl, req.url));
      } else {
        // Fully active user, no redirect_url - go to dashboard
        res = NextResponse.redirect(
          new URL(getDashboardUrl(hostname), req.url)
        );
      }
    } else if (!userId && pathname === '/sign-in') {
      // Normalize legacy /sign-in to /signin
      const url = req.nextUrl.clone();
      url.pathname = '/signin';
      res = NextResponse.redirect(url);
    } else if (!userId && pathname === '/sign-up') {
      // Normalize legacy /sign-up to /signup
      const url = req.nextUrl.clone();
      url.pathname = '/signup';
      res = NextResponse.redirect(url);
    } else if (userId) {
      // Check complete user state to route correctly - eliminates redirect loops
      const userState = await getUserState(userId);

      // Route based on complete state - NO MORE LOOPS
      // IMPORTANT: Never rewrite API routes - they handle their own auth
      if (
        userState.needsWaitlist &&
        pathname !== '/waitlist' &&
        !pathname.startsWith('/api/')
      ) {
        // User needs waitlist - rewrite to waitlist page
        res = NextResponse.rewrite(new URL('/waitlist', req.url), {
          request: { headers: requestHeaders },
        });
      } else if (
        userState.needsOnboarding &&
        pathname !== '/onboarding' &&
        !pathname.startsWith('/api/')
      ) {
        // ENG-002: Check for recent onboarding completion cookie to prevent redirect loop
        // This cookie is set after completing onboarding to bypass the race condition
        // where the DB query might see stale data before transaction is fully visible
        const onboardingJustCompleted =
          req.cookies.get('jovie_onboarding_complete')?.value === '1';

        if (onboardingJustCompleted) {
          // User just completed onboarding - let them through to dashboard
          // The cookie will expire in 30s, and by then DB will have fresh data
          res = NextResponse.next({ request: { headers: requestHeaders } });
          // Clear the cookie since it's a one-time bypass
          res.cookies.delete('jovie_onboarding_complete');
        } else {
          // User needs onboarding - rewrite to onboarding page
          res = NextResponse.rewrite(new URL('/onboarding', req.url), {
            request: { headers: requestHeaders },
          });
        }
      } else if (
        !userState.needsWaitlist &&
        pathname === '/waitlist' &&
        !isRSCPrefetch
      ) {
        // Active user trying to access waitlist → redirect to dashboard
        // Skip for RSC prefetch to avoid "too many redirects" errors
        res = NextResponse.redirect(
          new URL(getDashboardUrl(hostname), req.url)
        );
      } else if (
        !userState.needsOnboarding &&
        pathname === '/onboarding' &&
        !isRSCPrefetch
      ) {
        // Active user trying to access onboarding → redirect to dashboard
        // Skip for RSC prefetch to avoid "too many redirects" errors
        res = NextResponse.redirect(
          new URL(getDashboardUrl(hostname), req.url)
        );
      } else if (
        (pathname === '/signin' || pathname === '/signup') &&
        !isRSCPrefetch
      ) {
        // Fully authenticated user hitting auth pages → redirect to dashboard
        // Skip for RSC prefetch to avoid "too many redirects" errors
        res = NextResponse.redirect(
          new URL(getDashboardUrl(hostname), req.url)
        );
      } else {
        // All other paths - user is authenticated and on correct page
        // On app.jov.ie, rewrite root to /app to show dashboard instead of marketing
        if (isAppSubdomain(hostname) && pathname === '/') {
          res = NextResponse.rewrite(new URL('/app', req.url), {
            request: { headers: requestHeaders },
          });
        } else {
          res = NextResponse.next({ request: { headers: requestHeaders } });
        }
      }
    } else {
      // Handle unauthenticated users
      const protectedPaths = [
        '/waitlist',
        '/analytics',
        '/audience',
        '/contacts',
        '/earnings',
        '/links',
        '/profile',
        '/releases',
        '/settings',
        '/admin',
        '/account',
        '/billing',
      ];

      // On app.jov.ie, root path is also protected (it's the dashboard)
      const isProtectedPath = protectedPaths.some(
        p => pathname === p || pathname.startsWith(`${p}/`)
      );
      const needsAuth =
        isProtectedPath || (isAppSubdomain(hostname) && pathname === '/');

      if (needsAuth) {
        // Redirect to signup for waitlist (new users creating accounts)
        // Redirect to signin for everything else (existing users)
        const authPage = pathname === '/waitlist' ? '/signup' : '/signin';
        const authUrl = new URL(authPage, req.url);
        authUrl.searchParams.set('redirect_url', req.nextUrl.pathname);
        res = NextResponse.redirect(authUrl);
      } else {
        res = NextResponse.next({ request: { headers: requestHeaders } });
      }
    }

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

    // Add performance monitoring headers
    const duration = Date.now() - startTime;
    res.headers.set('Server-Timing', `middleware;dur=${duration}`);
    if (contentSecurityPolicy) {
      res.headers.set('Content-Security-Policy', contentSecurityPolicy);
    }

    // Add CSP violation reporting headers (report-only mode)
    if (contentSecurityPolicyReportOnly && cspReportUri) {
      res.headers.set(
        'Content-Security-Policy-Report-Only',
        contentSecurityPolicyReportOnly
      );
      res.headers.set('Report-To', buildReportToHeader(cspReportUri));
      res.headers.set(
        'Reporting-Endpoints',
        buildReportingEndpointsHeader(cspReportUri)
      );
    }

    // Add performance monitoring for API routes
    if (pathname.startsWith('/api/')) {
      // Track API performance
      res.headers.set('X-API-Response-Time', `${duration}`);

      // Log performance data in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${req.method} ${pathname} - ${duration}ms`);
      }
    }

    // Add anti-indexing and no-cache headers for link and API routes (even on 404s)
    if (
      pathname.startsWith('/go/') ||
      pathname.startsWith('/out/') ||
      pathname.startsWith('/api/')
    ) {
      res.headers.set(
        'X-Robots-Tag',
        'noindex, nofollow, nosnippet, noarchive'
      );
      res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.headers.set('Pragma', 'no-cache');
      res.headers.set('Expires', '0');
      res.headers.set('Referrer-Policy', 'no-referrer');
    }

    return res;
  } catch (error) {
    // Log errors for observability - silent failures can mask security issues
    await captureError('Middleware error in proxy', error, {
      pathname: req.nextUrl.pathname,
      context: 'proxy_middleware',
    });

    // Fallback to basic middleware behavior
    // Note: Individual pages have their own auth checks (resolveUserState)
    return NextResponse.next();
  }
}

const clerkWrappedMiddleware = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  return handleRequest(req, userId);
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const shouldBypassClerk =
    process.env.NODE_ENV === 'test' && isMockOrMissingClerkConfig();

  if (shouldBypassClerk) {
    return handleRequest(req, null);
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
