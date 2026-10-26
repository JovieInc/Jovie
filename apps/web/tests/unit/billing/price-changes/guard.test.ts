import { describe, expect, it } from 'vitest';
import { evaluatePriceChangeGuard } from '@/lib/billing/price-changes/guard';
import { PRICE_CHANGE_NOTICE_DAYS } from '@/lib/billing/price-changes/rules';
import type { ScheduledPriceChange } from '@/lib/billing/price-changes/types';

const RECORD: ScheduledPriceChange = {
  id: 'pro-month-12-to-15',
  priceKey: 'offer:pro:month',
  planName: 'Artist Presence',
  interval: 'month',
  currency: 'usd',
  oldAmountCents: 1200,
  newAmountCents: 1500,
  oldStripePriceEnvKey: 'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
  newStripePriceEnvKey: 'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY_V2',
  effectiveDate: '2027-01-15',
  scheduledAt: '2026-12-01',
  reason: 'Costs',
};
const BASE = { 'offer:pro:month': 1200, 'offer:max:month': 14900 };

const run = (
  overrides: Partial<Parameters<typeof evaluatePriceChangeGuard>[0]>
) =>
  evaluatePriceChangeGuard({
    baseLive: BASE,
    headLive: BASE,
    baseRecords: [],
    headRecords: [],
    today: '2026-12-01',
    ...overrides,
  });

describe('price-change guard', () => {
  it('is green when nothing changes', () => {
    expect(run({})).toEqual([]);
  });

  it('RED: an in-place edit of an existing live price needs a record', () => {
    const violations = run({ headLive: { ...BASE, 'offer:pro:month': 1500 } });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/without a merged scheduled-change record/);
  });

  it('RED: adding the record and flipping the price in the same commit is rejected', () => {
    const violations = run({
      headLive: { ...BASE, 'offer:pro:month': 1500 },
      headRecords: [RECORD],
      today: '2027-01-20',
    });
    expect(violations.join('\n')).toMatch(
      /without a merged scheduled-change record/
    );
  });

  it('GREEN: declaring the record with a full notice window passes', () => {
    expect(run({ headRecords: [RECORD] })).toEqual([]);
  });

  it('RED: a new record with less than N days notice fails', () => {
    const short = { ...RECORD, effectiveDate: '2026-12-20' };
    const violations = run({ headRecords: [short] });
    expect(violations.join('\n')).toContain(
      `at least ${PRICE_CHANGE_NOTICE_DAYS} days`
    );
  });

  it('RED: the flip before the effective date fails, after it passes', () => {
    const headLive = { ...BASE, 'offer:pro:month': 1500 };
    const early = run({
      headLive,
      baseRecords: [RECORD],
      headRecords: [RECORD],
      today: '2027-01-14',
    });
    expect(early.join('\n')).toMatch(/not effective until 2027-01-15/);
    expect(
      run({
        headLive,
        baseRecords: [RECORD],
        headRecords: [RECORD],
        today: '2027-01-15',
      })
    ).toEqual([]);
  });

  it('RED: the flip must match the record amounts exactly', () => {
    const violations = run({
      headLive: { ...BASE, 'offer:pro:month': 1600 },
      baseRecords: [RECORD],
      headRecords: [RECORD],
      today: '2027-02-01',
    });
    expect(violations.join('\n')).toMatch(
      /without a merged scheduled-change record/
    );
  });

  it('RED: a cancelled record cannot authorise the flip', () => {
    const cancelled = { ...RECORD, cancelledAt: '2026-12-10' };
    const violations = run({
      headLive: { ...BASE, 'offer:pro:month': 1500 },
      baseRecords: [RECORD],
      headRecords: [cancelled],
      today: '2027-02-01',
    });
    expect(violations.join('\n')).toMatch(
      /without a merged scheduled-change record/
    );
  });

  it('exempts brand-new plans and price decreases', () => {
    expect(run({ headLive: { ...BASE, 'offer:new:month': 4900 } })).toEqual([]);
    expect(run({ headLive: { ...BASE, 'offer:max:month': 9900 } })).toEqual([]);
  });

  it('RED: removing a live price is rejected', () => {
    expect(run({ headLive: { 'offer:pro:month': 1200 } }).join()).toMatch(
      /live price removed/
    );
  });

  it('merged records are immutable and cannot be deleted; cancellation may be added', () => {
    expect(
      run({
        baseRecords: [RECORD],
        headRecords: [{ ...RECORD, effectiveDate: '2026-12-05' }],
      }).join()
    ).toMatch(/was edited/);
    expect(run({ baseRecords: [RECORD], headRecords: [] }).join()).toMatch(
      /was removed/
    );
    expect(
      run({
        baseRecords: [RECORD],
        headRecords: [{ ...RECORD, cancelledAt: '2026-12-10' }],
      })
    ).toEqual([]);
  });

  it('rejects a record whose old amount is not the live price', () => {
    const wrong = { ...RECORD, oldAmountCents: 1000 };
    expect(run({ headRecords: [wrong] }).join()).toMatch(
      /does not match the live price/
    );
  });

  it('rejects annual changes until a renewal-aligned window exists', () => {
    const annual = {
      ...RECORD,
      interval: 'year',
    } as unknown as ScheduledPriceChange;
    expect(run({ headRecords: [annual] }).join()).toMatch(/only monthly/);
  });
});

describe('price-change guard: new keys', () => {
  it('RED: a new legacy/config key (existing-plan source) is not exempt', () => {
    const violations = evaluatePriceChangeGuard({
      baseLive: BASE,
      headLive: { ...BASE, 'config:proMonthly': 1500 },
      baseRecords: [],
      headRecords: [],
      today: '2026-12-01',
    });
    expect(violations.join()).toMatch(/new non-offer price key/);
  });
});
