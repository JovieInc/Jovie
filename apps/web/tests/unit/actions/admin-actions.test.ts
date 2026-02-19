import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks – created before any module resolution
// ---------------------------------------------------------------------------
const {
  mockGetCachedAuth,
  mockIsAdmin,
  mockDbUpdate,
  mockDbSelect,
  mockDbDelete,
  mockRevalidatePath,
  mockInvalidateProfileCache,
  mockEnqueueLinktreeIngestionJob,
  mockWithSystemIngestionSession,
  mockIngestionStatusManagerMarkPendingBulk,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockInvalidateProfileCache: vi.fn(),
  mockEnqueueLinktreeIngestionJob: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
  mockIngestionStatusManagerMarkPendingBulk: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mockInvalidateProfileCache,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueLinktreeIngestionJob: mockEnqueueLinktreeIngestionJob,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markPendingBulk: mockIngestionStatusManagerMarkPendingBulk,
  },
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: (url: string) => url,
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    ADMIN: '/admin',
    ADMIN_CREATORS: '/admin/creators',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
  inArray: vi.fn((_col: unknown, val: unknown) => ({ inArray: val })),
}));

// ---------------------------------------------------------------------------
// DB mock – chainable query builder pattern
// ---------------------------------------------------------------------------

/** Creates a chain: .set() → .where() → .returning() */
function createUpdateChain(returningResult: unknown[] = []) {
  const returning = vi.fn().mockResolvedValue(returningResult);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where, returning };
}

/** Creates a chain: .from() → .where() */
function createSelectChain(result: unknown[] = []) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { from, where };
}

