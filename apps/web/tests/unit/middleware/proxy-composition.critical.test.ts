/**
 * Proxy composition tests — tests the proxy's own orchestration logic,
 * not its callees (which are tested in proxy-behavioral.test.ts).
 *
 * Specifically tests:
 * - CSP nonce is set on response headers (composition, not CSP function)
 * - Test bypass path sets cookies and skips Clerk
 * - Excluded paths via matcher skip the middleware entirely
 *
 * Marked .critical so it runs on every feature branch push.
 *
 * @see apps/web/proxy.ts
 * @see apps/web/tests/unit/middleware/proxy-behavioral.test.ts (callee behavior)
 */
import 'next/dist/server/node-environment';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import type { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyUserState } from '@/lib/auth/proxy-state';

// ============================================================================
// Hoisted mocks — same pattern as proxy-behavioral.test.ts
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

import middleware from '@/proxy';
import { createTestRequest } from './proxy-test-harness';

function createFetchEvent() {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as import('next/server').NextFetchEvent;
}

function resetMocks() {
  for (const mock of Object.values(mocks)) {
    if (typeof mock.mockClear === 'function') mock.mockClear();
  }
  mocks.resolveTestBypassUserId.mockReturnValue(null);
  mocks.isCookieBannerRequired.mockReturnValue(false);
  mocks.getUserState.mockResolvedValue(null);
  mocks.isKnownActiveUser.mockReturnValue(false);
  mocks.createBotResponse.mockReturnValue(undefined);
  mocks.clerkMiddleware.mockImplementation(
    (handler: Function) => async (req: unknown, event: unknown) =>
      handler(req, event)
  );
}

async function callMiddleware(
  req: import('next/server').NextRequest
): Promise<NextResponse> {
  const result = await middleware(req, createFetchEvent());
  expect(result).toBeDefined();
  return result as NextResponse;
}

