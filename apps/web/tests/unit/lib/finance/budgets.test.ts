import { describe, expect, it } from 'vitest';
import type { FinanceBudgetTarget } from '@/lib/db/schema/finance';
import {
  assessBudgetConfidence,
  BUDGET_BASELINE_MONTH,
  classifyBudgetCategory,
  isValidBudgetMonth,
  projectMonthEnd,
  resolveBudgetTarget,
  sumActualsByCategory,
  summarizeBudget,
} from '@/lib/finance/budgets';

const OWNER = '11111111-2222-3333-4444-555555555555';
const ACCOUNT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ACCOUNT = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

function target(
  category: string,
  month: string,
  amount: number
): FinanceBudgetTarget {
  return {
    id: 't',
    ownerUserId: OWNER,
    category,
    month,
    targetAmount: String(amount),
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function tx(
  amount: number,
  category: string | null,
  accountId = ACCOUNT,
  occurredAt = new Date('2026-10-10T00:00:00Z')
) {
  return {
    amount: String(amount),
    category,
    accountId,
    occurredAt,
  };
}

describe('budget month validation', () => {
  it('accepts YYYY-MM and rejects malformed months', () => {
    expect(isValidBudgetMonth('2026-10')).toBe(true);
    expect(isValidBudgetMonth('2026-13')).toBe(false);
    expect(isValidBudgetMonth('2026-00')).toBe(false);
    expect(isValidBudgetMonth('10-2026')).toBe(false);
    expect(isValidBudgetMonth('2026-1')).toBe(false);
  });
});

describe('classification', () => {
  it('maps provider categories to budget buckets case-insensitively', () => {
    expect(classifyBudgetCategory('Rent')).toBe('personal_essentials');
    expect(classifyBudgetCategory('ROYALTIES')).toBe('creator_income');
    expect(classifyBudgetCategory(' advertising ')).toBe('creator_investment');
  });

  it('returns null for unknown categories so they stay countable', () => {
    expect(classifyBudgetCategory('mystery')).toBeNull();
    expect(classifyBudgetCategory(null)).toBeNull();
  });
});

describe('target precedence', () => {
  const targets = [
    target('personal_essentials', BUDGET_BASELINE_MONTH, 2000),
    target('personal_essentials', '2026-10', 2500),
  ];

  it('prefers the month-specific override over the baseline', () => {
    const r = resolveBudgetTarget(targets, 'personal_essentials', '2026-10');
    expect(r.amount).toBe(2500);
    expect(r.source).toBe('override');
  });

  it('falls back to the baseline for months without an override', () => {
    const r = resolveBudgetTarget(targets, 'personal_essentials', '2026-11');
    expect(r.amount).toBe(2000);
    expect(r.source).toBe('baseline');
  });

  it('reports none when neither override nor baseline exists', () => {
    const r = resolveBudgetTarget(targets, 'creator_income', '2026-10');
    expect(r.amount).toBeNull();
    expect(r.source).toBe('none');
  });
});

describe('actuals', () => {
  it('sums expense outflows and income inflows per bucket', () => {
    const actuals = sumActualsByCategory([
      tx(100, 'rent'),
      tx(50, 'groceries'),
      tx(-300, 'royalties'),
      tx(-80, 'salary'),
    ]);
    expect(actuals.personal_essentials).toBe(150);
    expect(actuals.creator_income).toBe(300);
    expect(actuals.personal_income).toBe(80);
  });

  it('nets refunds against the expense bucket so totals reconcile', () => {
    const actuals = sumActualsByCategory([tx(100, 'rent'), tx(-20, 'rent')]);
    expect(actuals.personal_essentials).toBe(80);
  });

  it('respects account inclusion settings', () => {
    const actuals = sumActualsByCategory(
      [tx(100, 'rent', ACCOUNT), tx(60, 'rent', OTHER_ACCOUNT)],
      [ACCOUNT]
    );
    expect(actuals.personal_essentials).toBe(100);
  });

  it('counts unclassified rows for confidence', () => {
    const actuals = sumActualsByCategory([tx(10, 'weird'), tx(5, null)]);
    expect(actuals.unclassifiedCount).toBe(2);
    expect(actuals.unclassifiedTotal).toBe(15);
  });
});

describe('variance direction is category-aware', () => {
  const targets = [
    target('personal_discretionary', BUDGET_BASELINE_MONTH, 500),
    target('creator_income', BUDGET_BASELINE_MONTH, 4000),
  ];

  it('lower spending is favorable', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets,
      transactions: [tx(300, 'entertainment'), tx(-4000, 'royalties')],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const line = summary.lines.find(
      l => l.category === 'personal_discretionary'
    );
    expect(line?.direction).toBe('favorable');
    expect(line?.variance).toBe(-200);
  });

  it('lower income is unfavorable and produces an income_gap action', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets,
      transactions: [tx(100, 'entertainment'), tx(-1000, 'royalties')],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const line = summary.lines.find(l => l.category === 'creator_income');
    expect(line?.direction).toBe('unfavorable');
    expect(line?.variance).toBe(-3000);
    expect(summary.reviewActions).toContain(
      'income_gap:creator_income:3000.00'
    );
  });

  it('over-budget spend produces an over_budget action', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets,
      transactions: [tx(700, 'entertainment'), tx(-4000, 'royalties')],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(summary.reviewActions).toContain(
      'over_budget:personal_discretionary:200.00'
    );
  });
});

