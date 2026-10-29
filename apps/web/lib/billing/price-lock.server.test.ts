import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  inserted: [] as Record<string, unknown>[],
  captureError: vi.fn().mockResolvedValue(undefined),
  mapping: vi.fn(),
}));

// A tiny chainable fake: every select() pops the next queued result, every
// insert() records its values and resolves its returning() to one row.
function makeClient() {
  const chain = (result: () => unknown[]) => {
    const node: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'leftJoin', 'orderBy']) {
      node[key] = () => node;
    }
    node.limit = () => Promise.resolve(result());
    node.then = (resolve: (v: unknown) => void) => resolve(result());
    return node;
  };
  return {
    select: () => chain(() => hoisted.selectQueue.shift() ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        hoisted.inserted.push(v);
        const done = {
          onConflictDoNothing: () => done,
          returning: () => Promise.resolve([{ id: 'lock_row' }]),
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        };
        return done;
      },
    }),
  };
}

vi.mock('@/lib/db', () => ({ db: makeClient() }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));
vi.mock('@/lib/stripe/price-ids', () => ({
  getStripePriceIds: () => ({
    artistVisibilityProMonthly: 'price_12',
    proAnnual: 'price_annual',
  }),
}));
vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: hoisted.mapping,
}));

const {
  backfillSubscriberPriceLocks,
  ensurePriceLockForUser,
  ensurePriceLockForUserSafely,
  getPriceLockForUser,
  resolveCheckoutPriceForUser,
  snapshotFromSubscriptionPriceId,
} = await import('./price-lock.server');

const ROW = {
  id: 'lock_1',
  userId: 'user_1',
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: new Date('2026-10-29T00:00:00.000Z'),
  reconcileStatus: null,
  reconciledAt: null,
  createdAt: new Date('2026-10-29T00:00:00.000Z'),
};

beforeEach(() => {
  hoisted.selectQueue.length = 0;
  hoisted.inserted.length = 0;
  hoisted.captureError.mockClear();
  hoisted.mapping.mockReset();
});

describe('ensurePriceLockForUser', () => {
  it('returns the existing lock without writing (first write wins)', async () => {
    hoisted.selectQueue.push([ROW]);
    const lock = await ensurePriceLockForUser('user_1', 'checkout');
    expect(lock.priceVersionId).toBe('pro-2026-10-20-m12');
    expect(hoisted.inserted).toEqual([]);
  });

  it('locks a new signup to the current list version with the live Stripe ids', async () => {
    hoisted.selectQueue.push([], [ROW]);
    const lock = await ensurePriceLockForUser(
      'user_1',
      'signup',
      undefined,
      new Date('2026-10-29T00:00:00.000Z')
    );
    expect(hoisted.inserted).toHaveLength(1);
    expect(hoisted.inserted[0]).toMatchObject({
      userId: 'user_1',
      plan: 'pro',
      priceVersionId: 'pro-2026-10-20-m12',
      monthlyAmountCents: 1200,
      yearlyAmountCents: null,
      stripePriceIdMonthly: 'price_12',
      stripePriceIdYearly: null,
      source: 'signup',
    });
    expect(lock.monthlyAmountCents).toBe(1200);
  });

  it('throws when the insert did not persist (checkout then fails closed)', async () => {
    hoisted.selectQueue.push([], []);
    await expect(ensurePriceLockForUser('user_1', 'checkout')).rejects.toThrow(
      /did not persist/
    );
  });

  it('the safe wrapper never throws and reports to error tracking', async () => {
    hoisted.selectQueue.push([], []);
    await expect(
      ensurePriceLockForUserSafely('user_1', 'signup')
    ).resolves.toBeUndefined();
    expect(hoisted.captureError).toHaveBeenCalledTimes(1);
  });

  it('getPriceLockForUser is null when none exists', async () => {
    hoisted.selectQueue.push([]);
    expect(await getPriceLockForUser('user_1')).toBeNull();
  });
});

describe('snapshotFromSubscriptionPriceId', () => {
  it('maps a $12 subscription price to the registered $12 version', () => {
    hoisted.mapping.mockReturnValue({
      plan: 'pro',
      amount: 1200,
      interval: 'month',
      currency: 'usd',
    });
    expect(snapshotFromSubscriptionPriceId('price_12')?.priceVersionId).toBe(
      'pro-2026-10-20-m12'
    );
  });

  it('returns null for an unmapped price and for non-pro plans', () => {
    hoisted.mapping.mockReturnValue(null);
    expect(snapshotFromSubscriptionPriceId('price_x')).toBeNull();
    hoisted.mapping.mockReturnValue({
      plan: 'max',
      amount: 14900,
      interval: 'month',
      currency: 'usd',
    });
    expect(snapshotFromSubscriptionPriceId('price_max')).toBeNull();
  });
});

describe('backfillSubscriberPriceLocks', () => {
  it('creates a lock per paying subscriber from the price they pay and reports unmapped prices', async () => {
    hoisted.selectQueue.push([
      { id: 'u_12', priceId: 'price_12' },
      { id: 'u_199', priceId: 'price_199' },
      { id: 'u_unknown', priceId: 'price_unknown' },
    ]);
    hoisted.mapping.mockImplementation((id: string) =>
      id === 'price_12'
        ? { plan: 'pro', amount: 1200, interval: 'month', currency: 'usd' }
        : id === 'price_199'
          ? { plan: 'pro', amount: 19900, interval: 'month', currency: 'usd' }
          : null
    );
    const result = await backfillSubscriberPriceLocks();
    expect(result).toEqual({
      scanned: 3,
      created: 2,
      unmapped: ['u_unknown'],
    });
    expect(hoisted.inserted.map(v => [v.userId, v.priceVersionId])).toEqual([
      ['u_12', 'pro-2026-10-20-m12'],
      ['u_199', 'sub-price:price_199'],
    ]);
    expect(
      hoisted.inserted.every(v => v.source === 'backfill_subscription')
    ).toBe(true);
  });
});

describe('resolveCheckoutPriceForUser', () => {
  it('charges the locked price for the list id the browser sent', async () => {
    hoisted.selectQueue.push([ROW]);
    hoisted.mapping.mockReturnValue({
      plan: 'pro',
      interval: 'month',
      amount: 1900,
    });
    const { decision } = await resolveCheckoutPriceForUser(
      'user_1',
      'price_19'
    );
    expect(decision).toMatchObject({
      kind: 'locked',
      priceId: 'price_12',
      substituted: true,
    });
  });

  it('creates the lock on first need', async () => {
    hoisted.selectQueue.push([], [ROW]);
    hoisted.mapping.mockReturnValue({
      plan: 'pro',
      interval: 'month',
      amount: 1200,
    });
    const { decision } = await resolveCheckoutPriceForUser(
      'user_1',
      'price_12'
    );
    expect(hoisted.inserted).toHaveLength(1);
    expect(hoisted.inserted[0].source).toBe('checkout');
    expect(decision.kind).toBe('locked');
  });
});
