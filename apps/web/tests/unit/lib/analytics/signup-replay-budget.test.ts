import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: mocks }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import {
  billingPeriodStart,
  listStuckSignupReplays,
  recordReplayFlush,
  recordSignupReplay,
  resolveServerFlushTrigger,
} from '@/lib/analytics/signup-replay.server';
import type { SignupReplayRow } from '@/lib/db/schema/signup-replays';

function query(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
}
beforeEach(() => vi.resetAllMocks());

describe('billingPeriodStart', () => {
  it('uses this month on or after the 24th', () => {
    expect(
      billingPeriodStart(new Date('2026-10-28T12:00:00Z')).toISOString()
    ).toBe('2026-10-24T00:00:00.000Z');
  });
  it('uses last month before the 24th, across a year boundary', () => {
    expect(
      billingPeriodStart(new Date('2027-01-05T00:00:00Z')).toISOString()
    ).toBe('2026-12-24T00:00:00.000Z');
  });
});

describe('signup replay decisions', () => {
  it('drops anonymous reports without a verified session or user', async () => {
    expect(
      await recordSignupReplay({
        replayId: 'a'.repeat(32),
        onboardingSessionId: null,
        userId: null,
      })
    ).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('persists the verified identity and returns the upserted replay', async () => {
    const replay = { id: 'stored-replay' };
    const insert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([replay]),
    };
    mocks.insert.mockReturnValue(insert);
    const input = {
      replayId: 'a'.repeat(32),
      onboardingSessionId: 'session-1',
      userId: 'user-1',
    };
    expect(await recordSignupReplay(input)).toEqual(replay);
    expect(insert.values).toHaveBeenCalledWith({
      sentryReplayId: input.replayId,
      onboardingSessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it.each([
    [true, new Date(0), 'profile_claimed'],
    [false, new Date(Date.now()), 'signup'],
    [false, new Date(0), null],
  ])(
    'selects the server trigger for claimed=%s and created=%s',
    async (claimed, createdAt, expected) => {
      mocks.select.mockReturnValue(query([{ claimed, createdAt }]));
      const replay = { userId: 'user-1', flushedAt: null } as SignupReplayRow;
      expect(await resolveServerFlushTrigger(replay)).toBe(expected);
      expect(
        await resolveServerFlushTrigger({ ...replay, flushedAt: new Date() })
      ).toBeNull();
      expect(await resolveServerFlushTrigger(null)).toBeNull();
    }
  );

  it.each([44, 45])('enforces the monthly cap at %s flushes', async used => {
    mocks.select.mockReturnValue(query([{ n: used }]));
    const insert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ flushTrigger: 'signup' }]),
    };
    mocks.insert.mockReturnValue(insert);
    const flushed = await recordReplayFlush({
      replayId: 'a'.repeat(32),
      trigger: 'signup',
      onboardingSessionId: 'session-1',
      userId: 'user-1',
    });
    expect(flushed).toBe(used < 45);
    expect(mocks.insert).toHaveBeenCalledTimes(used < 45 ? 1 : 0);
  });

  it('groups unclaimed users and replay URLs, omitting claimed accounts and absent replays', async () => {
    const recordedAt = new Date('2026-10-30');
    const row = {
      userId: 'user-1',
      signedUpAt: recordedAt,
      profileClaimed: false,
      replayId: 'a'.repeat(32),
      recordedAt,
    };
    mocks.select.mockReturnValue(
      query([
        row,
        { ...row, replayId: 'b'.repeat(32) },
        { ...row, userId: 'claimed', profileClaimed: true },
        { ...row, userId: 'user-2', replayId: null },
      ])
    );
    const result = await listStuckSignupReplays(30);
    expect(result).toEqual([
      {
        userId: 'user-1',
        signedUpAt: recordedAt.toISOString(),
        profileClaimed: false,
        replays: ['a', 'b'].map(id => ({
          replayId: id.repeat(32),
          url: `https://jovie.sentry.io/explore/replays/${id.repeat(32)}/`,
          recordedAt: recordedAt.toISOString(),
        })),
      },
      {
        userId: 'user-2',
        signedUpAt: recordedAt.toISOString(),
        profileClaimed: false,
        replays: [],
      },
    ]);
  });
});
