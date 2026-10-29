import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  returning: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  hold: vi.fn(),
  refund: vi.fn(),
  card: vi.fn(),
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
  readPaymentAdmissionHold: hoisted.hold,
}));
vi.mock('@/lib/stripe/claim-rejection-refund', () => ({
  refundFirstMonthAndCancel: hoisted.refund,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: hoisted.card,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: hoisted.invalidate,
}));

const { admitPaidUser } = await import('@/lib/waitlist/paid-admission');

describe('admitPaidUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.invalidate.mockResolvedValue(undefined);
    hoisted.hold.mockResolvedValue(null);
    hoisted.refund.mockResolvedValue({
      refundId: 're_test_1',
      amount: 1200,
      canceled: true,
    });
    hoisted.card.mockResolvedValue({ outcome: 'created' });
  });

  it('refunds in full, cancels and raises an incident when the gate holds a waiting buyer', async () => {
    hoisted.hold.mockResolvedValue(['design']);
    await expect(
      admitPaidUser({
        appUserId: 'app-1',
        cacheKeys: [],
        subscriptionId: 'sub_test_1',
      })
    ).resolves.toEqual({
      admitted: false,
      heldBy: ['design'],
      refunded: true,
    });
    expect(hoisted.refund).toHaveBeenCalledWith({
      subscriptionId: 'sub_test_1',
      idempotencyKey: 'admission-gate-refund:app-1:sub_test_1',
      source: 'admission_gate_closed',
    });
    expect(hoisted.card).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Incident: waiting buyer charged, refunded in full',
      })
    );
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('fails the webhook (so Stripe retries) and still raises the incident when the refund fails', async () => {
    hoisted.hold.mockResolvedValue(['profile']);
    hoisted.refund.mockRejectedValue(new Error('stripe down'));
    await expect(
      admitPaidUser({
        appUserId: 'app-1',
        cacheKeys: [],
        subscriptionId: 'sub_test_2',
      })
    ).rejects.toThrow('stripe down');
    expect(hoisted.card).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Incident: waiting buyer charged, refund failing',
      })
    );
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('treats an unreadable gate as a hold (fail closed)', async () => {
    hoisted.hold.mockRejectedValue(new Error('db down'));
    const result = await admitPaidUser({
      appUserId: 'app-1',
      cacheKeys: [],
      subscriptionId: 'sub_test_3',
    });
    expect(result.refunded).toBe(true);
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('moves a pending buyer to waitlist_approved and busts every cache key', async () => {
    hoisted.returning.mockResolvedValue([{ id: 'app-1' }]);
    await expect(
      admitPaidUser({
        appUserId: 'app-1',
        cacheKeys: ['ba-1', 'app-1'],
        subscriptionId: 'sub_test_0',
      })
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
      admitPaidUser({
        appUserId: 'app-2',
        cacheKeys: [],
        subscriptionId: 'sub_test_4',
      })
    ).resolves.toEqual({ admitted: false });
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('still reports admission when a cache bust fails', async () => {
    hoisted.returning.mockResolvedValue([{ id: 'app-3' }]);
    hoisted.invalidate.mockRejectedValue(new Error('redis down'));
    await expect(
      admitPaidUser({
        appUserId: 'app-3',
        cacheKeys: [],
        subscriptionId: 'sub_test_5',
      })
    ).resolves.toEqual({ admitted: true });
  });
});
