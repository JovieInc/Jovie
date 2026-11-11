import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  update: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));

import { tryReserveAutoAcceptSlot } from '@/lib/waitlist/settings';

const tx = {
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => [mocks.row] }) }),
  }),
  update: () => {
    mocks.update();
    return {
      set: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }),
    };
  },
} as unknown as Parameters<typeof tryReserveAutoAcceptSlot>[0];

describe('tryReserveAutoAcceptSlot with a support-load budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.row = {
      autoAcceptEnabled: true,
      autoAcceptDailyLimit: 10,
      autoAcceptedToday: 5,
      autoAcceptResetsAt: new Date(Date.now() + 86_400_000),
    };
  });

  it('refuses once today reaches the narrowed limit', async () => {
    expect(await tryReserveAutoAcceptSlot(tx, { dailyLimit: 5 })).toEqual({
      shouldAutoAccept: false,
      reason: 'capacity_full',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reserves under the narrowed limit', async () => {
    expect(await tryReserveAutoAcceptSlot(tx, { dailyLimit: 6 })).toEqual({
      shouldAutoAccept: true,
      reason: 'reserved',
    });
  });

  it('never lets a budget raise the stored limit', async () => {
    mocks.row.autoAcceptedToday = 10;
    expect(await tryReserveAutoAcceptSlot(tx, { dailyLimit: 50 })).toEqual({
      shouldAutoAccept: false,
      reason: 'capacity_full',
    });
  });
});
