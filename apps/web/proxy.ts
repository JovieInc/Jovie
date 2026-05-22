import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';
import {
  getRequestLocationFromHeaders,
  shouldBypassClerk,
  shouldDisableClerkProxyForLocation,
} from '@/components/providers/clerkAvailability';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import {
  checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders,
} from '@/lib/audience/public-profile-block';
import {
  buildAuthDegradedHtmlResponse,
  isBrowserNavigation,
} from '@/lib/auth/auth-degraded-fallback';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import { handleClerkFapiProxy } from '@/lib/auth/clerk-fapi-proxy';
import {
  type ClerkBypassPathInfo,
  isClerkRequiredPath,
  shouldBypassClerkForRequest,
} from '@/lib/auth/clerk-middleware-bypass';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { buildFinalResponse } from '@/lib/auth/final-response';
import { handleInvestorRequest } from '@/lib/auth/investor-portal';
import type { ProxyUserState } from '@/lib/auth/proxy-state';
import { getUserState, isKnownActiveUser } from '@/lib/auth/proxy-state';
import { captureErrorWithHostnameLimit } from '@/lib/auth/sentry-rate-limit';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { captureError } from '@/lib/error-tracking';
import {
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
  isProxyRewriteExempt,
} from '@/lib/routing/proxy-routing';
import { SCRIPT_NONCE_HEADER } from '@/lib/security/content-security-policy';
import {
  createProbeDropResponse,
  isMaliciousProbePath,
} from '@/lib/security/probe-detection';
import { ensureSentry } from '@/lib/sentry/ensure';
import { createBotResponse } from '@/lib/utils/bot-detection';

// ============================================================================
// Single Domain Architecture
// ============================================================================
// - jov.ie: Everything (marketing, auth, profiles, dashboard at /app/*)
// - meetjovie.com: 301 redirects to jov.ie (legacy redirect domain)
// - support.jov.ie: 308 redirects to jov.ie/support (retired help center)
// ============================================================================

// Pre-compiled regex for bot detection (O(1) vs O(n) array iteration)
const META_BOT_REGEX =
  /facebookexternalhit|facebot|facebook|instagram|whatsapp/i;

/**
 * Fast bot detection using pre-compiled regex
 */
function detectMetaBot(userAgent: string): boolean {
  return META_BOT_REGEX.test(userAgent);
}

function isWaitlistInviteRedirect(redirectUrl: string | null): boolean {
  return (
    redirectUrl === '/waitlist/invite' ||
    redirectUrl?.startsWith('/waitlist/invite?') === true
  );
}

/** Max consecutive state-based rewrites before the circuit breaker fires. */
const PROXY_REWRITE_CIRCUIT_BREAKER_THRESHOLD = 3;
const PROXY_REWRITE_COUNT_COOKIE = 'jovie_redirect_count';
const PROXY_REWRITE_COUNT_TTL_SECONDS = 30;

/**
 * Read the redirect-count cookie defensively. A tampered or malformed cookie
 * value must NOT disable the circuit breaker — fall back to 0 on any
 * non-finite or negative value.
 */