/** Creates a chain for delete: .where() */
function createDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  mockDbDelete.mockReturnValue({ where });
  return { where };
}

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
    delete: mockDbDelete,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('admin/actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated admin
    mockGetCachedAuth.mockResolvedValue({ userId: 'admin_123' });
    mockIsAdmin.mockResolvedValue(true);
    mockInvalidateProfileCache.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Admin authorization – applies to EVERY exported action
  // =========================================================================
  describe('admin authorization', () => {
    const actionNames = [
      'toggleCreatorVerifiedAction',
      'bulkRerunCreatorIngestionAction',
      'bulkSetCreatorsVerifiedAction',
      'toggleCreatorFeaturedAction',
      'bulkSetCreatorsFeaturedAction',
      'toggleCreatorMarketingAction',
      'deleteCreatorOrUserAction',
    ] as const;

    it.each(
      actionNames
    )('%s rejects unauthenticated users', async actionName => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const mod = await import('@/app/app/(shell)/admin/actions');
      const action = mod[actionName] as (
        ...args: unknown[]
      ) => Promise<unknown>;
      const fd = makeFormData({ profileId: 'p1' });

      await expect(action(fd)).rejects.toThrow('Unauthorized');
    });

    it.each(actionNames)('%s rejects non-admin users', async actionName => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'user_regular' });
      mockIsAdmin.mockResolvedValue(false);

      const mod = await import('@/app/app/(shell)/admin/actions');
      const action = mod[actionName] as (
        ...args: unknown[]
      ) => Promise<unknown>;
      const fd = makeFormData({ profileId: 'p1' });

      await expect(action(fd)).rejects.toThrow('Unauthorized');
    });

    it('updateCreatorAvatarAsAdmin rejects unauthenticated users', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('p1', 'https://res.cloudinary.com/img.jpg')
      ).rejects.toThrow('Unauthorized');
    });

    it('updateCreatorAvatarAsAdmin rejects non-admin users', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'user_regular' });
      mockIsAdmin.mockResolvedValue(false);

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('p1', 'https://res.cloudinary.com/img.jpg')
      ).rejects.toThrow('Unauthorized');
    });
  });

  // =========================================================================
  // toggleCreatorVerifiedAction
  // =========================================================================
  describe('toggleCreatorVerifiedAction', () => {
    it('toggles verification to true', async () => {
      const { returning } = createUpdateChain([
        { usernameNormalized: 'artist1' },
      ]);

      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p1', nextVerified: 'true' });
      await toggleCreatorVerifiedAction(fd);

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(returning).toHaveBeenCalled();
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('artist1');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/creators');
    });

    it('toggles verification to false', async () => {
      createUpdateChain([{ usernameNormalized: 'artist2' }]);

      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p2', nextVerified: 'false' });
      await toggleCreatorVerifiedAction(fd);

      // Check set was called with isVerified: false
      const setCall = mockDbUpdate.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ isVerified: false })
      );
    });

    it('defaults to verified=true when nextVerified is not provided', async () => {
      createUpdateChain([{ usernameNormalized: 'artist3' }]);

      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p3' });
      await toggleCreatorVerifiedAction(fd);

      const setCall = mockDbUpdate.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ isVerified: true })
      );
    });

    it('throws when profileId is missing', async () => {
      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(toggleCreatorVerifiedAction(fd)).rejects.toThrow(
        'profileId is required'
      );
    });
  });

  // =========================================================================
  // bulkRerunCreatorIngestionAction
  // =========================================================================
  describe('bulkRerunCreatorIngestionAction', () => {
    it('enqueues ingestion jobs for profiles', async () => {
      const profiles = [
        { id: 'p1', username: 'user1', usernameNormalized: 'user1' },
        { id: 'p2', username: 'user2', usernameNormalized: 'user2' },
      ];

      mockWithSystemIngestionSession.mockImplementation(
        async (fn: (tx: unknown) => Promise<number>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(profiles),
              }),
            }),
          };
          return fn(mockTx);
        }
      );

      mockEnqueueLinktreeIngestionJob.mockResolvedValue('job-id');
      mockIngestionStatusManagerMarkPendingBulk.mockResolvedValue(undefined);

      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify(['p1', 'p2']),
      });

      const result = await bulkRerunCreatorIngestionAction(fd);

      expect(result).toEqual({ queuedCount: 2 });
      expect(mockEnqueueLinktreeIngestionJob).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('rejects more than 200 profileIds', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const ids = Array.from({ length: 201 }, (_, i) => `p${i}`);
      const fd = makeFormData({ profileIds: JSON.stringify(ids) });

      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'Too many profileIds'
      );
    });

    it('throws when profileIds is missing', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'profileIds is required'
      );
    });

    it('throws when profileIds is not an array', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileIds: '"not-an-array"' });
      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'profileIds must be an array'
      );
    });

    it('throws when all profileIds are filtered out (empty strings)', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileIds: JSON.stringify(['', '']) });
      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'profileIds must contain at least one id'
      );
    });
  });

  // =========================================================================
  // bulkSetCreatorsVerifiedAction
  // =========================================================================
  describe('bulkSetCreatorsVerifiedAction', () => {
    it('bulk-verifies creators', async () => {
      createUpdateChain([
        { usernameNormalized: 'u1' },
        { usernameNormalized: 'u2' },
      ]);

      const { bulkSetCreatorsVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify(['p1', 'p2']),
        nextVerified: 'true',
      });

      await bulkSetCreatorsVerifiedAction(fd);

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockInvalidateProfileCache).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/creators');
    });

    it('rejects more than 200 profileIds', async () => {
      const { bulkSetCreatorsVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const ids = Array.from({ length: 201 }, (_, i) => `p${i}`);
      const fd = makeFormData({
        profileIds: JSON.stringify(ids),
        nextVerified: 'true',
      });

      await expect(bulkSetCreatorsVerifiedAction(fd)).rejects.toThrow(
        'Too many profileIds'
      );
    });

    it('throws when profileIds is missing', async () => {
      const { bulkSetCreatorsVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(bulkSetCreatorsVerifiedAction(fd)).rejects.toThrow(
        'profileIds is required'
      );
    });
  });

  // =========================================================================
  // updateCreatorAvatarAsAdmin
  // =========================================================================
  describe('updateCreatorAvatarAsAdmin', () => {
    it('updates avatar with valid https URL from allowed host', async () => {
      createUpdateChain([{ usernameNormalized: 'artist1' }]);

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await updateCreatorAvatarAsAdmin(
        'p1',
        'https://res.cloudinary.com/demo/image/upload/avatar.jpg'
      );

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('artist1');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('rejects non-https URLs', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('p1', 'http://res.cloudinary.com/img.jpg')
      ).rejects.toThrow('Avatar URL must use https');
    });

    it('rejects disallowed hosts', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('p1', 'https://evil.com/img.jpg')
      ).rejects.toThrow('Avatar URL host is not allowed');
    });

    it('rejects completely invalid URLs', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('p1', 'not-a-url')
      ).rejects.toThrow();
    });

    it('throws when profileId or avatarUrl is empty', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('', 'https://res.cloudinary.com/img.jpg')
      ).rejects.toThrow('profileId and avatarUrl are required');

      await expect(updateCreatorAvatarAsAdmin('p1', '')).rejects.toThrow(
        'profileId and avatarUrl are required'
      );
    });

    it('accepts all allowed avatar hosts', async () => {
      const allowedUrls = [
        'https://res.cloudinary.com/demo/img.jpg',
        'https://images.clerk.dev/avatar.png',
        'https://img.clerk.com/avatar.png',
        'https://images.unsplash.com/photo.jpg',
        'https://blob.vercel-storage.com/file.jpg',
      ];

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      for (const url of allowedUrls) {
        vi.clearAllMocks();
        mockGetCachedAuth.mockResolvedValue({ userId: 'admin_123' });
        mockIsAdmin.mockResolvedValue(true);
        mockInvalidateProfileCache.mockResolvedValue(undefined);
        createUpdateChain([{ usernameNormalized: 'artist' }]);

        await expect(
          updateCreatorAvatarAsAdmin('p1', url)
        ).resolves.toBeUndefined();
      }
    });
  });

  // =========================================================================
  // toggleCreatorFeaturedAction
  // =========================================================================
  describe('toggleCreatorFeaturedAction', () => {
    it('toggles featured status', async () => {
      createUpdateChain([{ usernameNormalized: 'featured1' }]);

      const { toggleCreatorFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p1', nextFeatured: 'true' });
      await toggleCreatorFeaturedAction(fd);

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('featured1');
      // Featured actions also revalidate homepage
      expect(mockRevalidatePath).toHaveBeenCalledWith('/');
    });

    it('throws when profileId is missing', async () => {
      const { toggleCreatorFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(toggleCreatorFeaturedAction(fd)).rejects.toThrow(
        'profileId is required'
      );
    });
  });

  // =========================================================================
  // bulkSetCreatorsFeaturedAction
  // =========================================================================
  describe('bulkSetCreatorsFeaturedAction', () => {
    it('bulk-sets featured status', async () => {
      createUpdateChain([
        { usernameNormalized: 'f1' },
        { usernameNormalized: 'f2' },
      ]);

      const { bulkSetCreatorsFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify(['p1', 'p2']),
        nextFeatured: 'true',
      });

      await bulkSetCreatorsFeaturedAction(fd);

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockInvalidateProfileCache).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/');
    });

    it('rejects more than 200 profileIds', async () => {
      const { bulkSetCreatorsFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const ids = Array.from({ length: 201 }, (_, i) => `p${i}`);
      const fd = makeFormData({
        profileIds: JSON.stringify(ids),
        nextFeatured: 'true',
      });

      await expect(bulkSetCreatorsFeaturedAction(fd)).rejects.toThrow(
        'Too many profileIds'
      );
    });

    it('throws when profileIds is missing', async () => {
      const { bulkSetCreatorsFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(bulkSetCreatorsFeaturedAction(fd)).rejects.toThrow(
        'profileIds is required'
      );
    });
  });

  // =========================================================================
  // toggleCreatorMarketingAction
  // =========================================================================
  describe('toggleCreatorMarketingAction', () => {
    it('toggles marketing opt-out to true', async () => {
      // This action does not call .returning()
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDbUpdate.mockReturnValue({ set });

      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileId: 'p1',
        nextMarketingOptOut: 'true',
      });
      await toggleCreatorMarketingAction(fd);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ marketingOptOut: true })
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('defaults marketing opt-out to false when not provided', async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where });
      mockDbUpdate.mockReturnValue({ set });

      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p1' });
      await toggleCreatorMarketingAction(fd);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ marketingOptOut: false })
      );
    });

    it('throws when profileId is missing', async () => {
      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(toggleCreatorMarketingAction(fd)).rejects.toThrow(
        'profileId is required'
      );
    });
  });

  // =========================================================================
  // deleteCreatorOrUserAction
  // =========================================================================
  describe('deleteCreatorOrUserAction', () => {
    it('soft-deletes a claimed creator (has userId)', async () => {
      // First call: select to get profile
      createSelectChain([{ userId: 'user_abc', username: 'claimed_user' }]);

      // Second call: update for soft delete
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      mockDbUpdate.mockReturnValue({ set: updateSet });

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p1' });
      await deleteCreatorOrUserAction(fd);

      expect(mockDbSelect).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      // Hard delete should NOT be called
      expect(mockDbDelete).not.toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('hard-deletes an unclaimed creator (no userId)', async () => {
      // Profile has no userId
      createSelectChain([{ userId: null, username: 'unclaimed_user' }]);
      createDeleteChain();

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'p1' });
      await deleteCreatorOrUserAction(fd);

      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('throws when profile is not found', async () => {
      createSelectChain([]);

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'nonexistent' });
      await expect(deleteCreatorOrUserAction(fd)).rejects.toThrow(
        'Profile not found'
      );
    });

    it('throws when profileId is missing', async () => {
      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = new FormData();
      await expect(deleteCreatorOrUserAction(fd)).rejects.toThrow(
        'profileId is required'
      );
    });
  });
});
