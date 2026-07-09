import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetOptionalAuth,
  mockGetCachedDevTestAuthSession,
  mockIsTestAuthBypassEnabled,
  mockNextResponse,
  mockNoStoreHeaders,
} = vi.hoisted(() => ({
  mockGetOptionalAuth: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockIsTestAuthBypassEnabled: vi.fn(),
  mockNextResponse: {
    json: vi.fn(),
  },
  mockNoStoreHeaders: new Headers({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }),
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
}));

vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: mockIsTestAuthBypassEnabled,
}));

vi.mock('next/server', () => ({
  NextResponse: mockNextResponse,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: mockNoStoreHeaders,
}));

describe('require-auth.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    mockIsTestAuthBypassEnabled.mockReturnValue(false);
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockNextResponse.json.mockImplementation((body, options) => ({
      body,
      options,
      isError: true,
    }));
  });

  describe('requireAuth', () => {
    it('returns userId when authenticated', async () => {
      mockGetOptionalAuth.mockResolvedValue({
        userId: 'user_123',
        sessionId: 'sess_1',
        orgId: null,
      });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      const result = await requireAuth();

      expect(result).toEqual({ userId: 'user_123', error: null });
    });

    it('handles undefined options', async () => {
      mockGetOptionalAuth.mockResolvedValue({
        userId: 'user_123',
        sessionId: 'sess_1',
        orgId: null,
      });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      await expect(requireAuth(undefined)).resolves.toEqual({
        userId: 'user_123',
        error: null,
      });
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetOptionalAuth.mockResolvedValue({
        userId: null,
        sessionId: null,
        orgId: null,
      });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      const result = await requireAuth();

      expect(result.userId).toBeNull();
      expect(result.error).toBeTruthy();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        expect.objectContaining({ status: 401 })
      );
    });

    it('uses the test-auth bypass session when enabled', async () => {
      mockIsTestAuthBypassEnabled.mockReturnValue(true);
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        dbUserId: 'user_bypass',
      });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      await expect(requireAuth()).resolves.toEqual({
        userId: 'user_bypass',
        error: null,
      });
      expect(mockGetOptionalAuth).not.toHaveBeenCalled();
    });
  });

  describe('getAuthUserId', () => {
    it('returns userId when authenticated', async () => {
      mockGetOptionalAuth.mockResolvedValue({
        userId: 'user_123',
        sessionId: 'sess_1',
        orgId: null,
      });

      const { getAuthUserId } = await import('@/lib/auth/require-auth');
      await expect(getAuthUserId()).resolves.toBe('user_123');
    });

    it('returns bypassed user id in test mode', async () => {
      mockIsTestAuthBypassEnabled.mockReturnValue(true);
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        dbUserId: 'user_bypass',
      });

      const { getAuthUserId } = await import('@/lib/auth/require-auth');
      await expect(getAuthUserId()).resolves.toBe('user_bypass');
    });
  });

  describe('type narrowing', () => {
    it('properly narrows AuthSuccess type', async () => {
      mockGetOptionalAuth.mockResolvedValue({
        userId: 'user_123',
        sessionId: 'sess_1',
        orgId: null,
      });

      const { requireAuth, isAuthSuccess } = await import(
        '@/lib/auth/require-auth'
      );
      const result = await requireAuth();
      expect(isAuthSuccess(result)).toBe(true);
      if (isAuthSuccess(result)) {
        expect(result.userId).toBe('user_123');
      }
    });
  });
});