describe('proxy composition (critical)', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // CSP nonce composition
  // ==========================================================================
  describe('CSP nonce on response', () => {
    it('does NOT generate nonce for marketing paths (homepage)', async () => {
      const req = createTestRequest({ pathname: '/' });
      await callMiddleware(req);

      // Marketing paths don't need CSP nonce — only app/protected routes do
      expect(mocks.buildContentSecurityPolicy).not.toHaveBeenCalled();
    });

    it('returns homepage markdown when Accept prefers text/markdown', async () => {
      const req = createTestRequest({
        pathname: '/',
        headers: { accept: 'text/markdown' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      );
      expect(res.headers.get('vary')).toBe('Accept');
      expect(res.headers.get('link')).toBe(
        '</>; rel="alternate"; type="text/html"'
      );
      await expect(res.text()).resolves.toContain('# ');
      expect(mocks.buildContentSecurityPolicy).not.toHaveBeenCalled();
    });

    it('returns a markdown 404 recovery body for a missing path', async () => {
      const req = createTestRequest({
        pathname: '/some-path-that-definitely-does-not-exist',
        headers: { accept: 'text/markdown' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      );
      expect(res.headers.get('vary')).toContain('Accept');
      const body = await res.text();
      expect(body).toContain('/llms.txt');
      expect(body).toContain('/openapi.json');
      expect(body).toContain('/sitemap.xml');
      expect(body).toContain('/llms-full.txt');
    });

    it('keeps the HTML homepage path for browser Accept and still varies on Accept', async () => {
      const req = createTestRequest({
        pathname: '/',
        headers: {
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const res = await callMiddleware(req);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('content-type')).not.toBe(
        'text/markdown; charset=utf-8'
      );
      expect(res.headers.get('vary')).toMatch(/Accept/i);
    });

    it('does not markdown-404 a public profile candidate', async () => {
      const req = createTestRequest({
        pathname: '/tim',
        headers: { accept: 'text/markdown' },
      });
      const res = await callMiddleware(req);
      expect(res.status).not.toBe(404);
      expect(res.headers.get('content-type')).not.toBe(
        'text/markdown; charset=utf-8'
      );
    });

    it('generates nonce for app paths', async () => {
      mocks.resolveTestBypassUserId.mockReturnValue('user_test123');
      mocks.getUserState.mockResolvedValue({
        needsWaitlist: false,
        needsOnboarding: false,
        isActive: true,
        isBanned: false,
      });
      mocks.isKnownActiveUser.mockReturnValue(true);

      const req = createTestRequest({ pathname: '/app/dashboard' });
      await callMiddleware(req);

      expect(mocks.buildContentSecurityPolicy).toHaveBeenCalled();
    });

    it('generates nonce for API paths', async () => {
      const req = createTestRequest({ pathname: '/api/health' });
      await callMiddleware(req);

      expect(mocks.buildContentSecurityPolicy).toHaveBeenCalled();
    });

    it('generates nonce for desktop auth handoff pages', async () => {
      const req = createTestRequest({ pathname: '/desktop-auth' });
      await callMiddleware(req);

      expect(mocks.buildContentSecurityPolicy).toHaveBeenCalled();
    });

    it('generates nonce for the dynamic start route used after desktop auth', async () => {
      const req = createTestRequest({ pathname: '/start' });
      await callMiddleware(req);

      expect(mocks.buildContentSecurityPolicy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Test bypass path
  // ==========================================================================
  describe('test bypass auth path', () => {
    it('resolves test user when bypass is enabled', async () => {
      mocks.resolveTestBypassUserId.mockReturnValue('user_test123');
      mocks.getUserState.mockResolvedValue({
        needsWaitlist: false,
        needsOnboarding: false,
        isActive: true,
        isBanned: false,
      });
      mocks.isKnownActiveUser.mockReturnValue(true);

      const req = createTestRequest({
        pathname: '/app/dashboard',
        headers: { 'x-test-mode': 'test-auth-bypass' },
      });
      const res = await callMiddleware(req);

      // Should not redirect authenticated test user away from /app
      expect(res.status).toBeLessThan(300);
      expect(mocks.resolveTestBypassUserId).toHaveBeenCalled();
    });

    it('treats request as unauthenticated when no test user resolved', async () => {
      mocks.resolveTestBypassUserId.mockReturnValue(null);

      const req = createTestRequest({ pathname: '/app/dashboard' });
      const res = await callMiddleware(req);

      // Should redirect unauthenticated to signin
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
    });
  });

  // ==========================================================================
  // Middleware matcher exclusions
  // ==========================================================================
  describe('matcher config', () => {
    it('exports a config with matcher that excludes /monitoring', async () => {
      // Import the config export to verify matcher
      const { config } = await import('@/proxy');
      expect(config).toBeDefined();
      expect(config.matcher).toBeDefined();

      // The matcher regex should exclude /monitoring
      const matcherPattern = Array.isArray(config.matcher)
        ? config.matcher[0]
        : config.matcher;
      expect(matcherPattern).toContain('monitoring');
    });

    it('exports a config with matcher that excludes static files', async () => {
      const { config } = await import('@/proxy');
      const matcherPattern = Array.isArray(config.matcher)
        ? config.matcher[0]
        : config.matcher;
      expect(matcherPattern).toContain('_next');
    });

    it('skips the proxy for the same-origin alias decision endpoint (JOV-8338)', async () => {
      // The proxy's alias fast path fetches /api/profile-alias-decision
      // same-origin on every legacy alias hop. Running the proxy again on
      // that fetch serializes a second Node proxy invocation inside the
      // alias redirect whenever the CDN-cached decision is not served fresh.
      const { config } = await import('@/proxy');
      // Compile through Next's route parser, as the production build does.
      const proxyRuns = (url: string) =>
        unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

      expect(proxyRuns('/api/profile-alias-decision')).toBe(false);
      expect(proxyRuns('/api/profile-alias-decision/')).toBe(false);
      expect(proxyRuns('/api/profile-alias-decision/extra')).toBe(false);
      expect(
        proxyRuns('/api/profile-alias-decision?username=dualipa&alias=listen')
      ).toBe(false);
      expect(proxyRuns('/api/profile-alias-decisionx')).toBe(true);
      expect(proxyRuns('/api/profile-alias-decisions')).toBe(true);
      expect(proxyRuns('/api/auth/session')).toBe(true);
      expect(proxyRuns('/api/auth/session.json')).toBe(true);
      expect(proxyRuns('/api/health/build-info')).toBe(true);
      expect(proxyRuns('/api/trpc/edge')).toBe(true);
      expect(proxyRuns('/trpc/profile.json')).toBe(true);
      expect(proxyRuns('/dualipa/listen')).toBe(true);
      expect(proxyRuns('/dualipa')).toBe(true);
    });
  });
});
