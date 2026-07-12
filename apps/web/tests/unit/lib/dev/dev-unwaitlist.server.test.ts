import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockApproveWaitlistEntryInTx,
  mockFinalizeWaitlistApproval,
  mockGetWaitlistAccess,
  mockInvalidateProxyUserStateCache,
  mockWithSystemIngestionSession,
  mockEnsureCreatorProfileRecord,
  mockEnsureUserProfileClaim,
  mockSetActiveProfileForUser,
  mockDbSelect,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockApproveWaitlistEntryInTx: vi.fn(),
  mockFinalizeWaitlistApproval: vi.fn(),
  mockGetWaitlistAccess: vi.fn(),
  mockInvalidateProxyUserStateCache: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
  mockEnsureCreatorProfileRecord: vi.fn(),
  mockEnsureUserProfileClaim: vi.fn(),
  mockSetActiveProfileForUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/gate', () => ({
  getWaitlistAccess: mockGetWaitlistAccess,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: mockApproveWaitlistEntryInTx,
  finalizeWaitlistApproval: mockFinalizeWaitlistApproval,
}));

vi.mock('@/lib/testing/test-user-provision.server', () => ({
  DEFAULT_TEST_AVATAR_URL: '/avatars/default-user.png',
  ensureCreatorProfileRecord: mockEnsureCreatorProfileRecord,
  ensureUserProfileClaim: mockEnsureUserProfileClaim,
  setActiveProfileForUser: mockSetActiveProfileForUser,
}));

function createSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, where, limit };
}

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  return { set, where };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

describe('devUnwaitlistSessionUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetWaitlistAccess.mockResolvedValue({
      entryId: 'entry-1',
      status: 'waitlisted',
    });
    mockWithSystemIngestionSession.mockImplementation(async operation =>
      operation({})
    );
    mockApproveWaitlistEntryInTx.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry-1',
      profileId: 'profile-1',
      email: 'smoke@example.com',
      fullName: 'Smoke Artist',
      clerkId: 'clerk_123',
    });
    mockEnsureCreatorProfileRecord.mockResolvedValue('profile-created');
    mockEnsureUserProfileClaim.mockResolvedValue(undefined);
    mockSetActiveProfileForUser.mockResolvedValue(undefined);
    mockInvalidateProxyUserStateCache.mockResolvedValue(undefined);
  });

  it('approves pending waitlist entries and finalizes dev activation', async () => {
    const userSelect = createSelectChain([
      {
        id: 'user-db-1',
        name: 'Smoke Artist',
        userStatus: 'waitlist_pending',
        waitlistEntryId: 'entry-1',
        activeProfileId: null,
        clerkId: 'clerk_123',
      },
    ]);
    const profileSelect = createSelectChain([{ id: 'profile-1' }]);
    const profileDetailsSelect = createSelectChain([
      {
        username: 'smoke-artist',
        usernameNormalized: 'smoke-artist',
        displayName: 'Smoke Artist',
      },
    ]);
    const userUpdate = createUpdateChain();
    const profileUpdate = createUpdateChain();
    const waitlistUpdate = createUpdateChain();

    mockDbSelect
      .mockReturnValueOnce(userSelect)
      .mockReturnValueOnce(profileSelect)
      .mockReturnValueOnce(profileDetailsSelect);
    mockDbUpdate
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(userUpdate)
      .mockReturnValueOnce(waitlistUpdate);

    const { devUnwaitlistSessionUser } = await import(
      '@/lib/dev/dev-unwaitlist.server'
    );

    const result = await devUnwaitlistSessionUser({
      userId: 'user-db-1',
      email: 'smoke@example.com',
      clerkId: null,
    });

    expect(result).toEqual({
      ok: true,
      profileId: 'profile-1',
      message: 'Session user activated past waitlist for dev QA',
      waitlistStatus: 'waitlisted',
    });
    expect(mockApproveWaitlistEntryInTx).toHaveBeenCalledWith({}, 'entry-1');
    expect(mockFinalizeWaitlistApproval).toHaveBeenCalled();
    expect(profileUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isClaimed: true,
        isPublic: true,
        onboardingCompletedAt: expect.any(Date),
      })
    );
    expect(userUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        userStatus: 'active',
        activeProfileId: 'profile-1',
      })
    );
    expect(waitlistUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'claimed' })
    );
    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith('clerk_123');
  });

  it('activates waitlist_pending users without a waitlist entry row', async () => {
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: null,
      status: null,
    });

    const userSelect = createSelectChain([
      {
        id: 'user-db-1',
        name: 'Smoke Artist',
        userStatus: 'waitlist_pending',
        waitlistEntryId: null,
        activeProfileId: null,
        clerkId: 'clerk_123',
      },
    ]);
    const claimedProfileSelect = createSelectChain([]);
    const userUpdate = createUpdateChain();

    mockDbSelect
      .mockReturnValueOnce(userSelect)
      .mockReturnValueOnce(claimedProfileSelect);
    mockDbUpdate.mockReturnValueOnce(userUpdate);

    const { devUnwaitlistSessionUser } = await import(
      '@/lib/dev/dev-unwaitlist.server'
    );

    const result = await devUnwaitlistSessionUser({
      userId: 'user-db-1',
      email: 'smoke@example.com',
      clerkId: null,
    });

    expect(result.ok).toBe(true);
    expect(mockApproveWaitlistEntryInTx).not.toHaveBeenCalled();
    expect(mockEnsureCreatorProfileRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-db-1',
        isClaimed: true,
        isPublic: true,
        onboardingCompletedAt: expect.any(Date),
      })
    );
    expect(result.profileId).toBe('profile-created');
  });

  it('returns 404 when the app user row is missing', async () => {
    mockDbSelect.mockReturnValueOnce(createSelectChain([]));

    const { devUnwaitlistSessionUser } = await import(
      '@/lib/dev/dev-unwaitlist.server'
    );

    const result = await devUnwaitlistSessionUser({
      userId: 'missing-user',
      email: 'smoke@example.com',
      clerkId: null,
    });

    expect(result).toEqual({
      ok: false,
      error: 'User record not found',
      status: 404,
    });
  });
});
