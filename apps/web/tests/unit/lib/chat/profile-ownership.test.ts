import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  limitMock: vi.fn(),
  whereMock: vi.fn(),
  innerJoinMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
}));

describe('getOwnedChatProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.limitMock.mockResolvedValue([]);
    hoisted.whereMock.mockReturnValue({ limit: hoisted.limitMock });
    hoisted.innerJoinMock.mockReturnValue({ where: hoisted.whereMock });
    hoisted.fromMock.mockReturnValue({ innerJoin: hoisted.innerJoinMock });
    hoisted.selectMock.mockReturnValue({ from: hoisted.fromMock });
  });

  it('returns the owned profile when the Clerk user matches the canonical user row', async () => {
    hoisted.limitMock.mockResolvedValue([
      {
        id: 'profile_1',
        internalUserId: 'user_internal_1',
        displayName: 'Tim White',
        bio: 'Bio',
        username: 'timwhite',
        clerkId: 'user_clerk_1',
      },
    ]);

    const { getOwnedChatProfile } = await import(
      '@/lib/chat/profile-ownership'
    );

    await expect(
      getOwnedChatProfile({
        profileId: 'profile_1',
        clerkUserId: 'user_clerk_1',
      })
    ).resolves.toEqual({
      id: 'profile_1',
      internalUserId: 'user_internal_1',
      displayName: 'Tim White',
      bio: 'Bio',
      username: 'timwhite',
    });
  });

  it('returns null when the Clerk id does not match', async () => {
    hoisted.limitMock.mockResolvedValue([
      {
        id: 'profile_1',
        internalUserId: 'user_internal_1',
        displayName: 'Tim White',
        bio: null,
        username: 'timwhite',
        clerkId: 'different_clerk_user',
      },
    ]);

    const { getOwnedChatProfile } = await import(
      '@/lib/chat/profile-ownership'
    );

    await expect(
      getOwnedChatProfile({
        profileId: 'profile_1',
        clerkUserId: 'user_clerk_1',
      })
    ).resolves.toBeNull();
  });

  it('returns null when the profile row is missing an internal user id', async () => {
    hoisted.limitMock.mockResolvedValue([
      {
        id: 'profile_1',
        internalUserId: null,
        displayName: 'Tim White',
        bio: null,
        username: 'timwhite',
        clerkId: 'user_clerk_1',
      },
    ]);

    const { getOwnedChatProfile } = await import(
      '@/lib/chat/profile-ownership'
    );

    await expect(
      getOwnedChatProfile({
        profileId: 'profile_1',
        clerkUserId: 'user_clerk_1',
      })
    ).resolves.toBeNull();
  });
});
