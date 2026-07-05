import {
  type NextFetchEvent,
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
import { respondAuthDegraded } from '@/lib/auth/auth-degraded-fallback';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import { handleClerkFapiProxy } from '@/lib/auth/clerk-fapi-proxy';
import {
  type ClerkBypassPathInfo,
  isClerkRequiredPath,
  shouldBypassClerkForRequest,
} from '@/lib/auth/clerk-middleware-bypass';
import {
  isMockOrMissingClerkConfig,
  selectClerkMiddleware,
} from '@/lib/auth/clerk-middleware-instances';
import { handleInvestorRequest } from '@/lib/auth/investor-portal';
import { handleProxyRequest } from '@/lib/auth/proxy-request-handler';
import { captureErrorWithHostnameLimit } from '@/lib/auth/sentry-rate-limit';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { analyzeHost, categorizePath } from '@/lib/routing/proxy-routing';
import { isLocalDevelopmentAutomationHostname } from '@/lib/security/development-only';
import {
  createProbeDropResponse,
  isMaliciousProbePath,
} from '@/lib/security/probe-detection';

// ============================================================================
// Single Domain Architecture
// ============================================================================
// - jov.ie: Everything (marketing, auth, profiles, dashboard at /app/*)
// - meetjovie.com: 301 redirects to jov.ie (legacy redirect domain)
// - support.jov.ie: 308 redirects to jov.ie/support (retired help center)
// ============================================================================

function hasClerkSessionCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some(
      cookie =>
        cookie.name.startsWith('__session') ||
        cookie.name.startsWith('__client') ||
        cookie.name.startsWith('__clerk')
    );
}

function isElectronAppShellNavigation(
  req: NextRequest,
  isNavigationMethod: boolean
): boolean {
  return (
    isNavigationMethod &&
    (req.nextUrl.pathname === APP_ROUTES.DASHBOARD ||
      req.nextUrl.pathname.startsWith('/app/')) &&
    req.nextUrl.searchParams.get('runtime') === 'electron'
  );
}

function redirectSignedOutElectronAppShell(req: NextRequest): NextResponse {
  const targetUrl = new URL(
    buildProtectedAuthRedirectUrl(
      APP_ROUTES.SIGNIN,
      req.nextUrl.pathname,
      req.nextUrl.search
    ),
    req.url
  );
  const response = NextResponse.redirect(targetUrl);
  response.headers.set('Location', targetUrl.toString());
  return response;
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
      return handleProxyRequest(req, testBypassUserId);
    }
  }

  const pathname = req.nextUrl.pathname;

  const hostname = req.nextUrl.hostname;
  const isSecureVercelDeployment =
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview';
  const isLocalPublicNoAuthSmokeRequest =
    process.env.PUBLIC_NOAUTH_SMOKE === '1' &&
    !isSecureVercelDeployment &&
    isLocalDevelopmentAutomationHostname(hostname);

  // Clerk FAPI proxy (extracted)
  const clerkProxyRes = await handleClerkFapiProxy(req);
  if (clerkProxyRes) return clerkProxyRes;

  const pathInfo = categorizePath(pathname);
  const isNavigationMethod = req.method === 'GET' || req.method === 'HEAD';

  if (
    isElectronAppShellNavigation(req, isNavigationMethod) &&
    !hasClerkSessionCookie(req)
  ) {
    return redirectSignedOutElectronAppShell(req);
  }

  const canProceedWithoutClerk =
    pathInfo.isAuthPath ||
    (!pathInfo.isProtectedPath && !isClerkRequiredPath(pathname, pathInfo)) ||
    (isNavigationMethod && pathname === APP_ROUTES.WAITLIST);

  // Check if Clerk config is missing or mocked (staging-aware)
  const clerkConfigMissing = isMockOrMissingClerkConfig(hostname);

  // In test mode, always bypass Clerk if config is missing
  if (process.env.NODE_ENV === 'test' && clerkConfigMissing) {
    return handleProxyRequest(req, null);
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
      return handleProxyRequest(req, null);
    }

    // For protected routes, return a service unavailable error.
    // Browser navigations get an HTML page; API/fetch callers get JSON.
    await captureErrorWithHostnameLimit(
      '[middleware] Clerk config missing for protected route',
      new Error('Clerk config missing'),
      hostname,
      { context: { pathname, context: 'clerk_config_missing' } }
    );

    return respondAuthDegraded(req.headers.get('accept'));
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
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    isLocalPublicNoAuthSmokeRequest;
  const shouldForceBypassClerkForRequest =
    (shouldForceBypassClerk && !shouldDisableClerkProxyOnPrivateOrigin) ||
    isLocalPublicNoAuthSmokeRequest;

  if (
    shouldBypassClerkForRequest({
      allowAuthRouteBypass: allowAuthRouteClerkBypass,
      pathname,
      pathInfo: clerkPathInfo,
      cookies: req.cookies.getAll(),
      forceBypass: shouldForceBypassClerkForRequest,
    })
  ) {
    return handleProxyRequest(req, null);
  }

  // Select the correct Clerk middleware based on hostname.
  // Staging uses a separate Clerk instance with its own keys.
  const selectedMiddleware = selectClerkMiddleware(hostname);

  if (!selectedMiddleware) {
    if (canProceedWithoutClerk) {
      return handleProxyRequest(req, null);
    }

    await captureErrorWithHostnameLimit(
      '[middleware] Clerk middleware unavailable for protected route',
      new Error('Clerk middleware not initialized'),
      hostname,
      { context: { pathname, context: 'clerk_middleware_missing' } }
    );

    return respondAuthDegraded(req.headers.get('accept'));
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
        return handleProxyRequest(req, null);
      }

      return respondAuthDegraded(req.headers.get('accept'));
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
