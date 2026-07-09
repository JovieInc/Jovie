import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('server-only', () => ({}));

import {
  computeRevenueSignals,
  listArtistCohortRevenueRows,
} from './artist-revenue-cohorts';
import {
  FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN,
  STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK,
} from './revenue-lift-weights';

/** Chain for aggregate queries: select().from().where().groupBy() → rows */
function mockGroupByChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

/** Chain for row queries: select().from().where() → rows */
function mockWhereChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const window = {
  start: new Date('2026-06-01T00:00:00.000Z'),
  end: new Date('2026-07-01T00:00:00.000Z'),
};

describe('computeRevenueSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty signals without querying when no profiles are given', async () => {
    const signals = await computeRevenueSignals({
      creatorProfileIds: [],
      window,
    });

    expect(signals.size).toBe(0);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('composes gmv + tips + weighted clicks + weighted fans per artist', async () => {
    // Promise.all order in the implementation: gmv, tips, clicks, fans.
    mockDbSelect
      .mockReturnValueOnce(
        mockGroupByChain([{ creatorProfileId: 'profile-1', gmvCents: 4200 }])
      )
      .mockReturnValueOnce(
        mockGroupByChain([{ creatorProfileId: 'profile-1', tipsCents: 800 }])
      )
      .mockReturnValueOnce(
        mockGroupByChain([{ creatorProfileId: 'profile-1', dspClickCount: 50 }])
      )
      .mockReturnValueOnce(
        mockGroupByChain([{ creatorProfileId: 'profile-1', newFanCount: 2 }])
      );

    const signals = await computeRevenueSignals({
      creatorProfileIds: ['profile-1', 'profile-2'],
      window,
    });

    const expectedSignal =
      4200 +
      800 +
      50 * STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK +
      2 * FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN;

    expect(signals.get('profile-1')).toEqual({
      creatorProfileId: 'profile-1',
      gmvCents: 4200,
      tipsCents: 800,
      dspClickCount: 50,
      newFanCount: 2,
      revenueSignalCents: expectedSignal,
    });

    // Artist with no activity gets an explicit zero signal, not a missing row.
    expect(signals.get('profile-2')).toEqual({
      creatorProfileId: 'profile-2',
      gmvCents: 0,
      tipsCents: 0,
      dspClickCount: 0,
      newFanCount: 0,
      revenueSignalCents: 0,
    });
  });
});

describe('listArtistCohortRevenueRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits cohort tag + rolling signal + lift vs the immutable baseline', async () => {
    const cohortRow = {
      id: 'cohort-1',
      userId: 'user-1',
      creatorProfileId: 'profile-1',
      cohort: 'jovie_active',
      assignedAt: new Date('2026-05-01T00:00:00.000Z'),
      activatedAt: new Date('2026-05-01T00:00:00.000Z'),
      matchCriteria: {},
      baselineWindowStart: new Date('2026-04-01T00:00:00.000Z'),
      baselineWindowEnd: new Date('2026-05-01T00:00:00.000Z'),
      baselineGmvCents: 1000,
      baselineTipsCents: 0,
      baselineDspClickCount: 0,
      baselineNewFanCount: 0,
      baselineRevenueSignalCents: 1000,
      baselineWeightsVersion: 'v1',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    mockDbSelect
      .mockReturnValueOnce(mockWhereChain([cohortRow]))
      // signal aggregates: gmv, tips, clicks, fans
      .mockReturnValueOnce(
        mockGroupByChain([{ creatorProfileId: 'profile-1', gmvCents: 3000 }])
      )
      .mockReturnValueOnce(mockGroupByChain([]))
      .mockReturnValueOnce(mockGroupByChain([]))
      .mockReturnValueOnce(mockGroupByChain([]));

    const rows = await listArtistCohortRevenueRows({ window });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      creatorProfileId: 'profile-1',
      cohort: 'jovie_active',
      baselineRevenueSignalCents: 1000,
      baselineWeightsVersion: 'v1',
    });
    expect(rows[0]?.signal?.revenueSignalCents).toBe(3000);
    expect(rows[0]?.liftCents).toBe(2000);
  });
});
