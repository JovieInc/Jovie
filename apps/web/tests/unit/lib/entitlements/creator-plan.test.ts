import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBatchCreatorEntitlements,
  getCreatorEntitlements,
} from '@/lib/entitlements/creator-plan';
import { getEntitlements } from '@/lib/entitlements/registry';

const {
  selectMock,
  fromMock,
  leftJoinMock,
  whereMock,
  orderByMock,
  limitMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  leftJoinMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

function installQueryResult(rows: unknown[]) {
  limitMock.mockResolvedValue(rows);
  orderByMock.mockReturnValue({ limit: limitMock });
  whereMock.mockReturnValue({ orderBy: orderByMock, limit: limitMock });
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

function installBatchQueryResults(
  ownershipRows: unknown[],
  planRows: unknown[]
) {
  const ownershipWhereMock = vi.fn().mockResolvedValue(ownershipRows);
  const ownershipOrderByMock = vi.fn().mockReturnValue({
    where: ownershipWhereMock,
  });
  const ownershipLeftJoinMock = vi.fn();
  ownershipLeftJoinMock.mockReturnValue({
    leftJoin: ownershipLeftJoinMock,
    orderBy: ownershipOrderByMock,
  });
  const ownershipFromMock = vi.fn().mockReturnValue({
    leftJoin: ownershipLeftJoinMock,
  });

  const planWhereMock = vi.fn().mockResolvedValue(planRows);
  const planFromMock = vi.fn().mockReturnValue({
    where: planWhereMock,
  });

  selectMock
    .mockReturnValueOnce({ from: ownershipFromMock })
    .mockReturnValueOnce({ from: planFromMock });
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
    expect(orderByMock).toHaveBeenCalledTimes(1);
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
    expect(orderByMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      plan: 'pro',
      entitlements: getEntitlements('pro'),
    });
  });
});

describe('getBatchCreatorEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates duplicate claim rows deterministically', async () => {
    installBatchQueryResults(
      [
        {
          creatorProfileId: 'profile_123',
          claimedUserId: 'user_a',
          legacyUserId: 'legacy_user',
        },
        {
          creatorProfileId: 'profile_123',
          claimedUserId: 'user_z',
          legacyUserId: 'legacy_user',
        },
      ],
      [
        { id: 'user_a', plan: 'pro' },
        { id: 'user_z', plan: 'free' },
      ]
    );

    const result = await getBatchCreatorEntitlements(['profile_123']);

    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(result.get('profile_123')).toEqual({
      plan: 'pro',
      entitlements: getEntitlements('pro'),
    });
  });
});
