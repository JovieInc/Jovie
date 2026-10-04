import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  user: null as { email: string | null; userStatus: string } | null,
  entry: null as { id: string; status: string } | null,
  updated: [] as Array<{ id: string }>,
  set: vi.fn(),
  approve: vi.fn(),
  invalidate: vi.fn(),
}));

// Each select resolves through `.limit(1)`, with or without `.for('update')`:
// the first select reads the user, the second the waitlist entry.
function createTx() {
  let selects = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = () => {
            selects += 1;
            const row = selects === 1 ? hoisted.user : hoisted.entry;
            return Promise.resolve(row ? [row] : []);
          };
          return { for: () => ({ limit: rows }), limit: rows };
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        hoisted.set(values);
        return {
          where: () => ({ returning: async () => hoisted.updated }),
        };
      },
    }),
  };
}

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (operation: (tx: unknown) => Promise<unknown>) =>
    operation(createTx()),
}));
vi.mock('@/lib/db/serializable-retry', () => ({
  withSerializableRetry: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: hoisted.approve,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: hoisted.invalidate,
}));

const { admitPaidUser } = await import('@/lib/waitlist/paid-admission');

describe('admitPaidUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.user = {
      email: 'buyer@example.com',
      userStatus: 'waitlist_pending',
    };
    hoisted.entry = null;
    hoisted.updated = [{ id: 'app-1' }];
    hoisted.invalidate.mockResolvedValue(undefined);
    hoisted.approve.mockResolvedValue({ outcome: 'approved' });
  });

  it('approves a pending waitlist entry through the operator path, with no invite', async () => {
    hoisted.entry = { id: 'entry-1', status: 'waitlisted' };

    await expect(
      admitPaidUser({ appUserId: 'app-1', cacheKeys: ['ba-1'] })
    ).resolves.toEqual({ admitted: true });
    expect(hoisted.approve).toHaveBeenCalledWith(expect.anything(), 'entry-1', {
      actorType: 'system',
      reason: 'paid_checkout',
      targetStatus: 'approved',
    });
    expect(hoisted.set).not.toHaveBeenCalled();
    expect(hoisted.invalidate.mock.calls.map(call => call[0]).sort()).toEqual([
      'app-1',
      'ba-1',
    ]);
  });

  it('moves a pending buyer with no entry straight to waitlist_approved', async () => {
    await expect(
      admitPaidUser({ appUserId: 'app-1', cacheKeys: [] })
    ).resolves.toEqual({ admitted: true });
    expect(hoisted.approve).not.toHaveBeenCalled();
    expect(hoisted.set).toHaveBeenCalledWith(
      expect.objectContaining({ userStatus: 'waitlist_approved' })
    );
  });

  it('is a no-op for anyone not pending (never downgrades or unbans)', async () => {
    hoisted.user = { email: 'buyer@example.com', userStatus: 'banned' };

    await expect(
      admitPaidUser({ appUserId: 'app-2', cacheKeys: [] })
    ).resolves.toEqual({ admitted: false });
    expect(hoisted.approve).not.toHaveBeenCalled();
    expect(hoisted.set).not.toHaveBeenCalled();
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('still reports admission when a cache bust fails', async () => {
    hoisted.invalidate.mockRejectedValue(new Error('redis down'));
    await expect(
      admitPaidUser({ appUserId: 'app-3', cacheKeys: [] })
    ).resolves.toEqual({ admitted: true });
  });
});
