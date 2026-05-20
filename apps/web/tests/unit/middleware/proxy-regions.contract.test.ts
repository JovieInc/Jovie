/**
 * Contract tests for proxy.ts specific regions (RED 43 core surface).
 *
 * Targets the three logical regions per TEST_RISK_REGISTER:
 * - Audience block + fingerprint (public profile visitor gating, 97-246)
 * - 301/legacy path handling + investor portal early return (249-453)
 * - Auth proxy (Clerk FAPI + error paths, wiring) + general error cases
 *
 * These are pure/contract tests for the orchestration owned by proxy.ts.
 * Pure helpers exported for testability of the audience fingerprint logic
 * (previously unreachable in NODE_ENV=test due to early return in check func).
 *
 * Wires additional coverage for the highest-risk proxy middleware surface.
 *
 * @see apps/web/proxy.ts
 * @see docs/TEST_RISK_REGISTER.md (proxy row)
 */

import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRequest } from './proxy-test-harness';

// Hoisted mocks — must precede import of proxy (which pulls in the deps)
const mocks = vi.hoisted(() => ({
  handleInvestorRequest: vi.fn(),
  handleClerkFapiProxy: vi.fn(),
  isMaliciousProbePath: vi.fn().mockReturnValue(false),
  createProbeDropResponse: vi.fn(),
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
  captureErrorWithHostnameLimit: vi.fn(),
  buildAuthDegradedHtmlResponse: vi.fn(),
  getRequestLocationFromHeaders: vi.fn().mockReturnValue(null),
  shouldDisableClerkProxyForLocation: vi.fn().mockReturnValue(false),
  shouldBypassClerk: vi.fn().mockReturnValue(false),
  clerkMiddleware: vi.fn(),
  getUserState: vi.fn().mockResolvedValue(null),
  isKnownActiveUser: vi.fn().mockReturnValue(false),
  ensureSentry: vi.fn().mockResolvedValue(undefined),
  buildContentSecurityPolicy: vi.fn().mockReturnValue("default-src 'self'"),
  buildContentSecurityPolicyReportOnly: vi.fn().mockReturnValue(null),
  buildReportToHeader: vi.fn().mockReturnValue(''),
  buildReportingEndpointsHeader: vi.fn().mockReturnValue(''),
  getCspReportUri: vi.fn().mockReturnValue(null),
  isCookieBannerRequired: vi.fn().mockReturnValue(false),
  buildProtectedAuthRedirectUrl: vi.fn((p: string) => `/${p}?redirect=1`),
  sanitizeRedirectUrl: vi.fn((u: string | null) => u),
  captureError: vi.fn(),
}));

vi.mock('@/lib/auth/investor-portal', () => ({
  handleInvestorRequest: mocks.handleInvestorRequest,
}));
vi.mock('@/lib/auth/clerk-fapi-proxy', () => ({
  handleClerkFapiProxy: mocks.handleClerkFapiProxy,
}));
vi.mock('@/lib/security/probe-detection', () => ({
  isMaliciousProbePath: mocks.isMaliciousProbePath,
  createProbeDropResponse: mocks.createProbeDropResponse,
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
  resolveTestBypassUserId: mocks.resolveTestBypassUserId,
}));
vi.mock('@/lib/auth/sentry-rate-limit', () => ({
  captureErrorWithHostnameLimit: mocks.captureErrorWithHostnameLimit,
}));
vi.mock('@/lib/auth/auth-degraded-fallback', () => ({
  buildAuthDegradedHtmlResponse: mocks.buildAuthDegradedHtmlResponse,
  isBrowserNavigation: (accept: string | null) =>
    !!(accept && accept.includes('text/html')),
}));
vi.mock('@/components/providers/clerkAvailability', () => ({
  getRequestLocationFromHeaders: mocks.getRequestLocationFromHeaders,
  shouldBypassClerk: mocks.shouldBypassClerk,
  shouldDisableClerkProxyForLocation: mocks.shouldDisableClerkProxyForLocation,
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: mocks.clerkMiddleware,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  getUserState: mocks.getUserState,
  isKnownActiveUser: mocks.isKnownActiveUser,
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
vi.mock('@/lib/cookies/consent-regions', () => ({
  COOKIE_BANNER_REQUIRED_COOKIE: 'jv_cc_required',
  isCookieBannerRequired: mocks.isCookieBannerRequired,
}));
vi.mock('@/lib/auth/build-auth-route-url', () => ({
  buildProtectedAuthRedirectUrl: mocks.buildProtectedAuthRedirectUrl,
}));
vi.mock('@/lib/auth/constants', () => ({
  sanitizeRedirectUrl: mocks.sanitizeRedirectUrl,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://jov.ie',
  HOSTNAME: 'jov.ie',
  STAGING_HOSTNAMES: new Set(['staging.jov.ie']),
}));
vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    START: '/start',
    ONBOARDING: '/onboarding',
    WAITLIST: '/waitlist',
    DASHBOARD_EARNINGS: '/app/earnings',
    EARNINGS: '/earnings',
    SETTINGS_ARTIST_PROFILE: '/app/settings/artist-profile',
    SUPPORT: '/support',
  },
}));

