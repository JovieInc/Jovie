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
} from '@/components/providers/clerkAvailability';
import {
  AUDIENCE_ANON_COOKIE,
  AUDIENCE_IDENTIFIED_COOKIE,
  COUNTRY_CODE_COOKIE,
  HOMEPAGE_CITY_COOKIE,
  HOMEPAGE_REGION_COOKIE,
} from '@/constants/app';
import { BASE_URL, HOSTNAME } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import {
  type ClerkBypassPathInfo,
  shouldBypassClerkForRequest,
} from '@/lib/auth/clerk-middleware-bypass';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import type { ProxyUserState } from '@/lib/auth/proxy-state';
import { getUserState, isKnownActiveUser } from '@/lib/auth/proxy-state';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
} from '@/lib/cookies/consent-regions';
import { captureError } from '@/lib/error-tracking';
import {
  analyzeHost,
  categorizePath,
  DASHBOARD_URL,
  type PathCategory,
} from '@/lib/routing/proxy-routing';
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

// ============================================================================
// Public Profile Audience Block Check
// ============================================================================
// Runs in middleware so ISR-cached profile pages don't need headers() in the
// page component. On Vercel, middleware executes before the CDN cache is served,
// so this gate applies even to cache hits.
// ============================================================================

/**
 * Mask an IP address for fingerprinting.
 * Mirrors maskIpAddress() in app/api/audience/lib/audience-utils.ts.
 * Edge-compatible (no Node.js modules).
 */
function maskIpForFingerprint(ip: string | null): string {
  if (!ip) return 'unknown_ip';
  if (ip.includes(':')) {
    // IPv6: keep first 4 groups
    return ip
      .split(':')
      .slice(0, 4)
      .map(segment => segment || '0')
      .join(':');
  }
  const parts = ip.split('.');
  if (parts.length >= 3) {
    return `${parts.slice(0, 3).join('.')}.0`;
  }
  return ip;
}

/**
 * Create visitor fingerprint using the Web Crypto API (edge-compatible).
 * Produces the same hex digest as createFingerprint() in audience-utils.ts.
 */
