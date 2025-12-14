import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ensureSentry } from '@/lib/sentry/ensure';
import { createBotResponse, detectBot } from '@/lib/utils/bot-detection';

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

export default clerkMiddleware(async (auth, req) => {
  await ensureSentry();
  try {
    // Start performance timing
    const startTime = Date.now();

    // Conservative bot blocking - only on sensitive API endpoints
    const pathname = req.nextUrl.pathname;
    const isSensitiveAPI = pathname.startsWith('/api/link/');

    // Block Sentry example pages in production (dev-only testing routes)
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

    if (isSensitiveAPI) {
      const botResult = detectBot(req, pathname);

      // Only block Meta crawlers on sensitive API endpoints to avoid anti-cloaking penalties
      if (botResult.shouldBlock) {
        return createBotResponse(204);
      }
    }

    const { userId } = await auth();

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

    const normalizeRedirectPath = (path: string): string => {
      if (path.startsWith('/dashboard')) {
        return path.replace(/^\/dashboard/, '/app/dashboard');
      }
      if (path.startsWith('/settings')) {
        return path.replace(/^\/settings/, '/app/settings');
      }
      return path;
    };

    if (userId && isAuthPath) {
      // If the user is already signed in and hits any auth page, check for redirect_url
      const redirectUrl = req.nextUrl.searchParams.get('redirect_url');
      if (redirectUrl && redirectUrl.startsWith('/')) {
        // Honor the redirect_url if it's a valid internal path (e.g., /claim/token)
        res = NextResponse.redirect(
          new URL(normalizeRedirectPath(redirectUrl), req.url)
        );
      } else {
        // Default to dashboard
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
        res = NextResponse.redirect(new URL('/app/dashboard', req.url));
      } else {
        res = NextResponse.next();
      }
    } else {
      // Handle unauthenticated users
      if (
        pathname.startsWith('/app') ||
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/account') ||
        pathname.startsWith('/billing')
      ) {
        // Redirect unauthenticated users to sign-in
        const signInUrl = new URL('/signin', req.url);
        signInUrl.searchParams.set(
          'redirect_url',
          normalizeRedirectPath(req.nextUrl.pathname)
        );
        res = NextResponse.redirect(signInUrl);
      } else {
        res = NextResponse.next();
      }
    }

    if (showBanner) {
      res.headers.set('x-show-cookie-banner', '1');
    }

    // Add performance monitoring headers
    const duration = Date.now() - startTime;
    res.headers.set('Server-Timing', `middleware;dur=${duration}`);

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
});

export const config = {
  matcher: [
    // Skip Next.js internals, all static files, and .well-known directory
    '/((?!_next|\.well-known|.*\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