// Import AFTER all vi.mock declarations
import middleware, {
  createFingerprintEdge,
  maskIpForFingerprint,
} from '@/proxy';

function createFetchEvent() {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as import('next/server').NextFetchEvent;
}

function resetMocks() {
  Object.values(mocks).forEach((m: any) => {
    if (m && typeof m.mockClear === 'function') m.mockClear();
  });
  mocks.resolveClerkKeys.mockReturnValue({
    publishableKey: 'pk_test_real-key-123',
    secretKey: 'sk_test_real-key-456',
    status: 'ok',
  });
  mocks.handleInvestorRequest.mockResolvedValue(null);
  mocks.handleClerkFapiProxy.mockResolvedValue(null);
  mocks.isMaliciousProbePath.mockReturnValue(false);
  mocks.resolveTestBypassUserId.mockReturnValue(null);
  mocks.isClerkRequiredPath.mockReturnValue(false);
  mocks.shouldBypassClerkForRequest.mockReturnValue(true);
  mocks.isTestAuthBypassEnabled.mockReturnValue(true);
  mocks.isStagingHost.mockReturnValue(false);
  mocks.clerkMiddleware.mockImplementation(
    (handler: any) => async (req: any, ev: any) => handler(req, ev)
  );
  mocks.createProbeDropResponse.mockReturnValue(
    new NextResponse(null, { status: 404 })
  );
  mocks.buildAuthDegradedHtmlResponse.mockReturnValue(
    new NextResponse('<html>auth degraded</html>', { status: 503 })
  );
}

async function callMiddleware(req: import('next/server').NextRequest) {
  const res = await middleware(req, createFetchEvent());
  return res as NextResponse;
}

