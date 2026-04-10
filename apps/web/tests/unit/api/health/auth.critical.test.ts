import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookies = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockGetDbUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockResolveTestBypassUserId = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/auth/session', () => ({ getDbUser: mockGetDbUser }));
vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));
vi.mock('@/lib/db/schema/profiles', () => ({ creatorProfiles: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));
vi.mock('@/lib/auth/test-mode', () => ({
  resolveTestBypassUserId: mockResolveTestBypassUserId,
}));

describe('@critical GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    mockResolveTestBypassUserId.mockReturnValue(null);
    mockGetCachedAuth.mockResolvedValue({ userId: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('allows trusted test-bypass probes in preview deployments', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    mockResolveTestBypassUserId.mockReturnValue('user_bypass');
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_bypass' });
    mockGetDbUser.mockResolvedValue(null);

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        authenticated: true,
        userId: 'user_bypass',
        hasProfile: false,
      })
    );
  });

  it('blocks trusted test-bypass probes on production deploys', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    mockResolveTestBypassUserId.mockReturnValue('user_bypass');

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('captures warning when auth check throws', async () => {
    mockGetCachedAuth.mockRejectedValue(new Error('Auth unavailable'));

    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();

    expect(response.status).toBe(500);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Auth health check failed',
      expect.any(Error),
      expect.objectContaining({ service: 'auth', route: '/api/health/auth' })
    );
  });
});
