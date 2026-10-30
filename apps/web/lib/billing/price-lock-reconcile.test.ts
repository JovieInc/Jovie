import { describe, expect, it } from 'vitest';
import {
  alarmSeverity,
  judgeCandidate,
  type ReconcileCandidate,
  type ReconcileSubscription,
  reconcilePriceLocks,
} from './price-lock-reconcile';
import type { PriceLockSnapshot } from './price-versions';

const MAPPED = new Set(['price_12', 'price_19', 'price_190y', 'price_199']);
const isMapped = (id: string) => MAPPED.has(id);

const LOCK_12: PriceLockSnapshot = {
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
};

const sub = (
  over: Partial<ReconcileSubscription> = {}
): ReconcileSubscription => ({
  subscriptionId: 'sub_1',
  status: 'active',
  priceId: 'price_12',
  unitAmountCents: 1200,
  currency: 'usd',
  interval: 'month',
  ...over,
});

const cand = (
  userId: string,
  lock: PriceLockSnapshot | null,
  subscription: ReconcileSubscription | null
): ReconcileCandidate => ({ userId, lock, subscription });

describe('judgeCandidate', () => {
  it('ok when the price id matches the lock', () => {
    expect(judgeCandidate(cand('u', LOCK_12, sub()), isMapped)?.verdict).toBe(
      'ok'
    );
  });

  it('ok when a different price object carries the same amount', () => {
    expect(
      judgeCandidate(
        cand('u', LOCK_12, sub({ priceId: 'price_12b' })),
        isMapped
      )?.verdict
    ).toBe('ok');
  });

  it('overcharged when Stripe charges more than the lock (list price leaked in)', () => {
    const finding = judgeCandidate(
      cand('u', LOCK_12, sub({ priceId: 'price_19', unitAmountCents: 1900 })),
      isMapped
    );
    expect(finding?.verdict).toBe('overcharged');
    expect(alarmSeverity('overcharged')).toBe('blocked');
  });

  it('undercharged when Stripe charges less than the lock', () => {
    const lock19 = {
      ...LOCK_12,
      monthlyAmountCents: 1900,
      stripePriceIdMonthly: 'price_19',
    };
    const finding = judgeCandidate(
      cand('u', lock19, sub({ priceId: 'price_12', unitAmountCents: 1200 })),
      isMapped
    );
    expect(finding?.verdict).toBe('undercharged');
    expect(alarmSeverity('undercharged')).toBe('degraded');
  });

  it('overcharged when the subscription interval is not covered by the lock', () => {
    const finding = judgeCandidate(
      cand(
        'u',
        LOCK_12,
        sub({ priceId: 'price_190y', unitAmountCents: 19000, interval: 'year' })
      ),
      isMapped
    );
    expect(finding?.verdict).toBe('overcharged');
  });

  it('missing_lock for a paying subscriber without a lock', () => {
    expect(judgeCandidate(cand('u', null, sub()), isMapped)?.verdict).toBe(
      'missing_lock'
    );
  });

  it('unmapped_locked_price when the app cannot map the locked price', () => {
    const lock = { ...LOCK_12, stripePriceIdMonthly: 'price_unmapped' };
    expect(
      judgeCandidate(
        cand('u', lock, sub({ priceId: 'price_unmapped' })),
        isMapped
      )?.verdict
    ).toBe('unmapped_locked_price');
  });

  it('ignores subscriptions that are not charging, and missing subscriptions', () => {
    expect(
      judgeCandidate(cand('u', LOCK_12, sub({ status: 'canceled' })), isMapped)
    ).toBeNull();
    expect(judgeCandidate(cand('u', LOCK_12, null), isMapped)).toBeNull();
  });

  it('judges trialing and past_due subscriptions', () => {
    for (const status of ['trialing', 'past_due']) {
      expect(
        judgeCandidate(cand('u', LOCK_12, sub({ status })), isMapped)?.verdict
      ).toBe('ok');
    }
  });
});

describe('reconcilePriceLocks on test data', () => {
  // The test-data fixture from the brief: grandfathered $12 payers, a new $19
  // payer, one leak in each direction, a missing lock, and noise.
  const LOCK_19 = {
    ...LOCK_12,
    priceVersionId: 'pro-v2-19',
    monthlyAmountCents: 1900,
    stripePriceIdMonthly: 'price_19',
  };
  const fixture: ReconcileCandidate[] = [
    cand('grandfathered-1', LOCK_12, sub({ subscriptionId: 'sub_a' })),
    cand('grandfathered-2', LOCK_12, sub({ subscriptionId: 'sub_b' })),
    cand(
      'new-19',
      LOCK_19,
      sub({
        subscriptionId: 'sub_c',
        priceId: 'price_19',
        unitAmountCents: 1900,
      })
    ),
    cand(
      'leaked-to-19',
      LOCK_12,
      sub({
        subscriptionId: 'sub_d',
        priceId: 'price_19',
        unitAmountCents: 1900,
      })
    ),
    cand(
      'leaked-to-12',
      LOCK_19,
      sub({
        subscriptionId: 'sub_e',
        priceId: 'price_12',
        unitAmountCents: 1200,
      })
    ),
    cand('no-lock', null, sub({ subscriptionId: 'sub_f' })),
    cand(
      'canceled',
      LOCK_12,
      sub({ subscriptionId: 'sub_g', status: 'canceled' })
    ),
    cand('no-sub', LOCK_12, null),
  ];

  it('counts every verdict and raises an alarm for each mismatch only', () => {
    const summary = reconcilePriceLocks(fixture, isMapped);
    expect(summary.checked).toBe(6);
    expect(summary.counts).toEqual({
      ok: 3,
      overcharged: 1,
      undercharged: 1,
      missing_lock: 1,
      unmapped_locked_price: 0,
    });
    expect(summary.alarms.map(a => a.userId).sort()).toEqual([
      'leaked-to-12',
      'leaked-to-19',
      'no-lock',
    ]);
  });

  it('is clean when every subscriber is on their locked price', () => {
    const clean = reconcilePriceLocks(fixture.slice(0, 3), isMapped);
    expect(clean.alarms).toEqual([]);
    expect(clean.counts.ok).toBe(3);
  });
});
