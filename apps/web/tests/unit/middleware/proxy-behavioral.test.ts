/**
 * Behavioral tests for proxy.ts middleware.
 *
 * Tests routing behavior that proxy.ts owns:
 * - Cookie banner geo-detection and cookie-setting
 * - Auth redirects for unauthenticated users on protected paths
 * - Auth redirects for authenticated users on auth pages
 * - Circuit breaker for redirect loops
 * - Bot detection on sensitive API paths
 * - Clerk FAPI proxy rewrites
 *
 * Does NOT test /app/* auth/onboarding gating (owned by app-layer layouts).
 *
 * @see apps/web/proxy.ts
 */
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { ProxyUserState } from '@/lib/auth/proxy-state';

// ============================================================================
// Hoisted mocks — vi.hoisted + vi.mock MUST be in the test file for hoisting
// ============================================================================

const mocks = vi.hoisted(() => ({
  getUserState:
    vi.fn<(clerkUserId: string) => Promise<ProxyUserState | null>>(),
  isKnownActiveUser: vi.fn<(clerkUserId: string) => boolean>(),
  invalidateProxyUserStateCache: vi.fn(),
  isCookieBannerRequired:
    vi.fn<
      (countryCode: string | null, regionCode?: string | null) => boolean
    >(),
  captureError: vi.fn(),
  ensureSentry: vi.fn().mockResolvedValue(undefined),
  buildContentSecurityPolicy: vi.fn().mockReturnValue("default-src 'self'"),
  buildContentSecurityPolicyReportOnly: vi.fn().mockReturnValue(null),
  buildReportToHeader: vi.fn().mockReturnValue(''),
  buildReportingEndpointsHeader: vi.fn().mockReturnValue(''),
  getCspReportUri: vi.fn().mockReturnValue(null),
  resolveClerkKeys: vi.fn().mockReturnValue({
    publishableKey: 'pk_test_real-key-123',
    secretKey: 'sk_test_real-key-456',
    status: 'ok',
  }),
  isStagingHost: vi.fn().mockReturnValue(false),
  isClerkRequiredPath: vi.fn().mockReturnValue(false),
  shouldBypassClerkForRequest: vi.fn().mockReturnValue(true),
  isTestAuthBypassEnabled: vi.fn().mockReturnValue(true),
  resolveTestBypassUserId: vi.fn().mockReturnValue(null),
  createBotResponse: vi.fn(),
  clerkMiddleware: vi.fn(),
  buildProtectedAuthRedirectUrl: vi.fn(
    (authPage: string, pathname: string, search: string) =>
      `${authPage}?redirect_url=${encodeURIComponent(pathname + search)}`
  ),
  sanitizeRedirectUrl: vi.fn().mockImplementation((url: string | null) => url),
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  getUserState: mocks.getUserState,
  isKnownActiveUser: mocks.isKnownActiveUser,
  invalidateProxyUserStateCache: mocks.invalidateProxyUserStateCache,
}));
vi.mock('@/lib/cookies/consent-regions', () => ({
  COOKIE_BANNER_REQUIRED_COOKIE: 'jv_cc_required',
  isCookieBannerRequired: mocks.isCookieBannerRequired,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/lib/sentry/ensure', () => ({
  ensureSentry: mocks.ensureSentry,
}));
vi.mock('@/lib/security/content-security-policy', () => ({
  buildContentSecurityPolicy: mocks.buildContentSecurityPolicy,
  buildContentSecurityPolicyReportOnly:
    mocks.buildContentSecurityPolicyReportOnly,
  SCRIPT_NONCE_HEADER: 'x-nonce',
}));
vi.mock('@/lib/security/csp-reporting', () => ({
  buildReportToHeader: mocks.buildReportToHeader,
  buildReportingEndpointsHeader: mocks.buildReportingEndpointsHeader,
  getCspReportUri: mocks.getCspReportUri,
}));
vi.mock('@/lib/auth/staging-clerk-keys', () => ({
  resolveClerkKeys: mocks.resolveClerkKeys,
  isStagingHost: mocks.isStagingHost,
}));
vi.mock('@/lib/auth/clerk-middleware-bypass', () => ({
  isClerkRequiredPath: mocks.isClerkRequiredPath,
  shouldBypassClerkForRequest: mocks.shouldBypassClerkForRequest,
}));
vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: mocks.isTestAuthBypassEnabled,
  TEST_AUTH_BYPASS_MODE: 'test-auth-bypass',
  TEST_MODE_HEADER: 'x-test-mode',
  resolveTestBypassUserId: mocks.resolveTestBypassUserId,
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  createBotResponse: mocks.createBotResponse,
}));
vi.mock('@/lib/auth/build-auth-route-url', () => ({
  buildProtectedAuthRedirectUrl: mocks.buildProtectedAuthRedirectUrl,
}));
vi.mock('@/lib/auth/constants', () => ({
  sanitizeRedirectUrl: mocks.sanitizeRedirectUrl,
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: mocks.clerkMiddleware,
}));
vi.mock('@/constants/app', () => ({
  AUDIENCE_ANON_COOKIE: 'audience_anon',
  AUDIENCE_IDENTIFIED_COOKIE: 'audience_identified',
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE: 'audience_spotify_preferred',
  COUNTRY_CODE_COOKIE: 'country_code',
  HOMEPAGE_CITY_COOKIE: 'homepage_city',
  HOMEPAGE_REGION_COOKIE: 'homepage_region',
  LISTEN_COOKIE: 'listen_cookie',
}));
vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://jov.ie',
  HOSTNAME: 'jov.ie',
  STAGING_HOSTNAMES: new Set(['staging.jov.ie', 'main.jov.ie']),
}));

