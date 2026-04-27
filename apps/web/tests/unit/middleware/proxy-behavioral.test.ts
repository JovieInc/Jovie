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
  COUNTRY_CODE_COOKIE: 'country_code',
  HOMEPAGE_CITY_COOKIE: 'homepage_city',
  HOMEPAGE_REGION_COOKIE: 'homepage_region',
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

    it('redirects unauthenticated GET /onboarding to /signin', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/onboarding' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/signin')).toBe(true);
    });

    it('redirects unauthenticated GET /waitlist to /signup', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/waitlist' });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(isRedirectTo(res, '/signup')).toBe(true);
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

    it('redirects authenticated user with needsOnboarding on /signin to /onboarding', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/signin',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/onboarding')).toBe(true);
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

    it('redirects active user away from /onboarding to /app', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.active);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/onboarding',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/app')).toBe(true);
    });
  });

  // ==========================================================================
  // Circuit Breaker
  // ==========================================================================
  describe('circuit breaker (redirect loop prevention)', () => {
    it('rewrites to /onboarding and increments redirect count', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.needsOnboarding);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
      });
      const res = await callMiddleware(req);

      // Verify the rewrite destination is /onboarding
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBeTruthy();
      expect(new URL(rewriteUrl!).pathname).toBe('/onboarding');

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
      const raw = await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8');
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
        expect(headers.get('host')).toBe(stagingFapiHost);
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
});
