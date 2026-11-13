import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  spine: vi.fn(),
  critical: vi.fn().mockResolvedValue(undefined),
}));

function makeClient() {
  const chain = (result: () => unknown[]) => {
    const node: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'leftJoin']) node[key] = () => node;
    node.limit = () => Promise.resolve(result());
    node.then = (resolve: (v: unknown) => void) => resolve(result());
    return node;
  };
  return {
    select: () => chain(() => hoisted.selectQueue.shift() ?? []),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          hoisted.updates.push(v);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
      }),
    }),
  };
}

vi.mock('@/lib/db', () => ({ db: makeClient() }));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: hoisted.spine,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: hoisted.critical,
  captureError: vi.fn(),
}));
vi.mock('@/lib/stripe/price-ids', () => ({
  getStripePriceIds: () => ({ artistVisibilityProMonthly: 'price_12' }),
}));
vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: (id: string) =>
    ['price_12', 'price_19'].includes(id)
      ? { plan: 'pro', amount: 1200, interval: 'month', currency: 'usd' }
      : null,
}));

const { runPriceLockReconcile, toReconcileSubscription } = await import(
  './price-lock-reconcile.server'
);

const lockRow = (userId: string, priceId: string, cents: number) => ({
  id: `lock_${userId}`,
  userId,
  plan: 'pro',
  priceVersionId: 'v',
  currency: 'usd',
  monthlyAmountCents: cents,
  yearlyAmountCents: null,
  stripePriceIdMonthly: priceId,
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: new Date('2026-10-29T00:00:00.000Z'),
  reconcileStatus: null,
  reconciledAt: null,
  createdAt: new Date('2026-10-29T00:00:00.000Z'),
});

const stripeSub = (
  id: string,
  priceId: string,
  cents: number,
  status = 'active'
) =>
  ({
    id,
    status,
    items: {
      data: [
        {
          price: {
            id: priceId,
            unit_amount: cents,
            currency: 'usd',
            recurring: { interval: 'month' },
          },
        },
      ],
    },
  }) as unknown as Stripe.Subscription;

async function* iterate(subs: Stripe.Subscription[]) {
  for (const s of subs) yield s;
}

beforeEach(() => {
  hoisted.selectQueue.length = 0;
  hoisted.updates.length = 0;
  hoisted.spine.mockClear();
  hoisted.critical.mockClear();
});

describe('runPriceLockReconcile on test data', () => {
  it('stamps verdicts and alarms Summer for the mismatches only', async () => {
    hoisted.selectQueue.push(
      [], // backfill: nobody missing a lock
      [
        {
          userId: 'ok',
          subscriptionId: 'sub_ok',
          lock: lockRow('ok', 'price_12', 1200),
        },
        {
          userId: 'leak',
          subscriptionId: 'sub_leak',
          lock: lockRow('leak', 'price_12', 1200),
        },
        { userId: 'nolock', subscriptionId: 'sub_nolock', lock: null },
        {
          userId: 'gone',
          subscriptionId: 'sub_gone',
          lock: lockRow('gone', 'price_12', 1200),
        },
      ]
    );
    const result = await runPriceLockReconcile({
      listSubscriptions: () =>
        iterate([
          stripeSub('sub_ok', 'price_12', 1200),
          stripeSub('sub_leak', 'price_19', 1900),
          stripeSub('sub_nolock', 'price_12', 1200),
        ]),
      now: new Date('2026-10-29T12:00:00.000Z'),
    });

    expect(result.summary.checked).toBe(3);
    expect(result.summary.counts).toMatchObject({
      ok: 1,
      overcharged: 1,
      missing_lock: 1,
    });
    // Summer is paged through the revenue-spine plan_mismatch channel.
    expect(hoisted.spine).toHaveBeenCalledTimes(2);
    expect(hoisted.spine).toHaveBeenCalledWith({
      stage: 'stripe_sync',
      failureCode: 'plan_mismatch',
      severity: 'blocked',
      userId: 'leak',
    });
    expect(hoisted.spine).toHaveBeenCalledWith({
      stage: 'stripe_sync',
      failureCode: 'plan_mismatch',
      severity: 'degraded',
      userId: 'nolock',
    });
    expect(hoisted.critical).toHaveBeenCalledTimes(1);
    // Verdict stamped on locks that exist (not on the missing one).
    expect(hoisted.updates.map(u => u.reconcileStatus).sort()).toEqual([
      'ok',
      'overcharged',
    ]);
  });

  it('raises nothing when every subscriber is on their locked price', async () => {
    hoisted.selectQueue.push(
      [],
      [
        {
          userId: 'a',
          subscriptionId: 'sub_a',
          lock: lockRow('a', 'price_12', 1200),
        },
      ]
    );
    const result = await runPriceLockReconcile({
      listSubscriptions: () => iterate([stripeSub('sub_a', 'price_12', 1200)]),
    });
    expect(result.summary.alarms).toEqual([]);
    expect(hoisted.spine).not.toHaveBeenCalled();
    expect(hoisted.critical).not.toHaveBeenCalled();
  });
});

describe('toReconcileSubscription', () => {
  it('reads price, amount and interval from the first item', () => {
    expect(
      toReconcileSubscription(stripeSub('sub_1', 'price_12', 1200))
    ).toEqual({
      subscriptionId: 'sub_1',
      status: 'active',
      priceId: 'price_12',
      unitAmountCents: 1200,
      currency: 'usd',
      interval: 'month',
    });
  });
});
