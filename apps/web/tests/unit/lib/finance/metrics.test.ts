import { describe, expect, it } from 'vitest';
import {
  buildMoneyOverview,
  classifyTransactionScope,
  transactionNeedsReview,
} from '@/lib/finance/metrics';
import {
  ACTIVE,
  account,
  card,
  NOW,
  overview,
  tx,
} from '@/tests/fixtures/money-overview';

describe('classification', () => {
  it('routes creator/business categories to creator scope', () => {
    for (const c of ['creator:software', 'Business', 'business:ads'])
      expect(classifyTransactionScope(c)).toBe('creator');
    expect(classifyTransactionScope('groceries')).toBe('personal');
    expect(classifyTransactionScope(null)).toBe('personal');
  });
  it('flags empty, uncategorized, and review categories for review', () => {
    for (const c of [null, '  ', 'uncategorized', 'review'])
      expect(transactionNeedsReview(c)).toBe(true);
    expect(transactionNeedsReview('rent')).toBe(false);
  });
});

describe('buildMoneyOverview states', () => {
  it('returns no-connections with no institutions', () => {
    const o = buildMoneyOverview({
      institutions: [],
      accounts: [],
      transactions: [],
      now: NOW,
    });
    expect(o.state).toBe('no-connections');
    expect(o.cards.every(c => c.value === null)).toBe(true);
  });

  it('covers syncing, provider-error, and insufficient-history', () => {
    expect(
      buildMoneyOverview({
        institutions: [{ status: 'syncing' }],
        accounts: [account()],
        transactions: [],
        now: NOW,
      }).state
    ).toBe('syncing');
    expect(
      buildMoneyOverview({
        institutions: [{ status: 'error' }],
        accounts: [account()],
        transactions: [tx({ daysAgo: 40, amount: 10 })],
        now: NOW,
      }).state
    ).toBe('provider-error');
    const short = overview([tx({ daysAgo: 2, amount: -100 })]);
    expect(short.state).toBe('insufficient-history');
    expect(card(short, 'runway').confidence).toBe('insufficient');
  });

  it('handles no cash accounts and excluded accounts', () => {
    const o = buildMoneyOverview({
      institutions: [ACTIVE],
      accounts: [
        account({ id: 'c', accountType: 'credit', currentBalance: '-400' }),
        account({ id: 'h', accountType: 'hidden', currentBalance: '999' }),
        account({ id: 'u', accountType: null, currentBalance: '99999' }),
      ],
      transactions: [tx({ daysAgo: 20, amount: 100 })],
      now: NOW,
    });
    expect(o.counts.cashAccounts).toBe(0);
    expect(o.counts.excludedAccounts).toBe(1);
    expect(card(o, 'cash').value).toBeNull();
    expect(card(o, 'runway').value).toBeNull();
  });
});

