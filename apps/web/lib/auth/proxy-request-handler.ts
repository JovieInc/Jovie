import { getCookieCache } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders,
} from '@/lib/audience/public-profile-block';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import { isCentralAuthPassThroughRoute } from '@/lib/auth/central-auth-routing';
import { buildFinalResponse } from '@/lib/auth/final-response';
import { captureError } from '@/lib/error-tracking';
import { resolveLegacyRootPathRedirect } from '@/lib/routing/legacy-root-path-redirects';
import {
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
  isDedicatedRootSegment,
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

function shouldAllowProductScreenshotCaptureRoutes(req: NextRequest): boolean {
  return shouldBypassProductionBlockedDebugPath(
    req.nextUrl.pathname,
    req.nextUrl.hostname,
    req.headers
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

/**
 * Core proxy request handler: routing, signed-in `/` → `/app` redirect, CSP
 * nonce, and final response composition. Runs after the proxy.ts entry has
 * resolved the signed-in marker (Better Auth session cookie presence).
 *
 * The handler treats `userId` as a truthy signed-in marker only. Plan
 * decision 5: the proxy no longer does user-state DB/Redis work — the
 * shell layout (`resolveUserState`) owns waitlist/onboarding/banned
 * redirects. Auth-page signed-in redirects are owned by the pages
 * themselves via `auth.api.getSession` (audit row 16 — avoids a 5-min
 * stale cookie-cache redirect loop). The signed-cookie validation via
 * `getCookieCache` is consulted ONLY for the `/` → `/app` convenience
 * redirect (worst case: one bounce to /signin, no loop).
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
    // Next.js Server Components read the nonce from request headers via
    // headers().get('x-nonce')
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
    // canonical artist profile pay section.
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
    // Runs here — after domain redirects, before any auth/routing logic — so
    // it applies to both authenticated and unauthenticated visitors.
    //
    // On Vercel, middleware executes before the CDN cache is consulted,
    // meaning this gate is enforced even for ISR-cached responses. This lets
    // the profile page avoid calling headers() (which opts the page into
    // dynamic rendering).
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
    // Unauthenticated user handling (no getCookieCache call needed)
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

      // Anonymous waitlist visitors start in chat onboarding. Keep this in
      // middleware so local/dev auth outages do not expose a 503 or legacy
      // view.
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

      // Unauthenticated user on public path — build response with CSP if needed
      return buildFinalResponse(
        req,
        NextResponse.next({ request: { headers: requestHeaders } }),
        pathInfo,
        startTime,
        null,
        nonce
      );
    }

    // Auth callback / native handoff pass-through routes must reach their
    // route handlers untouched so OAuth/PKCE completion can succeed. The
    // signed-in marker is forwarded but no state-based redirect is applied.
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
    // Signed-in `/` → `/app` convenience redirect (audit row 16).
    //
    // `getCookieCache(req)` validates the signed session cookie (zero DB hit
    // for cache reads ≤5 min old). On a valid signed-in session at `/`, the
    // proxy bounces to /app. On a stale/revoked cookie (worst case), the
    // user lands on /, the shell layout re-validates via the full
    // `auth.api.getSession`, and bounces to /signin if needed — one bounce,
    // no loop. The shell layout owns the waitlist/onboarding redirect for
    // authenticated /app/* navigations.
    // ========================================================================
    if (pathname === '/' && isNavigationMethod) {
      try {
        // `getCookieCache` validates the signed session cookie (zero DB hit
        // for cache reads ≤5 min old). A non-null return means the user has
        // a live BA session — bounce to /app. A null/throw means stale or
        // absent — fall through to render the anonymous homepage; the shell
        // layout revalidates via auth.api.getSession. Audit row 16.
        const cachedSession = await getCookieCache(req);
        if (cachedSession) {
          return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
        }
      } catch {
        // Tampered/unparseable signed cookie — treat as not signed in.
      }
    }

    // Default: pass through with CSP nonce. /app/* and other authenticated
    // surfaces do their own auth/onboarding/waitlist gating in layouts and
    // route handlers (plan decision 5: shell layout owns user-state
    // redirects; proxy no longer does DB/Redis work).
    return buildFinalResponse(
      req,
      NextResponse.next({ request: { headers: requestHeaders } }),
      pathInfo,
      startTime,
      userId,
      nonce
    );
  } catch (error) {
    await captureError('Middleware error in proxy', error, {
      pathname: req.nextUrl.pathname,
      context: 'proxy_middleware',
    });
    return NextResponse.next();
  }
}
