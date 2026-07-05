/**
 * Proxy defence-in-depth for debug/test routes outside development.
 */
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserState: vi.fn(),
  isKnownActiveUser: vi.fn(),
  isCookieBannerRequired: vi.fn(),
  captureError: vi.fn(),
  captureWarning: vi.fn(),
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
  isTestAuthBypassEnabled: vi.fn().mockReturnValue(false),
  resolveTestBypassUserId: vi.fn().mockReturnValue(null),
  checkProfileVisitorBlocked: vi.fn().mockResolvedValue(false),
  getAudienceBlockIpFromHeaders: vi.fn().mockReturnValue('masked-ip'),
  createBotResponse: vi.fn(),
  clerkMiddleware: vi.fn(),
  buildProtectedAuthRedirectUrl: vi.fn(),
  sanitizeRedirectUrl: vi.fn().mockImplementation((url: string | null) => url),
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  getUserState: mocks.getUserState,
  isKnownActiveUser: mocks.isKnownActiveUser,
  invalidateProxyUserStateCache: vi.fn(),
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
    if (typeof mock.mockClear === 'function') {
      mock.mockClear();
    }
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
  mocks.checkProfileVisitorBlocked.mockResolvedValue(false);
  mocks.getAudienceBlockIpFromHeaders.mockReturnValue('masked-ip');
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

async function callMiddleware(
  req: import('next/server').NextRequest
): Promise<NextResponse> {
  const result = await middleware(req, createFetchEvent());
  expect(result).toBeDefined();
  return result as NextResponse;
}

describe('proxy debug/test route lockdown', () => {
  beforeEach(() => {
    resetMocks();
    vi.unstubAllEnvs();
  });

  it('rewrites debug API routes to /404 on preview deployments', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const req = createTestRequest({
      pathname: '/api/dev/test-auth/session',
      hostname: 'preview.jov.ie',
    });
    const response = await callMiddleware(req);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');

    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl!).pathname).toBe('/404');
  });

  it('rewrites debug page routes to /404 on production deployments', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const req = createTestRequest({
      pathname: '/exp/shell-v1',
      hostname: 'jov.ie',
    });
    const response = await callMiddleware(req);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');

    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl!).pathname).toBe('/404');
  });

  it('allows shell-v1 product screenshots on loopback automation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const req = createTestRequest({
      pathname: '/exp/shell-v1',
      hostname: 'localhost',
    });
    const response = await callMiddleware(req);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('blocks shell-v1 product screenshots on public hosts even with test env', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const req = createTestRequest({
      pathname: '/exp/shell-v1',
      hostname: 'jov.ie',
    });
    const response = await callMiddleware(req);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');

    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl!).pathname).toBe('/404');
  });

  it('keeps other experiment routes blocked on loopback automation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const req = createTestRequest({
      pathname: '/exp/library-v1',
      hostname: 'localhost',
    });
    const response = await callMiddleware(req);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');

    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl!).pathname).toBe('/404');
  });

  it('allows debug routes during explicit local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');

    const req = createTestRequest({
      pathname: '/api/dev/test-auth/session',
      hostname: 'localhost',
    });
    const response = await callMiddleware(req);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('allows loopback test-auth routes on production-built CI servers', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const req = createTestRequest({
      pathname: '/api/dev/test-auth/session',
      hostname: '127.0.0.1',
    });
    const response = await callMiddleware(req);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('blocks test-auth routes on public hosts even with E2E bypass', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');

    const req = createTestRequest({
      pathname: '/api/dev/test-auth/session',
      hostname: 'jov.ie',
    });
    const response = await callMiddleware(req);
    const rewriteUrl = response.headers.get('x-middleware-rewrite');

    expect(rewriteUrl).toBeTruthy();
    expect(new URL(rewriteUrl!).pathname).toBe('/404');
  });

  it('keeps /demo reachable outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const req = createTestRequest({
      pathname: '/demo',
      hostname: 'jov.ie',
    });
    const response = await callMiddleware(req);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
