import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBatchCreatorEntitlements,
  getCreatorEntitlements,
} from '@/lib/entitlements/creator-plan';
import { getEntitlements } from '@/lib/entitlements/registry';

const {
  loggerErrorMock,
  selectMock,
  fromMock,
  leftJoinMock,
  whereMock,
  orderByMock,
  limitMock,
  withRetryMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  leftJoinMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  withRetryMock: vi.fn(async (operation: () => Promise<unknown>) =>
    operation()
  ),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
  withRetry: withRetryMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: loggerErrorMock,
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

  it('fails closed to free when the query errors', async () => {
    selectMock.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const result = await getCreatorEntitlements('profile_error');

    expect(result).toEqual({
      plan: 'free',
      entitlements: getEntitlements('free'),
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load creator entitlements',
      expect.objectContaining({
        creatorProfileId: 'profile_error',
        error: expect.any(Error),
        helper: 'getCreatorEntitlements',
      }),
      'public-smart-link'
    );
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

describe('trial expiry (read-time normalization)', () => {
  const NOW = new Date('2026-07-09T12:00:00.000Z');
  const FUTURE = new Date('2026-07-20T12:00:00.000Z');
  const PAST = new Date('2026-07-01T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('grants trial entitlements while the trial window is open', async () => {
    installQueryResult([
      {
        claimedUserId: 'user_claimed',
        claimedPlan: 'trial',
        claimedTrialEndsAt: FUTURE,
        legacyUserId: null,
        legacyPlan: null,
        legacyTrialEndsAt: null,
      },
    ]);

    const result = await getCreatorEntitlements('profile_trial_active');

    expect(result).toEqual({
      plan: 'trial',
      entitlements: getEntitlements('trial'),
    });
  });

  it('fails closed to free once the trial has expired (plan column still trial)', async () => {
    installQueryResult([
      {
        claimedUserId: 'user_claimed',
        claimedPlan: 'trial',
        claimedTrialEndsAt: PAST,
        legacyUserId: null,
        legacyPlan: null,
        legacyTrialEndsAt: null,
      },
    ]);

    const result = await getCreatorEntitlements('profile_trial_expired');

    expect(result).toEqual({
      plan: 'free',
      entitlements: getEntitlements('free'),
    });
  });

  it('fails closed to free when plan is trial but trialEndsAt is missing', async () => {
    installQueryResult([
      {
        claimedUserId: null,
        claimedPlan: null,
        claimedTrialEndsAt: null,
        legacyUserId: 'user_legacy',
        legacyPlan: 'trial',
        legacyTrialEndsAt: null,
      },
    ]);

    const result = await getCreatorEntitlements('profile_trial_no_end');

    expect(result).toEqual({
      plan: 'free',
      entitlements: getEntitlements('free'),
    });
  });

  it('applies trial expiry in the batch lookup', async () => {
    installBatchQueryResults(
      [
        {
          creatorProfileId: 'profile_active',
          claimedUserId: 'user_active',
          legacyUserId: null,
        },
        {
          creatorProfileId: 'profile_expired',
          claimedUserId: 'user_expired',
          legacyUserId: null,
        },
      ],
      [
        { id: 'user_active', plan: 'trial', trialEndsAt: FUTURE },
        { id: 'user_expired', plan: 'trial', trialEndsAt: PAST },
      ]
    );

    const result = await getBatchCreatorEntitlements([
      'profile_active',
      'profile_expired',
    ]);

    expect(result.get('profile_active')).toEqual({
      plan: 'trial',
      entitlements: getEntitlements('trial'),
    });
    expect(result.get('profile_expired')).toEqual({
      plan: 'free',
      entitlements: getEntitlements('free'),
    });
  });
});