describe('buildMoneyOverview metrics', () => {
  it('uses the ledger bank sign convention for totals and daily cash flow', () => {
    const o = overview([
      tx({ daysAgo: 40, amount: 1200, category: 'payroll' }),
      tx({ daysAgo: 20, amount: 1200, category: 'payroll' }),
      tx({ daysAgo: 10, amount: -300, category: 'rent' }),
      tx({ daysAgo: 5, amount: -200, category: 'creator:plugins' }),
    ]);
    expect(card(o, 'income').value).toBe(1200);
    expect(card(o, 'burn').value).toBe(500);
    expect(card(o, 'netCashFlow').value).toBe(700);
    expect(o.personal.income.value).toBe(1200);
    expect(o.personal.expenses.value).toBe(300);
    expect(o.creator.expenses.value).toBe(200);
    expect(o.trend.find(p => p.income === 1200)?.netCashFlow).toBe(1200);
    expect(o.trend.find(p => p.personalExpenses === 300)?.netCashFlow).toBe(
      -300
    );
    expect(o.trend.find(p => p.creatorExpenses === 200)?.netCashFlow).toBe(
      -200
    );
  });

  it('excludes non-effective ledger rows from economics and trend totals', () => {
    const baseline = [
      tx({ daysAgo: 40, amount: 100 }),
      tx({ daysAgo: 10, amount: -20 }),
    ];
    const ignored = [
      ...['pending', 'superseded', 'removed'].map(status =>
        tx({ daysAgo: 10, amount: -900, status })
      ),
      ...['transfer', 'cc_payment', 'reversal', 'duplicate'].map(flowKind =>
        tx({ daysAgo: 10, amount: 900, flowKind })
      ),
    ];
    const expected = overview(baseline);
    const actual = overview([...baseline, ...ignored]);
    expect(actual.cards).toEqual(expected.cards);
    expect(actual.personal).toEqual(expected.personal);
    expect(actual.creator).toEqual(expected.creator);
    expect(actual.trend).toEqual(expected.trend);
    expect(actual.reviewCount).toBe(expected.reviewCount);
  });

  it('does not compare an empty prior window merely because older history exists', () => {
    const o = overview([
      tx({ daysAgo: 90, amount: -600, category: 'rent' }),
      tx({ daysAgo: 10, amount: -300, category: 'rent' }),
    ]);
    expect(o.personal.expenses.deltaAbs).toBeNull();
    expect(o.personal.expenses.deltaPct).toBeNull();
    expect(card(o, 'burn').deltaAbs).toBeNull();
  });

  it('computes income, burn, net cash flow, and runway', () => {
    const o = buildMoneyOverview({
      institutions: [ACTIVE],
      accounts: [account({ currentBalance: '9000' })],
      transactions: [
        tx({ daysAgo: 40, amount: 3000, category: 'payroll' }),
        tx({ daysAgo: 10, amount: 3000, category: 'creator:royalties' }),
        tx({ daysAgo: 5, amount: -600, category: 'rent' }),
        tx({ daysAgo: 3, amount: -300, category: 'creator:plugins' }),
      ],
      now: NOW,
    });
    expect(o.state).toBe('ready');
    expect(card(o, 'income').value).toBe(3000); // 40d-ago payroll is prior window
    expect(card(o, 'income').deltaAbs).toBe(0);
    expect(card(o, 'income').favorable).toBeNull();
    expect(card(o, 'burn').value).toBe(900);
    expect(card(o, 'netCashFlow').value).toBe(2100);
    expect(card(o, 'netCashFlow').target).toBe('on-track');
    expect(card(o, 'runway').value).toBe(300); // 900/30=30/day → 9000/30
    expect(card(o, 'runway').target).toBe('on-track');
    expect(o.conclusion.tone).toBe('positive');
  });

  it('splits personal and creator economics', () => {
    const o = overview([
      tx({ daysAgo: 20, amount: -100, category: 'groceries' }),
      tx({ daysAgo: 20, amount: -50, category: 'creator:domain' }),
      tx({ daysAgo: 20, amount: 80, category: 'creator:royalties' }),
      tx({ daysAgo: 20, amount: 200, category: 'payroll' }),
    ]);
    expect(o.personal.expenses.value).toBe(100);
    expect(o.creator.expenses.value).toBe(50);
    expect(o.creator.income.value).toBe(80);
    expect(o.personal.income.value).toBe(200);
    expect(o.creator.net.value).toBe(30);
    expect(o.creator.hasIncome).toBe(true);
    for (const net of [o.personal.net, o.creator.net]) {
      expect(net.deltaAbs).toBeNull();
      expect(net.deltaPct).toBeNull();
    }
  });

  it('marks spend decreases favorable and income decreases unfavorable', () => {
    const o = overview([
      tx({ daysAgo: 45, amount: -600, category: 'rent' }),
      tx({ daysAgo: 10, amount: -300, category: 'rent' }),
      tx({ daysAgo: 45, amount: 1000, category: 'payroll' }),
      tx({ daysAgo: 10, amount: 500, category: 'payroll' }),
    ]);
    expect(o.personal.expenses.deltaAbs).toBe(-300);
    expect(o.personal.expenses.favorable).toBe(true);
    expect(o.personal.income.deltaAbs).toBe(-500);
    expect(o.personal.income.favorable).toBe(false);
  });

  it('reports negative cash flow and at-risk runway', () => {
    const o = buildMoneyOverview({
      institutions: [ACTIVE],
      accounts: [account({ currentBalance: '1500' })],
      transactions: [
        tx({ daysAgo: 20, amount: -1000, category: 'rent' }),
        tx({ daysAgo: 10, amount: -500, category: 'food' }),
      ],
      now: NOW,
    });
    expect(card(o, 'runway').value).toBe(30);
    expect(card(o, 'runway').target).toBe('at-risk');
    expect(o.conclusion.tone).toBe('negative');
  });

  it('counts review queue and flags stale data', () => {
    const o = overview([
      tx({ daysAgo: 10, amount: -5 }), // uncategorized → review
      tx({ daysAgo: 10, amount: -5, category: 'rent' }),
    ]);
    expect(o.reviewCount).toBe(1);
    expect(o.anomalies).toContain('stale-data');
  });

  it('produces a daily trend that reconstructs to the current balance', () => {
    const o = buildMoneyOverview({
      institutions: [ACTIVE],
      accounts: [account({ currentBalance: '1000' })],
      transactions: [
        tx({ daysAgo: 20, amount: 300, category: 'payroll' }),
        tx({ daysAgo: 10, amount: -100, category: 'rent' }),
      ],
      now: NOW,
    });
    expect(o.trend.length).toBeGreaterThanOrEqual(20);
    expect(o.trend.some(p => p.income === 300)).toBe(true);
    expect(o.trend[o.trend.length - 1].cashBalance).toBeCloseTo(1000, 5);
  });
});