// Import the middleware under test — used by callMiddleware()
import middleware from '@/proxy';
import {
  createTestRequest,
  getResponseCookies,
  isRedirectTo,
  USER_STATES,
} from './proxy-test-harness';

function createFetchEvent() {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as import('next/server').NextFetchEvent;
}

function createAuthenticatedRequest(
  userId: string,
  options: Parameters<typeof createTestRequest>[0] = {}
) {
  mocks.resolveTestBypassUserId.mockReturnValue(userId);
  return createTestRequest(options);
}

function createUnauthenticatedRequest(
  options: Parameters<typeof createTestRequest>[0] = {}
) {
  mocks.resolveTestBypassUserId.mockReturnValue(null);
  mocks.isTestAuthBypassEnabled.mockReturnValue(true);
  return createTestRequest(options);
}

/** Call middleware and assert the result is a NextResponse (not undefined). */
async function callMiddleware(
  req: import('next/server').NextRequest
): Promise<NextResponse> {
  const result = await middleware(req, createFetchEvent());
  expect(result).toBeDefined();
  return result as NextResponse;
}

function resetMocks() {
  for (const mock of Object.values(mocks)) {
    if (typeof mock.mockClear === 'function') mock.mockClear();
  }
  // Re-apply defaults (mockClear keeps implementations, just clears call history)
  mocks.resolveClerkKeys.mockReturnValue({
    publishableKey: 'pk_test_real-key-123',
    secretKey: 'sk_test_real-key-456',
    status: 'ok',
  });
  mocks.resolveTestBypassUserId.mockReturnValue(null);
  mocks.isCookieBannerRequired.mockReturnValue(false);
  mocks.getUserState.mockResolvedValue(null);
  mocks.isKnownActiveUser.mockReturnValue(false);
  mocks.isStagingHost.mockReturnValue(false);
  mocks.createBotResponse.mockReturnValue(undefined);
  mocks.fetch.mockResolvedValue(
    new Response('ok', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
  mocks.clerkMiddleware.mockImplementation(
    (handler: Function) => async (req: unknown, event: unknown) =>
      handler(req, event)
  );
  vi.stubGlobal('fetch', mocks.fetch);
}

describe('proxy.ts middleware', () => {
  beforeEach(() => {
    resetMocks();
    // NODE_ENV is already 'test' from vitest — no need to set it
  });

  // ==========================================================================
  // Scanner probe drop (JOV-2189) — must be the earliest exit so probes
  // never reach Clerk, DB lookups, or the page handler.
  // ==========================================================================
  describe('scanner probe drop', () => {
    it.each([
      '/some-creator/wp-content/plugins/hellopress/wp_filemanager.php',
      '/timwhite/wp-admin/install.php',
      '/xmlrpc.php',
      '/.env',
      '/some/random.php',
    ])('returns 404 for probe path %s without invoking Clerk', async path => {
      const req = createUnauthenticatedRequest({ pathname: path });
      const res = await callMiddleware(req);

      expect(res.status).toBe(404);
      // Critical: probe must not touch auth or DB; if any of these were
      // called the early-return failed and the request leaked deeper.
      expect(mocks.resolveTestBypassUserId).not.toHaveBeenCalled();
      expect(mocks.getUserState).not.toHaveBeenCalled();
      expect(mocks.shouldBypassClerkForRequest).not.toHaveBeenCalled();
    });

    it('still serves a legitimate profile path that contains no probe markers', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/timwhite/listen',
      });
      const res = await callMiddleware(req);
      // Anything other than the 404 drop response means the probe gate
      // correctly let real traffic through.
      expect(res.status).not.toBe(404);
    });
  });

  // ==========================================================================
  // Cookie Banner Geo-Detection
  // ==========================================================================
  describe('cookie banner geo-detection', () => {
    it('sets jv_cc_required=1 for EU country (Germany)', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: { 'x-vercel-ip-country': 'DE' },
      });
      const res = await callMiddleware(req);

      expect(mocks.isCookieBannerRequired).toHaveBeenCalledWith('DE', null);
      const cookies = getResponseCookies(res);
      expect(cookies.jv_cc_required).toBe('1');
    });

    it('keeps only pre-consent cookies for consent-required visitors without consent', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'DE',
          'x-vercel-ip-city': 'Berlin',
          'x-vercel-ip-country-region': 'BE',
        },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.jv_cc_required).toBe('1');
      expect(cookies.country_code).toBe('DE');
      expect(cookies.homepage_city).toBeUndefined();
      expect(cookies.homepage_region).toBeUndefined();
      expect(cookies.audience_anon).toBeUndefined();
    });

    it('deletes existing nonessential proxy cookies when consent is missing', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'DE',
          'x-vercel-ip-city': 'Berlin',
          'x-vercel-ip-country-region': 'BE',
        },
        cookies: {
          audience_anon: 'anon-1',
          audience_identified: '1',
          homepage_city: 'Munich',
          homepage_region: 'BY',
        },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.audience_anon).toBe('');
      expect(cookies.audience_identified).toBe('');
      expect(cookies.homepage_city).toBe('');
      expect(cookies.homepage_region).toBe('');
    });

    it('sets nonessential proxy cookies after analytics consent is granted', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'DE',
          'x-vercel-ip-city': 'Berlin',
          'x-vercel-ip-country-region': 'BE',
        },
        cookies: {
          jv_cc: JSON.stringify({
            essential: true,
            analytics: true,
            marketing: false,
          }),
        },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.homepage_city).toBe('Berlin');
      expect(cookies.homepage_region).toBe('BE');
      expect(cookies.audience_anon).toBeDefined();
    });

    it('does not set analytics-classified cookies for marketing-only consent', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'DE',
          'x-vercel-ip-city': 'Berlin',
          'x-vercel-ip-country-region': 'BE',
        },
        cookies: {
          jv_cc: JSON.stringify({
            essential: true,
            analytics: false,
            marketing: true,
          }),
        },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.homepage_city).toBeUndefined();
      expect(cookies.homepage_region).toBeUndefined();
      expect(cookies.audience_anon).toBeUndefined();
    });

    it('deletes analytics-classified cookies for marketing-only consent', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'DE',
          'x-vercel-ip-city': 'Berlin',
          'x-vercel-ip-country-region': 'BE',
        },
        cookies: {
          jv_cc: JSON.stringify({
            essential: true,
            analytics: false,
            marketing: true,
          }),
          audience_anon: 'anon-1',
          audience_identified: '1',
          homepage_city: 'Munich',
          homepage_region: 'BY',
        },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.audience_anon).toBe('');
      expect(cookies.audience_identified).toBe('');
      expect(cookies.homepage_city).toBe('');
      expect(cookies.homepage_region).toBe('');
    });

    it('sets jv_cc_required=1 for US California (CCPA)', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'US',
          'x-vercel-ip-country-region': 'CA',
        },
      });
      const res = await callMiddleware(req);

      expect(mocks.isCookieBannerRequired).toHaveBeenCalledWith('US', 'CA');
      const cookies = getResponseCookies(res);
      expect(cookies.jv_cc_required).toBe('1');
    });

    it('sets jv_cc_required=0 for US Texas (no state law)', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(false);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: {
          'x-vercel-ip-country': 'US',
          'x-vercel-ip-country-region': 'TX',
        },
      });
      const res = await callMiddleware(req);

      expect(mocks.isCookieBannerRequired).toHaveBeenCalledWith('US', 'TX');
      const cookies = getResponseCookies(res);
      expect(cookies.jv_cc_required).toBe('0');
    });

    it('does not re-set cookie when value already matches', async () => {
      mocks.isCookieBannerRequired.mockReturnValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: { 'x-vercel-ip-country': 'DE' },
        cookies: { jv_cc_required: '1' },
      });
      const res = await callMiddleware(req);

      // isCookieBannerRequired should still be called
      expect(mocks.isCookieBannerRequired).toHaveBeenCalled();
      // Cookie should NOT be re-set when the existing value already matches
      const cookies = getResponseCookies(res);
      expect(cookies.jv_cc_required).toBeUndefined();
    });
  });

  // ==========================================================================
  // Auth Redirects (proxy-owned)
  // ==========================================================================
  describe('auth redirects for unauthenticated users', () => {
    it('redirects unauthenticated GET /app to /signin', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/app' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/signin')).toBe(true);
    });

    it('redirects unauthenticated GET /app/dashboard to /signin', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/app/dashboard',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/signin')).toBe(true);
    });

    it('keeps unauthenticated legacy earnings deep links behind signin', async () => {
      const req = createUnauthenticatedRequest({
        pathname: APP_ROUTES.DASHBOARD_EARNINGS,
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/signin')).toBe(true);
      expect(res.headers.get('location')).toContain(
        'redirect_url=%2Fapp%2Fdashboard%2Fearnings'
      );
    });

    it('keeps unauthenticated app earnings aliases behind signin', async () => {
      const req = createUnauthenticatedRequest({
        pathname: APP_ROUTES.EARNINGS,
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, APP_ROUTES.SIGNIN)).toBe(true);
      expect(res.headers.get('location')).toContain(
        'redirect_url=%2Fapp%2Fearnings'
      );
    });

    it('redirects unauthenticated GET /onboarding to /start before rendering', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/onboarding',
        searchParams: { resume: 'spotify' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/start')).toBe(true);
      expect(res.headers.get('location')).toContain('resume=spotify');
    });

    it('redirects unauthenticated GET /waitlist to /start', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/waitlist' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/start')).toBe(true);
    });

    it('allows unauthenticated access to public paths', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
    });

    it('normalizes /sign-in to /signin', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/sign-in' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/signin')).toBe(true);
    });

    it('normalizes /sign-up to /signup', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/sign-up' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/signup')).toBe(true);
    });
  });

  describe('private-origin Clerk handling', () => {
    it('keeps Clerk middleware enabled for authenticated mobile APIs on localhost', async () => {
      mocks.isTestAuthBypassEnabled.mockReturnValue(false);
      mocks.shouldBypassClerkForRequest.mockReturnValue(false);

      const req = createUnauthenticatedRequest({
        pathname: '/api/mobile/v1/me',
        headers: {
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-proto': 'http',
        },
      });

      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(mocks.shouldBypassClerkForRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          allowAuthRouteBypass: true,
          forceBypass: false,
          pathname: '/api/mobile/v1/me',
        })
      );
    });
  });

  describe('staging Clerk contract', () => {
    it('fails closed on staging auth routes when staging Clerk keys are missing', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_missing',
      });

      const req = createUnauthenticatedRequest({
        hostname: 'staging.jov.ie',
        pathname: '/signup',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(200);
      expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
    });

    it('renders auth routes on production runtime when Clerk keys are missing', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_missing',
      });
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/signup',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(200);
        expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('returns 503 for protected staging routes when staging Clerk keys are missing', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_missing',
      });
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/app',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(503);
        expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('returns 503 (not a signin redirect) when staging Clerk middleware throws on a protected path (JOV-1902)', async () => {
      // Regression test: when staging Clerk middleware throws (e.g., due to a
      // transient domain allowlist check failure or JWT validation error), protected
      // paths like /onboarding must NOT silently fall back to handleRequest(null),
      // which would produce a redirect loop:
      //   /onboarding → /signin?redirect_url=%2Fonboarding → OAuth → /onboarding → …
      //
      // The fix: the catch block mirrors !selectedMiddleware logic and returns 503
      // for protected paths instead of calling handleRequest(req, null).
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_test_staging-key',
        secretKey: 'sk_test_staging-key',
        status: 'ok',
      });
      mocks.clerkMiddleware.mockImplementation(() => async () => {
        throw new Error('Clerk staging domain not in allowlist');
      });

      const req = createUnauthenticatedRequest({
        hostname: 'staging.jov.ie',
        pathname: '/onboarding/checkout',
      });
      const res = await callMiddleware(req);

      // Must return 503, NOT redirect to /signin?redirect_url=%2Fonboarding%2Fcheckout
      expect(res.status).toBe(503);
      expect(isRedirectTo(res, '/signin')).toBe(false);
    });

    it('falls back to unauthenticated handling when staging Clerk throws on a public path', async () => {
      // Public (non-protected, non-auth-required) paths may still be rendered
      // when the staging middleware throws — they don't require auth.
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_test_staging-key',
        secretKey: 'sk_test_staging-key',
        status: 'ok',
      });
      mocks.clerkMiddleware.mockImplementation(() => async () => {
        throw new Error('Clerk staging domain not in allowlist');
      });

      const req = createUnauthenticatedRequest({
        hostname: 'staging.jov.ie',
        pathname: '/',
      });
      const res = await callMiddleware(req);

      // Public paths pass through (200) — they don't require authentication
      expect(res.status).toBeLessThan(300);
    });

    it('falls back to unauthenticated handling when staging Clerk throws on an auth page', async () => {
      // Auth pages (/signin, /signup) are treated as public for the staging
      // error fallback so the "Auth unavailable" UI can still render.
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_test_staging-key',
        secretKey: 'sk_test_staging-key',
        status: 'ok',
      });
      mocks.clerkMiddleware.mockImplementation(() => async () => {
        throw new Error('Clerk staging domain not in allowlist');
      });

      const req = createUnauthenticatedRequest({
        hostname: 'staging.jov.ie',
        pathname: '/signin',
      });
      const res = await callMiddleware(req);

      // Auth pages pass through (200) even when Clerk throws on staging
      expect(res.status).toBeLessThan(300);
    });

    it('returns 503 (not a signin redirect) when staging Clerk middleware throws on /app', async () => {
      // Extends the JOV-1902 regression: /app is also a protected path that must not
      // redirect to /signin when the staging Clerk middleware throws — otherwise a
      // fully authenticated user hitting /app would be bounced to /signin infinitely.
      mocks.isStagingHost.mockReturnValue(true);
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_test_staging-key',
        secretKey: 'sk_test_staging-key',
        status: 'ok',
      });
      mocks.clerkMiddleware.mockImplementation(() => async () => {
        throw new Error('Clerk staging domain not in allowlist');
      });

      const req = createUnauthenticatedRequest({
        hostname: 'staging.jov.ie',
        pathname: '/app',
      });
      const res = await callMiddleware(req);

      // Must return 503, NOT a redirect to /signin
      expect(res.status).toBe(503);
      expect(isRedirectTo(res, '/signin')).toBe(false);
    });
  });

  describe('auth redirects for authenticated users', () => {
    it('redirects authenticated user on /signin to /app', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signin',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/app')).toBe(true);
    });

    it('redirects authenticated user on /signup to /app', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signup',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/app')).toBe(true);
    });

    it('redirects authenticated user with needsWaitlist on /signin to /waitlist', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signin',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/waitlist')).toBe(true);
    });

    it('redirects authenticated user with needsOnboarding on /signin to /start', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signin',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/start')).toBe(true);
    });

    it('returns approved invite recipients from /signin to the invite redemption page', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);
      const redirectUrl = '/waitlist/invite?token=secure-token';

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signin',
        searchParams: { redirect_url: redirectUrl },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      const locationUrl = new URL(location ?? '', 'https://localhost');
      expect(locationUrl.pathname).toBe('/waitlist/invite');
      expect(locationUrl.searchParams.get('token')).toBe('secure-token');
    });

    it('lets needsOnboarding users redeem waitlist invite links', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/waitlist/invite',
        searchParams: { token: 'secure-token' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('lets waitlisted users redeem waitlist invite links', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/waitlist/invite',
        searchParams: { token: 'secure-token' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('redirects active user away from /waitlist to /app', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/waitlist',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/app')).toBe(true);
    });

    it('redirects active users from legacy /onboarding to /start', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/onboarding',
        searchParams: { handle: 'artist' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/start')).toBe(true);
      expect(res.headers.get('location')).toContain('handle=artist');
    });

    it('redirects authenticated legacy earnings deep links to artist profile pay', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: APP_ROUTES.DASHBOARD_EARNINGS,
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      const locationUrl = new URL(location ?? '', 'https://localhost');
      expect(locationUrl.pathname).toBe('/app/settings/artist-profile');
      expect(locationUrl.searchParams.get('tab')).toBe('earn');
      expect(locationUrl.hash).toBe('#pay');
      expect(mocks.getUserState).not.toHaveBeenCalled();
    });

    it('redirects authenticated app earnings aliases to artist profile pay', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: APP_ROUTES.EARNINGS,
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      const locationUrl = new URL(location ?? '', 'https://localhost');
      expect(locationUrl.pathname).toBe(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
      expect(locationUrl.searchParams.get('tab')).toBe('earn');
      expect(locationUrl.hash).toBe('#pay');
      expect(mocks.getUserState).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================
  describe('circuit breaker (redirect loop prevention)', () => {
    it('rewrites to /start and increments redirect count', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
      });
      const res = await callMiddleware(req);

      // Verify the rewrite destination is /start
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/start');

      const cookies = getResponseCookies(res);
      expect(cookies.jovie_redirect_count).toBe('1');
    });

    it('increments redirect count on subsequent rewrites', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
        cookies: { jovie_redirect_count: '2' },
      });
      const res = await callMiddleware(req);

      const cookies = getResponseCookies(res);
      expect(cookies.jovie_redirect_count).toBe('3');
    });

    it('breaks the loop at count >= 3', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
        cookies: { jovie_redirect_count: '3' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(mocks.captureError).toHaveBeenCalledWith(
        expect.stringContaining('circuit breaker'),
        expect.any(Error),
        expect.objectContaining({ redirectCount: 3 })
      );
    });

    it('lets request through when onboarding_complete cookie is set', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
        cookies: { jovie_onboarding_complete: '1' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
    });

    it('rewrites needsWaitlist user from /pricing to /waitlist and increments count', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
      });
      const res = await callMiddleware(req);

      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/waitlist');

      const cookies = getResponseCookies(res);
      expect(cookies.jovie_redirect_count).toBe('1');
    });

    it('treats a tampered jovie_redirect_count cookie (NaN) as 0 (defense in depth)', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
        cookies: { jovie_redirect_count: 'NaN' },
      });
      const res = await callMiddleware(req);

      // Cookie was unparseable → treat as 0 and increment to 1, NOT NaN+1.
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/start');
      const cookies = getResponseCookies(res);
      expect(cookies.jovie_redirect_count).toBe('1');
    });

    it('breaks needsWaitlist rewrite loop at count >= 3 (JOV-2161 regression guard)', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
        cookies: { jovie_redirect_count: '3' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(mocks.captureError).toHaveBeenCalledWith(
        expect.stringContaining('circuit breaker'),
        expect.any(Error),
        expect.objectContaining({ target: '/waitlist', redirectCount: 3 })
      );
    });
  });

  // ==========================================================================
  // Rewrite-Exempt Paths (JOV-2147)
  // ==========================================================================
  describe('rewrite-exempt paths', () => {
    it('does NOT rewrite /start for a needsWaitlist user (lets OnboardingShell mount)', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/start',
      });
      const res = await callMiddleware(req);

      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBeLessThan(300);
    });

    it('does NOT rewrite /start for a needsOnboarding user', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/start',
      });
      const res = await callMiddleware(req);

      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBeLessThan(300);
    });

    it('does NOT rewrite /onboarding/checkout for a needsWaitlist user', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/onboarding/checkout',
      });
      const res = await callMiddleware(req);

      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBeLessThan(300);
    });

    it('does NOT rewrite /onboarding/checkout for a needsOnboarding user', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/onboarding/checkout',
      });
      const res = await callMiddleware(req);

      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBeLessThan(300);
    });
  });

  // ==========================================================================
  // Bot Detection
  // ==========================================================================
  describe('bot detection', () => {
    it('blocks Meta bots on sensitive API paths', async () => {
      mocks.createBotResponse.mockReturnValue(
        new NextResponse(null, { status: 204 })
      );

      const req = createUnauthenticatedRequest({
        pathname: '/api/link/some-link',
        headers: { 'user-agent': 'facebookexternalhit/1.1' },
      });
      const res = await callMiddleware(req);

      expect(mocks.createBotResponse).toHaveBeenCalledWith(204);
      expect(res.status).toBe(204);
    });

    it('allows normal user agents on sensitive API paths', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/api/link/some-link',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      await callMiddleware(req);

      expect(mocks.createBotResponse).not.toHaveBeenCalled();
    });

    it('does not block Meta bots on non-sensitive paths', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/',
        headers: { 'user-agent': 'facebookexternalhit/1.1' },
      });
      await callMiddleware(req);

      expect(mocks.createBotResponse).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Banned User Rewrite
  // ==========================================================================
  describe('banned user handling', () => {
    it('rewrites banned user to /unavailable on non-/app paths', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.banned);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
      });
      const res = await callMiddleware(req);

      // Rewrite, not redirect — URL bar stays on /pricing
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/unavailable');
    });

    it('rewrites banned user on marketing pages', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.banned);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/about',
      });
      const res = await callMiddleware(req);

      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/unavailable');
    });
  });

  // ==========================================================================
  // Clerk FAPI Proxy (vercel.json must NOT have clerk rewrites)
  // ==========================================================================
  describe('Clerk FAPI proxy (vercel.json)', () => {
    it('does not have clerk rewrites — middleware fetch proxy handles this', async () => {
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      const raw = await readFile(
        resolve(process.cwd(), '../../vercel.json'),
        'utf8'
      );
      const cfg = JSON.parse(raw) as {
        rewrites?: Array<{ source: string; destination: string }>;
      };
      const rewrites = cfg.rewrites ?? [];
      const clerkRewrites = rewrites.filter(r => r.source.includes('clerk'));
      expect(clerkRewrites).toEqual([]);
    });

    it('routes staging Clerk proxy traffic to the staging FAPI host', async () => {
      const stagingFapiHost = 'staging-fapi.clerk.example';
      const productionFapiHost = 'production-fapi.clerk.example';
      const previousPublishableKey =
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from(`${productionFapiHost}$`).toString('base64')}`;
        mocks.resolveClerkKeys.mockReturnValue({
          publishableKey: `pk_live_${Buffer.from(`${stagingFapiHost}$`).toString('base64')}`,
          secretKey: 'sk_live_staging_example',
          status: 'ok',
        });

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/__clerk/v1/client',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(200);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        const [targetUrl, init] = mocks.fetch.mock.calls[0] as [
          string,
          RequestInit,
        ];

        expect(targetUrl).toBe(`https://${stagingFapiHost}/v1/client`);
        expect(init.method).toBe('GET');
        expect(init.redirect).toBe('manual');
        const headers = init.headers as Headers;
        // Host is intentionally NOT forwarded — fetch() sets it from the
        // target URL, and manual override breaks Edge fetch on POST bodies
        // (root cause of Apple OAuth form_post 502s).
        expect(headers.get('host')).toBeNull();
        expect(headers.get('origin')).toBe(`https://${stagingFapiHost}`);
      } finally {
        if (previousPublishableKey === undefined) {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        } else {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
            previousPublishableKey;
        }
      }
    });

    it('handles upstream 3xx redirects via NextResponse.redirect (avoids middleware crash on streamed redirect bodies)', async () => {
      // Reproduces the staging Google OAuth bug: FAPI returns 301 for
      // /v1/oauth_callback, and the proxy must turn that into a clean
      // middleware-compliant redirect instead of streaming the upstream
      // Response (which crashes Vercel Edge with an opaque 500).
      const stagingFapiHost = 'clerk.staging.jov.ie';
      const previousPublishableKey =
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from('production-fapi.clerk.example$').toString('base64')}`;
        mocks.resolveClerkKeys.mockReturnValue({
          publishableKey: `pk_live_${Buffer.from(`${stagingFapiHost}$`).toString('base64')}`,
          secretKey: 'sk_live_staging_example',
          status: 'ok',
        });

        const upstreamLocation = `https://${stagingFapiHost}/v1/oauth_callback?err_code=authorization_invalid`;
        const upstreamCookie =
          '__cf_bm=abc123; path=/; domain=.clerk.staging.jov.ie; HttpOnly; Secure; SameSite=None';
        mocks.fetch.mockResolvedValueOnce(
          new Response(null, {
            status: 301,
            headers: {
              location: upstreamLocation,
              'set-cookie': upstreamCookie,
              'content-encoding': 'gzip',
            },
          })
        );

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/__clerk/v1/oauth_callback',
          searchParams: { state: 'test', code: 'test' },
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(301);
        expect(res.headers.get('location')).toBe(
          `https://staging.jov.ie/__clerk/v1/oauth_callback?err_code=authorization_invalid`
        );
        // Set-Cookie from upstream is forwarded so __cf_bm survives the proxy hop.
        const setCookies =
          res.headers.getSetCookie?.() ??
          res.headers.get('set-cookie')?.split(/,(?=[^;]+=)/) ??
          [];
        expect(setCookies.join('\n')).toContain('__cf_bm=abc123');
      } finally {
        if (previousPublishableKey === undefined) {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        } else {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
            previousPublishableKey;
        }
      }
    });

    it('rewrites FAPI-relative Location headers to absolute proxy URLs (Apple OAuth form_post redirect)', async () => {
      // Apple's OAuth form_post callback flow makes FAPI return a 302 to a
      // *relative* path like `/v1/oauth_callback?code=...&state=...`.
      // NextResponse.redirect requires an absolute URL; passing the relative
      // path through threw "URL is malformed". The proxy must resolve the
      // relative path against our /__clerk proxy origin.
      const stagingFapiHost = 'clerk.staging.jov.ie';
      const previousPublishableKey =
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from('production-fapi.clerk.example$').toString('base64')}`;
        mocks.resolveClerkKeys.mockReturnValue({
          publishableKey: `pk_live_${Buffer.from(`${stagingFapiHost}$`).toString('base64')}`,
          secretKey: 'sk_live_staging_example',
          status: 'ok',
        });

        // FAPI returns a Location header with a relative path (no scheme).
        mocks.fetch.mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: {
              location: '/v1/oauth_callback?code=abc123&state=def456',
            },
          })
        );

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/__clerk/v1/oauth_callback',
          method: 'POST',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(
          'https://staging.jov.ie/__clerk/v1/oauth_callback?code=abc123&state=def456'
        );
      } finally {
        if (previousPublishableKey === undefined) {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        } else {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
            previousPublishableKey;
        }
      }
    });

    it('passes through upstream non-redirect 3xx-adjacent responses (e.g. 304) without rewriting Location', async () => {
      // Sanity: 200 path still streams (covered above by /v1/client). This
      // covers the edge where upstream 3xx has no Location header — the proxy
      // should fall through to the streaming path.
      const stagingFapiHost = 'clerk.staging.jov.ie';
      const previousPublishableKey =
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from('production-fapi.clerk.example$').toString('base64')}`;
        mocks.resolveClerkKeys.mockReturnValue({
          publishableKey: `pk_live_${Buffer.from(`${stagingFapiHost}$`).toString('base64')}`,
          secretKey: 'sk_live_staging_example',
          status: 'ok',
        });

        mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 304 }));

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/__clerk/v1/environment',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(304);
      } finally {
        if (previousPublishableKey === undefined) {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        } else {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
            previousPublishableKey;
        }
      }
    });

    it('returns 503 for staging Clerk proxy traffic when staging keys are missing', async () => {
      const previousPublishableKey =
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      try {
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_live_${Buffer.from('production-fapi.clerk.example$').toString('base64')}`;
        mocks.resolveClerkKeys.mockReturnValue({
          publishableKey: undefined,
          secretKey: undefined,
          status: 'staging_missing',
        });

        const req = createUnauthenticatedRequest({
          hostname: 'staging.jov.ie',
          pathname: '/__clerk/v1/client',
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(503);
        expect(mocks.fetch).not.toHaveBeenCalled();
        await expect(res.json()).resolves.toEqual({
          error: 'Clerk proxy unavailable: missing or invalid publishable key',
        });
      } finally {
        if (previousPublishableKey === undefined) {
          delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
        } else {
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
            previousPublishableKey;
        }
      }
    });
  });

  // ==========================================================================
  // meetjovie.com Redirect
  // ==========================================================================
  describe('meetjovie.com redirect', () => {
    it('301 redirects meetjovie.com to jov.ie', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/some-page',
        hostname: 'meetjovie.com',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(301);
      const location = res.headers.get('location');
      expect(location).toContain('jov.ie');
      expect(location).toContain('/some-page');
    });
  });

  describe('support.jov.ie redirect', () => {
    it('308 redirects support.jov.ie to jov.ie/support and preserves query params', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/articles/649224-jovie-password-reset',
        hostname: 'support.jov.ie',
        searchParams: { ref: '123' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(308);
      const location = res.headers.get('location');
      expect(location).toBe('https://jov.ie/support?ref=123');
    });

    it('redirects support.jov.ie investor paths before investor handling runs', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/investor-portal/respond',
        hostname: 'support.jov.ie',
        searchParams: {
          t: 'token-123',
          action: 'interested',
        },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe(
        'https://jov.ie/support?t=token-123&action=interested'
      );
    });
  });

  describe('investors.jov.ie legacy subdomain (proxy investor 301 early returns)', () => {
    it('301 redirects investors.jov.ie non-static paths to jov.ie/investor-portal preserving token', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/foo/bar',
        hostname: 'investors.jov.ie',
        searchParams: { t: 'tok-abc', utm: 'x' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(301);
      const location = res.headers.get('location') || '';
      expect(location).toContain('https://jov.ie/investor-portal/foo/bar');
      expect(location).toContain('t=tok-abc');
      expect(location).toContain('utm=x');
    });

    it('passes through _next static assets on investors.jov.ie without redirect (early return)', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/_next/static/chunks/main.js',
        hostname: 'investors.jov.ie',
      });
      const res = await callMiddleware(req);

      // NextResponse.next() has status 200 in test harness? or no redirect
      expect(res.status).not.toBe(301);
      expect(res.headers.get('location')).toBeNull();
    });

    it('301 redirects investors.jov.ie root to jov.ie/investor-portal', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/',
        hostname: 'investors.jov.ie',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toContain(
        'https://jov.ie/investor-portal'
      );
    });
  });
});
