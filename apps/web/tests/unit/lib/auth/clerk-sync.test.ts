import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockClerkClient,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockCaptureError,
} = vi.hoisted(() => ({
  mockClerkClient: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockCaptureError: vi.fn(),
}));

// Mock Clerk client
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

describe('clerk-sync module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JovieClerkMetadata interface', () => {
    it('defines the expected metadata shape', async () => {
      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      // The interface should accept these fields
      const metadata = {
        jovie_role: 'admin' as const,
        jovie_status: 'active' as const,
        jovie_has_profile: true,
      };

      // Setup mock to verify the interface
      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});
      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      await syncClerkMetadata('clerk_123', metadata);

      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_123', {
        publicMetadata: expect.objectContaining(metadata),
      });
    });
  });

  describe('syncClerkMetadata', () => {
    it('returns error when clerkUserId is missing', async () => {
      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncClerkMetadata('', { jovie_role: 'user' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing clerkUserId');
    });

    it('merges new metadata with existing metadata', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({
        publicMetadata: {
          jovie_role: 'user',
          jovie_status: 'pending',
          other_field: 'preserved',
        },
      });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      await syncClerkMetadata('clerk_123', {
        jovie_role: 'admin',
        jovie_has_profile: true,
      });

      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_123', {
        publicMetadata: {
          jovie_role: 'admin',
          jovie_status: 'pending',
          jovie_has_profile: true,
          other_field: 'preserved',
        },
      });
    });

    it('handles Clerk API errors gracefully', async () => {
      const mockGetUser = vi
        .fn()
        .mockRejectedValue(new Error('Clerk API error'));

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
        },
      });

      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncClerkMetadata('clerk_123', {
        jovie_role: 'user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Clerk API error');
      expect(mockCaptureError).toHaveBeenCalled();
    });
  });

  describe('syncAllClerkMetadata', () => {
    it('returns error when clerkUserId is missing', async () => {
      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing clerkUserId');
    });

    it('syncs minimal state when DB user does not exist', async () => {
      // Mock no DB user found (single JOIN query returns empty)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('clerk_123');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        jovie_role: 'user',
        jovie_status: 'pending',
        jovie_has_profile: false,
      });
    });

    it('syncs admin role correctly', async () => {
      // Mock DB user with admin role (single JOIN query)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userId: 'user-uuid-123',
                  userStatus: 'active',
                  isAdmin: true,
                  // No profile fields
                  profileId: null,
                  onboardingCompletedAt: null,
                  username: null,
                  displayName: null,
                  isPublic: null,
                },
              ]),
            }),
          }),
        }),
      });

      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('clerk_123');

      expect(result.success).toBe(true);
      expect(result.metadata?.jovie_role).toBe('admin');
    });

    it('syncs banned status correctly', async () => {
      // Mock banned DB user (single JOIN query)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userId: 'user-uuid-123',
                  userStatus: 'banned',
                  isAdmin: false,
                  // No profile fields
                  profileId: null,
                  onboardingCompletedAt: null,
                  username: null,
                  displayName: null,
                  isPublic: null,
                },
              ]),
            }),
          }),
        }),
      });

      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('clerk_123');

      expect(result.success).toBe(true);
      expect(result.metadata?.jovie_status).toBe('banned');
    });

    it('syncs profile completion correctly', async () => {
      // Mock DB user with complete profile (single JOIN query)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userId: 'user-uuid-123',
                  userStatus: 'active',
                  isAdmin: false,
                  // Profile fields
                  profileId: 'profile-uuid-123',
                  onboardingCompletedAt: new Date(),
                  username: 'testuser',
                  displayName: 'Test User',
                  isPublic: true,
                },
              ]),
            }),
          }),
        }),
      });

      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('clerk_123');

      expect(result.success).toBe(true);
      expect(result.metadata?.jovie_has_profile).toBe(true);
    });
  });

  describe('handleClerkUserDeleted', () => {
    it('returns error when clerkUserId is missing', async () => {
      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing clerkUserId');
    });

    it('succeeds when user does not exist in DB', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('clerk_123');

      expect(result.success).toBe(true);
    });

    it('succeeds when user is already soft-deleted', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user-uuid-123',
                deletedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('clerk_123');

      expect(result.success).toBe(true);
    });

    it('soft-deletes user when they exist', async () => {
      // Mock finding the user
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user-uuid-123',
                deletedAt: null,
              },
            ]),
          }),
        }),
      });

      // Mock the update
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      });

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('clerk_123');

      expect(result.success).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe('syncAdminRoleChange', () => {
    it('returns error when targetClerkUserId is missing', async () => {
      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('', true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing targetClerkUserId');
    });

    it('syncs admin role grant to Clerk', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('clerk_target', true);

      expect(result.success).toBe(true);
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_target', {
        publicMetadata: expect.objectContaining({
          jovie_role: 'admin',
        }),
      });
    });

    it('syncs admin role revocation to Clerk', async () => {
      const mockGetUser = vi
        .fn()
        .mockResolvedValue({ publicMetadata: { jovie_role: 'admin' } });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('clerk_target', false);

      expect(result.success).toBe(true);
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_target', {
        publicMetadata: expect.objectContaining({
          jovie_role: 'user',
        }),
      });
    });
  });

  describe('syncProfileStatus', () => {
    it('syncs profile completion status', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncProfileStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncProfileStatus('clerk_123', true);

      expect(result.success).toBe(true);
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_123', {
        publicMetadata: expect.objectContaining({
          jovie_has_profile: true,
        }),
      });
    });
  });

  describe('syncUserStatus', () => {
    it('syncs user status changes', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ publicMetadata: {} });
      const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});

      mockClerkClient.mockResolvedValue({
        users: {
          getUser: mockGetUser,
          updateUserMetadata: mockUpdateUserMetadata,
        },
      });

      const { syncUserStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncUserStatus('clerk_123', 'banned');

      expect(result.success).toBe(true);
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('clerk_123', {
        publicMetadata: expect.objectContaining({
          jovie_status: 'banned',
        }),
      });
    });
  });
});

describe('clerk-sync - authorization principle', () => {
  it('documents that Clerk metadata is read-only cache, not source of truth', () => {
    // This test documents the critical security principle:
    // - Clerk publicMetadata is a READ-ONLY CACHE for convenience
    // - The SOURCE OF TRUTH for authorization is always the Neon database
    // - Never trust Clerk metadata for authorization decisions
    // - All auth gating must query the database

    const principle = `
      SECURITY PRINCIPLE:
      - Database is source of truth for: role, status, profile state
      - Clerk metadata is a read-only mirror for debugging/visibility
      - Authorization decisions MUST query the database
      - Clerk metadata sync is best-effort and may be delayed
    `;

    expect(principle).toContain('source of truth');
    expect(principle).toContain('database');
  });
});
