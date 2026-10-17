/**
 * Behavioral tests for proxy.ts middleware.
 *
 * Tests routing behavior that proxy.ts owns:
 * - Cookie banner geo-detection and cookie-setting
 * - Auth redirects for unauthenticated users on protected paths
 * - Bot detection on sensitive API paths
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
  captureWarning: vi.fn(),
  ensureSentry: vi.fn().mockResolvedValue(undefined),
  buildContentSecurityPolicy: vi.fn().mockReturnValue("default-src 'self'"),
  buildContentSecurityPolicyReportOnly: vi.fn().mockReturnValue(null),
  buildReportToHeader: vi.fn().mockReturnValue(''),
  buildReportingEndpointsHeader: vi.fn().mockReturnValue(''),
  getCspReportUri: vi.fn().mockReturnValue(null),
  isClerkRequiredPath: vi.fn().mockReturnValue(false),
  shouldBypassClerkForRequest: vi.fn().mockReturnValue(true),
  isTestAuthBypassEnabled: vi.fn().mockReturnValue(true),
  resolveTestBypassUserId: vi.fn().mockReturnValue(null),
  checkProfileVisitorBlocked: vi.fn().mockResolvedValue(false),
  getAudienceBlockIpFromHeaders: vi.fn().mockReturnValue('masked-ip'),
  createBotResponse: vi.fn(),
  clerkMiddleware: vi.fn(),
  // Better Auth cookie helper. `getSessionCookie` backs the proxy's
  // top-level signed-in marker (apps/web/proxy.ts). Public `/` navigation
  // deliberately does not consult a cookie cache.
  getSessionCookie: vi.fn().mockReturnValue(null),
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
  captureWarning: mocks.captureWarning,
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
vi.mock('@/lib/audience/public-profile-block', () => ({
  checkProfileVisitorBlocked: mocks.checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders: mocks.getAudienceBlockIpFromHeaders,
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
vi.mock('better-auth/cookies', () => ({
  getSessionCookie: mocks.getSessionCookie,
}));
vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
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
  DOCS_URL: 'https://docs.jov.ie',
  HOSTNAME: 'jov.ie',
  SUPPORT_EMAIL: 'support@jov.ie',
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

function createFetchEvent(
  waitUntil: (promise: Promise<unknown>) => void = () => {}
) {
  return {
    waitUntil,
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
  req: import('next/server').NextRequest,
  event = createFetchEvent()
): Promise<NextResponse> {
  const result = await middleware(req, event);
  expect(result).toBeDefined();
  return result as NextResponse;
}

function snapshotFixtureEnv() {
  return {
    CI: process.env.CI,
    NEXT_PUBLIC_E2E_MODE: process.env.NEXT_PUBLIC_E2E_MODE,
    PUBLIC_NOAUTH_SMOKE: process.env.PUBLIC_NOAUTH_SMOKE,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

function clearFixtureEnv() {
  delete process.env.CI;
  delete process.env.NEXT_PUBLIC_E2E_MODE;
  delete process.env.PUBLIC_NOAUTH_SMOKE;
  delete process.env.VERCEL_ENV;
}

function restoreFixtureEnv(previous: ReturnType<typeof snapshotFixtureEnv>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
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
  mocks.checkProfileVisitorBlocked.mockResolvedValue(false);
  mocks.getAudienceBlockIpFromHeaders.mockReturnValue('masked-ip');
  mocks.createBotResponse.mockReturnValue(undefined);
  mocks.getSessionCookie.mockReturnValue(null);
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

  describe('trusted app-shell mode header', () => {
    it('overwrites a spoofed customer mode for canonical OV requests', async () => {
      const req = createAuthenticatedRequest('admin_test', {
        pathname: APP_ROUTES.ADMIN_CHAT,
        headers: { 'x-jovie-app-shell-mode': 'customer' },
      });

      const res = await callMiddleware(req);

      expect(
        res.headers.get('x-middleware-request-x-jovie-app-shell-mode')
      ).toBe('ov');
    });

    it('overwrites a spoofed OV mode for customer requests', async () => {
      const req = createAuthenticatedRequest('creator_test', {
        pathname: APP_ROUTES.CHAT,
        headers: { 'x-jovie-app-shell-mode': 'ov' },
      });

      const res = await callMiddleware(req);

      expect(
        res.headers.get('x-middleware-request-x-jovie-app-shell-mode')
      ).toBe('customer');
    });
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

  describe('private profile alias marker', () => {
    it.each([
      '/dualipa/music/__profile-mode-alias/resolve',
      '/dualipa/listen/__profile-mode-alias/resolve',
      '/tim/subscribe/__profile-mode-alias/resolve',
      '/tim/subscribe/__profile-mode-alias/resolve/qr',
      '/tim/profile-mode-render/listen/__profile-mode-alias',
      `/tim/subscribe/__profile-mode-alias/resolve/${'q'.repeat(256)}`,
      '/tim/subscribe/__profile%2Dmode%2Dalias/resolve/qr',
      '/tim/subscribe/%5F%5Fprofile-mode-alias/resolve/qr',
      '/tim/subscribe/%255F%255Fprofile-mode-alias/resolve/qr',
      '/tim/subscribe/%25255F%25255Fprofile%25252Dmode%25252Dalias/resolve/qr',
      '/tim/subscribe/%252525255F%252525255Fprofile-mode-alias/resolve/qr',
      '/tim/subscribe/%252F__profile-mode-alias%252Fresolve/qr',
      `/tim/subscribe/${'q'.repeat(2049)}/resolve/qr`,
    ])('returns 404 for direct marker path %s before auth', async path => {
      const req = createUnauthenticatedRequest({ pathname: path });
      const res = await callMiddleware(req);

      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.text()).toBe('');
      expect(mocks.getSessionCookie).not.toHaveBeenCalled();
      expect(mocks.resolveTestBypassUserId).not.toHaveBeenCalled();
      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
    });

    it('does not block the public alias before its afterFiles rewrite', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/dualipa/music' });
      const res = await callMiddleware(req);

      expect(res.status).not.toBe(404);
    });

    it.each(['/tim/caf%C3%A9', '/tim/100%25-real', '/tim/%25zz'])(
      'does not reject a valid encoded public path %s',
      async path => {
        const req = createUnauthenticatedRequest({ pathname: path });
        const res = await callMiddleware(req);

        expect(res.status).not.toBe(404);
      }
    );

    it('canonicalizes repeated alias sources to the first non-empty value', async () => {
      const req = createUnauthenticatedRequest({
        pathname:
          '/dualipa/music?campaign=summer&source=&source=link&source=qr',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(307);
      const location = new URL(
        res.headers.get('location') ?? '',
        'https://localhost'
      );
      expect(location.pathname).toBe('/dualipa/music');
      expect(location.searchParams.getAll('source')).toEqual(['link']);
      expect(location.searchParams.get('campaign')).toBe('summer');
      expect(mocks.getSessionCookie).not.toHaveBeenCalled();
      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
    });

    it('removes repeated empty alias sources without redirecting elsewhere', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/dualipa/tour?source=&source=',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(307);
      const location = new URL(
        res.headers.get('location') ?? '',
        'https://localhost'
      );
      expect(location.pathname).toBe('/dualipa/tour');
      expect(location.searchParams.has('source')).toBe(false);
    });
  });

  // ==========================================================================
  // Catch-all handle hardening (JOV-3054)
  // ==========================================================================
  describe('catch-all handle hardening', () => {
    it('passes the canonical profile admission fixture to its concrete profile route', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/unfazed',
        searchParams: { source: 'profile-admission' },
      });
      const res = await callMiddleware(req);

      expect(res.status).not.toBe(307);
      expect(mocks.checkProfileVisitorBlocked).toHaveBeenCalled();
    });

    it('redirects /login to /signin without touching the audience block', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/login' });
      const res = await callMiddleware(req);

      expect(res.status).toBe(308);
      expect(isRedirectTo(res, '/signin')).toBe(true);
      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
    });

    it('redirects /request-access to /start without touching the audience block', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/request-access' });
      const res = await callMiddleware(req);

      expect(res.status).toBe(308);
      expect(isRedirectTo(res, '/start')).toBe(true);
      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
    });

    it('returns a fast 404 for other reserved catch-all segments', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/register' });
      const res = await callMiddleware(req);

      expect(res.status).toBe(404);
      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
    });

    it('returns 410 for root /music and /shows only', async () => {
      for (const pathname of ['/music', '/shows']) {
        const req = createUnauthenticatedRequest({ pathname });
        const res = await callMiddleware(req);

        expect(res.status, pathname).toBe(410);
        expect(res.headers.get('x-robots-tag')).toBe('noindex');
        expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
      }
    });

    it('leaves /product and /you claimable so Drive can ship the marketing route', async () => {
      for (const pathname of ['/product', '/you']) {
        const req = createUnauthenticatedRequest({ pathname });
        const res = await callMiddleware(req);

        expect(res.status, pathname).not.toBe(410);
        expect(res.status, pathname).not.toBe(308);
      }
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

    it('redirects signed-out Electron app shell requests with an absolute signin location before Clerk dev-browser handling', async () => {
      const req = createUnauthenticatedRequest({
        hostname: 'localhost:3112',
        pathname: '/app/chat',
        searchParams: { runtime: 'electron' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('location')).toBe(
        'https://localhost:3112/signin?redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron'
      );
      expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
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

    it('redirects anonymous /onboarding/checkout to sign-in outside the screenshot fixture', async () => {
      const previous = snapshotFixtureEnv();
      clearFixtureEnv();
      try {
        const req = createUnauthenticatedRequest({
          pathname: APP_ROUTES.ONBOARDING_CHECKOUT,
        });
        const res = await callMiddleware(req);

        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(isRedirectTo(res, '/signin')).toBe(true);
      } finally {
        restoreFixtureEnv(previous);
      }
    });

    it('keeps anonymous /onboarding/checkout behind sign-in when the screenshot fixture is admitted', async () => {
      const previous = snapshotFixtureEnv();
      clearFixtureEnv();
      process.env.CI = 'true';
      process.env.PUBLIC_NOAUTH_SMOKE = '1';
      try {
        const req = createUnauthenticatedRequest({
          pathname: APP_ROUTES.ONBOARDING_CHECKOUT,
        });
        const res = await callMiddleware(req);

        expect(res.status).toBe(307);
        expect(isRedirectTo(res, '/signin')).toBe(true);
        expect(res.headers.get('location')).toContain(
          'redirect_url=%2Fonboarding%2Fcheckout'
        );
      } finally {
        restoreFixtureEnv(previous);
      }
    });

    it('keeps anonymous /onboarding/checkout behind sign-in on a production deployment', async () => {
      const previous = snapshotFixtureEnv();
      clearFixtureEnv();
      process.env.CI = 'true';
      process.env.PUBLIC_NOAUTH_SMOKE = '1';
      process.env.VERCEL_ENV = 'production';
      try {
        const req = createUnauthenticatedRequest({
          pathname: APP_ROUTES.ONBOARDING_CHECKOUT,
        });
        const res = await callMiddleware(req);

        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(isRedirectTo(res, '/signin')).toBe(true);
      } finally {
        restoreFixtureEnv(previous);
      }
    });

    it('does not open other protected routes when the screenshot fixture is admitted', async () => {
      const previous = snapshotFixtureEnv();
      clearFixtureEnv();
      process.env.CI = 'true';
      process.env.PUBLIC_NOAUTH_SMOKE = '1';
      try {
        const req = createUnauthenticatedRequest({ pathname: '/app' });
        const res = await callMiddleware(req);

        expect(isRedirectTo(res, '/signin')).toBe(true);
      } finally {
        restoreFixtureEnv(previous);
      }
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

    it('lets unauthenticated GET /waitlist render the public front door', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/waitlist' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('location')).toBeNull();
    });

    it('allows unauthenticated access to public paths', async () => {
      const req = createUnauthenticatedRequest({ pathname: '/' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
    });

    it('answers retired public investor pages with a neutral noindex 404', async () => {
      for (const pathname of [
        '/investors',
        '/pitch',
        '/Jovie-Pitch-Deck.pdf',
      ]) {
        const res = await callMiddleware(
          createUnauthenticatedRequest({ pathname })
        );

        expect(res.status, pathname).toBe(404);
        expect(res.headers.get('X-Robots-Tag'), pathname).toContain('noindex');
        expect(res.headers.get('Cache-Control'), pathname).toBe(
          'private, no-store'
        );
      }
    });

    it('does not run the audience block lookup for reserved public routes', async () => {
      const reservedRoutes = [
        '/start',
        '/pricing',
        '/about',
        APP_ROUTES.ARTISTS,
        APP_ROUTES.PLAYLISTS,
      ];

      for (const pathname of reservedRoutes) {
        const req = createUnauthenticatedRequest({ pathname });
        const res = await callMiddleware(req);

        expect(res.status).toBeLessThan(300);
      }

      expect(mocks.checkProfileVisitorBlocked).not.toHaveBeenCalled();
      expect(mocks.getAudienceBlockIpFromHeaders).not.toHaveBeenCalled();
    });

    it('runs the audience block lookup for public profile root paths only', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/timwhite',
        headers: {
          'x-forwarded-for': '203.0.113.7, 198.51.100.8',
          'user-agent': 'Mozilla/5.0',
        },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(mocks.getAudienceBlockIpFromHeaders).toHaveBeenCalledWith(
        req.headers
      );
      expect(mocks.checkProfileVisitorBlocked).toHaveBeenCalledWith(
        'timwhite',
        'masked-ip',
        'Mozilla/5.0'
      );
    });

    it('redirects blocked public profile visitors before route handling continues', async () => {
      mocks.checkProfileVisitorBlocked.mockResolvedValue(true);

      const req = createUnauthenticatedRequest({
        pathname: '/timwhite',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://jov.ie/');
      expect(mocks.checkProfileVisitorBlocked).toHaveBeenCalledWith(
        'timwhite',
        'masked-ip',
        'Mozilla/5.0'
      );
    });

    it('applies the same audience block redirect to authenticated visitors', async () => {
      mocks.checkProfileVisitorBlocked.mockResolvedValue(true);
      const req = createAuthenticatedRequest('user_test', {
        pathname: '/timwhite',
        headers: { 'user-agent': 'Mozilla/5.0' },
      });

      const res = await callMiddleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://jov.ie/');
    });

    it('bounds a cold audience lookup and keeps its reconciliation alive', async () => {
      let resolveBlockCheck: ((blocked: boolean) => void) | undefined;
      mocks.checkProfileVisitorBlocked.mockReturnValue(
        new Promise<boolean>(resolve => {
          resolveBlockCheck = resolve;
        })
      );
      const backgroundWork: Promise<unknown>[] = [];
      const event = createFetchEvent(promise => backgroundWork.push(promise));
      const req = createUnauthenticatedRequest({ pathname: '/timwhite' });

      const startedAt = performance.now();
      const res = await callMiddleware(req, event);
      const durationMs = performance.now() - startedAt;

      expect(res.status).toBeLessThan(300);
      expect(durationMs).toBeLessThan(250);
      expect(backgroundWork).toHaveLength(1);

      resolveBlockCheck?.(true);
      await Promise.all(backgroundWork);
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

  describe('auth redirects for authenticated users (proxy no longer owns auth-page user-state redirects)', () => {
    it.each([
      APP_ROUTES.AUTH_START,
      APP_ROUTES.AUTH_CALLBACK,
      APP_ROUTES.LEGACY_APP_AUTH_CALLBACK,
    ])(
      'lets authenticated central auth route %s reach its handler without user-state redirects',
      async pathname => {
        mocks.getUserState.mockResolvedValue(USER_STATES.needsWaitlist);

        const req = createAuthenticatedRequest('clerk_user_1', {
          pathname,
          searchParams: { state: 'state_123' },
        });
        const res = await callMiddleware(req);

        expect(res.status).toBeLessThan(300);
        expect(mocks.getUserState).not.toHaveBeenCalled();
      }
    );

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
      expect(locationUrl.pathname).toBe('/app/settings/profile');
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
      expect(locationUrl.pathname).toBe(APP_ROUTES.SETTINGS_PROFILE);
      expect(locationUrl.searchParams.get('tab')).toBe('earn');
      expect(locationUrl.hash).toBe('#pay');
      expect(mocks.getUserState).not.toHaveBeenCalled();
    });
  });

  describe('public homepage navigation', () => {
    it('passes through for an authenticated visitor', async () => {
      const req = createAuthenticatedRequest('clerk_user_1', { pathname: '/' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(isRedirectTo(res, APP_ROUTES.DASHBOARD)).toBe(false);
      expect(mocks.getUserState).not.toHaveBeenCalled();
    });

    it('passes through for a stale or tampered session marker', async () => {
      const req = createTestRequest({ pathname: '/' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(isRedirectTo(res, APP_ROUTES.DASHBOARD)).toBe(false);
    });

    it('passes through non-navigation methods without auth redirects', async () => {
      const req = createAuthenticatedRequest('clerk_user_1', {
        pathname: '/',
        method: 'POST',
      });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(300);
      expect(isRedirectTo(res, APP_ROUTES.DASHBOARD)).toBe(false);
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

    it('preserves the redirect when an agent prefers Markdown', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/',
        hostname: 'meetjovie.com',
        headers: { Accept: 'text/markdown' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toContain('https://jov.ie/');
      expect(res.headers.get('content-type')).toBeNull();
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

  describe('path-based investor portal (proxy investor early returns)', () => {
    it('lets investor response links bypass Clerk without stripping token params', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/investor-portal/respond',
        searchParams: {
          t: 'token-123',
          action: 'interested',
        },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
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

    it('preserves the redirect when an agent prefers Markdown', async () => {
      const req = createUnauthenticatedRequest({
        pathname: '/',
        hostname: 'investors.jov.ie',
        headers: { Accept: 'text/markdown' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toContain(
        'https://jov.ie/investor-portal'
      );
      expect(res.headers.get('content-type')).toBeNull();
    });
  });
});
