import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const {
  mockClerkClient,
  mockGetUser,
  mockUpdateUserMetadata,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockCaptureError,
  mockCaptureWarning,
  mockSentryAddBreadcrumb,
  mockInvalidateProxyUserStateCache,
} = vi.hoisted(() => ({
  mockClerkClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockUpdateUserMetadata: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockCaptureError: vi.fn(),
  mockCaptureWarning: vi.fn(),
  mockSentryAddBreadcrumb: vi.fn(),
  mockInvalidateProxyUserStateCache: vi.fn(),
}));

// Mock Clerk client
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockSentryAddBreadcrumb,
}));

// Mock drizzle-orm eq (passthrough)
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

// Mock schema tables
vi.mock('@/lib/db/schema/admin', () => ({
  adminAuditLog: { adminUserId: 'adminUserId', targetUserId: 'targetUserId' },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
    deletedAt: 'deletedAt',
    email: 'email',
    isAdmin: 'isAdmin',
    userStatus: 'userStatus',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    onboardingCompletedAt: 'onboardingCompletedAt',
    username: 'username',
    displayName: 'displayName',
    isPublic: 'isPublic',
  },
}));

// Mock error tracking
vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

// Mock proxy state
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

// --- Helpers ---

/** Build a chainable mock for db.select().from().leftJoin().where().limit() */
function createSelectChain(results: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(results),
        }),
      }),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(results),
      }),
    }),
  };
}

/** Build a chainable mock for db.update().set().where() */
function createUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

/** Build a chainable mock for db.insert().values() */
function createInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

/** Set up the Clerk client mock with getUser and updateUserMetadata */
function setupClerkClient(publicMetadata: Record<string, unknown> = {}) {
  mockGetUser.mockResolvedValue({ publicMetadata });
  mockUpdateUserMetadata.mockResolvedValue(undefined);
  mockClerkClient.mockResolvedValue({
    users: {
      getUser: mockGetUser,
      updateUserMetadata: mockUpdateUserMetadata,
    },
  });
}

// --- Tests ---

