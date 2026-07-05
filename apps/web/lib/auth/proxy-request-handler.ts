import { type NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders,
} from '@/lib/audience/public-profile-block';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import { isCentralAuthPassThroughRoute } from '@/lib/auth/central-auth-routing';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { buildFinalResponse } from '@/lib/auth/final-response';
import type { ProxyUserState } from '@/lib/auth/proxy-state';
import { getUserState, isKnownActiveUser } from '@/lib/auth/proxy-state';
import { resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { resolveLegacyRootPathRedirect } from '@/lib/routing/legacy-root-path-redirects';
import {
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
  isDedicatedRootSegment,
  isProxyRewriteExempt,
} from '@/lib/routing/proxy-routing';
import { SCRIPT_NONCE_HEADER } from '@/lib/security/content-security-policy';
import {
  isExplicitDevelopmentEnvironment,
  shouldBypassProductionBlockedDebugPath,
} from '@/lib/security/development-only';
import { createFastNotFoundResponse } from '@/lib/security/probe-detection';
import { isProductionBlockedDebugPath } from '@/lib/security/production-blocked-routes';
import { ensureSentry } from '@/lib/sentry/ensure';
import { createBotResponse } from '@/lib/utils/bot-detection';
import { isReservedUsername } from '@/lib/validation/username-core';

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

function shouldAllowProductScreenshotCaptureRoutes(req: NextRequest): boolean {
  return shouldBypassProductionBlockedDebugPath(
    req.nextUrl.pathname,
    req.nextUrl.hostname,
    req.headers
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
 * Apply a state-based redirect with a shared redirect-loop circuit breaker.
 * Returns the redirect NextResponse, or null when the breaker fires (caller
 * falls through with NextResponse.next() and a Sentry event).
 *
 * Uses redirect (not rewrite) so the URL bar moves to the canonical target.
 * Rewrites left the original pathname in the address bar, which caused
 * repeated middleware hits (RSC prefetches) on non-exempt paths and tripped
 * the breaker even when the user was already viewing onboarding content.
 *
 * The counter is shared across all state-based redirects (waitlist + onboarding)
 * so any loop class trips the same breaker.
 */
function applyStateRedirect(
  req: NextRequest,
  target: string
): NextResponse | null {
  const redirectCount = readRedirectCount(req);
  if (redirectCount >= PROXY_REWRITE_CIRCUIT_BREAKER_THRESHOLD) {
    return null;
  }
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set(PROXY_REWRITE_COUNT_COOKIE, String(redirectCount + 1), {
    maxAge: PROXY_REWRITE_COUNT_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
  return res;
}

/**
 * Apply a state-based redirect, handling the circuit-breaker fallthrough:
 * when the breaker fires, capture a Sentry warning, pass the request through,
 * and clear the redirect-count cookie so the next navigation starts fresh.
 */
async function applyStateRedirectOrBreak(
  req: NextRequest,
  requestHeaders: Headers,
  target: string
): Promise<NextResponse> {
  const redirect = applyStateRedirect(req, target);
  if (redirect !== null) {
    return redirect;
  }
  await captureWarning(
    '[proxy] Redirect loop circuit breaker triggered',
    new Error('Redirect loop detected'),
    {
      pathname: req.nextUrl.pathname,
      target,
      redirectCount: readRedirectCount(req),
      operation: 'proxy_circuit_breaker',
    }
  );
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.delete(PROXY_REWRITE_COUNT_COOKIE);
  return res;
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

/**
 * Core proxy request handler: routing, state-based redirects, CSP nonce,
 * and final response composition. Runs after Clerk middleware (or a bypass)
 * has resolved the userId.
 */
export async function handleProxyRequest(
  req: NextRequest,
  userId: string | null
) {
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

    // Block debug/test/dev surfaces outside explicit development environments.
    if (
      !isExplicitDevelopmentEnvironment() &&
      !shouldBypassProductionBlockedDebugPath(
        pathname,
        hostname,
        req.headers
      ) &&
      isProductionBlockedDebugPath(pathname, {
        allowProductScreenshotCaptureRoutes:
          shouldAllowProductScreenshotCaptureRoutes(req),
      })
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

    // Legacy single-segment paths (e.g. /login, /request-access) must never
    // hit the public profile catch-all — redirect before any DB work (JOV-3054).
    if (isNavigationMethod) {
      const legacyRedirect = resolveLegacyRootPathRedirect(pathname);
      if (legacyRedirect) {
        const targetUrl = req.nextUrl.clone();
        targetUrl.pathname = legacyRedirect;
        return NextResponse.redirect(targetUrl, 308);
      }
    }

    // Reserved handle segments with no dedicated route get a real 404 at the
    // edge — no soft-404 HTML, no DB (JOV-3054).
    if (isNavigationMethod) {
      const pathParts = pathname.split('/').filter(Boolean);
      const rootSegment = pathParts[0];
      if (
        rootSegment &&
        pathParts.length === 1 &&
        isReservedUsername(rootSegment) &&
        !isDedicatedRootSegment(rootSegment)
      ) {
        return createFastNotFoundResponse();
      }
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
    // Native auth start must also reach its route handler for authenticated
    // users so it can issue the central callback instead of being redirected
    // by waitlist/onboarding middleware state.
    if (
      pathInfo.isAuthCallbackPath ||
      isCentralAuthPassThroughRoute(pathname)
    ) {
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

    // Fetch user state ONCE for all authenticated routing decisions
    let userState: ProxyUserState | null = null;

    // Only non-/app page routes need user state for middleware redirects.
    // /app and /app/* perform auth and onboarding/waitlist gating deeper in
    // route handlers/layouts, so proxy-level state lookups are unnecessary.
    const needsUserState =
      !pathname.startsWith('/api/') &&
      !pathInfo.isAuthCallbackPath &&
      pathname !== '/app' &&
      !pathname.startsWith('/app/');

    // Skip the getUserState call for RSC prefetch requests when the user is
    // already known-active from the in-memory cache. Active users don't need
    // routing intervention (no waitlist/onboarding redirect), so the prefetch
    // can pass through immediately. The subsequent full navigation will still
    // call getUserState normally.
    const canSkipForPrefetch = isRSCPrefetch && isKnownActiveUser(userId);

    if (needsUserState && !canSkipForPrefetch) {
      userState = await getUserState(userId);
    }

    // Authenticated users on homepage → route based on user state at the edge.
    // needsOnboarding users go directly to /start so we never bounce through
    // /app (which immediately redirects back to /start and can loop with
    // /onboarding/checkout — JOV-2454 / ENG-002).
    if (pathname === '/' && isNavigationMethod && !isRSCPrefetch) {
      if (userState?.needsOnboarding) {
        return NextResponse.redirect(new URL(APP_ROUTES.START, req.url));
      }
      if (userState?.needsWaitlist) {
        return NextResponse.redirect(new URL('/waitlist', req.url));
      }
      return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
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
        res = await applyStateRedirectOrBreak(req, requestHeaders, '/waitlist');
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
          res = await applyStateRedirectOrBreak(
            req,
            requestHeaders,
            APP_ROUTES.START
          );
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
