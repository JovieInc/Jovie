import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockAuth, mockNextResponse, mockNoStoreHeaders } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockNextResponse: {
    json: vi.fn(),
  },
  mockNoStoreHeaders: new Headers({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }),
}));

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: mockNextResponse,
}));

// Mock HTTP headers
vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: mockNoStoreHeaders,
}));

describe('require-auth.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset the mock implementation
    mockNextResponse.json.mockImplementation((body, options) => ({
      body,
      options,
      isError: true,
    }));
  });

  describe('requireAuth', () => {
    it('returns userId when authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      const result = await requireAuth();

      expect(result.userId).toBe('user_123');
      expect(result.error).toBeNull();
    });

    it('returns 401 error when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      const result = await requireAuth();

      expect(result.userId).toBeNull();
      expect(result.error).toBeDefined();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        expect.objectContaining({
          status: 401,
          headers: mockNoStoreHeaders,
        })
      );
    });

    it('uses custom error message when provided', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      await requireAuth({ message: 'Please sign in to upload photos' });

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Please sign in to upload photos' },
        expect.any(Object)
      );
    });

    it('omits NO_STORE_HEADERS when noCache is false', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      await requireAuth({ noCache: false });

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        expect.objectContaining({
          status: 401,
          headers: undefined,
        })
      );
    });

    it('includes NO_STORE_HEADERS by default', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      await requireAuth();

      expect(mockNextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          headers: mockNoStoreHeaders,
        })
      );
    });

    it('handles undefined options', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_456' });

      const { requireAuth } = await import('@/lib/auth/require-auth');
      const result = await requireAuth();

      expect(result.userId).toBe('user_456');
      expect(result.error).toBeNull();
    });
  });

  describe('getAuthUserId', () => {
    it('returns userId when authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_789' });

      const { getAuthUserId } = await import('@/lib/auth/require-auth');
      const result = await getAuthUserId();

      expect(result).toBe('user_789');
    });

    it('returns null when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { getAuthUserId } = await import('@/lib/auth/require-auth');
      const result = await getAuthUserId();

      expect(result).toBeNull();
    });
  });

  describe('isAuthSuccess', () => {
    it('returns true when error is null', async () => {
      const { isAuthSuccess } = await import('@/lib/auth/require-auth');

      const successResult = { userId: 'user_123', error: null };
      expect(isAuthSuccess(successResult)).toBe(true);
    });

    it('returns false when error exists', async () => {
      const { isAuthSuccess } = await import('@/lib/auth/require-auth');

      const errorResult = { userId: null, error: { body: { error: 'test' } } };
      expect(isAuthSuccess(errorResult as never)).toBe(false);
    });
  });

  describe('type narrowing', () => {
    it('properly narrows AuthSuccess type', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_abc' });

      const { requireAuth, isAuthSuccess } = await import(
        '@/lib/auth/require-auth'
      );
      const result = await requireAuth();

      if (isAuthSuccess(result)) {
        // TypeScript should know result.userId is string here
        expect(typeof result.userId).toBe('string');
        expect(result.userId).toBe('user_abc');
      } else {
        // This branch shouldn't execute
        expect.fail('Should not reach this branch');
      }
    });

    it('properly narrows AuthError type', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { requireAuth, isAuthSuccess } = await import(
        '@/lib/auth/require-auth'
      );
      const result = await requireAuth();

      if (!isAuthSuccess(result)) {
        // TypeScript should know result.userId is null here
        expect(result.userId).toBeNull();
        expect(result.error).toBeDefined();
      } else {
        // This branch shouldn't execute
        expect.fail('Should not reach this branch');
      }
    });
  });
});