function readRedirectCount(req: NextRequest): number {
  const raw = req.cookies.get(PROXY_REWRITE_COUNT_COOKIE)?.value;
  const parsed = Number.parseInt(raw ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Apply a state-based rewrite with a shared redirect-loop circuit breaker.
 * Returns the rewritten NextResponse, or null when the breaker fires (caller
 * falls through with NextResponse.next() and a Sentry event).
 *
 * The counter is shared across all state-based rewrites (waitlist + onboarding)
 * so any loop class trips the same breaker.
 */
function applyStateRewrite(
  req: NextRequest,
  requestHeaders: Headers,
  target: string
): NextResponse | null {
  const redirectCount = readRedirectCount(req);
  if (redirectCount >= PROXY_REWRITE_CIRCUIT_BREAKER_THRESHOLD) {
    return null;
  }
  const res = NextResponse.rewrite(new URL(target, req.url), {
    request: { headers: requestHeaders },
  });
  res.cookies.set(PROXY_REWRITE_COUNT_COOKIE, String(redirectCount + 1), {
    maxAge: PROXY_REWRITE_COUNT_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}

const CLERK_SENSITIVE_PATTERNS = [
  'dummy',
  'mock',
  '1234567890',
  'test-key',
  'placeholder',
] as const;

function isMockOrMissingClerkConfig(hostname: string): boolean {
  const keys = resolveClerkKeys(hostname);

  if (!keys.publishableKey || !keys.secretKey) return true;

  const publishableLower = keys.publishableKey.toLowerCase();
  const secretLower = keys.secretKey.toLowerCase();

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
    binary += String.fromCodePoint(nonceBytes[i]);
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
    const isNavigationMethod = req.method === 'GET' || req.method === 'HEAD';

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

    // Inject the resolved Clerk publishable key so server components can read
    // it from a single pre-resolved header instead of re-parsing the hostname.
    // Only set when BOTH keys are present — a valid publishable key with a
    // missing secret key would trick the auth layout into rendering ClerkProvider,
    // which then throws during SSR because CLERK_SECRET_KEY is unavailable.
    const resolvedKeys = resolveClerkKeys(hostname);
    if (resolvedKeys.publishableKey && resolvedKeys.secretKey) {
      requestHeaders.set(
        'x-clerk-publishable-key',
        resolvedKeys.publishableKey
      );
    }
    // Always set the key-resolution status so downstream UI (signin page,
    // AuthClientProviders) can distinguish "Clerk not configured" from
    // "Clerk disabled for localhost" and show a specific error instead of
    // silently falling back to the mock provider.
    requestHeaders.set('x-clerk-key-status', resolvedKeys.status);

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

    // 308 redirect retired support subdomain to the main support page
    if (hostInfo.isSupportHost) {
      const targetUrl = new URL('/support', 'https://jov.ie');
      targetUrl.search = req.nextUrl.search;
      return NextResponse.redirect(targetUrl, 308);
    }

    // `/start` is the canonical onboarding front door. Redirect legacy
    // `/onboarding` before React renders so users never see the old shell or a
    // streamed meta-refresh fallback. `/onboarding/checkout` remains unchanged.
    if (isNavigationMethod && pathname === APP_ROUTES.ONBOARDING) {
      const targetUrl = req.nextUrl.clone();
      targetUrl.pathname = APP_ROUTES.START;
      return NextResponse.redirect(targetUrl, 308);
    }

    // Authenticated legacy earnings deep links should land directly on the
    // canonical artist profile pay section. Keeping this in proxy preserves
    // auth-aware handling for anonymous users instead of using static redirects.
    if (
      isNavigationMethod &&
      userId &&
      (pathname === APP_ROUTES.DASHBOARD_EARNINGS ||
        pathname === APP_ROUTES.EARNINGS)
    ) {
      return NextResponse.redirect(
        new URL(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`, req.url)
      );
    }

    // ========================================================================
    // Audience block check for public profile routes
    //
    // Runs here — after domain redirects, before any auth/routing logic — so it
    // applies to both authenticated and unauthenticated visitors.
    //
    // On Vercel, middleware executes before the CDN cache is consulted, meaning
    // this gate is enforced even for ISR-cached responses. This lets the profile
    // page avoid calling headers() (which opts the page into dynamic rendering).
    // ========================================================================
    if (isNavigationMethod) {
      const profileUsername = pathInfo.publicProfileCandidate;
      if (profileUsername) {
        const rawIp = getAudienceBlockIpFromHeaders(req.headers);
        const ua = req.headers.get('user-agent');
        const isBlocked = await checkProfileVisitorBlocked(
          profileUsername,
          rawIp,
          ua
        );
        if (isBlocked) {
          return NextResponse.redirect('https://jov.ie');
        }
      }
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

      // Anonymous waitlist visitors now start in chat onboarding. Keep this in
      // middleware so local/dev auth outages do not expose a 503 or legacy view.
      if (isNavigationMethod && pathname === APP_ROUTES.WAITLIST) {
        return NextResponse.redirect(new URL(APP_ROUTES.START, req.url));
      }

      // Check if path requires authentication
      const needsAuth = pathInfo.isProtectedPath;

      if (needsAuth) {
        if (pathname === APP_ROUTES.WAITLIST) {
          return NextResponse.redirect(new URL(APP_ROUTES.START, req.url));
        }
        const authPage = pathname === '/waitlist' ? '/signup' : '/signin';
        const authUrl = new URL(
          buildProtectedAuthRedirectUrl(
            authPage,
            req.nextUrl.pathname,
            req.nextUrl.search
          ),
          req.url
        );
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

    // Auth callback routes must pass through untouched so Clerk can
    // complete the handshake and exchange tokens successfully.
    if (pathInfo.isAuthCallbackPath) {
      return buildFinalResponse(
        req,
        NextResponse.next({ request: { headers: requestHeaders } }),
        pathInfo,
        startTime,
        userId,
        nonce
      );
    }

    // ========================================================================
    // Authenticated user handling - SINGLE getUserState call
    // ========================================================================
    const isRSCPrefetch =
      req.headers.get('Next-Router-Prefetch') === '1' ||
      req.nextUrl.searchParams.has('_rsc');

    // Authenticated users on homepage → redirect to dashboard at the edge.
    // Skips the client-side AuthRedirectHandler overlay (black flash) entirely.
    // No getUserState needed — /app handles waitlist/onboarding gating in its layout.
    if (pathname === '/' && isNavigationMethod && !isRSCPrefetch) {
      return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
    }

    // Fetch user state ONCE for all authenticated routing decisions
    let userState: ProxyUserState | null = null;

    // Only non-/app page routes need user state for middleware rewrites.
    // /app and /app/* perform auth and onboarding/waitlist gating deeper in
    // route handlers/layouts, so proxy-level state lookups are unnecessary.
    const needsUserState =
      !pathname.startsWith('/api/') &&
      !pathInfo.isAuthCallbackPath &&
      pathname !== '/app' &&
      !pathname.startsWith('/app/');

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
      isNavigationMethod &&
      userState
    ) {
      const redirectUrl = sanitizeRedirectUrl(
        req.nextUrl.searchParams.get('redirect_url')
      );

      if (redirectUrl && isWaitlistInviteRedirect(redirectUrl)) {
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      }
      if (userState.needsWaitlist) {
        return NextResponse.redirect(new URL('/waitlist', req.url));
      }
      if (userState.needsOnboarding) {
        return NextResponse.redirect(new URL(APP_ROUTES.START, req.url));
      }
      if (redirectUrl) {
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      }
      return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
    }

    // Route based on user state
    // Note: /app/* routes are excluded from waitlist/onboarding rewrites because
    // they have their own auth handling in their layouts. Rewriting /app/* to
    // /waitlist during RSC navigation causes layout hierarchy mismatches that
    // manifest as "page not found" errors on the client.
    if (userState) {
      const isInviteRedemptionPath = isWaitlistInviteRedirect(
        req.nextUrl.pathname + req.nextUrl.search
      );

      // Rewrite banned/deleted users to generic unavailable page.
      // Uses rewrite (not redirect) so the URL bar stays on whatever page
      // they were visiting — no dedicated path to discover.
      // Note: /app/* routes are handled by the shell layout ban check,
      // not here (proxy skips getUserState for /app/* paths).
      if (
        userState.isBanned &&
        isNavigationMethod &&
        !isRSCPrefetch &&
        pathname !== APP_ROUTES.UNAVAILABLE
      ) {
        res = NextResponse.rewrite(new URL(APP_ROUTES.UNAVAILABLE, req.url), {
          request: { headers: requestHeaders },
        });
      } else if (
        userState.needsWaitlist &&
        pathname !== '/waitlist' &&
        !isInviteRedemptionPath &&
        !isProxyRewriteExempt(pathname)
      ) {
        const waitlistRewrite = applyStateRewrite(
          req,
          requestHeaders,
          '/waitlist'
        );
        if (waitlistRewrite === null) {
          await captureError(
            '[proxy] Redirect loop circuit breaker triggered',
            new Error('Redirect loop detected'),
            {
              pathname,
              target: '/waitlist',
              redirectCount: readRedirectCount(req),
              operation: 'proxy_circuit_breaker',
            }
          );
          res = NextResponse.next({ request: { headers: requestHeaders } });
          res.cookies.delete(PROXY_REWRITE_COUNT_COOKIE);
        } else {
          res = waitlistRewrite;
        }
      } else if (
        userState.needsOnboarding &&
        pathname !== APP_ROUTES.START &&
        !isInviteRedemptionPath &&
        !isProxyRewriteExempt(pathname)
      ) {
        const onboardingJustCompleted =
          req.cookies.get('jovie_onboarding_complete')?.value === '1';

        if (onboardingJustCompleted) {
          res = NextResponse.next({ request: { headers: requestHeaders } });
          res.cookies.delete('jovie_onboarding_complete');
        } else {
          const rewriteRes = applyStateRewrite(
            req,
            requestHeaders,
            APP_ROUTES.START
          );
          if (rewriteRes === null) {
            await captureError(
              '[proxy] Redirect loop circuit breaker triggered',
              new Error('Redirect loop detected'),
              {
                pathname,
                target: APP_ROUTES.START,
                redirectCount: readRedirectCount(req),
                operation: 'proxy_circuit_breaker',
              }
            );
            res = NextResponse.next({ request: { headers: requestHeaders } });
            res.cookies.delete(PROXY_REWRITE_COUNT_COOKIE);
          } else {
            res = rewriteRes;
          }
        }
      } else if (
        !userState.needsWaitlist &&
        pathname === '/waitlist' &&
        isNavigationMethod &&
        !isRSCPrefetch
      ) {
        return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
      } else if (pathInfo.isAuthPath && isNavigationMethod && !isRSCPrefetch) {
        // Redirect authenticated users away from any auth page (/signin, /sign-in,
        // /signup, /sign-up). Uses isAuthPath to cover all variants consistently.
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

function _getGeoFromRequest(req: NextRequest): {
  city: string | null;
  region: string | null;
} {
  const geoRequest = req as NextRequest & {
    geo?: { city?: string | null; region?: string | null };
  };

  const rawCity = req.headers.get('x-vercel-ip-city')?.trim() ?? null;
  const cityFromHeader = rawCity ? decodeURIComponent(rawCity) : null;
  const regionFromHeader =
    req.headers.get('x-vercel-ip-country-region')?.trim() ?? null;

  return {
    city: cityFromHeader || geoRequest.geo?.city?.trim() || null,
    region: regionFromHeader || geoRequest.geo?.region?.trim() || null,
  };
}

// Production Clerk middleware (default keys from env)
const clerkProductionMiddleware = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  return handleRequest(req, userId);
});

// Staging Clerk middleware — lazy-initialized with separate instance keys.
// The same build is promoted staging → production, so staging keys are
// stored as server-only runtime env vars (not NEXT_PUBLIC_).
//
// Key resolution order:
// 1. Explicit _STAGING suffixed vars (if either is set, use only those)
// 2. Standard env vars read at runtime via bracket notation to bypass
//    webpack DefinePlugin (Doppler syncs staging values per-environment)
let _clerkStagingMiddleware: NextMiddleware | null = null;
function getClerkStagingMiddleware() {
  if (_clerkStagingMiddleware === null) {
    const explicitPk = process.env.CLERK_PUBLISHABLE_KEY_STAGING;
    const explicitSk = process.env.CLERK_SECRET_KEY_STAGING;

    let stagingPk: string | undefined;
    let stagingSk: string | undefined;

    if (explicitPk || explicitSk) {
      // Explicit _STAGING vars present — use only those (fail closed on partial)
      stagingPk = explicitPk;
      stagingSk = explicitSk;
    } else {
      // Fall back to runtime standard vars (bracket notation bypasses DefinePlugin)
      stagingPk =
        (process.env as Record<string, string | undefined>)[
          'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
        ] || undefined;
      stagingSk = process.env.CLERK_SECRET_KEY || undefined;
    }

    if (stagingPk && stagingSk) {
      // Read proxyUrl at runtime using bracket notation to bypass webpack
      // DefinePlugin. NEXT_PUBLIC_CLERK_PROXY_URL is inlined at build time with
      // the production value, but staging and production share the same path
      // (/__clerk), so the inlined value is correct. The bracket notation is
      // used here for symmetry with the other runtime env reads above and to
      // ensure the correct value is used if the env var differs per environment.
      const stagingProxyUrl =
        (process.env as Record<string, string | undefined>)[
          'NEXT_PUBLIC_CLERK_PROXY_URL'
        ] || '/__clerk';

      _clerkStagingMiddleware = clerkMiddleware(
        async (auth, req) => {
          const { userId } = await auth();
          return handleRequest(req, userId);
        },
        {
          publishableKey: stagingPk,
          secretKey: stagingSk,
          proxyUrl: stagingProxyUrl,
        }
      );
    }
  }
  return _clerkStagingMiddleware;
}

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent
) {
  // ========================================================================
  // Drop obvious scanner probes early (e.g. /username/wp-content/...,
  // /xmlrpc.php, /.env). These paths can never legitimately match a Jovie
  // route, but the public profile catch-all redirects them into the page
  // pipeline — which wakes up rendering, billing for an invocation, and
  // emits Sentry warnings. The dedicated detector returns a quiet 404
  // before any other handling so probe traffic costs nothing downstream.
  // ========================================================================
  if (isMaliciousProbePath(req.nextUrl.pathname)) {
    return createProbeDropResponse();
  }

  const hostInfo = analyzeHost(req.nextUrl.hostname);
  if (hostInfo.isSupportHost) {
    const targetUrl = new URL(APP_ROUTES.SUPPORT, BASE_URL);
    targetUrl.search = req.nextUrl.search;
    return NextResponse.redirect(targetUrl, 308);
  }

  // ========================================================================
  // Investor portal: handle before Clerk (no auth needed)
  // /investor-portal uses token-based access, not Clerk sessions
  // Legacy investors.jov.ie subdomain redirects to /investor-portal
  // ========================================================================
  const investorResponse = await handleInvestorRequest(req, event);
  if (investorResponse) return investorResponse;

  if (isTestAuthBypassEnabled()) {
    const testBypassUserId = resolveTestBypassUserId(req.headers, req.cookies);
    if (testBypassUserId) {
      return handleRequest(req, testBypassUserId);
    }
  }

  const pathname = req.nextUrl.pathname;

  const hostname = req.nextUrl.hostname;

  // Clerk FAPI proxy (extracted)
  const clerkProxyRes = await handleClerkFapiProxy(req);
  if (clerkProxyRes) return clerkProxyRes;

  const pathInfo = categorizePath(pathname);
  const isNavigationMethod = req.method === 'GET' || req.method === 'HEAD';
  const canProceedWithoutClerk =
    pathInfo.isAuthPath ||
    (!pathInfo.isProtectedPath && !isClerkRequiredPath(pathname, pathInfo)) ||
    (isNavigationMethod && pathname === APP_ROUTES.WAITLIST);

  // Check if Clerk config is missing or mocked (staging-aware)
  const clerkConfigMissing = isMockOrMissingClerkConfig(hostname);

  // In test mode, always bypass Clerk if config is missing
  if (process.env.NODE_ENV === 'test' && clerkConfigMissing) {
    return handleRequest(req, null);
  }

  // In production/dev, if Clerk config is missing, handle gracefully
  // This can happen during Vercel cold starts when env vars are temporarily unavailable
  if (clerkConfigMissing) {
    // For public routes (non-protected), proceed without auth
    // This allows the homepage, marketing pages, and public profiles to load.
    // Authenticated API routes (e.g. /api/chat) must NOT fall through here —
    // their route handlers call auth() and would throw "Clerk can't detect
    // usage of clerkMiddleware()" (JOV-1795) if Clerk context wasn't set up.
    if (canProceedWithoutClerk) {
      return handleRequest(req, null);
    }

    // For protected routes, return a service unavailable error.
    // Browser navigations get an HTML page; API/fetch callers get JSON.
    await captureErrorWithHostnameLimit(
      '[middleware] Clerk config missing for protected route',
      new Error('Clerk config missing'),
      hostname,
      { context: { pathname, context: 'clerk_config_missing' } }
    );

    if (isBrowserNavigation(req.headers.get('accept'))) {
      return buildAuthDegradedHtmlResponse();
    }
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

  const clerkPathInfo: ClerkBypassPathInfo = pathInfo;
  const { publishableKey: resolvedClerkPublishableKey } =
    resolveClerkKeys(hostname);
  const requestLocation =
    getRequestLocationFromHeaders(req.headers) ?? req.nextUrl;
  const shouldDisableClerkProxyOnPrivateOrigin =
    shouldDisableClerkProxyForLocation(requestLocation);
  const shouldForceBypassClerk = shouldBypassClerk(
    resolvedClerkPublishableKey,
    process.env.NEXT_PUBLIC_CLERK_MOCK,
    requestLocation
  );
  const allowAuthRouteClerkBypass =
    shouldForceBypassClerk ||
    shouldDisableClerkProxyOnPrivateOrigin ||
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
  const shouldForceBypassClerkForRequest =
    shouldForceBypassClerk && !shouldDisableClerkProxyOnPrivateOrigin;

  if (
    shouldBypassClerkForRequest({
      allowAuthRouteBypass: allowAuthRouteClerkBypass,
      pathname,
      pathInfo: clerkPathInfo,
      cookies: req.cookies.getAll(),
      forceBypass: shouldForceBypassClerkForRequest,
    })
  ) {
    return handleRequest(req, null);
  }

  // Select the correct Clerk middleware based on hostname.
  // Staging uses a separate Clerk instance with its own keys.
  const selectedMiddleware = isStagingHost(hostname)
    ? getClerkStagingMiddleware()
    : clerkProductionMiddleware;

  if (!selectedMiddleware) {
    if (canProceedWithoutClerk) {
      return handleRequest(req, null);
    }

    await captureErrorWithHostnameLimit(
      '[middleware] Clerk middleware unavailable for protected route',
      new Error('Clerk middleware not initialized'),
      hostname,
      { context: { pathname, context: 'clerk_middleware_missing' } }
    );

    if (isBrowserNavigation(req.headers.get('accept'))) {
      return buildAuthDegradedHtmlResponse();
    }
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

  try {
    return await selectedMiddleware(req, event);
  } catch (error) {
    // Clerk middleware can throw on staging when keys are invalid or the
    // domain isn't in the Clerk app's allowlist. Fall back gracefully so
    // auth routes render the "Auth unavailable" card instead of a 500.
    if (isStagingHost(hostname)) {
      await captureErrorWithHostnameLimit(
        '[middleware] Staging Clerk error',
        error,
        hostname,
        { context: { pathname, context: 'staging_clerk_middleware' } }
      );
      // Mirror the !selectedMiddleware fallback: only treat as unauthenticated
      // for auth pages and truly public paths. Protected paths (e.g. /onboarding,
      // /app) must not silently fall back to null userId — that causes a redirect
      // loop where the user completes Google OAuth but lands back at
      // /signin?redirect_url=%2Fonboarding instead of /onboarding (JOV-1902).
      if (canProceedWithoutClerk) {
        return handleRequest(req, null);
      }

      if (isBrowserNavigation(req.headers.get('accept'))) {
        return buildAuthDegradedHtmlResponse();
      }
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
    throw error;
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, .well-known, and Sentry tunnel (/monitoring)
    // NOTE: use \\\\ (double-escape) so the string contains \\. which is a literal dot in
    // the compiled regex. A single \\. in a JS string becomes just . (any char), which
    // would allow paths like /wp-json or /a-css/foo to bypass middleware (JOV-2236).
    '/((?!_next|monitoring(?:/|$)|\\.well-known|.*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk proxy paths (including .js bundles from /npm/)
    '/__clerk/(.*)',
    '/clerk/(.*)',
  ],
};
