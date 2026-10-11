import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCachedAuthMock,
  recordEventMock,
  whereMock,
  limitMock,
  eqMock,
  creatorProfilesMock,
} = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  return {
    getCachedAuthMock: vi.fn(),
    recordEventMock: vi.fn(),
    whereMock,
    limitMock,
    eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
    creatorProfilesMock: {
      id: 'creator_profiles.id',
      userId: 'creator_profiles.user_id',
      isClaimed: 'creator_profiles.is_claimed',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: eqMock,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: getCachedAuthMock }));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: whereMock }) }) },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: creatorProfilesMock,
}));
vi.mock('@/lib/onboarding/upgrade-offer', () => ({
  recordOnboardingUpgradeOfferEvent: recordEventMock,
}));

import { recordOnboardingUpgradeOfferDecision } from './upgrade-offer';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

describe('recordOnboardingUpgradeOfferDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedAuthMock.mockResolvedValue({ userId: APP_USER_ID });
    recordEventMock.mockResolvedValue({ ok: true });
  });

  it('checks ownership against the app users.id from the session', async () => {
    limitMock.mockResolvedValue([{ id: PROFILE_ID }]);

    await expect(
      recordOnboardingUpgradeOfferDecision(PROFILE_ID, 'accepted', 'pro')
    ).resolves.toEqual({ ok: true });

    expect(eqMock).toHaveBeenCalledWith(
      creatorProfilesMock.userId,
      APP_USER_ID
    );
    expect(recordEventMock).toHaveBeenCalledWith(PROFILE_ID, 'accepted', 'pro');
  });

  it('records nothing when the profile is not owned by the session user', async () => {
    limitMock.mockResolvedValue([]);

    await expect(
      recordOnboardingUpgradeOfferDecision(PROFILE_ID, 'dismissed', 'pro')
    ).resolves.toEqual({ ok: false });
    expect(recordEventMock).not.toHaveBeenCalled();
  });

  it('rejects signed-out sessions and malformed profile ids', async () => {
    getCachedAuthMock.mockResolvedValueOnce({ userId: null });
    await expect(
      recordOnboardingUpgradeOfferDecision(PROFILE_ID, 'accepted', 'pro')
    ).resolves.toEqual({ ok: false });

    await expect(
      recordOnboardingUpgradeOfferDecision('not-a-uuid', 'accepted', 'pro')
    ).resolves.toEqual({ ok: false });
    expect(whereMock).not.toHaveBeenCalled();
  });
});
