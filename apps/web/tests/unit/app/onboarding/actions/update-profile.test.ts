import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const eqMock = vi.fn((left: unknown, right: unknown) => ({ left, right }));
  const andMock = vi.fn((...conditions: unknown[]) => conditions);
  const getCachedAuthMock = vi
    .fn()
    .mockResolvedValue({ userId: 'app-user-uuid' });
  const limitMock = vi.fn(() => Promise.resolve(selectResults.shift() ?? []));
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const innerJoinMock = vi.fn(() => ({ where: whereMock }));
  const fromMock = vi.fn(() => ({ innerJoin: innerJoinMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    andMock,
    eqMock,
    getCachedAuthMock,
    limitMock,
    selectMock,
    selectResults,
    updateMock,
  };
});

vi.mock('drizzle-orm', () => ({
  and: hoisted.andMock,
  eq: hoisted.eqMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    clerkId: 'users.clerkId',
    id: 'users.id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    avatarUrl: 'creatorProfiles.avatarUrl',
    id: 'creatorProfiles.id',
    isClaimed: 'creatorProfiles.isClaimed',
    theme: 'creatorProfiles.theme',
    userId: 'creatorProfiles.userId',
  },
}));

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn(),
}));

describe('onboarding profile app-user identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectResults.length = 0;
    hoisted.getCachedAuthMock.mockResolvedValue({
      userId: 'app-user-uuid',
    });
  });

  it('keys every profile lookup on users.id instead of legacy clerk_id', async () => {
    hoisted.selectResults.push(
      [{ avatarUrl: 'https://cdn.example.com/avatar.avif' }],
      [{ avatarUrl: 'https://cdn.example.com/avatar.avif' }],
      [
        {
          avatarUrl: 'https://cdn.example.com/avatar.avif',
          id: 'profile-uuid',
          theme: {},
        },
      ]
    );

    const {
      getProfileAvatarUrl,
      updateOnboardingProfile,
      verifyProfileHasAvatar,
    } = await import('@/app/onboarding/actions/update-profile');

    await expect(verifyProfileHasAvatar()).resolves.toEqual({
      avatarUrl: 'https://cdn.example.com/avatar.avif',
    });
    await expect(getProfileAvatarUrl()).resolves.toEqual({
      avatarUrl: 'https://cdn.example.com/avatar.avif',
    });
    await expect(updateOnboardingProfile({})).resolves.toEqual({
      success: true,
    });

    const appUserPredicates = hoisted.eqMock.mock.calls.filter(
      ([left, right]) => left === 'users.id' && right === 'app-user-uuid'
    );
    expect(appUserPredicates).toHaveLength(3);
    expect(hoisted.eqMock).not.toHaveBeenCalledWith(
      'users.clerkId',
      'app-user-uuid'
    );
  });
});
