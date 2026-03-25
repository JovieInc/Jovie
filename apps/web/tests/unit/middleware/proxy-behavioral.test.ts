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
import { NextRequest, NextResponse } from 'next/server';
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
  }),
  isStagingHost: vi.fn().mockReturnValue(false),
  shouldBypassClerkForRequest: vi.fn().mockReturnValue(true),
  resolveTestBypassUserId: vi.fn().mockReturnValue(null),
  createBotResponse: vi.fn(),
  clerkMiddleware: vi.fn(),
  buildProtectedAuthRedirectUrl: vi.fn(
    (authPage: string, pathname: string, search: string) =>
      `${authPage}?redirect_url=${encodeURIComponent(pathname + search)}`
  ),
  sanitizeRedirectUrl: vi.fn().mockImplementation((url: string | null) => url),
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
  shouldBypassClerkForRequest: mocks.shouldBypassClerkForRequest,
}));
vi.mock('@/lib/auth/test-mode', () => ({
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
  HOSTNAME: 'jov.ie',
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
  mocks.resolveTestBypassUserId.mockReturnValue(null);
  mocks.isCookieBannerRequired.mockReturnValue(false);
  mocks.getUserState.mockResolvedValue(null);
  mocks.isKnownActiveUser.mockReturnValue(false);
  mocks.isStagingHost.mockReturnValue(false);
  mocks.createBotResponse.mockReturnValue(undefined);
  mocks.clerkMiddleware.mockImplementation(
    (handler: Function) => async (req: unknown, event: unknown) =>
      handler(req, event)
  );
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
  // Banned User Redirect
  // ==========================================================================
  describe('banned user handling', () => {
    it('redirects banned user to /banned on non-/app paths', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.banned);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/pricing',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(isRedirectTo(res, '/banned')).toBe(true);
    });

    it('does not redirect banned user already on /banned', async () => {
      mocks.getUserState.mockResolvedValue(USER_STATES.banned);

      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/banned',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
    });
  });

  // ==========================================================================
  // Clerk FAPI Proxy Rewrites
  // ==========================================================================
  describe('Clerk FAPI proxy rewrites', () => {
    // FAPI proxy tests must NOT use the test-auth-bypass header because the
    // test bypass returns from handleRequest before reaching the FAPI block.
    function createFapiRequest(pathname: string, hostname: string) {
      const url = new URL(pathname, `https://${hostname}`);
      return new NextRequest(url.toString(), {
        method: 'GET',
        headers: new Headers({}),
      });
    }

    it('rewrites /__clerk to production Clerk on production host', async () => {
      mocks.isStagingHost.mockReturnValue(false);
      const req = createFapiRequest('/__clerk/v1/client', 'jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.jov.ie/v1/client');
    });

    it('rewrites /__clerk to staging Clerk on staging host', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      const req = createFapiRequest('/__clerk/v1/client', 'staging.jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.staging.jov.ie/v1/client');
    });

    it('rewrites /clerk to production Clerk on production host', async () => {
      mocks.isStagingHost.mockReturnValue(false);
      const req = createFapiRequest('/clerk/v1/client', 'jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.jov.ie/v1/client');
    });

    it('rewrites /clerk to staging Clerk on staging host', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      const req = createFapiRequest('/clerk/v1/client', 'staging.jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.staging.jov.ie/v1/client');
    });

    it('rewrites exact /__clerk root on staging', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      const req = createFapiRequest('/__clerk', 'staging.jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.staging.jov.ie/');
    });

    it('rewrites exact /clerk root on production', async () => {
      mocks.isStagingHost.mockReturnValue(false);
      const req = createFapiRequest('/clerk', 'jov.ie');
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.jov.ie/');
    });

    it('preserves query string on /__clerk rewrite', async () => {
      mocks.isStagingHost.mockReturnValue(true);
      const url = new URL(
        '/__clerk/v1/client?foo=bar',
        'https://staging.jov.ie'
      );
      const req = new NextRequest(url.toString(), {
        method: 'GET',
        headers: new Headers({}),
      });
      const res = await callMiddleware(req);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      expect(rewriteUrl).toBe('https://clerk.staging.jov.ie/v1/client?foo=bar');
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
});
