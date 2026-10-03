import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const innerJoinMock = vi.fn(() => ({ where: whereMock }));
  const fromMock = vi.fn(() => ({ innerJoin: innerJoinMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const updateWhereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return {
    getCachedAuthMock: vi.fn(),
    eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
    andMock: vi.fn((...conditions: unknown[]) => ({ conditions })),
    limitMock,
    whereMock,
    selectMock,
    setMock,
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
  db: { select: hoisted.selectMock, update: hoisted.updateMock },
}));

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn(async () => ({})),
}));

import {
  getProfileAvatarUrl,
  updateOnboardingProfile,
  verifyProfileHasAvatar,
} from '@/app/onboarding/actions/update-profile';
import { users } from '@/lib/db/schema/auth';

const APP_USER_ID = 'app-user-uuid';

function expectOwnerLookupByAppUserId() {
  expect(hoisted.eqMock).toHaveBeenCalledWith(users.id, APP_USER_ID);
  expect(hoisted.eqMock).not.toHaveBeenCalledWith(
    users.clerkId,
    expect.anything()
  );
}

describe('onboarding update-profile actions (JOV-5401)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: APP_USER_ID });
  });

  it('verifyProfileHasAvatar resolves the owner by users.id', async () => {
    hoisted.limitMock.mockResolvedValue([{ avatarUrl: ' https://a/b.png ' }]);

    await expect(verifyProfileHasAvatar()).resolves.toEqual({
      avatarUrl: 'https://a/b.png',
    });
    expectOwnerLookupByAppUserId();
  });

  it('getProfileAvatarUrl resolves the owner by users.id', async () => {
    hoisted.limitMock.mockResolvedValue([]);

    await expect(getProfileAvatarUrl()).resolves.toEqual({ avatarUrl: null });
    expectOwnerLookupByAppUserId();
  });

  it('updateOnboardingProfile resolves the owner by users.id and saves trimmed fields', async () => {
    hoisted.limitMock.mockResolvedValue([
      { id: 'profile-1', avatarUrl: null, theme: {} },
    ]);

    await expect(
      updateOnboardingProfile({ displayName: '  Artist  ' })
    ).resolves.toEqual({ success: true });
    expectOwnerLookupByAppUserId();
    expect(hoisted.setMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Artist' })
    );
  });

  it('rejects unauthenticated callers before any lookup', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    await expect(updateOnboardingProfile({ bio: 'x' })).rejects.toThrow(
      'Unauthorized'
    );
    expect(hoisted.selectMock).not.toHaveBeenCalled();
  });
});
