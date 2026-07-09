import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockIsAdmin,
  mockCaptureWarning,
  mockAddBreadcrumb,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockCaptureWarning: vi.fn(),
  mockAddBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getOptionalAuth: mockGetCachedAuth,
  getCachedSessionTokenAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockAddBreadcrumb,
}));

vi.mock('@/lib/auth/mask-user-id', () => ({
  maskUserIdForLog: (id: string) => `masked:${id}`,
}));

describe('requireAdmin (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when getCachedAuth has no userId', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const { requireAdmin } = await import('@/lib/admin/middleware');
    const response = await requireAdmin();

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: 'Unauthorized. Please sign in.',
    });
    expect(mockIsAdmin).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'admin',
        message: 'admin/middleware: unauth hit (no user id)',
      })
    );
  });

  it('returns 403 when authenticated but not admin', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_regular',
      sessionId: 'sess_1',
      orgId: null,
    });
    mockIsAdmin.mockResolvedValue(false);

    const { requireAdmin } = await import('@/lib/admin/middleware');
    const response = await requireAdmin();

    expect(mockIsAdmin).toHaveBeenCalledWith('user_regular');
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: 'Forbidden. Admin privileges required.',
    });
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      expect.stringContaining('masked:user_regular')
    );
  });

  it('returns null when authenticated admin', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_admin',
      sessionId: 'sess_admin',
      orgId: null,
    });
    mockIsAdmin.mockResolvedValue(true);

    const { requireAdmin } = await import('@/lib/admin/middleware');
    const response = await requireAdmin();

    expect(response).toBeNull();
    expect(mockIsAdmin).toHaveBeenCalledWith('user_admin');
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'admin',
        message: expect.stringContaining('masked:user_admin'),
      })
    );
  });
});

describe('checkIsAdmin (Better Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns false when unauthenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const { checkIsAdmin } = await import('@/lib/admin/middleware');
    await expect(checkIsAdmin()).resolves.toBe(false);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it('returns isAdmin result for authenticated users', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_admin',
      sessionId: 'sess_admin',
      orgId: null,
    });
    mockIsAdmin.mockResolvedValue(true);

    const { checkIsAdmin } = await import('@/lib/admin/middleware');
    await expect(checkIsAdmin()).resolves.toBe(true);
    expect(mockIsAdmin).toHaveBeenCalledWith('user_admin');
  });
});
