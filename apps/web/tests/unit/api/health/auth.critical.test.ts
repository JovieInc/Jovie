import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetDbUser = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/auth/session', () => ({ getDbUser: mockGetDbUser }));
vi.mock('@/lib/db', () => ({ db: { select: mockDbSelect } }));
vi.mock('@/lib/db/schema', () => ({ creatorProfiles: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/health/auth/route');
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('captures warning when auth check throws', async () => {
    mockAuth.mockRejectedValue(new Error('Auth unavailable'));

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