describe('@critical clerk-sync.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaptureError.mockResolvedValue(undefined);
    mockCaptureWarning.mockReturnValue(undefined);
    mockInvalidateProxyUserStateCache.mockResolvedValue(undefined);
  });

  // =========================================================
  // syncClerkMetadata
  // =========================================================
  describe('syncClerkMetadata', () => {
    it('returns error when clerkUserId is empty', async () => {
      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncClerkMetadata('', { jovie_role: 'user' });

      expect(result).toEqual({ success: false, error: 'Missing clerkUserId' });
      expect(mockClerkClient).not.toHaveBeenCalled();
    });

    it('merges new metadata with existing publicMetadata', async () => {
      setupClerkClient({ jovie_role: 'user', jovie_status: 'active' });

      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncClerkMetadata('user_abc', {
        jovie_has_profile: true,
      });

      expect(result).toEqual({ success: true });
      expect(mockGetUser).toHaveBeenCalledWith('user_abc');
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith('user_abc', {
        publicMetadata: {
          jovie_role: 'user',
          jovie_status: 'active',
          jovie_has_profile: true,
        },
      });
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'clerk-sync', level: 'info' })
      );
    });

    it('handles Clerk API error and returns error message', async () => {
      const apiError = new Error('Clerk API unreachable');
      mockClerkClient.mockResolvedValue({
        users: {
          getUser: vi.fn().mockRejectedValue(apiError),
          updateUserMetadata: vi.fn(),
        },
      });

      const { syncClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncClerkMetadata('user_abc', {
        jovie_role: 'admin',
      });

      expect(result).toEqual({
        success: false,
        error: 'Clerk API unreachable',
      });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to sync Clerk metadata',
        apiError,
        expect.objectContaining({ clerkUserId: 'user_abc' })
      );
    });
  });

  // =========================================================
  // syncAllClerkMetadata
  // =========================================================
  describe('syncAllClerkMetadata', () => {
    it('returns error when clerkUserId is empty', async () => {
      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('');

      expect(result).toEqual({ success: false, error: 'Missing clerkUserId' });
    });

    it('syncs minimal state when user not found in DB', async () => {
      setupClerkClient({});
      mockDbSelect.mockReturnValue(createSelectChain([]));

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_new');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        jovie_role: 'user',
        jovie_status: 'pending',
        jovie_has_profile: false,
      });
    });

    it('maps active user with complete profile correctly', async () => {
      setupClerkClient({});
      mockDbSelect.mockReturnValue(
        createSelectChain([
          {
            userId: 'db-1',
            userStatus: 'active',
            isAdmin: false,
            profileId: 'prof-1',
            onboardingCompletedAt: new Date(),
            username: 'artist',
            displayName: 'Artist Name',
            isPublic: true,
          },
        ])
      );

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_active');

      expect(result.success).toBe(true);
      expect(result.metadata).toEqual({
        jovie_role: 'user',
        jovie_status: 'active',
        jovie_has_profile: true,
      });
    });

    it('maps admin user status correctly', async () => {
      setupClerkClient({});
      mockDbSelect.mockReturnValue(
        createSelectChain([
          {
            userId: 'db-2',
            userStatus: 'active',
            isAdmin: true,
            profileId: null,
            onboardingCompletedAt: null,
            username: null,
            displayName: null,
            isPublic: null,
          },
        ])
      );

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_admin');

      expect(result.metadata).toEqual({
        jovie_role: 'admin',
        jovie_status: 'active',
        jovie_has_profile: false,
      });
    });

    it('maps banned/suspended status to banned', async () => {
      setupClerkClient({});
      mockDbSelect.mockReturnValue(
        createSelectChain([
          {
            userId: 'db-3',
            userStatus: 'banned',
            isAdmin: false,
            profileId: null,
            onboardingCompletedAt: null,
            username: null,
            displayName: null,
            isPublic: null,
          },
        ])
      );

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_banned');

      expect(result.metadata?.jovie_status).toBe('banned');
    });

    it('maps waitlist_pending status to pending', async () => {
      setupClerkClient({});
      mockDbSelect.mockReturnValue(
        createSelectChain([
          {
            userId: 'db-4',
            userStatus: 'waitlist_pending',
            isAdmin: false,
            profileId: null,
            onboardingCompletedAt: null,
            username: null,
            displayName: null,
            isPublic: null,
          },
        ])
      );

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_waitlist');

      expect(result.metadata?.jovie_status).toBe('pending');
    });

    it('captures error on DB failure', async () => {
      const dbError = new Error('DB connection lost');
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(dbError),
            }),
          }),
        }),
      });

      const { syncAllClerkMetadata } = await import('@/lib/auth/clerk-sync');

      const result = await syncAllClerkMetadata('user_err');

      expect(result).toEqual({
        success: false,
        error: 'DB connection lost',
      });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to perform full Clerk metadata sync',
        dbError,
        expect.objectContaining({ operation: 'full-sync' })
      );
    });
  });

  // =========================================================
  // handleClerkUserDeleted
  // =========================================================
  describe('handleClerkUserDeleted', () => {
    it('returns error when clerkUserId is empty', async () => {
      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('');

      expect(result).toEqual({ success: false, error: 'Missing clerkUserId' });
    });

    it('returns success and warns when user not found in DB', async () => {
      mockDbSelect.mockReturnValue(createSelectChain([]));

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('user_gone');

      expect(result).toEqual({ success: true });
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        'User not found in DB for Clerk deletion',
        expect.objectContaining({ clerkUserId: 'user_gone' })
      );
    });

    it('returns success when user is already soft-deleted', async () => {
      mockDbSelect.mockReturnValue(
        createSelectChain([{ id: 'db-1', deletedAt: new Date() }])
      );

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('user_already');

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User already soft-deleted' })
      );
    });

    it('soft-deletes user and invalidates cache', async () => {
      mockDbSelect.mockReturnValue(
        createSelectChain([{ id: 'db-5', deletedAt: null }])
      );
      mockDbUpdate.mockReturnValue(createUpdateChain());

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('user_del');

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith(
        'user_del'
      );
    });

    it('logs audit entry when adminUserId is provided', async () => {
      // First select: find the target user (not deleted)
      // Second select: find the admin user by clerkId
      const selectCallCount = { current: 0 };
      mockDbSelect.mockImplementation(() => {
        selectCallCount.current++;
        if (selectCallCount.current === 1) {
          return createSelectChain([{ id: 'db-target', deletedAt: null }]);
        }
        // Admin user lookup
        return createSelectChain([{ id: 'db-admin' }]);
      });
      mockDbUpdate.mockReturnValue(createUpdateChain());
      mockDbInsert.mockReturnValue(createInsertChain());

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('user_del', 'admin_clerk');

      expect(result).toEqual({ success: true });
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('captures error on DB failure during deletion', async () => {
      const dbError = new Error('Delete failed');
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(dbError),
          }),
        }),
      });

      const { handleClerkUserDeleted } = await import('@/lib/auth/clerk-sync');

      const result = await handleClerkUserDeleted('user_err');

      expect(result).toEqual({ success: false, error: 'Delete failed' });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to handle Clerk user deletion',
        dbError,
        expect.objectContaining({ operation: 'user-deletion' })
      );
    });
  });

  // =========================================================
  // syncAdminRoleChange
  // =========================================================
  describe('syncAdminRoleChange', () => {
    it('returns error when targetClerkUserId is empty', async () => {
      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('', true);

      expect(result).toEqual({
        success: false,
        error: 'Missing targetClerkUserId',
      });
    });

    it('grants admin role via Clerk metadata', async () => {
      setupClerkClient({ jovie_role: 'user', jovie_status: 'active' });

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('user_target', true);

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_target',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({ jovie_role: 'admin' }),
        })
      );
    });

    it('revokes admin role via Clerk metadata', async () => {
      setupClerkClient({ jovie_role: 'admin', jovie_status: 'active' });

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('user_target', false);

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_target',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({ jovie_role: 'user' }),
        })
      );
    });

    it('logs audit when adminClerkUserId is provided', async () => {
      setupClerkClient({});
      // Two lookups: admin user, target user
      mockDbSelect.mockReturnValue(createSelectChain([{ id: 'db-admin' }]));
      mockDbInsert.mockReturnValue(createInsertChain());

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange(
        'user_target',
        true,
        'admin_clerk',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(result).toEqual({ success: true });
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('returns failure when underlying Clerk sync fails', async () => {
      const apiError = new Error('Role sync failed');
      mockClerkClient.mockRejectedValue(apiError);

      const { syncAdminRoleChange } = await import('@/lib/auth/clerk-sync');

      const result = await syncAdminRoleChange('user_target', true);

      // syncClerkMetadata catches the error internally and returns { success: false }
      // syncAdminRoleChange propagates that failure
      expect(result).toEqual({ success: false, error: 'Role sync failed' });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to sync Clerk metadata',
        apiError,
        expect.objectContaining({ clerkUserId: 'user_target' })
      );
    });
  });

  // =========================================================
  // syncProfileStatus
  // =========================================================
  describe('syncProfileStatus', () => {
    it('syncs profile completion as true', async () => {
      setupClerkClient({});

      const { syncProfileStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncProfileStatus('user_prof', true);

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_prof',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            jovie_has_profile: true,
          }),
        })
      );
    });

    it('syncs profile completion as false', async () => {
      setupClerkClient({ jovie_has_profile: true });

      const { syncProfileStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncProfileStatus('user_prof', false);

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_prof',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            jovie_has_profile: false,
          }),
        })
      );
    });
  });

  // =========================================================
  // syncUserStatus
  // =========================================================
  describe('syncUserStatus', () => {
    it('syncs active status', async () => {
      setupClerkClient({});

      const { syncUserStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncUserStatus('user_status', 'active');

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_status',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            jovie_status: 'active',
          }),
        })
      );
    });

    it('syncs banned status', async () => {
      setupClerkClient({});

      const { syncUserStatus } = await import('@/lib/auth/clerk-sync');

      const result = await syncUserStatus('user_status', 'banned');

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
        'user_status',
        expect.objectContaining({
          publicMetadata: expect.objectContaining({
            jovie_status: 'banned',
          }),
        })
      );
    });
  });

  // =========================================================
  // syncEmailFromClerk
  // =========================================================
  describe('syncEmailFromClerk', () => {
    it('returns error when userId is empty', async () => {
      const { syncEmailFromClerk } = await import('@/lib/auth/clerk-sync');

      const result = await syncEmailFromClerk('', 'a@b.com');

      expect(result).toEqual({
        success: false,
        error: 'Missing userId or newEmail',
      });
    });

    it('returns error when newEmail is empty', async () => {
      const { syncEmailFromClerk } = await import('@/lib/auth/clerk-sync');

      const result = await syncEmailFromClerk('db-user-1', '');

      expect(result).toEqual({
        success: false,
        error: 'Missing userId or newEmail',
      });
    });

    it('updates email in DB and logs breadcrumb', async () => {
      mockDbUpdate.mockReturnValue(createUpdateChain());

      const { syncEmailFromClerk } = await import('@/lib/auth/clerk-sync');

      const result = await syncEmailFromClerk('db-user-1', 'new@example.com');

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'clerk-sync',
          data: expect.objectContaining({
            userId: 'db-user-1',
            newEmail: 'new@example.com',
          }),
        })
      );
    });

    it('captures error on DB failure', async () => {
      const dbError = new Error('Email update failed');
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(dbError),
        }),
      });

      const { syncEmailFromClerk } = await import('@/lib/auth/clerk-sync');

      const result = await syncEmailFromClerk('db-user-1', 'new@example.com');

      expect(result).toEqual({
        success: false,
        error: 'Email update failed',
      });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to sync email from Clerk',
        dbError,
        expect.objectContaining({ userId: 'db-user-1' })
      );
    });
  });

  // =========================================================
  // syncEmailFromClerkByClerkId
  // =========================================================
  describe('syncEmailFromClerkByClerkId', () => {
    it('returns error when clerkId is empty', async () => {
      const { syncEmailFromClerkByClerkId } = await import(
        '@/lib/auth/clerk-sync'
      );

      const result = await syncEmailFromClerkByClerkId('', 'a@b.com');

      expect(result).toEqual({
        success: false,
        error: 'Missing clerkId or newEmail',
      });
    });

    it('updates email in DB by clerkId', async () => {
      mockDbUpdate.mockReturnValue(createUpdateChain());

      const { syncEmailFromClerkByClerkId } = await import(
        '@/lib/auth/clerk-sync'
      );

      const result = await syncEmailFromClerkByClerkId(
        'clerk_xyz',
        'updated@example.com'
      );

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Synced email from Clerk by clerkId',
          data: expect.objectContaining({
            clerkId: 'clerk_xyz',
            newEmail: 'updated@example.com',
          }),
        })
      );
    });

    it('captures error on DB failure', async () => {
      const dbError = new Error('Clerk email sync failed');
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(dbError),
        }),
      });

      const { syncEmailFromClerkByClerkId } = await import(
        '@/lib/auth/clerk-sync'
      );

      const result = await syncEmailFromClerkByClerkId(
        'clerk_xyz',
        'updated@example.com'
      );

      expect(result).toEqual({
        success: false,
        error: 'Clerk email sync failed',
      });
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Failed to sync email from Clerk by clerkId',
        dbError,
        expect.objectContaining({ clerkId: 'clerk_xyz' })
      );
    });
  });
});
