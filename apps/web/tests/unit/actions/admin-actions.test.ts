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
  mockEnqueueMusicFetchEnrichmentJob,
  mockSendVerificationApprovedEmail,
  mockCaptureWarning,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockInvalidateProfileCache: vi.fn(),
  mockEnqueueMusicFetchEnrichmentJob: vi.fn(),
  mockSendVerificationApprovedEmail: vi.fn(),
  mockCaptureWarning: vi.fn(),
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
  enqueueMusicFetchEnrichmentJob: mockEnqueueMusicFetchEnrichmentJob,
}));

vi.mock('@/lib/verification/notifications', () => ({
  sendVerificationApprovedEmail: mockSendVerificationApprovedEmail,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
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

/** Creates a chain: .from() → .where() → .limit() */
function createSelectChain(result: unknown[] = []) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  // Also make where resolve directly for queries without limit
  where.mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { from, where, limit };
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
  users: { id: 'users.id', email: 'users.email', deletedAt: 'users.deletedAt' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    displayName: 'creatorProfiles.displayName',
    userId: 'creatorProfiles.userId',
    spotifyId: 'creatorProfiles.spotifyId',
    spotifyUrl: 'creatorProfiles.spotifyUrl',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Valid UUID for test data */
const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';
const ADMIN_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

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
    mockGetCachedAuth.mockResolvedValue({ userId: ADMIN_USER_ID });
    mockIsAdmin.mockResolvedValue(true);
    mockInvalidateProfileCache.mockResolvedValue(undefined);
    mockSendVerificationApprovedEmail.mockResolvedValue(undefined);
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
      const fd = makeFormData({ profileId: VALID_UUID });

      await expect(action(fd)).rejects.toThrow('Unauthorized');
    });

    it.each(actionNames)('%s rejects non-admin users', async actionName => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'user_regular' });
      mockIsAdmin.mockResolvedValue(false);

      const mod = await import('@/app/app/(shell)/admin/actions');
      const action = mod[actionName] as (
        ...args: unknown[]
      ) => Promise<unknown>;
      const fd = makeFormData({ profileId: VALID_UUID });

      await expect(action(fd)).rejects.toThrow('Unauthorized');
    });

    it('updateCreatorAvatarAsAdmin rejects unauthenticated users', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin(
          VALID_UUID,
          'https://img.clerk.com/avatar.jpg'
        )
      ).rejects.toThrow('Unauthorized');
    });

    it('updateCreatorAvatarAsAdmin rejects non-admin users', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: 'user_regular' });
      mockIsAdmin.mockResolvedValue(false);

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin(
          VALID_UUID,
          'https://img.clerk.com/avatar.jpg'
        )
      ).rejects.toThrow('Unauthorized');
    });
  });

  // =========================================================================
  // UUID validation – applies to all single-profile actions
  // =========================================================================
  describe('UUID validation', () => {
    it('rejects non-UUID profileId in toggleCreatorVerifiedAction', async () => {
      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileId: 'not-a-uuid',
        nextVerified: 'true',
      });
      await expect(toggleCreatorVerifiedAction(fd)).rejects.toThrow(
        'profileId must be a valid UUID'
      );
    });

    it('rejects non-UUID profileId in toggleCreatorFeaturedAction', async () => {
      const { toggleCreatorFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'abc123', nextFeatured: 'true' });
      await expect(toggleCreatorFeaturedAction(fd)).rejects.toThrow(
        'profileId must be a valid UUID'
      );
    });

    it('rejects non-UUID profileId in toggleCreatorMarketingAction', async () => {
      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileId: 'xyz',
        nextMarketingOptOut: 'true',
      });
      await expect(toggleCreatorMarketingAction(fd)).rejects.toThrow(
        'profileId must be a valid UUID'
      );
    });

    it('rejects non-UUID profileId in deleteCreatorOrUserAction', async () => {
      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: 'drop-table' });
      await expect(deleteCreatorOrUserAction(fd)).rejects.toThrow(
        'profileId must be a valid UUID'
      );
    });

    it('rejects non-UUID profileId in updateCreatorAvatarAsAdmin', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('bad-id', 'https://img.clerk.com/avatar.jpg')
      ).rejects.toThrow('profileId must be a valid UUID');
    });

    it('rejects whitespace-only profileId', async () => {
      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: '   ', nextVerified: 'true' });
      await expect(toggleCreatorVerifiedAction(fd)).rejects.toThrow(
        'profileId is required'
      );
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

      const fd = makeFormData({ profileId: VALID_UUID, nextVerified: 'true' });
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

      const fd = makeFormData({ profileId: VALID_UUID, nextVerified: 'false' });
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

      const fd = makeFormData({ profileId: VALID_UUID });
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

    it('continues gracefully when verification email fails', async () => {
      // Setup: profile with userId that will trigger email
      createUpdateChain([
        {
          usernameNormalized: 'artist-email-fail',
          displayName: 'Test Artist',
          userId: 'user_with_email',
        },
      ]);

      // Second select for user email lookup
      const emailLimit = vi
        .fn()
        .mockResolvedValue([{ email: 'test@example.com' }]);
      const emailWhere = vi.fn().mockReturnValue({ limit: emailLimit });
      const emailFrom = vi.fn().mockReturnValue({ where: emailWhere });
      // Override the select mock for the second call
      mockDbSelect.mockReturnValueOnce({ from: emailFrom });

      // Make email sending fail
      mockSendVerificationApprovedEmail.mockRejectedValueOnce(
        new Error('SMTP connection refused')
      );

      const { toggleCreatorVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID, nextVerified: 'true' });

      // Should NOT throw despite email failure
      await expect(toggleCreatorVerifiedAction(fd)).resolves.toBeUndefined();

      // Should log warning to Sentry
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        expect.stringContaining('Verification email failed'),
        expect.objectContaining({
          profileId: VALID_UUID,
          userId: 'user_with_email',
        })
      );

      // Cache invalidation should still happen
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith(
        'artist-email-fail'
      );
    });
  });

  // =========================================================================
  // bulkRerunCreatorIngestionAction
  // =========================================================================
  describe('bulkRerunCreatorIngestionAction', () => {
    it('enqueues ingestion jobs for profiles', async () => {
      const profiles = [
        {
          id: VALID_UUID,
          spotifyId: 'spotify-1',
          spotifyUrl: 'https://open.spotify.com/artist/spotify-1',
        },
        {
          id: VALID_UUID_2,
          spotifyId: 'spotify-2',
          spotifyUrl: 'https://open.spotify.com/artist/spotify-2',
        },
      ];

      createSelectChain(profiles);

      mockEnqueueMusicFetchEnrichmentJob.mockResolvedValue('job-id');

      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify([VALID_UUID, VALID_UUID_2]),
      });

      const result = await bulkRerunCreatorIngestionAction(fd);

      expect(result).toEqual({ queuedCount: 2 });
      expect(mockEnqueueMusicFetchEnrichmentJob).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('skips profiles with no spotify data', async () => {
      const profiles = [
        { id: VALID_UUID, spotifyId: null, spotifyUrl: null },
        {
          id: VALID_UUID_2,
          spotifyId: 'spotify-2',
          spotifyUrl: 'https://open.spotify.com/artist/spotify-2',
        },
      ];

      createSelectChain(profiles);
      mockEnqueueMusicFetchEnrichmentJob.mockResolvedValue('job-id');

      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify([VALID_UUID, VALID_UUID_2]),
      });

      const result = await bulkRerunCreatorIngestionAction(fd);

      expect(result).toEqual({ queuedCount: 1 });
      expect(mockEnqueueMusicFetchEnrichmentJob).toHaveBeenCalledTimes(1);
    });

    it('constructs spotify URL from spotifyId when spotifyUrl is missing', async () => {
      const profiles = [
        { id: VALID_UUID, spotifyId: 'abc123', spotifyUrl: null },
      ];

      createSelectChain(profiles);
      mockEnqueueMusicFetchEnrichmentJob.mockResolvedValue('job-id');

      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify([VALID_UUID]),
      });

      await bulkRerunCreatorIngestionAction(fd);

      expect(mockEnqueueMusicFetchEnrichmentJob).toHaveBeenCalledWith({
        creatorProfileId: VALID_UUID,
        spotifyUrl: 'https://open.spotify.com/artist/abc123',
      });
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

    it('throws on invalid JSON in profileIds', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileIds: '{not valid json' });
      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'profileIds must be valid JSON'
      );
    });

    it('rejects non-UUID values in profileIds array', async () => {
      const { bulkRerunCreatorIngestionAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: JSON.stringify([VALID_UUID, 'not-a-uuid']),
      });
      await expect(bulkRerunCreatorIngestionAction(fd)).rejects.toThrow(
        'profileIds must contain valid UUIDs'
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
        profileIds: JSON.stringify([VALID_UUID, VALID_UUID_2]),
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

    it('throws on invalid JSON in profileIds', async () => {
      const { bulkSetCreatorsVerifiedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileIds: '{{broken', nextVerified: 'true' });
      await expect(bulkSetCreatorsVerifiedAction(fd)).rejects.toThrow(
        'profileIds must be valid JSON'
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
        VALID_UUID,
        'https://img.clerk.com/avatar.jpg'
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
        updateCreatorAvatarAsAdmin(VALID_UUID, 'http://img.clerk.com/img.jpg')
      ).rejects.toThrow('Avatar URL must use https');
    });

    it('rejects disallowed hosts', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin(VALID_UUID, 'https://evil.com/img.jpg')
      ).rejects.toThrow('Avatar URL host is not allowed');
    });

    it('rejects completely invalid URLs', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin(VALID_UUID, 'not-a-url')
      ).rejects.toThrow();
    });

    it('throws when profileId or avatarUrl is empty', async () => {
      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      await expect(
        updateCreatorAvatarAsAdmin('', 'https://img.clerk.com/img.jpg')
      ).rejects.toThrow('profileId and avatarUrl are required');

      await expect(updateCreatorAvatarAsAdmin(VALID_UUID, '')).rejects.toThrow(
        'profileId and avatarUrl are required'
      );
    });

    it('accepts all allowed avatar hosts', async () => {
      const allowedUrls = [
        'https://images.clerk.dev/avatar.png',
        'https://img.clerk.com/avatar.png',
        'https://images.unsplash.com/photo.jpg',
        'https://blob.vercel-storage.com/file.jpg',
        'https://lineup-images.scdn.co/artist.jpg',
        'https://cdn.linktr.ee/profiles/artist.jpg',
      ];

      const { updateCreatorAvatarAsAdmin } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      for (const url of allowedUrls) {
        vi.clearAllMocks();
        mockGetCachedAuth.mockResolvedValue({ userId: ADMIN_USER_ID });
        mockIsAdmin.mockResolvedValue(true);
        mockInvalidateProfileCache.mockResolvedValue(undefined);
        createUpdateChain([{ usernameNormalized: 'artist' }]);

        await expect(
          updateCreatorAvatarAsAdmin(VALID_UUID, url)
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

      const fd = makeFormData({ profileId: VALID_UUID, nextFeatured: 'true' });
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
        profileIds: JSON.stringify([VALID_UUID, VALID_UUID_2]),
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

    it('throws on invalid JSON in profileIds', async () => {
      const { bulkSetCreatorsFeaturedAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileIds: 'not-json!',
        nextFeatured: 'true',
      });
      await expect(bulkSetCreatorsFeaturedAction(fd)).rejects.toThrow(
        'profileIds must be valid JSON'
      );
    });
  });

  // =========================================================================
  // toggleCreatorMarketingAction
  // =========================================================================
  describe('toggleCreatorMarketingAction', () => {
    it('toggles marketing opt-out to true and invalidates cache', async () => {
      createUpdateChain([{ usernameNormalized: 'marketing-artist' }]);

      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({
        profileId: VALID_UUID,
        nextMarketingOptOut: 'true',
      });
      await toggleCreatorMarketingAction(fd);

      const setCall = mockDbUpdate.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ marketingOptOut: true })
      );
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith(
        'marketing-artist'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
    });

    it('defaults marketing opt-out to false when not provided', async () => {
      createUpdateChain([{ usernameNormalized: 'artist-default' }]);

      const { toggleCreatorMarketingAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
      await toggleCreatorMarketingAction(fd);

      const setCall = mockDbUpdate.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
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
      // First select: get profile
      const profileWhere = vi.fn().mockResolvedValue([
        {
          userId: 'user_abc',
          username: 'claimed_user',
          usernameNormalized: 'claimed_user',
        },
      ]);
      const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });

      // Second select: check if user already deleted
      const deleteCheckWhere = vi.fn().mockResolvedValue([{ deletedAt: null }]);
      const deleteCheckFrom = vi
        .fn()
        .mockReturnValue({ where: deleteCheckWhere });

      mockDbSelect
        .mockReturnValueOnce({ from: profileFrom })
        .mockReturnValueOnce({ from: deleteCheckFrom });

      // Update call for soft delete
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      mockDbUpdate.mockReturnValue({ set: updateSet });

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
      await deleteCreatorOrUserAction(fd);

      expect(mockDbSelect).toHaveBeenCalledTimes(2);
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
      // Cache invalidation should happen
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('claimed_user');
    });

    it('hard-deletes an unclaimed creator (no userId)', async () => {
      // Profile has no userId — only one select needed
      const profileWhere = vi.fn().mockResolvedValue([
        {
          userId: null,
          username: 'unclaimed_user',
          usernameNormalized: 'unclaimed_user',
        },
      ]);
      const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });
      mockDbSelect.mockReturnValueOnce({ from: profileFrom });
      createDeleteChain();

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
      await deleteCreatorOrUserAction(fd);

      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
      // Cache should still be invalidated
      expect(mockInvalidateProfileCache).toHaveBeenCalledWith('unclaimed_user');
    });

    it('throws when profile is not found', async () => {
      const profileWhere = vi.fn().mockResolvedValue([]);
      const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });
      mockDbSelect.mockReturnValueOnce({ from: profileFrom });

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
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

    it('prevents admin from deleting their own account', async () => {
      // Profile with userId matching the admin's userId
      const profileWhere = vi.fn().mockResolvedValue([
        {
          userId: ADMIN_USER_ID,
          username: 'admin_user',
          usernameNormalized: 'admin_user',
        },
      ]);
      const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });
      mockDbSelect.mockReturnValueOnce({ from: profileFrom });

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
      await expect(deleteCreatorOrUserAction(fd)).rejects.toThrow(
        'Cannot delete your own account'
      );

      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockDbDelete).not.toHaveBeenCalled();
    });

    it('rejects double-delete of already soft-deleted user', async () => {
      // First select: get profile (claimed)
      const profileWhere = vi.fn().mockResolvedValue([
        {
          userId: 'user_already_deleted',
          username: 'deleted_user',
          usernameNormalized: 'deleted_user',
        },
      ]);
      const profileFrom = vi.fn().mockReturnValue({ where: profileWhere });

      // Second select: user already has deletedAt set
      const deleteCheckWhere = vi
        .fn()
        .mockResolvedValue([{ deletedAt: new Date('2025-01-01') }]);
      const deleteCheckFrom = vi
        .fn()
        .mockReturnValue({ where: deleteCheckWhere });

      mockDbSelect
        .mockReturnValueOnce({ from: profileFrom })
        .mockReturnValueOnce({ from: deleteCheckFrom });

      const { deleteCreatorOrUserAction } = await import(
        '@/app/app/(shell)/admin/actions'
      );

      const fd = makeFormData({ profileId: VALID_UUID });
      await expect(deleteCreatorOrUserAction(fd)).rejects.toThrow(
        'User is already deleted'
      );

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });
});