describe('projection and confidence', () => {
  it('projects month-end linearly from elapsed days', () => {
    expect(projectMonthEnd(310, 10, 31)).toBeCloseTo(961);
    expect(projectMonthEnd(0, 0, 31)).toBe(0);
  });

  it('reports low confidence with no data and mid-month setup', () => {
    expect(
      assessBudgetConfidence({
        transactionCount: 0,
        unclassifiedCount: 0,
        unclassifiedTotal: 0,
        actualTotal: 0,
        daysElapsed: 15,
        daysInMonth: 31,
      })
    ).toBe('low');
    expect(
      assessBudgetConfidence({
        transactionCount: 20,
        unclassifiedCount: 0,
        unclassifiedTotal: 0,
        actualTotal: 100,
        daysElapsed: 3,
        daysInMonth: 31,
      })
    ).toBe('low');
  });
});

describe('sustainability', () => {
  it('computes survival burn, coverage, and break-even creator income', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [
        target('personal_essentials', BUDGET_BASELINE_MONTH, 2000),
        target('personal_discretionary', BUDGET_BASELINE_MONTH, 500),
        target('creator_operating', BUDGET_BASELINE_MONTH, 800),
        target('creator_investment', BUDGET_BASELINE_MONTH, 200),
        target('taxes_reserves', BUDGET_BASELINE_MONTH, 500),
        target('personal_income', BUDGET_BASELINE_MONTH, 1000),
        target('creator_income', BUDGET_BASELINE_MONTH, 3000),
      ],
      transactions: [],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const s = summary.sustainability;
    expect(s.survivalBurnTarget).toBe(4000);
    // Creator income needed to cover creator costs alone (income-independent).
    expect(s.creatorCostBreakEven).toBe(0);
    // Essentials + creator costs minus personal income.
    expect(s.essentialsBreakEven).toBe(2000);
    // Full survival burn minus personal income.
    expect(s.survivalBurnBreakEven).toBe(3000);
    expect(s.creatorIncomeCoverageTarget).toBeCloseTo(0.75);
  });
});

describe('sparse data and irregular income', () => {
  it('handles a month with a single irregular royalty deposit', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [target('creator_income', BUDGET_BASELINE_MONTH, 3000)],
      transactions: [tx(-12000, 'royalties')],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const line = summary.lines.find(l => l.category === 'creator_income');
    expect(line?.actual).toBe(12000);
    expect(line?.direction).toBe('favorable');
  });

  it('reports latest transaction timestamp for data freshness', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [],
      transactions: [
        tx(10, 'rent', ACCOUNT, new Date('2026-10-03T00:00:00Z')),
        tx(10, 'rent', ACCOUNT, new Date('2026-10-20T00:00:00Z')),
      ],
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(summary.dataFreshness.latestTransactionAt).toBe(
      '2026-10-20T00:00:00.000Z'
    );
  });
});
