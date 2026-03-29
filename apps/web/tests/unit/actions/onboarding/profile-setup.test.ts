import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', clerkId: 'clerkId', activeProfileId: 'activeProfileId', updatedAt: 'updatedAt' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    username: 'username',
    usernameNormalized: 'usernameNormalized',
    displayName: 'displayName',
    isClaimed: 'isClaimed',
    isPublic: 'isPublic',
    claimedAt: 'claimedAt',
    onboardingCompletedAt: 'onboardingCompletedAt',
    updatedAt: 'updatedAt',
    creatorType: 'creatorType',
    settings: 'settings',
    theme: 'theme',
    ingestionStatus: 'ingestionStatus',
  },
  userProfileClaims: {
    userId: 'userId',
    creatorProfileId: 'creatorProfileId',
    role: 'role',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

function createMockTx() {
  const executeMock = vi.fn();
  const returningMock = vi.fn();
  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const insertValuesMock = vi.fn().mockReturnValue({
    returning: returningMock,
    onConflictDoNothing: onConflictDoNothingMock,
  });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
  const updateWhereMock = vi.fn().mockReturnValue({ returning: returningMock });
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });
  const limitMock = vi.fn();
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock, orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    execute: executeMock,
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    limitMock,
    returningMock,
    executeMock,
  };
}

describe('createUserAndProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates user and profile via DB function', async () => {
    const tx = createMockTx();
    tx.executeMock.mockResolvedValue({
      rows: [{ profile_id: 'new_profile_123' }],
    });

    const { createUserAndProfile } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await createUserAndProfile(
      tx as any,
      'clerk_123',
      'user@test.com',
      'myartist',
      'My Artist'
    );

    expect(result.status).toBe('created');
    expect(result.profileId).toBe('new_profile_123');
    expect(result.username).toBe('myartist');
  });

  it('handles null email', async () => {
    const tx = createMockTx();
    tx.executeMock.mockResolvedValue({
      rows: [{ profile_id: 'profile_456' }],
    });

    const { createUserAndProfile } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await createUserAndProfile(
      tx as any,
      'clerk_123',
      null,
      'noemailer',
      'No Email'
    );

    expect(result.status).toBe('created');
    expect(result.profileId).toBe('profile_456');
  });

  it('reports errors to Sentry and rethrows', async () => {
    const tx = createMockTx();
    tx.executeMock.mockRejectedValue(new Error('Unique violation'));

    const { createUserAndProfile } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    await expect(
      createUserAndProfile(tx as any, 'clerk_123', 'x@y.com', 'u', 'D')
    ).rejects.toThrow('Unique violation');

    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'createUserAndProfile failed',
      expect.any(Error),
      expect.objectContaining({ route: 'profile-setup' })
    );
  });
});

describe('fetchExistingUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user when found', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([{ id: 'user_123' }]);

    const { fetchExistingUser } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await fetchExistingUser(tx as any, 'clerk_123');

    expect(result).toEqual({ id: 'user_123' });
  });

  it('returns null when user not found', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([]);

    const { fetchExistingUser } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await fetchExistingUser(tx as any, 'nonexistent');

    expect(result).toBeNull();
  });

  it('reports errors and rethrows', async () => {
    const tx = createMockTx();
    tx.limitMock.mockRejectedValue(new Error('DB down'));

    const { fetchExistingUser } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    await expect(
      fetchExistingUser(tx as any, 'clerk_123')
    ).rejects.toThrow('DB down');

    expect(hoisted.captureErrorMock).toHaveBeenCalled();
  });
});

describe('fetchExistingProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns profile when found', async () => {
    const tx = createMockTx();
    const mockProfile = {
      id: 'profile_123',
      userId: 'user_123',
      isClaimed: true,
    };
    tx.limitMock.mockResolvedValue([mockProfile]);

    const { fetchExistingProfile } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await fetchExistingProfile(tx as any, 'user_123');

    expect(result).toEqual(mockProfile);
  });

  it('returns null when no profile exists', async () => {
    const tx = createMockTx();
    tx.limitMock.mockResolvedValue([]);

    const { fetchExistingProfile } = await import(
      '@/app/onboarding/actions/profile-setup'
    );
    const result = await fetchExistingProfile(tx as any, 'user_123');

    expect(result).toBeNull();
  });
});
