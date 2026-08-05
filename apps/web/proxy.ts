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
  createFastNotFoundResponse,
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
 * work (plan decision 5). Public `/` remains an explicit navigation target;
 * protected app routes own their auth redirect.
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

const PRIVATE_PROFILE_ALIAS_MARKER = '__profile-mode-alias';
const MAX_PROFILE_ALIAS_SEGMENT_LENGTH = 2048;
const MAX_PROFILE_ALIAS_DECODE_PASSES = 4;

function isReservedProfileAliasMarkerPath(pathname: string): boolean {
  return pathname.split('/').some(segment => {
    let decodedSegment = segment;

    for (let pass = 0; pass < MAX_PROFILE_ALIAS_DECODE_PASSES; pass += 1) {
      if (decodedSegment.length > MAX_PROFILE_ALIAS_SEGMENT_LENGTH) {
        return true;
      }

      let nextDecodedSegment: string;
      try {
        nextDecodedSegment = decodeURIComponent(decodedSegment);
      } catch {
        // Next decodes route params after proxy execution. Reject malformed
        // escapes at the public boundary. A literal percent produced by an
        // earlier successful decode cannot reveal another encoded marker and
        // remains a valid public path segment.
        return pass === 0;
      }

      if (
        nextDecodedSegment.split('/').includes(PRIVATE_PROFILE_ALIAS_MARKER)
      ) {
        return true;
      }

      if (nextDecodedSegment === decodedSegment) {
        return false;
      }

      decodedSegment = nextDecodedSegment;
    }

    // Excessively nested escaping is never emitted by Jovie. Fail closed so
    // it cannot bypass this boundary or create attacker-controlled ISR keys.
    return true;
  });
}

const LEGACY_PROFILE_MODE_ALIASES = new Set([
  'listen',
  'music',
  'releases',
  'subscribe',
  'tip',
  'tour',
]);

function getDuplicateAliasSourceRedirect(
  req: NextRequest
): NextResponse | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;

  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  if (
    segments.length !== 2 ||
    !LEGACY_PROFILE_MODE_ALIASES.has(segments[1] ?? '')
  ) {
    return null;
  }

  const sources = req.nextUrl.searchParams.getAll('source');
  if (sources.length <= 1) return null;

  // The established redirect helper keeps the first non-empty source. Next's
  // rewrite matcher otherwise selects the last repeated value, so collapse the
  // request once at the public boundary before it can become an ISR cache key.
  const source = sources.find(value => value.length > 0);
  const canonicalUrl = req.nextUrl.clone();
  canonicalUrl.searchParams.delete('source');
  if (source) canonicalUrl.searchParams.set('source', source);
  return NextResponse.redirect(canonicalUrl, 307);
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

  // The profile-mode marker is a private destination for afterFiles rewrites.
  // Proxy executes before those rewrites, so a marker present here can only be
  // a direct/forged request. Drop it before auth, database, or page routing.
  if (isReservedProfileAliasMarkerPath(req.nextUrl.pathname)) {
    return createFastNotFoundResponse();
  }

  const duplicateAliasSourceRedirect = getDuplicateAliasSourceRedirect(req);
  if (duplicateAliasSourceRedirect) return duplicateAliasSourceRedirect;

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
      return handleProxyRequest(req, testBypassUserId, event);
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
  //     signed-in marker. Public `/` navigation passes through unchanged;
  //     auth-page signed-in redirects are owned by the pages themselves via
  //     auth.api.getSession.
  return handleProxyRequest(req, sessionCookie, event);
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
