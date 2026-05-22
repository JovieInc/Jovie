/**
 * Tests for proxy.ts middleware 503 paths:
 * - Returns HTML for browser navigation (Accept: text/html) at all 4 503 sites
 * - Returns JSON for API/fetch callers (Accept: application/json)
 * - captureErrorWithHostnameLimit is called (not raw captureError) on 503 paths
 *
 * Audit findings: #11, #13, #15, #23, #49
 *
 * @see apps/web/proxy.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProxyUserState } from '@/lib/auth/proxy-state';

// ============================================================================
// Hoisted mocks — must be in test file for vi.hoisted hoisting
// ============================================================================

const mocks = vi.hoisted(() => ({
  getUserState:
    vi.fn<(clerkUserId: string) => Promise<ProxyUserState | null>>(),
  isKnownActiveUser: vi.fn<(clerkUserId: string) => boolean>(),
  invalidateProxyUserStateCache: vi.fn(),
  isCookieBannerRequired: vi.fn().mockReturnValue(false),
  captureError: vi.fn().mockResolvedValue(undefined),
  captureErrorWithHostnameLimit: vi.fn().mockResolvedValue(true),
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
  shouldBypassClerkForRequest: vi.fn().mockReturnValue(false),
  isTestAuthBypassEnabled: vi.fn().mockReturnValue(false),
  resolveTestBypassUserId: vi.fn().mockReturnValue(null),
  createBotResponse: vi.fn(),
  clerkMiddleware: vi.fn(),
  buildProtectedAuthRedirectUrl: vi.fn(
    (authPage: string, pathname: string, search: string) =>
      `${authPage}?redirect_url=${encodeURIComponent(pathname + search)}`
  ),
  sanitizeRedirectUrl: vi.fn().mockImplementation((url: string | null) => url),
  fetch: vi.fn(),
  decodeFapiHostFromPublishableKey: vi.fn(),
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
vi.mock('@/lib/auth/sentry-rate-limit', () => ({
  captureErrorWithHostnameLimit: mocks.captureErrorWithHostnameLimit,
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
  resolvePublishableKeyFromHeaders: vi.fn().mockResolvedValue('pk_test_mock'),
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
vi.mock('@/lib/auth/decode-fapi-host', () => ({
  decodeFapiHostFromPublishableKey: mocks.decodeFapiHostFromPublishableKey,
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

// ============================================================================
// Import SUT and helpers
// ============================================================================

import middleware from '@/proxy';
import { createTestRequest } from './proxy-test-harness';

function createFetchEvent() {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as import('next/server').NextFetchEvent;
}

/** Create a request that simulates browser navigation to a protected path. */
function browserRequest(pathname: string, hostname = 'jov.ie') {
  return createTestRequest({
    pathname,
    hostname,
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
}

/** Create a request that simulates an API/fetch call to a protected path. */
function apiRequest(pathname: string, hostname = 'jov.ie') {
  return createTestRequest({
    pathname,
    hostname,
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
}

// ============================================================================
// Site 1: /__clerk proxy — FAPI host decode failure (JSON only — not browser nav)
// ============================================================================

describe('proxy.ts 503 path: /__clerk FAPI host decode failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveClerkKeys.mockReturnValue({
      publishableKey: '',
      secretKey: '',
      status: 'missing',
    });
    mocks.isStagingHost.mockReturnValue(false);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveTestBypassUserId.mockReturnValue(null);
    mocks.shouldBypassClerkForRequest.mockReturnValue(false);
    // The /__clerk path hits the FAPI proxy branch which always returns JSON
    // because it is never a browser navigation (it is always a JS/FAPI fetch).
    mocks.decodeFapiHostFromPublishableKey.mockReturnValue(null);
    mocks.captureErrorWithHostnameLimit.mockResolvedValue(true);
  });

  it('returns a 503 JSON response when FAPI host cannot be decoded from publishable key', async () => {
    const req = createTestRequest({
      pathname: '/__clerk/v1/client',
      hostname: 'jov.ie',
      method: 'GET',
      headers: {
        // The /__clerk proxy is always called by Clerk JS (XHR/fetch), not browser nav
        accept: 'application/json',
      },
    });
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const body = await res.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toHaveProperty('error');
  });

  it('does NOT fire captureErrorWithHostnameLimit for the /__clerk proxy path (handled upstream)', async () => {
    const req = createTestRequest({
      pathname: '/__clerk/v1/client',
      hostname: 'jov.ie',
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    await middleware(req, createFetchEvent());
    // The /__clerk path returns early before captureErrorWithHostnameLimit is reached
    expect(mocks.captureErrorWithHostnameLimit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Site 2: clerkConfigMissing for protected routes
//
// In test mode (NODE_ENV=test) proxy.ts short-circuits via:
//   if (process.env.NODE_ENV === 'test' && clerkConfigMissing) return handleRequest(req, null);
//
// This means the clerkConfigMissing 503 branch cannot be triggered by running
// the middleware in unit test mode. The mock below overrides NODE_ENV to
// 'production' by temporarily reassigning process.env.NODE_ENV so the test
// exercise the production code path.
// ============================================================================

describe('proxy.ts 503 paths: clerkConfigMissing for protected routes (Site 2)', () => {
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate missing Clerk config (empty keys trigger isMockOrMissingClerkConfig)
    mocks.resolveClerkKeys.mockReturnValue({
      publishableKey: '',
      secretKey: '',
      status: 'missing',
    });
    mocks.isStagingHost.mockReturnValue(false);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveTestBypassUserId.mockReturnValue(null);
    mocks.shouldBypassClerkForRequest.mockReturnValue(false);
    mocks.captureErrorWithHostnameLimit.mockResolvedValue(true);
    // Override NODE_ENV so the test-mode early-return does NOT fire
    (process.env as any).NODE_ENV = 'production';
  });

  afterEach(() => {
    // Restore original NODE_ENV
    (process.env as any).NODE_ENV = origNodeEnv;
  });

  it('returns HTML for browser navigation to /app/dashboard when Clerk config is missing', async () => {
    const req = browserRequest('/app/dashboard');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<h1>');
    expect(body).toContain('temporarily unavailable');
    expect(body).toContain('<html');
  });

  it('returns JSON for API/fetch caller to /app/dashboard when Clerk config is missing', async () => {
    const req = apiRequest('/app/dashboard');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const body = await res.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toHaveProperty('error');
  });

  it('fires captureErrorWithHostnameLimit on clerkConfigMissing 503 (not raw captureError)', async () => {
    const req = browserRequest('/app/dashboard');
    await middleware(req, createFetchEvent());

    expect(mocks.captureErrorWithHostnameLimit).toHaveBeenCalledWith(
      expect.stringContaining('[middleware]'),
      expect.any(Error),
      'jov.ie',
      expect.any(Object)
    );
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('passes auth/public paths through even when Clerk config is missing (canProceedWithoutClerk)', async () => {
    const req = browserRequest('/signin');
    const res = await middleware(req, createFetchEvent());

    // /signin is an auth path — canProceedWithoutClerk=true, so 503 must NOT fire
    expect(res.status).not.toBe(503);
  });
});

// ============================================================================
// Site 3: !selectedMiddleware for protected routes
// (Site 2 — clerkConfigMissing — short-circuits in test mode via
//  `if (process.env.NODE_ENV === 'test' && clerkConfigMissing)` bypass,
//  so the production path is tested in the "Site 2" describe above.)
// ============================================================================

describe('proxy.ts 503 paths: !selectedMiddleware for protected routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a valid publishable key so clerkConfigMissing=false.
    // We rely on the selectedMiddleware being null to trigger the 503 branch.
    mocks.resolveClerkKeys.mockReturnValue({
      publishableKey: 'pk_test_real-key-123',
      secretKey: 'sk_test_real-key-456',
      status: 'ok',
    });
    mocks.isStagingHost.mockReturnValue(false);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveTestBypassUserId.mockReturnValue(null);
    mocks.shouldBypassClerkForRequest.mockReturnValue(false);
    // clerkMiddleware returns undefined → selectedMiddleware is null
    mocks.clerkMiddleware.mockReturnValue(undefined);
    mocks.captureErrorWithHostnameLimit.mockResolvedValue(true);
  });

  it('returns HTML for browser navigation to /app/dashboard when Clerk middleware is null', async () => {
    const req = browserRequest('/app/dashboard');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<h1>');
    expect(body).toContain('temporarily unavailable');
    expect(body).toContain('<html');
  });

  it('returns JSON for API/fetch caller to /app/dashboard when Clerk middleware is null', async () => {
    const req = apiRequest('/app/dashboard');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const body = await res.text();
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty('error');
  });

  it('fires captureErrorWithHostnameLimit on !selectedMiddleware 503', async () => {
    const req = browserRequest('/app/dashboard');
    await middleware(req, createFetchEvent());

    expect(mocks.captureErrorWithHostnameLimit).toHaveBeenCalledWith(
      expect.stringContaining('[middleware]'),
      expect.any(Error),
      'jov.ie',
      expect.any(Object)
    );
    // Raw captureError should NOT be called for this path
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('passes public/auth paths through even when Clerk middleware is null', async () => {
    const req = browserRequest('/signin');
    const res = await middleware(req, createFetchEvent());

    // Auth paths are in canProceedWithoutClerk, so they get handleRequest, not 503
    expect(res.status).not.toBe(503);
  });
});

// ============================================================================
// Site 4: staging Clerk middleware throws
// ============================================================================

describe('proxy.ts 503 paths: staging Clerk middleware throw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isStagingHost.mockReturnValue(true);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveTestBypassUserId.mockReturnValue(null);
    mocks.shouldBypassClerkForRequest.mockReturnValue(false);
    mocks.resolveClerkKeys.mockReturnValue({
      publishableKey: 'pk_test_staging-key-123',
      secretKey: 'sk_test_staging-key-456',
      status: 'ok',
    });
    // Simulate the Clerk middleware throwing
    mocks.clerkMiddleware.mockImplementation(() => {
      return vi.fn().mockRejectedValue(new Error('Staging Clerk error'));
    });
    mocks.captureErrorWithHostnameLimit.mockResolvedValue(true);
  });

  it('returns HTML for browser navigation to /app/dashboard on staging Clerk throw', async () => {
    const req = browserRequest('/app/dashboard', 'staging.jov.ie');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<html');
    expect(body).toContain('<h1>');
  });

  it('returns JSON for API/fetch caller on staging Clerk throw', async () => {
    const req = apiRequest('/app/dashboard', 'staging.jov.ie');
    const res = await middleware(req, createFetchEvent());

    expect(res.status).toBe(503);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
  });

  it('fires captureErrorWithHostnameLimit on staging Clerk throw', async () => {
    const req = browserRequest('/app/dashboard', 'staging.jov.ie');
    await middleware(req, createFetchEvent());

    expect(mocks.captureErrorWithHostnameLimit).toHaveBeenCalledWith(
      expect.stringContaining('[middleware]'),
      expect.anything(),
      'staging.jov.ie',
      expect.any(Object)
    );
  });
});

// ============================================================================
// /waitlist: browser navigation should get HTML when auth is degraded
// ============================================================================

describe('/waitlist 503 path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveClerkKeys.mockReturnValue({
      publishableKey: '',
      secretKey: '',
      status: 'missing',
    });
    mocks.isStagingHost.mockReturnValue(false);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveTestBypassUserId.mockReturnValue(null);
    mocks.shouldBypassClerkForRequest.mockReturnValue(false);
  });

  it('returns HTML for browser navigation to /waitlist when auth is degraded', async () => {
    const req = browserRequest('/waitlist');
    const res = await middleware(req, createFetchEvent());

    // /waitlist is in canProceedWithoutClerk for navigation, so it passes
    // through. When Clerk config is fully absent, behavior depends on the
    // handleRequest path. We verify the response is either a valid 2xx/3xx
    // (passes through) or a 503 with HTML (if it hits the 503 branch).
    // Either way, it must NOT be a 503 with JSON content-type.
    if (res.status === 503) {
      const contentType = res.headers.get('content-type') ?? '';
      expect(contentType).not.toContain('application/json');
      expect(contentType).toContain('text/html');
    } else {
      // Passed through — acceptable
      expect(res.status).toBeLessThan(500);
    }
  });
});
