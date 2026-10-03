import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookies = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockGetOptionalAuth = vi.hoisted(() => vi.fn());
const mockIsTestAuthBypassEnabled = vi.hoisted(() => vi.fn());
const mockGetDbUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockResolveTestBypassUserId = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));
vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));
vi.mock('@/lib/auth/session', () => ({ getDbUser: mockGetDbUser }));
vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));
vi.mock('@/lib/db/schema/profiles', () => ({ creatorProfiles: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));
vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: mockIsTestAuthBypassEnabled,
  resolveTestBypassUserId: mockResolveTestBypassUserId,
}));

const mockCanReadHealthDetail = vi.hoisted(() => vi.fn(async () => false));
vi.mock('@/lib/health/detail-access', async () => {
  const double = await import('./detail-access-double');
  return {
    ...double,
    canReadHealthDetail: mockCanReadHealthDetail,
  };
});

describe('@critical GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    mockResolveTestBypassUserId.mockReturnValue(null);
    mockIsTestAuthBypassEnabled.mockReturnValue(false);
    mockGetOptionalAuth.mockResolvedValue({ userId: null });
    mockCanReadHealthDetail.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));
    expect(response.status).toBe(403);
    expect(mockGetOptionalAuth).not.toHaveBeenCalled();
  });

  it('does not unlock preview detail for test-bypass alone', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mockResolveTestBypassUserId.mockReturnValue('user_bypass');
    mockGetOptionalAuth.mockResolvedValue({ userId: 'user_bypass' });
    mockGetDbUser.mockResolvedValue(null);

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['healthy', 'timestamp']);
    expect(body.healthy).toBe(true);
    expect(mockGetOptionalAuth).not.toHaveBeenCalled();
  });

  it('returns preview auth detail for an authorized caller', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mockCanReadHealthDetail.mockResolvedValue(true);
    mockGetOptionalAuth.mockResolvedValue({ userId: 'user_admin' });
    mockGetDbUser.mockResolvedValue(null);

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        authenticated: true,
        userId: 'user_admin',
        hasProfile: false,
      })
    );
  });

  it('blocks trusted test-bypass probes on production deploys', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    mockResolveTestBypassUserId.mockReturnValue('user_bypass');

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));

    expect(response.status).toBe(403);
    expect(mockGetOptionalAuth).not.toHaveBeenCalled();
  });

  it('keeps anonymous dev-fast probes on liveness', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MOCK', '1');
    mockIsTestAuthBypassEnabled.mockReturnValue(true);

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['healthy', 'timestamp']);
    expect(mockGetOptionalAuth).not.toHaveBeenCalled();
  });

  it('returns dev-fast health response when auth mock flags are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_MOCK', '1');
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROXY_DISABLED', '1');
    vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
    mockIsTestAuthBypassEnabled.mockReturnValue(true);
    mockCanReadHealthDetail.mockResolvedValue(true);
    mockGetOptionalAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        authenticated: false,
        devFast: expect.objectContaining({
          active: true,
          authMockEnabled: true,
          authProxyDisabled: true,
          testAuthBypassEnabled: true,
          authMiddleware: 'bypassed',
        }),
        message: expect.stringContaining('dev-fast auth bypass active'),
      })
    );
  });

  it('captures warning when auth check throws', async () => {
    mockCanReadHealthDetail.mockResolvedValue(true);
    mockGetOptionalAuth.mockRejectedValue(new Error('Auth unavailable'));

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET(new Request('http://localhost/api/health/auth'));

    expect(response.status).toBe(500);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Auth health check failed',
      expect.any(Error),
      expect.objectContaining({ service: 'auth', route: '/api/health/auth' })
    );
  });
});
