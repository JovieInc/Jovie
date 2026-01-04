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
import { MARKETING_HOSTNAME, PROFILE_HOSTNAME } from '@/constants/domains';
import {
  buildContentSecurityPolicy,
  SCRIPT_NONCE_HEADER,
} from '@/lib/security/content-security-policy';
import { ensureSentry } from '@/lib/sentry/ensure';
import { createBotResponse, detectBot } from '@/lib/utils/bot-detection';

// ============================================================================
// Multi-Domain Routing Configuration
// ============================================================================
// - jov.ie (PROFILE_HOSTNAME): Public creator profiles + viewer subscription cookies
// - meetjovie.com (MARKETING_HOSTNAME): Marketing + Dashboard + Auth (single domain for Clerk)
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
 * Check if a hostname matches the marketing domain (meetjovie.com)
 */
function isMarketingHost(hostname: string): boolean {
  return (
    hostname === MARKETING_HOSTNAME || hostname === `www.${MARKETING_HOSTNAME}`
  );
}

// Note: isAppHost removed - we now use meetjovie.com for both marketing and app
// to avoid Clerk's satellite domain costs for subdomains

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

const EU_EEA_UK = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
];
const US_STATES = ['CA', 'CO', 'VA', 'CT', 'UT'];
const CA_PROVINCES = ['QC'];

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
  await ensureSentry();
  try {
    // Start performance timing
    const startTime = Date.now();
    const nonce = generateNonce();
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(SCRIPT_NONCE_HEADER, nonce);
    const contentSecurityPolicy = buildContentSecurityPolicy({ nonce });

    // Conservative bot blocking - only on sensitive API endpoints
    const pathname = req.nextUrl.pathname;
    const isSensitiveAPI = pathname.startsWith('/api/link/');

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

    // Skip domain routing in development/preview environments
    if (!isDevOrPreview(hostname)) {
      // Profile domain (jov.ie): Only allow profile-related paths
      if (isProfileHost(hostname)) {
        // Allow: /{username}, /{username}/tip, /{username}/listen, /api/*, static assets
        const isProfilePath =
          pathname === '/' ||
          pathname.startsWith('/api/') ||
          /^\/[a-zA-Z0-9_-]+\/?$/.test(pathname) || // /{username}
          /^\/[a-zA-Z0-9_-]+\/(tip|listen|subscribe)\/?$/.test(pathname); // /{username}/tip etc.

        // Redirect non-profile paths to marketing domain
        if (!isProfilePath) {
          const marketingUrl = new URL(
            pathname,
            `https://${MARKETING_HOSTNAME}`
          );
          marketingUrl.search = req.nextUrl.search;
          return NextResponse.redirect(marketingUrl, 301);
        }
      }

      // Marketing/App domain (meetjovie.com): Handles both marketing and app paths
      // Note: We use meetjovie.com for both to avoid Clerk satellite domain costs
      if (isMarketingHost(hostname)) {
        // Redirect profile paths (/{username}) to profile domain
        if (
          /^\/[a-zA-Z0-9_-]+\/?$/.test(pathname) &&
          !pathname.startsWith('/api/')
        ) {
          // Check if this looks like a username (not a marketing/app page)
          const reservedPages = [
            '/blog',
            '/pricing',
            '/support',
            '/legal',
            '/about',
            '/features',
            '/app',
            '/signin',
            '/signup',
            '/sign-in',
            '/sign-up',
            '/waitlist',
            '/onboarding',
            '/claim',
            '/billing',
            '/settings',
            '/account',
            '/dashboard',
            '/monitoring', // Sentry tunnel route - must not redirect to profile domain
          ];
          const isReservedPage = reservedPages.some(
            page => pathname === page || pathname.startsWith(`${page}/`)
          );
          if (!isReservedPage) {
            const profileUrl = new URL(pathname, `https://${PROFILE_HOSTNAME}`);
            profileUrl.search = req.nextUrl.search;
            return NextResponse.redirect(profileUrl, 301);
          }
        }
      }
    }

    // Safely access geo information
    let country = '';
    let region = '';
    try {
      const geo = (req as { geo?: { country?: string; region?: string } }).geo;
      if (geo && typeof geo === 'object') {
        country = geo.country || '';
        region = geo.region || '';
      }
    } catch {
      // Ignore geo errors
    }

    let showBanner = false;
    if (EU_EEA_UK.includes(country)) showBanner = true;
    else if (country === 'US' && US_STATES.includes(region)) showBanner = true;
    else if (country === 'CA' && CA_PROVINCES.includes(region))
      showBanner = true;

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

    const normalizeRedirectPath = (path: string): string => {
      if (path.startsWith('/dashboard')) {
        return path.replace(/^\/dashboard/, '/app/dashboard');
      }
      if (path.startsWith('/settings')) {
        return path.replace(/^\/settings/, '/app/settings');
      }
      return path;
    };

    // Let SSO callback routes complete without middleware interference
    // The AuthenticateWithRedirectCallback component will handle routing based on user state
    if (userId && isAuthPath && !isAuthCallbackPath) {
      // If the user is already signed in and hits a non-callback auth page, check for redirect_url
      const redirectUrl = req.nextUrl.searchParams.get('redirect_url');
      if (
        redirectUrl &&
        redirectUrl.startsWith('/') &&
        !redirectUrl.startsWith('//')
      ) {
        // Honor the redirect_url if it's a valid internal path (e.g., /claim/token)
        res = NextResponse.redirect(
          new URL(normalizeRedirectPath(redirectUrl), req.url)
        );
      } else {
        // Default to the app shell; it will route users to the correct next step.
        res = NextResponse.redirect(new URL('/app/dashboard', req.url));
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
      // Handle authenticated user redirects
      if (pathname.startsWith('/dashboard')) {
        res = NextResponse.redirect(
          new URL(normalizeRedirectPath(pathname), req.url)
        );
      } else if (req.nextUrl.pathname === '/') {
        // Redirect to the app shell which will route users to the appropriate destination.
        res = NextResponse.redirect(new URL('/app/dashboard', req.url));
      } else {
        res = NextResponse.next({ request: { headers: requestHeaders } });
      }
    } else {
      // Handle unauthenticated users
      if (
        pathname === '/waitlist' ||
        pathname.startsWith('/app') ||
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/account') ||
        pathname.startsWith('/billing')
      ) {
        // Redirect to signup for waitlist (new users creating accounts)
        // Redirect to signin for everything else (existing users)
        const authPage = pathname === '/waitlist' ? '/signup' : '/signin';
        const authUrl = new URL(authPage, req.url);
        authUrl.searchParams.set(
          'redirect_url',
          normalizeRedirectPath(req.nextUrl.pathname)
        );
        res = NextResponse.redirect(authUrl);
      } else {
        res = NextResponse.next({ request: { headers: requestHeaders } });
      }
    }

    if (showBanner) {
      res.headers.set('x-show-cookie-banner', '1');
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
    res.headers.set('Content-Security-Policy', contentSecurityPolicy);

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
  } catch {
    // Fallback to basic middleware behavior if Clerk auth fails
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
