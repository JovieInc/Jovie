import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockCachedAuth, mockDbExecute, mockDbSelect, mockDbTransaction } =
  vi.hoisted(() => ({
    mockCachedAuth: vi.fn(),
    mockDbExecute: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbTransaction: vi.fn(),
  }));

// Mock cached auth
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
}));

// Mock schema
vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
}));

describe('session.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDbExecute.mockResolvedValue(undefined);
  });

  describe('validateClerkUserId', () => {
    it('accepts valid Clerk user IDs', async () => {
      const { validateClerkUserId } = await import('@/lib/auth/session');

      // These should not throw
      expect(() => validateClerkUserId('user_123abc')).not.toThrow();
      expect(() => validateClerkUserId('user_ABC123')).not.toThrow();
      expect(() => validateClerkUserId('test-user_id')).not.toThrow();
      expect(() => validateClerkUserId('simple123')).not.toThrow();
    });

    it('rejects invalid characters', async () => {
      const { validateClerkUserId } = await import('@/lib/auth/session');

      expect(() => validateClerkUserId("user'; DROP TABLE--")).toThrow(
        'Invalid user ID format'
      );
      expect(() => validateClerkUserId('user<script>')).toThrow(
        'Invalid user ID format'
      );
      expect(() => validateClerkUserId('user\n\r')).toThrow(
        'Invalid user ID format'
      );
      expect(() => validateClerkUserId('user id with spaces')).toThrow(
        'Invalid user ID format'
      );
    });

    it('rejects overly long user IDs', async () => {
      const { validateClerkUserId } = await import('@/lib/auth/session');

      const longId = 'a'.repeat(256);
      expect(() => validateClerkUserId(longId)).toThrow('User ID too long');
    });

    it('accepts max length user IDs', async () => {
      const { validateClerkUserId } = await import('@/lib/auth/session');

      const maxId = 'a'.repeat(255);
      expect(() => validateClerkUserId(maxId)).not.toThrow();
    });
  });

  describe('setupDbSession', () => {
    it('sets session variables for provided clerkUserId', async () => {
      const { setupDbSession } = await import('@/lib/auth/session');

      const result = await setupDbSession('user_provided_123');

      expect(result.userId).toBe('user_provided_123');
      expect(mockDbExecute).toHaveBeenCalledTimes(2);
    });

    it('uses getCachedAuth when no clerkUserId provided', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'user_from_auth' });

      const { setupDbSession } = await import('@/lib/auth/session');

      const result = await setupDbSession();

      expect(result.userId).toBe('user_from_auth');
      expect(mockCachedAuth).toHaveBeenCalled();
    });

    it('throws when not authenticated and no clerkUserId', async () => {
      mockCachedAuth.mockResolvedValue({ userId: null });

      const { setupDbSession } = await import('@/lib/auth/session');

      await expect(setupDbSession()).rejects.toThrow('Unauthorized');
    });

    it('validates userId format', async () => {
      const { setupDbSession } = await import('@/lib/auth/session');

      await expect(setupDbSession("invalid'; DROP--")).rejects.toThrow(
        'Invalid user ID format'
      );
    });
  });

  describe('withDbSession', () => {
    it('executes operation with userId', async () => {
      const { withDbSession } = await import('@/lib/auth/session');

      const operation = vi.fn().mockResolvedValue('result');

      const result = await withDbSession(operation, {
        clerkUserId: 'user_123',
      });

      expect(operation).toHaveBeenCalledWith('user_123');
      expect(result).toBe('result');
    });

    it('uses getCachedAuth when no clerkUserId in options', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'user_from_auth' });

      const { withDbSession } = await import('@/lib/auth/session');

      const operation = vi.fn().mockResolvedValue('result');

      await withDbSession(operation);

      expect(operation).toHaveBeenCalledWith('user_from_auth');
    });
  });

  describe('withDbSessionTx', () => {
    it('executes operation within transaction', async () => {
      // Setup transaction mock to call the callback
      const mockTxExecute = vi.fn().mockResolvedValue(undefined);
      const mockTx = { execute: mockTxExecute };

      mockDbTransaction.mockImplementation(async callback => {
        return await callback(mockTx);
      });

      const { withDbSessionTx } = await import('@/lib/auth/session');

      const operation = vi.fn().mockResolvedValue('tx_result');

      const result = await withDbSessionTx(operation, {
        clerkUserId: 'user_123',
      });

      expect(operation).toHaveBeenCalledWith(mockTx, 'user_123');
      expect(result).toBe('tx_result');
    });

    it('validates userId before executing transaction', async () => {
      const { withDbSessionTx } = await import('@/lib/auth/session');

      const operation = vi.fn();

      await expect(
        withDbSessionTx(operation, { clerkUserId: "invalid'; DROP--" })
      ).rejects.toThrow('Invalid user ID format');

      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('requireAuth', () => {
    it('returns userId when authenticated', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'user_123' });

      const { requireAuth } = await import('@/lib/auth/session');

      const result = await requireAuth();

      expect(result).toBe('user_123');
    });

    it('throws when not authenticated', async () => {
      mockCachedAuth.mockResolvedValue({ userId: null });

      const { requireAuth } = await import('@/lib/auth/session');

      await expect(requireAuth()).rejects.toThrow('Authentication required');
    });
  });

  describe('getDbUser', () => {
    it('returns user when found', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: true,
        userStatus: 'active',
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const { getDbUser } = await import('@/lib/auth/session');
      const result = await getDbUser();

      expect(result).toEqual(mockUser);
    });

    it('returns null when user not found', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { getDbUser } = await import('@/lib/auth/session');
      const result = await getDbUser();

      expect(result).toBeNull();
    });

    it('uses provided clerkUserId', async () => {
      const mockUser = {
        id: 'db-user-456',
        clerkId: 'clerk_provided',
        email: 'provided@example.com',
        isAdmin: true,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const { getDbUser } = await import('@/lib/auth/session');
      const result = await getDbUser('clerk_provided');

      expect(result).toEqual(mockUser);
      expect(mockCachedAuth).not.toHaveBeenCalled();
    });
  });

  describe('getProfileByDbUserId', () => {
    it('returns profile when found', async () => {
      const mockProfile = {
        id: 'profile-123',
        userId: 'db-user-123',
        username: 'testuser',
        usernameNormalized: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: new Date(),
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockProfile]),
          }),
        }),
      });

      const { getProfileByDbUserId } = await import('@/lib/auth/session');
      const result = await getProfileByDbUserId('db-user-123');

      expect(result).toEqual(mockProfile);
    });

    it('returns null when profile not found', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { getProfileByDbUserId } = await import('@/lib/auth/session');
      const result = await getProfileByDbUserId('db-user-123');

      expect(result).toBeNull();
    });
  });

  describe('getSessionContext', () => {
    it('returns full context for active user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: true,
        userStatus: 'active',
      };

      const mockProfile = {
        id: 'profile-123',
        userId: 'db-user-123',
        username: 'testuser',
        usernameNormalized: 'testuser',
        displayName: 'Test User',
        avatarUrl: null,
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: new Date(),
      };

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProfile]),
            }),
          }),
        });

      const { getSessionContext } = await import('@/lib/auth/session');
      const result = await getSessionContext();

      expect(result.clerkUserId).toBe('clerk_123');
      expect(result.user).toEqual(mockUser);
      expect(result.profile).toEqual(mockProfile);
    });

    it('throws when user not found and requireUser is true', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { getSessionContext } = await import('@/lib/auth/session');

      await expect(getSessionContext({ requireUser: true })).rejects.toThrow(
        'User not found'
      );
    });

    it('throws when profile not found and requireProfile is true', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      const { getSessionContext } = await import('@/lib/auth/session');

      await expect(getSessionContext({ requireProfile: true })).rejects.toThrow(
        'Profile not found'
      );
    });

    it('returns null profile when not found and requireProfile is false', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      const { getSessionContext } = await import('@/lib/auth/session');
      const result = await getSessionContext({ requireProfile: false });

      expect(result.profile).toBeNull();
    });
  });

  describe('getCurrentUserProfile', () => {
    it('returns profile for authenticated user', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      const mockProfile = {
        id: 'profile-123',
        userId: 'db-user-123',
        username: 'testuser',
        usernameNormalized: 'testuser',
        displayName: 'Test User',
        avatarUrl: null,
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: new Date(),
      };

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockProfile]),
            }),
          }),
        });

      const { getCurrentUserProfile } = await import('@/lib/auth/session');
      const result = await getCurrentUserProfile();

      expect(result).toEqual(mockProfile);
    });

    it('returns null when no profile exists', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      const { getCurrentUserProfile } = await import('@/lib/auth/session');
      const result = await getCurrentUserProfile();

      expect(result).toBeNull();
    });
  });

  describe('withSessionContext', () => {
    it('executes operation with session context', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const { withSessionContext } = await import('@/lib/auth/session');

      const operation = vi.fn().mockResolvedValue('operation_result');

      const result = await withSessionContext(operation);

      expect(operation).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'clerk_123',
          user: mockUser,
        })
      );
      expect(result).toBe('operation_result');
    });

    it('sets up RLS session before executing operation', async () => {
      mockCachedAuth.mockResolvedValue({ userId: 'clerk_123' });

      const mockUser = {
        id: 'db-user-123',
        clerkId: 'clerk_123',
        email: 'test@example.com',
        isAdmin: false,
        isPro: false,
        userStatus: 'active',
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const { withSessionContext } = await import('@/lib/auth/session');

      await withSessionContext(vi.fn().mockResolvedValue(null));

      // Should have called execute for setting session variables
      expect(mockDbExecute).toHaveBeenCalled();
    });
  });
});