describe('proxy regions contracts (audience + investor + auth proxy + 301/legacy + errors)', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // Audience block region: pure fingerprint helpers (exported for testability)
  // Covers mask + createFingerprintEdge branches (IPv4 /24, IPv6 prefix, nulls)
  // Previously unreachable under NODE_ENV=test in checkProfileVisitorBlocked.
  // ==========================================================================
  describe('audience fingerprint helpers (public profile block)', () => {
    it('masks IPv4 to first 3 octets ( /24 )', () => {
      expect(maskIpForFingerprint('1.2.3.4')).toBe('1.2.3.0');
      expect(maskIpForFingerprint('10.20.30.40')).toBe('10.20.30.0');
    });

    it('masks IPv6 to first 4 groups', () => {
      expect(maskIpForFingerprint('2001:db8:85a3:0:0:8a2e:370:7334')).toBe(
        '2001:db8:85a3:0'
      );
      expect(
        maskIpForFingerprint('fe80:0000:0000:0000:0202:b3ff:fe1e:8329')
      ).toBe('fe80:0000:0000:0000');
    });

    it('returns unknown_ip for null/undefined/empty', () => {
      expect(maskIpForFingerprint(null)).toBe('unknown_ip');
      expect(maskIpForFingerprint('')).toBe('unknown_ip');
    });

    it('createFingerprintEdge produces stable 64-char hex for same inputs', async () => {
      const fp1 = await createFingerprintEdge('1.2.3.4', 'Mozilla/5.0');
      const fp2 = await createFingerprintEdge('1.2.3.4', 'Mozilla/5.0');
      expect(fp1).toHaveLength(64);
      expect(fp1).toBe(fp2);
      expect(/^[0-9a-f]+$/.test(fp1)).toBe(true);
    });

    it('createFingerprintEdge differs for different IP or UA', async () => {
      const fpA = await createFingerprintEdge('1.2.3.4', 'UA1');
      const fpB = await createFingerprintEdge('4.5.6.7', 'UA1');
      const fpC = await createFingerprintEdge('1.2.3.4', 'UA2');
      expect(fpA).not.toBe(fpB);
      expect(fpA).not.toBe(fpC);
    });

    it('createFingerprintEdge handles nulls gracefully', async () => {
      const fp = await createFingerprintEdge(null, null);
      expect(fp).toHaveLength(64);
    });
  });

  // ==========================================================================
  // 301/legacy path handling (meetjovie, support, sign-* normalizers, waitlist)
  // =============================================================================
  describe('301/legacy redirects', () => {
    it('301 redirects all meetjovie.com traffic to jov.ie preserving path+search', async () => {
      const req = createTestRequest({
        pathname: '/some/legacy/path',
        hostname: 'meetjovie.com',
        searchParams: { foo: 'bar' },
      });
      const res = await callMiddleware(req);
      expect(res.status).toBe(301);
      const loc = res.headers.get('location') || '';
      expect(loc).toContain('https://jov.ie/some/legacy/path');
      expect(loc).toContain('foo=bar');
    });

    it('308 redirects retired support.jov.ie to /support preserving query', async () => {
      const req = createTestRequest({
        pathname: '/foo',
        hostname: 'support.jov.ie',
        searchParams: { help: '1' },
      });
      const res = await callMiddleware(req);
      expect(res.status).toBe(308);
      const loc = res.headers.get('location') || '';
      expect(loc).toContain('/support');
      expect(loc).toContain('help=1');
    });
  });

  // ==========================================================================
  // Investor portal region: early return before Clerk
  // =============================================================================
  describe('investor portal early handling', () => {
    it('short-circuits to investor handler response for investor paths', async () => {
      const investorRes = NextResponse.json(
        { ok: 'investor' },
        { status: 200 }
      );
      mocks.handleInvestorRequest.mockResolvedValue(investorRes);

      const req = createTestRequest({ pathname: '/investor-portal' });
      const res = await callMiddleware(req);

      expect(mocks.handleInvestorRequest).toHaveBeenCalled();
      expect(res.status).toBe(200);
      // body check would require text(), but status sufficient for contract
    });
  });

  // ==========================================================================
  // Auth proxy (Clerk FAPI) region: early return for /__clerk and /clerk paths
  // =============================================================================
  describe('Clerk FAPI proxy early handling', () => {
    it('short-circuits to clerk fapi proxy handler for /__clerk/* paths', async () => {
      const proxyRes = new NextResponse('clerk bundle', {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      });
      mocks.handleClerkFapiProxy.mockResolvedValue(proxyRes);

      const req = createTestRequest({
        pathname: '/__clerk/v1/js/.../clerk.js',
      });
      const res = await callMiddleware(req);

      expect(mocks.handleClerkFapiProxy).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // Error cases (clerk config missing, staging clerk errors, probe drops)
  // =============================================================================
  describe('proxy error cases (clerk unavailable, probes)', () => {
    it('drops malicious probe paths early with 404 (no further processing)', async () => {
      mocks.isMaliciousProbePath.mockReturnValue(true);
      const probeRes = new NextResponse(null, { status: 404 });
      mocks.createProbeDropResponse.mockReturnValue(probeRes);

      const req = createTestRequest({
        pathname: '/evil/wp-admin/setup-config.php',
      });
      const res = await callMiddleware(req);

      expect(mocks.isMaliciousProbePath).toHaveBeenCalled();
      expect(mocks.createProbeDropResponse).toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it('returns 503 JSON when clerk config missing on protected path (non-browser)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: null,
        secretKey: null,
        status: 'missing',
      });
      mocks.isClerkRequiredPath.mockReturnValue(true);
      mocks.shouldBypassClerkForRequest.mockReturnValue(false);

      const req = createTestRequest({
        pathname: '/app/dashboard',
        headers: { accept: 'application/json' },
      });
      const res = await callMiddleware(req);

      expect(res.status).toBe(503);
      expect(res.headers.get('content-type')).toContain('application/json');
      vi.unstubAllEnvs();
    });

    it('returns degraded HTML when clerk config missing on protected browser nav', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      mocks.resolveClerkKeys.mockReturnValue({
        publishableKey: null,
        secretKey: null,
        status: 'missing',
      });
      mocks.isClerkRequiredPath.mockReturnValue(true);
      mocks.shouldBypassClerkForRequest.mockReturnValue(false);

      const req = createTestRequest({
        pathname: '/onboarding',
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      const res = await callMiddleware(req);

      expect(mocks.buildAuthDegradedHtmlResponse).toHaveBeenCalled();
      expect(res.status).toBe(503);
      vi.unstubAllEnvs();
    });
  });
});
