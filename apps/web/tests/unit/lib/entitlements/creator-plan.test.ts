import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCreatorEntitlements } from '@/lib/entitlements/creator-plan';
import { getEntitlements } from '@/lib/entitlements/registry';

const { selectMock, fromMock, leftJoinMock, whereMock, limitMock } = vi.hoisted(
  () => ({
    selectMock: vi.fn(),
    fromMock: vi.fn(),
    leftJoinMock: vi.fn(),
    whereMock: vi.fn(),
    limitMock: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

function installQueryResult(rows: unknown[]) {
  limitMock.mockResolvedValue(rows);
  whereMock.mockReturnValue({ limit: limitMock });
  leftJoinMock.mockReturnValue({
    leftJoin: leftJoinMock,
    where: whereMock,
  });
  fromMock.mockReturnValue({
    leftJoin: leftJoinMock,
    where: whereMock,
  });
  selectMock.mockReturnValue({ from: fromMock });
}

describe('getCreatorEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the claimed owner plan in a single query', async () => {
    installQueryResult([
      {
        claimedUserId: 'user_claimed',
        claimedPlan: 'pro',
        legacyUserId: 'user_legacy',
        legacyPlan: 'free',
      },
    ]);

    const result = await getCreatorEntitlements('profile_123');

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      plan: 'pro',
      entitlements: getEntitlements('pro'),
    });
  });

  it('falls back to the legacy owner only when no claim exists', async () => {
    installQueryResult([
      {
        claimedUserId: null,
        claimedPlan: null,
        legacyUserId: 'user_legacy',
        legacyPlan: 'pro',
      },
    ]);

    const result = await getCreatorEntitlements('profile_456');

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      plan: 'pro',
      entitlements: getEntitlements('pro'),
    });
  });
});
