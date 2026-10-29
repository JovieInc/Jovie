import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  returning: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  decide: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        hoisted.set(values);
        return {
          where: (condition: unknown) => {
            hoisted.where(condition);
            return { returning: hoisted.returning };
          },
        };
      },
    }),
  },
}));
vi.mock('@/lib/waitlist/admission-gate.server', () => ({
  decideAdmissionForUser: hoisted.decide,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: hoisted.invalidate,
}));

const { admitPaidUser } = await import('@/lib/waitlist/paid-admission');

describe('admitPaidUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.invalidate.mockResolvedValue(undefined);
    hoisted.decide.mockResolvedValue({ admit: true, blocking: [] });
  });

  it('holds a paying buyer on the waitlist while the admission gate is closed', async () => {
    hoisted.decide.mockResolvedValue({ admit: false, blocking: ['design'] });
    await expect(
      admitPaidUser({ appUserId: 'app-1', cacheKeys: [] })
    ).resolves.toEqual({ admitted: false, heldBy: ['design'] });
    expect(hoisted.set).not.toHaveBeenCalled();
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('fails closed when the gate cannot be read', async () => {
    hoisted.decide.mockRejectedValue(new Error('db down'));
    const result = await admitPaidUser({ appUserId: 'app-1', cacheKeys: [] });
    expect(result.admitted).toBe(false);
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('moves a pending buyer to waitlist_approved and busts every cache key', async () => {
    hoisted.returning.mockResolvedValue([{ id: 'app-1' }]);
    await expect(
      admitPaidUser({ appUserId: 'app-1', cacheKeys: ['ba-1', 'app-1'] })
    ).resolves.toEqual({ admitted: true });
    expect(hoisted.set).toHaveBeenCalledWith(
      expect.objectContaining({ userStatus: 'waitlist_approved' })
    );
    expect(hoisted.invalidate.mock.calls.map(call => call[0]).sort()).toEqual([
      'app-1',
      'ba-1',
    ]);
  });

  it('is a no-op for anyone not pending (never downgrades or unbans)', async () => {
    hoisted.returning.mockResolvedValue([]);
    await expect(
      admitPaidUser({ appUserId: 'app-2', cacheKeys: [] })
    ).resolves.toEqual({ admitted: false });
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('still reports admission when a cache bust fails', async () => {
    hoisted.returning.mockResolvedValue([{ id: 'app-3' }]);
    hoisted.invalidate.mockRejectedValue(new Error('redis down'));
    await expect(
      admitPaidUser({ appUserId: 'app-3', cacheKeys: [] })
    ).resolves.toEqual({ admitted: true });
  });
});
