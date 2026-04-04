import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockAuth,
  mockCurrentUser,
  mockCache,
  mockGetCachedDevTestAuthSession,
  mockBuildDevTestAuthCurrentUser,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCurrentUser: vi.fn(),
  mockGetCachedDevTestAuthSession: vi.fn(),
  mockBuildDevTestAuthCurrentUser: vi.fn(),
  mockCache: vi.fn(<T extends (...args: never[]) => unknown>(fn: T) => {
    let hasValue = false;
    let value: ReturnType<T>;

    return ((...args: never[]) => {
      if (!hasValue) {
        hasValue = true;
        value = fn(...args) as ReturnType<T>;
      }
      return value;
    }) as T;
  }),
}));

// Mock Clerk's auth functions
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

// Mock React's cache function
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: mockCache,
  };
});

vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: mockGetCachedDevTestAuthSession,
  buildDevTestAuthCurrentUser: mockBuildDevTestAuthCurrentUser,
}));

// Import after mocks are set up
// Note: We need to use dynamic import or resetModules to test cache() deduplication
// because React's cache() memoizes at module level
describe('cached auth utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Reset modules to clear the React cache between tests
    vi.resetModules();
    mockGetCachedDevTestAuthSession.mockResolvedValue(null);
    mockBuildDevTestAuthCurrentUser.mockImplementation(session => ({
      id: session.clerkUserId,
      username: session.username,
      fullName: session.fullName,
      primaryEmailAddress: {
        emailAddress: session.email,
      },
      emailAddresses: [{ emailAddress: session.email }],
    }));
  });

  describe('getCachedAuth', () => {
    it('returns the auth object from Clerk', async () => {
      const mockAuthResult = {
        userId: 'user_123',
        sessionId: 'sess_abc',
        orgId: null,
      };
      mockAuth.mockResolvedValue(mockAuthResult);

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const result = await getCachedAuth();

      expect(result).toEqual(mockAuthResult);
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it('returns null userId when not authenticated', async () => {
      const mockAuthResult = {
        userId: null,
        sessionId: null,
        orgId: null,
      };
      mockAuth.mockResolvedValue(mockAuthResult);

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const result = await getCachedAuth();

      expect(result.userId).toBeNull();
    });

    it('deduplicates multiple calls within the same request', async () => {
      const mockAuthResult = {
        userId: 'user_dedupe',
        sessionId: 'sess_dedupe',
        orgId: null,
      };
      mockAuth.mockResolvedValue(mockAuthResult);

      const { getCachedAuth } = await import('@/lib/auth/cached');

      // Call getCachedAuth multiple times (simulating multiple components calling it)
      const [result1, result2, result3] = await Promise.all([
        getCachedAuth(),
        getCachedAuth(),
        getCachedAuth(),
      ]);

      // All results should be identical
      expect(result1).toEqual(mockAuthResult);
      expect(result2).toEqual(mockAuthResult);
      expect(result3).toEqual(mockAuthResult);

      // The underlying auth() should only be called once due to React's cache()
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it('returns consistent results across sequential calls', async () => {
      const mockAuthResult = {
        userId: 'user_sequential',
        sessionId: 'sess_sequential',
        orgId: 'org_123',
      };
      mockAuth.mockResolvedValue(mockAuthResult);

      const { getCachedAuth } = await import('@/lib/auth/cached');

      // Sequential calls
      const result1 = await getCachedAuth();
      const result2 = await getCachedAuth();

      expect(result1).toBe(result2); // Should be the same reference
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });

    it('bypasses Clerk auth in test mode when bypass header is present', async () => {
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        clerkUserId: 'user_hdr',
      });

      const { getCachedAuth } = await import('@/lib/auth/cached');
      const result = await getCachedAuth();

      expect(result.userId).toBe('user_hdr');
      expect(mockAuth).not.toHaveBeenCalled();
    });
  });

  describe('getCachedCurrentUser', () => {
    it('returns the current user from Clerk', async () => {
      const mockUserResult = {
        id: 'user_456',
        firstName: 'John',
        lastName: 'Doe',
        emailAddresses: [{ emailAddress: 'john@example.com', id: 'email_1' }],
        primaryEmailAddress: { emailAddress: 'john@example.com' },
      };
      mockCurrentUser.mockResolvedValue(mockUserResult);

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');
      const result = await getCachedCurrentUser();

      expect(result).toEqual(mockUserResult);
      expect(mockCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('returns null when user is not authenticated', async () => {
      mockCurrentUser.mockResolvedValue(null);

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');
      const result = await getCachedCurrentUser();

      expect(result).toBeNull();
    });

    it('returns a synthetic verified Clerk user in test bypass mode', async () => {
      mockGetCachedDevTestAuthSession.mockResolvedValue({
        clerkUserId: 'user_cookie',
        username: 'browse-test-user',
        fullName: 'Browse Test User',
        email: 'browse+clerk_test@jov.ie',
      });
      mockBuildDevTestAuthCurrentUser.mockReturnValue({
        id: 'user_cookie',
        username: 'browse-test-user',
        fullName: 'Browse Test User',
        primaryEmailAddress: {
          emailAddress: 'browse+clerk_test@jov.ie',
          verification: {
            status: 'verified',
          },
        },
        emailAddresses: [
          {
            emailAddress: 'browse+clerk_test@jov.ie',
            verification: {
              status: 'verified',
            },
          },
        ],
      });

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');
      const result = await getCachedCurrentUser();

      expect(result).toEqual(
        expect.objectContaining({
          id: 'user_cookie',
          username: 'browse-test-user',
          fullName: 'Browse Test User',
          primaryEmailAddress: expect.objectContaining({
            emailAddress: 'browse+clerk_test@jov.ie',
            verification: expect.objectContaining({
              status: 'verified',
            }),
          }),
        })
      );
      expect(result?.emailAddresses).toEqual([
        expect.objectContaining({
          emailAddress: 'browse+clerk_test@jov.ie',
          verification: expect.objectContaining({
            status: 'verified',
          }),
        }),
      ]);
      expect(mockCurrentUser).not.toHaveBeenCalled();
    });

    it('deduplicates multiple calls within the same request', async () => {
      const mockUserResult = {
        id: 'user_dedupe',
        firstName: 'Jane',
        lastName: 'Smith',
        emailAddresses: [{ emailAddress: 'jane@example.com', id: 'email_2' }],
        primaryEmailAddress: { emailAddress: 'jane@example.com' },
      };
      mockCurrentUser.mockResolvedValue(mockUserResult);

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');

      // Call getCachedCurrentUser multiple times (simulating multiple components)
      const [result1, result2, result3] = await Promise.all([
        getCachedCurrentUser(),
        getCachedCurrentUser(),
        getCachedCurrentUser(),
      ]);

      // All results should be identical
      expect(result1).toEqual(mockUserResult);
      expect(result2).toEqual(mockUserResult);
      expect(result3).toEqual(mockUserResult);

      // The underlying currentUser() should only be called once due to React's cache()
      expect(mockCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('returns consistent results across sequential calls', async () => {
      const mockUserResult = {
        id: 'user_seq',
        firstName: 'Sequential',
        lastName: 'User',
        primaryEmailAddress: { emailAddress: 'seq@example.com' },
      };
      mockCurrentUser.mockResolvedValue(mockUserResult);

      const { getCachedCurrentUser } = await import('@/lib/auth/cached');

      // Sequential calls
      const result1 = await getCachedCurrentUser();
      const result2 = await getCachedCurrentUser();

      expect(result1).toBe(result2); // Should be the same reference
      expect(mockCurrentUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('independent caching', () => {
    it('getCachedAuth and getCachedCurrentUser cache independently', async () => {
      const mockAuthResult = {
        userId: 'user_independent',
        sessionId: 'sess_1',
      };
      const mockUserResult = {
        id: 'user_independent',
        firstName: 'Independent',
        lastName: 'User',
      };

      mockAuth.mockResolvedValue(mockAuthResult);
      mockCurrentUser.mockResolvedValue(mockUserResult);

      const { getCachedAuth, getCachedCurrentUser } = await import(
        '@/lib/auth/cached'
      );

      // Call both functions multiple times
      await getCachedAuth();
      await getCachedAuth();
      await getCachedCurrentUser();
      await getCachedCurrentUser();

      // Each underlying function should only be called once
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockCurrentUser).toHaveBeenCalledTimes(1);
    });
  });
});
