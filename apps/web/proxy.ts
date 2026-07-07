import { getSessionCookie } from 'better-auth/cookies';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import { handleInvestorRequest } from '@/lib/auth/investor-portal';
import { handleProxyRequest } from '@/lib/auth/proxy-request-handler';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { analyzeHost } from '@/lib/routing/proxy-routing';
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

/**
 * Better Auth session cookie presence check (zero DB/Redis). Returns the
 * cookie value when present, `null` otherwise. The proxy hot path treats a
 * non-null return as the signed-in signal — `handleProxyRequest` only needs
 * a truthy marker now that the proxy no longer does user-state DB/Redis
 * work (plan decision 5). The signed-cookie validation lives inside
 * `handleProxyRequest` via `getCookieCache` for the `/` → `/app` convenience
 * redirect only (audit row 16: avoids a 5-min stale-loop on auth pages).
 */
function detectBetterAuthSession(req: NextRequest): string | null {
  try {
    return getSessionCookie(req);
  } catch {
    // getSessionCookie can throw on malformed cookies; treat as signed-out.
    return null;
  }
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
  // pipeline — which wakes up rendering, bills for an invocation, and
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
  // Better Auth catch-all endpoints (sign-in/social, OAuth callbacks, email
  // OTP send/verify, one-time-token verify, session endpoints) pass through
  // untouched so the BA handler at app/api/auth/[...all]/route.ts owns the
  // response. Plan decision 5: categorizePath treats /api/auth/* as an
  // auth-callback pass-through; this early return keeps BA endpoints off
  // the proxy's nonce/CSP/redirect path entirely.
  // ========================================================================
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // ========================================================================
  // Investor portal: handle before auth (token-based access, not BA sessions)
  // /investor-portal uses token-based access; legacy investors.jov.ie
  // subdomain redirects to /investor-portal.
  // ========================================================================
  const investorResponse = await handleInvestorRequest(req, event);
  if (investorResponse) return investorResponse;

  if (isTestAuthBypassEnabled()) {
    const testBypassUserId = resolveTestBypassUserId(req.headers, req.cookies);
    if (testBypassUserId) {
      return handleProxyRequest(req, testBypassUserId);
    }
  }

  const isNavigationMethod = req.method === 'GET' || req.method === 'HEAD';
  const sessionCookie = detectBetterAuthSession(req);

  // Electron app-shell navigations need a signed-in session cookie to render
  // the dashboard; without one, bounce to /signin?redirect_url=… before the
  // shell ever boots.
  if (isElectronAppShellNavigation(req, isNavigationMethod) && !sessionCookie) {
    return redirectSignedOutElectronAppShell(req);
  }

  // The proxy hot path is now cookie-only (plan decision 5):
  //   - getSessionCookie(req) above is the only auth read on the hot path
  //     (zero DB/Redis).
  //   - handleProxyRequest treats the second argument as a truthy
  //     signed-in marker. The signed-cookie validation (getCookieCache)
  //     happens inside handleProxyRequest for the `/` → `/app` redirect
  //     only. Auth-page signed-in redirects are owned by the pages
  //     themselves via auth.api.getSession (audit row 16).
  return handleProxyRequest(req, sessionCookie);
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, .well-known, and Sentry tunnel
    // (/monitoring). NOTE: use \\\\ (double-escape) so the string contains
    // \\. which is a literal dot in the compiled regex. A single \\. in a
    // JS string becomes just . (any char), which would allow paths like
    // /wp-json or /a-css/foo to bypass middleware (JOV-2236).
    '/((?!_next|monitoring(?:/|$)|\\.well-known|.*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes so the /api/auth/* early-return above and
    // the protected-API redirect logic in handleProxyRequest apply.
    '/(api|trpc)(.*)',
  ],
};