async function createFingerprintEdge(
  ip: string | null,
  ua: string | null
): Promise<string> {
  const maskedIp = maskIpForFingerprint(ip);
  const uaStr = (ua || 'unknown_ua').slice(0, 128);
  const input = `${maskedIp}|${uaStr}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Single-segment path segments that are Next.js / system routes, not usernames.
// Complements the RESERVED_USERNAMES list in lib/validation/username-core.ts
// which prevents these being registered as profile handles in the first place.
const MIDDLEWARE_SYSTEM_SEGMENTS = new Set([
  '.env',
  '_next',
  'favicon.ico',
  'og',
  'go',
  'out',
  '__clerk',
  'clerk',
  'phpmyadmin',
  'sidebar-demo',
  'sentry-example-page',
  'sentry-example-api',
  'investor-portal',
  'wordpress',
  'wp',
  'wp-admin',
  'xmlrpc.php',
]);

/**
 * Returns the username for public profile paths (/username) or null for
 * non-profile paths. Uses a length-and-character pre-filter; the DB query
 * will naturally return no rows for non-existent usernames.
 */
function extractPublicProfileUsername(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  // Profile routes are a single path segment (no subroutes like /username/claim)
  if (parts.length !== 1) return null;

  const segment = parts[0];
  if (MIDDLEWARE_SYSTEM_SEGMENTS.has(segment)) return null;

  // Username bounds from lib/validation/username-core.ts
  if (segment.length < 3 || segment.length > 30) return null;

  // Basic character check (mirrors USERNAME_PATTERN) — no content filter needed
  // here; invalid/non-existent usernames simply return no DB rows.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/.test(segment))
    return null;

  return segment;
}

/**
 * Check if a public profile visitor should be blocked.
 *
 * Uses a single JOIN query (creator_profiles ⋈ audience_blocks) so no round-trip
 * is wasted when the profile exists but the visitor isn't blocked (the common case).
 *
 * Fails open on any error — a blocked user slipping through once is preferable
 * to locking out all visitors during a DB hiccup.
 */
async function checkProfileVisitorBlocked(
  username: string,
  ip: string | null,
  ua: string | null
): Promise<boolean> {
  // Skip in unit-test environments and public smoke-test mode
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') return false;

  try {
    const fingerprint = await createFingerprintEdge(ip, ua);

    // Lazy imports mirror the investor-portal pattern in this file.
    const { db } = await import('@/lib/db');
    const { and, eq, isNull } = await import('drizzle-orm');
    const { audienceBlocks } = await import('@/lib/db/schema/analytics');
    const { creatorProfiles } = await import('@/lib/db/schema/profiles');

    // Single round-trip: join profile + block table. Returns a row only when
    // the username exists AND the fingerprint is in the block list.
    // Profile owners cannot block themselves, so no owner-skip is needed here.
    const [result] = await db
      .select({ blockId: audienceBlocks.id })
      .from(creatorProfiles)
      .innerJoin(
        audienceBlocks,
        eq(audienceBlocks.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.username, username.toLowerCase()),
          eq(audienceBlocks.fingerprint, fingerprint),
          isNull(audienceBlocks.unblockedAt)
        )
      )
      .limit(1);

    return !!result;
  } catch {
    // Fail open: don't lock out visitors on DB errors.
    return false;
  }
}

// ============================================================================
// Investor Portal — Path-based token auth (/investor-portal?t=TOKEN)
// ============================================================================
// Bypasses Clerk entirely. Auth is via a secret token in URL param or cookie.
// Token validated against investor_links table on every request (volume is tiny).
// Legacy subdomain (investors.jov.ie) redirects to /investor-portal.
// ============================================================================

const INVESTOR_TOKEN_COOKIE = '__investor_token';
const INVESTOR_TOKEN_PARAM = 't';

/**
 * Handle investor portal requests.
 *
 * 1. Legacy subdomain (investors.jov.ie) → 301 redirect to /investor-portal
 * 2. /investor-portal?t=TOKEN → validate, set cookie, strip param
 * 3. /investor-portal with cookie → validate, record view, continue
 */
async function handleInvestorRequest(
  req: NextRequest,
  event?: NextFetchEvent
): Promise<NextResponse | null> {
  const hostname = req.nextUrl.hostname;
  const hostInfo = analyzeHost(hostname);
  const pathname = req.nextUrl.pathname;

  // --- Legacy subdomain redirect ---
  if (hostInfo.isInvestorPortal) {
    // Allow Next.js internals and static files to pass through
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.endsWith('.ico') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.svg')
    ) {
      return NextResponse.next();
    }

    // Redirect to main host /investor-portal, preserving token param
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.hostname = HOSTNAME;
    redirectUrl.port = '';
    const subPath = pathname === '/' ? '' : pathname;
    redirectUrl.pathname = `/investor-portal${subPath}`;

    return NextResponse.redirect(redirectUrl, 301);
  }

  // --- Path-based investor portal ---
  if (
    !pathname.startsWith('/investor-portal') ||
    pathname.startsWith('/_next')
  ) {
    return null;
  }

  // Check for token in URL param (first visit from shared link)
  const tokenParam = req.nextUrl.searchParams.get(INVESTOR_TOKEN_PARAM);

  if (tokenParam) {
    const isValid = await validateInvestorToken(tokenParam);

    if (!isValid) {
      return new NextResponse(null, { status: 404 });
    }

    // Valid token: set cookie and redirect to strip ?t= from URL
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete(INVESTOR_TOKEN_PARAM);

    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set(INVESTOR_TOKEN_COOKIE, tokenParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return res;
  }

  // Check for token in cookie (return visits)
  const tokenCookie = req.cookies.get(INVESTOR_TOKEN_COOKIE)?.value;

  if (!tokenCookie) {
    return new NextResponse(null, { status: 404 });
  }

  // Validate cookie token against DB
  const isValid = await validateInvestorToken(tokenCookie);

  if (!isValid) {
    const res = new NextResponse(null, { status: 404 });
    res.cookies.delete(INVESTOR_TOKEN_COOKIE);
    return res;
  }

  const res = NextResponse.next();

  // Anti-scraping headers
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.headers.set('Cache-Control', 'private, no-store');

  // Record view — use waitUntil for edge runtime reliability
  if (event) {
    event.waitUntil(recordInvestorView(tokenCookie, pathname, req));
  } else {
    await recordInvestorView(tokenCookie, pathname, req);
  }

  return res;
}

/**
 * Validate an investor token against the database.
 * Checks: exists, is_active, not expired.
 * Returns true if valid.
 */
async function validateInvestorToken(token: string): Promise<boolean> {
  try {
    // Lazy import to avoid loading DB in every middleware invocation
    const { db } = await import('@/lib/db');
    const { investorLinks } = await import('@/lib/db/schema/investors');
    const { eq, and } = await import('drizzle-orm');

    const [link] = await db
      .select({
        id: investorLinks.id,
        isActive: investorLinks.isActive,
        expiresAt: investorLinks.expiresAt,
      })
      .from(investorLinks)
      .where(
        and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
      )
      .limit(1);

    if (!link) return false;

    // Check expiry
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return false;
    }

    return true;
  } catch (error) {
    // Fail closed: if DB is down, deny access
    await captureError('Investor token validation failed', error, {
      context: 'investor_portal',
    });
    return false;
  }
}

/**
 * Record an investor page view (fire-and-forget).
 * Also updates stage from 'shared' to 'viewed' on first view.
 */
async function recordInvestorView(
  token: string,
  pagePath: string,
  req: NextRequest
): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    const { investorLinks, investorViews } = await import(
      '@/lib/db/schema/investors'
    );
    const { eq } = await import('drizzle-orm');

    // Find the link
    const [link] = await db
      .select({ id: investorLinks.id, stage: investorLinks.stage })
      .from(investorLinks)
      .where(eq(investorLinks.token, token))
      .limit(1);

    if (!link) return;

    // Insert view record
    await db.insert(investorViews).values({
      investorLinkId: link.id,
      pagePath,
      userAgent: req.headers.get('user-agent') ?? undefined,
      referrer: req.headers.get('referer') ?? undefined,
    });

    // Auto-advance stage: shared → viewed on first view
    if (link.stage === 'shared') {
      await db
        .update(investorLinks)
        .set({ stage: 'viewed', updatedAt: new Date() })
        .where(eq(investorLinks.id, link.id));
    }
  } catch (error) {
    // Swallow errors — view tracking should never block the response
    await captureError('Investor view tracking failed', error, {
      context: 'investor_portal',
      pagePath,
    });
  }
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
      const profileUsername = extractPublicProfileUsername(pathname);
      if (profileUsername) {
        // Mirror extractClientIP() priority: cf-connecting-ip > x-real-ip > x-forwarded-for > true-client-ip
        const rawIp =
          req.headers.get('cf-connecting-ip') ||
          req.headers.get('x-real-ip') ||
          (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
          req.headers.get('true-client-ip') ||
          null;
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

      // Check if path requires authentication
      const needsAuth = pathInfo.isProtectedPath;

      if (needsAuth) {
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
    const hasOnboardingContinuationSignal =
      req.nextUrl.searchParams.has('handle') ||
      req.nextUrl.searchParams.has('resume');

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
    // Note: /app/* routes are excluded from waitlist/onboarding rewrites because
    // they have their own auth handling in their layouts. Rewriting /app/* to
    // /waitlist during RSC navigation causes layout hierarchy mismatches that
    // manifest as "page not found" errors on the client.
    if (userState) {
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
        !pathname.startsWith('/api/') &&
        pathname !== '/app' &&
        !pathname.startsWith('/app/')
      ) {
        res = NextResponse.rewrite(new URL('/waitlist', req.url), {
          request: { headers: requestHeaders },
        });
      } else if (
        userState.needsOnboarding &&
        pathname !== '/onboarding' &&
        !pathname.startsWith('/api/') &&
        pathname !== '/app' &&
        !pathname.startsWith('/app/')
      ) {
        const onboardingJustCompleted =
          req.cookies.get('jovie_onboarding_complete')?.value === '1';

        if (onboardingJustCompleted) {
          res = NextResponse.next({ request: { headers: requestHeaders } });
          res.cookies.delete('jovie_onboarding_complete');
        } else {
          // Circuit breaker: detect redirect loops between /app and /onboarding.
          // If we've redirected the same user more than 3 times in 30 seconds,
          // break the loop and let the request through instead of looping forever.
          const redirectCount = Number(
            req.cookies.get('jovie_redirect_count')?.value ?? '0'
          );

          if (redirectCount >= 3) {
            await captureError(
              '[proxy] Redirect loop circuit breaker triggered',
              new Error('Redirect loop detected'),
              {
                pathname,
                redirectCount,
                operation: 'proxy_circuit_breaker',
              }
            );
            // Let the request through — the page will handle the state
            res = NextResponse.next({ request: { headers: requestHeaders } });
            res.cookies.delete('jovie_redirect_count');
          } else {
            res = NextResponse.rewrite(new URL('/onboarding', req.url), {
              request: { headers: requestHeaders },
            });
            res.cookies.set('jovie_redirect_count', String(redirectCount + 1), {
              maxAge: 30, // 30 second TTL — auto-resets
              path: '/',
              httpOnly: true,
              sameSite: 'lax',
            });
          }
        }
      } else if (
        !userState.needsWaitlist &&
        pathname === '/waitlist' &&
        isNavigationMethod &&
        !isRSCPrefetch
      ) {
        return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
      } else if (
        !userState.needsOnboarding &&
        pathname === '/onboarding' &&
        isNavigationMethod &&
        !isRSCPrefetch &&
        !hasOnboardingContinuationSignal
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

function getGeoFromRequest(req: NextRequest): {
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
    const allowTestRuntimeRelaxations = process.env.E2E_ALLOW_DEV_CSP === '1';
    res.headers.set(SCRIPT_NONCE_HEADER, nonce);
    res.headers.set(
      'Content-Security-Policy',
      buildContentSecurityPolicy({ nonce, allowTestRuntimeRelaxations })
    );

    const cspReportUri = getCspReportUri();
    if (cspReportUri) {
      const reportOnlyPolicy = buildContentSecurityPolicyReportOnly({
        nonce,
        allowTestRuntimeRelaxations,
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

  const geo = getGeoFromRequest(req);

  if (geo.city && req.cookies.get(HOMEPAGE_CITY_COOKIE)?.value !== geo.city) {
    res.cookies.set(HOMEPAGE_CITY_COOKIE, geo.city, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  if (
    geo.region &&
    req.cookies.get(HOMEPAGE_REGION_COOKIE)?.value !== geo.region
  ) {
    res.cookies.set(HOMEPAGE_REGION_COOKIE, geo.region, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  const countryCode =
    req.headers.get('x-vercel-ip-country') ?? req.headers.get('cf-ipcountry');
  const normalizedCountryCode = countryCode?.trim().toUpperCase() ?? null;
  const requiresCookieConsent = isCookieBannerRequired(
    normalizedCountryCode,
    geo.region
  );
  const currentCookieRequirement = req.cookies.get(
    COOKIE_BANNER_REQUIRED_COOKIE
  )?.value;
  const currentCountryCode =
    req.cookies.get(COUNTRY_CODE_COOKIE)?.value ?? null;
  const nextCookieRequirement = requiresCookieConsent ? '1' : '0';

  if (normalizedCountryCode && currentCountryCode !== normalizedCountryCode) {
    res.cookies.set(COUNTRY_CODE_COOKIE, normalizedCountryCode, {
      // httpOnly: false so StaticArtistPage can read country code on mount
      // for DSP geo-sorting, replacing the server-side headers() read that
      // prevented ISR caching of public profile pages.
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  if (currentCookieRequirement !== nextCookieRequirement) {
    res.cookies.set(COOKIE_BANNER_REQUIRED_COOKIE, nextCookieRequirement, {
      httpOnly: false, // Readable by client JS so CookieBannerSection can check without headers()
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
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
      _clerkStagingMiddleware = clerkMiddleware(
        async (auth, req) => {
          const { userId } = await auth();
          return handleRequest(req, userId);
        },
        {
          publishableKey: stagingPk,
          secretKey: stagingSk,
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

  // ========================================================================
  // Clerk FAPI proxy: fetch-based proxy using the hostname-resolved Clerk
  // publishable key. Staging and production use different Clerk instances,
  // so the FAPI host must be decoded from the active host's key at runtime.
  // We use fetch() because NextResponse.rewrite() and vercel.json rewrites
  // forward the original Host header, causing Clerk to return 400 "Invalid host".
  // ========================================================================
  if (
    pathname.startsWith('/__clerk/') ||
    pathname === '/__clerk' ||
    pathname.startsWith('/clerk/') ||
    pathname === '/clerk'
  ) {
    const pk = resolveClerkKeys(hostname).publishableKey ?? '';
    let fapiHost = '';
    try {
      const b64 = pk.replace(/^pk_(live|test)_/, '');
      fapiHost = b64 ? atob(b64).replace(/\$$/, '') : '';
    } catch {
      // malformed key
    }
    if (!fapiHost) {
      return NextResponse.json(
        {
          error: 'Clerk proxy unavailable: missing or invalid publishable key',
        },
        { status: 503 }
      );
    }

    const subpath = pathname.replace(/^\/__clerk\/?|^\/clerk\/?/, '');
    const targetUrl = `https://${fapiHost}/${subpath}${req.nextUrl.search}`;

    // Read body FIRST so content-length stays accurate
    let body: ArrayBuffer | null = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await req.arrayBuffer();
      } catch {
        // empty body
      }
    }

    // Build clean headers — only forward what Clerk needs
    const headers = new Headers();
    headers.set('host', fapiHost);
    headers.set('origin', `https://${fapiHost}`);
    const ct = req.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    const accept = req.headers.get('accept');
    if (accept) headers.set('accept', accept);
    const cookie = req.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);
    const ua = req.headers.get('user-agent');
    if (ua) headers.set('user-agent', ua);
    const auth = req.headers.get('authorization');
    if (auth) headers.set('authorization', auth);
    if (body && body.byteLength > 0) {
      headers.set('content-length', String(body.byteLength));
    }

    try {
      const proxyRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: body && body.byteLength > 0 ? body : undefined,
        redirect: 'manual',
      });

      const resHeaders = new Headers(proxyRes.headers);
      resHeaders.delete('content-encoding');

      // Rewrite redirect Location headers to route back through /__clerk
      const location = resHeaders.get('location');
      if (location) {
        const fapiOrigin = `https://${fapiHost}`;
        if (location.startsWith(fapiOrigin)) {
          resHeaders.set(
            'location',
            location.replace(fapiOrigin, `${req.nextUrl.origin}/__clerk`)
          );
        }
      }

      return new NextResponse(proxyRes.body, {
        status: proxyRes.status,
        statusText: proxyRes.statusText,
        headers: resHeaders,
      });
    } catch (err) {
      console.error('[clerk-proxy] fetch failed:', err);
      return NextResponse.json({ error: 'Clerk proxy error' }, { status: 502 });
    }
  }

  const pathInfo = categorizePath(pathname);

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

  const clerkPathInfo: ClerkBypassPathInfo = pathInfo;
  const { publishableKey: resolvedClerkPublishableKey } =
    resolveClerkKeys(hostname);
  const shouldForceBypassClerk = shouldBypassClerk(
    resolvedClerkPublishableKey,
    process.env.NEXT_PUBLIC_CLERK_MOCK,
    getRequestLocationFromHeaders(req.headers) ?? req.nextUrl
  );
  const allowAuthRouteClerkBypass =
    shouldForceBypassClerk ||
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

  if (
    shouldBypassClerkForRequest({
      allowAuthRouteBypass: allowAuthRouteClerkBypass,
      pathname,
      pathInfo: clerkPathInfo,
      cookies: req.cookies.getAll(),
      forceBypass: shouldForceBypassClerk,
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
    if (!pathInfo.isProtectedPath) {
      return handleRequest(req, null);
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
      console.error('[middleware] Staging Clerk error:', error);
      return handleRequest(req, null);
    }
    throw error;
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, .well-known, and Sentry tunnel (/monitoring)
    '/((?!_next|monitoring(?:/|$)|\.well-known|.*\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk proxy paths (including .js bundles from /npm/)
    '/__clerk/(.*)',
    '/clerk/(.*)',
  ],
};
