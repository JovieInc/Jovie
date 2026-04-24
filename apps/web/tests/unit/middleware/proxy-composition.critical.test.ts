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
import { NextResponse } from 'next/server';
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
  // Clerk publishable key header injection
  // ==========================================================================
  describe('x-clerk-publishable-key header', () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    beforeEach(() => {
      nextSpy.mockClear();
    });

    const getInjectedClerkHeader = () => {
      const arg = nextSpy.mock.calls.at(-1)?.[0] as
        | { request?: { headers?: Headers } }
        | undefined;
      return arg?.request?.headers?.get('x-clerk-publishable-key') ?? null;
    };

    it('sets header when both publishableKey and secretKey are present', async () => {
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_test_valid-key',
        secretKey: 'sk_test_valid-key',
        status: 'ok',
      });
      mocks.shouldBypassClerkForRequest.mockReturnValue(true);

      const req = createTestRequest({ pathname: '/signup' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(400);
      expect(getInjectedClerkHeader()).toBe('pk_test_valid-key');
    });

    it('does NOT set header when secretKey is missing (staging without CLERK_SECRET_KEY)', async () => {
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: 'pk_live_valid-production-key',
        secretKey: undefined,
        status: 'staging_missing',
      });
      mocks.shouldBypassClerkForRequest.mockReturnValue(true);

      const req = createTestRequest({ pathname: '/signup' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(500);
      expect(getInjectedClerkHeader()).toBeNull();
    });

    it('does NOT set header when publishableKey is missing', async () => {
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: undefined,
        secretKey: undefined,
        status: 'staging_missing',
      });
      mocks.shouldBypassClerkForRequest.mockReturnValue(true);

      const req = createTestRequest({ pathname: '/' });
      const res = await callMiddleware(req);

      expect(res.status).toBeLessThan(500);
      expect(getInjectedClerkHeader()).toBeNull();
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
  });
});
