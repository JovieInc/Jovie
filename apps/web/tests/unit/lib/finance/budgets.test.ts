import { describe, expect, it } from 'vitest';
import type { FinanceBudgetTarget } from '@/lib/db/schema/finance';
import {
  assessBudgetConfidence,
  BUDGET_BASELINE_MONTH,
  classifyBudgetCategory,
  FINANCE_BUDGET_CATEGORIES,
  type FinanceBudgetCategory,
  isFinanceBudgetCategory,
  isIncomeCategory,
  isValidBudgetMonth,
  isValidBudgetScope,
  projectMonthEnd,
  resolveBudgetTarget,
  sumActualsByCategory,
  summarizeBudget,
} from '@/lib/finance/budgets';

const OWNER = '11111111-2222-3333-4444-555555555555';
const ACCOUNT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ACCOUNT = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const MONTH_END = new Date('2026-11-01T00:00:00Z');

function target(
  category: string,
  month: string,
  amount: number | string
): FinanceBudgetTarget {
  return {
    id: 't',
    ownerUserId: OWNER,
    category,
    month,
    targetAmount: String(amount),
    currency: 'USD',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function tx(
  amount: number,
  category: string | null,
  accountId = ACCOUNT,
  occurredAt: Date | string = new Date('2026-10-10T00:00:00Z')
) {
  return {
    amount: String(amount),
    category,
    accountId,
    occurredAt: occurredAt as Date,
  };
}

const zeroSums = () =>
  Object.fromEntries(FINANCE_BUDGET_CATEGORIES.map(c => [c, 0])) as Record<
    FinanceBudgetCategory,
    number
  >;

const confidenceInput = {
  transactionCount: 100,
  unclassifiedCount: 0,
  unclassifiedTotal: 0,
  actualTotal: 100,
  daysElapsed: 31,
  daysInMonth: 31,
};

describe('category and month guards', () => {
  it('recognizes only canonical budget categories', () => {
    for (const category of FINANCE_BUDGET_CATEGORIES) {
      expect(isFinanceBudgetCategory(category)).toBe(true);
    }
    expect(isFinanceBudgetCategory('rent')).toBe(false);
    expect(isFinanceBudgetCategory('')).toBe(false);
    expect(isFinanceBudgetCategory(42)).toBe(false);
    expect(isFinanceBudgetCategory(null)).toBe(false);
  });

  it('treats exactly the two income buckets as income', () => {
    expect(FINANCE_BUDGET_CATEGORIES.filter(c => isIncomeCategory(c))).toEqual([
      'personal_income',
      'creator_income',
    ]);
  });

  it.each([
    ['2026-01', true],
    ['2026-09', true],
    ['2026-10', true],
    ['2026-12', true],
    ['2026-13', false],
    ['2026-00', false],
    ['10-2026', false],
    ['2026-1', false],
    ['26-10', false],
    ['2026-10x', false],
    ['x2026-10', false],
    ['2026/10', false],
  ])('isValidBudgetMonth(%s) → %s', (value, valid) => {
    expect(isValidBudgetMonth(value)).toBe(valid);
  });

  it('rejects non-string months', () => {
    expect(isValidBudgetMonth(202610)).toBe(false);
    expect(isValidBudgetMonth(null)).toBe(false);
  });

  it('accepts the baseline sentinel or a month as a scope', () => {
    expect(BUDGET_BASELINE_MONTH).toBe('baseline');
    expect(isValidBudgetScope('baseline')).toBe(true);
    expect(isValidBudgetScope('2026-10')).toBe(true);
    expect(isValidBudgetScope('Baseline')).toBe(false);
    expect(isValidBudgetScope('2026-13')).toBe(false);
    expect(isValidBudgetScope(undefined)).toBe(false);
  });
});

describe('classifyBudgetCategory', () => {
  it.each<[string, FinanceBudgetCategory]>([
    ['personal_essentials', 'personal_essentials'],
    ['rent', 'personal_essentials'],
    ['mortgage', 'personal_essentials'],
    ['utilities', 'personal_essentials'],
    ['groceries', 'personal_essentials'],
    ['food_and_drink', 'personal_essentials'],
    ['groceries_and_dining', 'personal_essentials'],
    ['healthcare', 'personal_essentials'],
    ['medical', 'personal_essentials'],
    ['insurance', 'personal_essentials'],
    ['transportation', 'personal_essentials'],
    ['personal_discretionary', 'personal_discretionary'],
    ['entertainment', 'personal_discretionary'],
    ['travel', 'personal_discretionary'],
    ['shopping', 'personal_discretionary'],
    ['general_merchandise', 'personal_discretionary'],
    ['personal_care', 'personal_discretionary'],
    ['creator_operating', 'creator_operating'],
    ['business_software', 'creator_operating'],
    ['software', 'creator_operating'],
    ['subscriptions', 'creator_operating'],
    ['equipment', 'creator_operating'],
    ['studio', 'creator_operating'],
    ['contractor', 'creator_operating'],
    ['contractor_services', 'creator_operating'],
    ['creator_investment', 'creator_investment'],
    ['advertising', 'creator_investment'],
    ['marketing', 'creator_investment'],
    ['campaign', 'creator_investment'],
    ['promotion', 'creator_investment'],
    ['taxes_reserves', 'taxes_reserves'],
    ['tax', 'taxes_reserves'],
    ['taxes', 'taxes_reserves'],
    ['savings', 'taxes_reserves'],
    ['reserves', 'taxes_reserves'],
    ['personal_income', 'personal_income'],
    ['salary', 'personal_income'],
    ['payroll', 'personal_income'],
    ['wages', 'personal_income'],
    ['creator_income', 'creator_income'],
    ['royalties', 'creator_income'],
    ['royalty', 'creator_income'],
    ['streaming', 'creator_income'],
    ['merchandise', 'creator_income'],
    ['tips', 'creator_income'],
    ['payout', 'creator_income'],
  ])('maps %s → %s', (raw, bucket) => {
    expect(classifyBudgetCategory(raw)).toBe(bucket);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(classifyBudgetCategory('  ROYALTIES\t')).toBe('creator_income');
    expect(classifyBudgetCategory('Rent')).toBe('personal_essentials');
  });

  it.each([['mystery'], [''], ['   '], [null], [undefined], ['toString']])(
    'returns null for %j',
    raw => {
      expect(classifyBudgetCategory(raw)).toBeNull();
    }
  );
});

describe('resolveBudgetTarget', () => {
  const targets = [
    target('personal_essentials', BUDGET_BASELINE_MONTH, 2000),
    target('personal_essentials', '2026-10', '2500.5000'),
    target('creator_income', '2026-11', 999),
    target('taxes_reserves', '2026-10', 0),
  ];

  it('prefers the month override and parses its numeric amount', () => {
    expect(
      resolveBudgetTarget(targets, 'personal_essentials', '2026-10')
    ).toEqual({
      category: 'personal_essentials',
      amount: 2500.5,
      source: 'override',
    });
  });

  it('falls back to the category baseline', () => {
    expect(
      resolveBudgetTarget(targets, 'personal_essentials', '2026-11')
    ).toEqual({
      category: 'personal_essentials',
      amount: 2000,
      source: 'baseline',
    });
  });

  it('never uses another category or month', () => {
    expect(resolveBudgetTarget(targets, 'creator_income', '2026-10')).toEqual({
      category: 'creator_income',
      amount: null,
      source: 'none',
    });
  });

  it('keeps an explicit zero override', () => {
    expect(resolveBudgetTarget(targets, 'taxes_reserves', '2026-10')).toEqual({
      category: 'taxes_reserves',
      amount: 0,
      source: 'override',
    });
  });
});

describe('sumActualsByCategory', () => {
  it('returns every bucket, signed by bucket direction', () => {
    expect(
      sumActualsByCategory([
        tx(100, 'rent'),
        tx(50.25, 'groceries'),
        tx(-20, 'rent'),
        tx(-300, 'royalties'),
        tx(25, 'royalties'),
        tx(-80, 'salary'),
        tx(10, 'weird'),
        tx(-5, null),
      ])
    ).toEqual({
      ...zeroSums(),
      personal_essentials: 130.25,
      creator_income: 275,
      personal_income: 80,
      unclassifiedTotal: 15,
      unclassifiedCount: 2,
    });
  });

  it('returns zeros for no transactions', () => {
    expect(sumActualsByCategory([])).toEqual({
      ...zeroSums(),
      unclassifiedTotal: 0,
      unclassifiedCount: 0,
    });
  });

  it('only includes listed accounts, including for unclassified rows', () => {
    expect(
      sumActualsByCategory(
        [
          tx(100, 'rent', ACCOUNT),
          tx(60, 'rent', OTHER_ACCOUNT),
          tx(7, null, OTHER_ACCOUNT),
        ],
        [ACCOUNT]
      )
    ).toEqual({
      ...zeroSums(),
      personal_essentials: 100,
      unclassifiedTotal: 0,
      unclassifiedCount: 0,
    });
  });

  it.each([
    ['null', null],
    ['empty list', []],
  ])('includes all accounts when the inclusion list is %s', (_l, ids) => {
    expect(
      sumActualsByCategory(
        [tx(100, 'rent', ACCOUNT), tx(60, 'rent', OTHER_ACCOUNT)],
        ids
      ).personal_essentials
    ).toBe(160);
  });
});

describe('projectMonthEnd', () => {
  it('projects linearly from elapsed days', () => {
    expect(projectMonthEnd(310, 10, 31)).toBe(961);
    expect(projectMonthEnd(10, 1, 30)).toBe(300);
  });

  it('clamps elapsed days to the month length', () => {
    expect(projectMonthEnd(310, 40, 31)).toBe(310);
    expect(projectMonthEnd(310, 31, 31)).toBe(310);
  });

  it('returns actual when there is no elapsed time or month length', () => {
    expect(projectMonthEnd(42, 0, 31)).toBe(42);
    expect(projectMonthEnd(42, -1, 31)).toBe(42);
    expect(projectMonthEnd(42, 5, 0)).toBe(42);
  });
});

describe('assessBudgetConfidence', () => {
  it('is low without transactions', () => {
    expect(
      assessBudgetConfidence({ ...confidenceInput, transactionCount: 0 })
    ).toBe('low');
  });

  it.each([
    { unclassifiedCount: 0, daysElapsed: 31, want: 'high' },
    { unclassifiedCount: 10, daysElapsed: 31, want: 'high' },
    { unclassifiedCount: 11, daysElapsed: 31, want: 'medium' },
    { unclassifiedCount: 25, daysElapsed: 31, want: 'medium' },
    { unclassifiedCount: 26, daysElapsed: 31, want: 'low' },
  ])(
    'unclassified $unclassifiedCount/100 → $want',
    ({ unclassifiedCount, daysElapsed, want }) => {
      expect(
        assessBudgetConfidence({
          ...confidenceInput,
          unclassifiedCount,
          daysElapsed,
        })
      ).toBe(want);
    }
  );

  it.each([
    { daysElapsed: 7, want: 'low' },
    { daysElapsed: 8, want: 'medium' },
    { daysElapsed: 15, want: 'medium' },
    { daysElapsed: 16, want: 'high' },
  ])('elapsed $daysElapsed/32 days → $want', ({ daysElapsed, want }) => {
    expect(
      assessBudgetConfidence({
        ...confidenceInput,
        daysElapsed,
        daysInMonth: 32,
      })
    ).toBe(want);
  });

  it('is low when the month length is zero', () => {
    expect(assessBudgetConfidence({ ...confidenceInput, daysInMonth: 0 })).toBe(
      'low'
    );
  });
});

describe('summarizeBudget', () => {
  const lineFor = (
    summary: ReturnType<typeof summarizeBudget>,
    category: FinanceBudgetCategory
  ) => summary.lines.find(l => l.category === category);

  it('builds a complete line per category with variance and projection', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [
        target('personal_discretionary', BUDGET_BASELINE_MONTH, 500),
        target('creator_income', '2026-10', 4000),
      ],
      transactions: [tx(300, 'entertainment'), tx(-1000, 'royalties')],
      now: new Date('2026-10-10T12:00:00Z'),
    });
    expect(summary.month).toBe('2026-10');
    expect(summary.lines.map(l => l.category)).toEqual([
      ...FINANCE_BUDGET_CATEGORIES,
    ]);
    // Day 10 of 31 elapsed.
    expect(lineFor(summary, 'personal_discretionary')).toEqual({
      category: 'personal_discretionary',
      target: 500,
      actual: 300,
      variance: -200,
      variancePercent: -0.4,
      direction: 'favorable',
      projectedMonthEnd: 930,
      source: 'baseline',
    });
    expect(lineFor(summary, 'creator_income')).toEqual({
      category: 'creator_income',
      target: 4000,
      actual: 1000,
      variance: -3000,
      variancePercent: -0.75,
      direction: 'unfavorable',
      projectedMonthEnd: 3100,
      source: 'override',
    });
    expect(lineFor(summary, 'taxes_reserves')).toEqual({
      category: 'taxes_reserves',
      target: null,
      actual: 0,
      variance: null,
      variancePercent: null,
      direction: 'on_target',
      projectedMonthEnd: 0,
      source: 'none',
    });
  });

  it('counts the first instant of the month as one elapsed day', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [],
      transactions: [tx(10, 'rent')],
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(lineFor(summary, 'personal_essentials')?.projectedMonthEnd).toBe(
      310
    );
  });

  it('does not project before the month starts and stops at month end', () => {
    const before = summarizeBudget({
      month: '2026-10',
      targets: [],
      transactions: [tx(10, 'rent')],
      now: new Date('2026-09-30T23:59:59Z'),
    });
    expect(lineFor(before, 'personal_essentials')?.projectedMonthEnd).toBe(10);
    expect(before.confidence).toBe('low');
    const after = summarizeBudget({
      month: '2026-10',
      targets: [],
      transactions: [tx(10, 'rent')],
      now: MONTH_END,
    });
    expect(lineFor(after, 'personal_essentials')?.projectedMonthEnd).toBe(10);
    expect(after.confidence).toBe('high');
  });

  it('uses the real UTC month length, including leap years', () => {
    const feb = (month: string) =>
      lineFor(
        summarizeBudget({
          month,
          targets: [],
          transactions: [tx(10, 'rent')],
          now: new Date(`${month}-01T12:00:00Z`),
        }),
        'personal_essentials'
      )?.projectedMonthEnd;
    expect(feb('2026-02')).toBe(280);
    expect(feb('2028-02')).toBe(290);
    expect(feb('2026-04')).toBe(300);
  });

  it('treats differences within 0.5% of target as on target', () => {
    const direction = (category: string, amount: number, actual: number) =>
      lineFor(
        summarizeBudget({
          month: '2026-10',
          targets: [target(category, BUDGET_BASELINE_MONTH, amount)],
          transactions: [
            tx(category === 'creator_income' ? -actual : actual, category),
          ],
          now: MONTH_END,
        }),
        category as FinanceBudgetCategory
      )?.direction;
    expect(direction('creator_operating', 1000, 1005)).toBe('on_target');
    expect(direction('creator_operating', 1000, 995)).toBe('on_target');
    expect(direction('creator_operating', 1000, 1005.5)).toBe('unfavorable');
    expect(direction('creator_operating', 1000, 994.5)).toBe('favorable');
    expect(direction('creator_income', 1000, 995)).toBe('on_target');
    expect(direction('creator_income', 1000, 994.5)).toBe('unfavorable');
    expect(direction('creator_income', 1000, 1005.5)).toBe('favorable');
    // A zero target still allows one cent of noise.
    expect(direction('creator_operating', 0, 0.01)).toBe('on_target');
    expect(direction('creator_operating', 0, 0.02)).toBe('unfavorable');
  });

  it('reports null variance percent for a zero target', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [target('creator_operating', BUDGET_BASELINE_MONTH, 0)],
      transactions: [tx(50, 'software')],
      now: MONTH_END,
    });
    expect(lineFor(summary, 'creator_operating')).toMatchObject({
      target: 0,
      variance: 50,
      variancePercent: null,
      direction: 'unfavorable',
    });
  });

  it('emits review actions only for unfavorable lines with targets, in category order', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [
        target('personal_essentials', BUDGET_BASELINE_MONTH, 1000),
        target('personal_discretionary', BUDGET_BASELINE_MONTH, 500),
        target('creator_operating', BUDGET_BASELINE_MONTH, 100),
        target('creator_income', BUDGET_BASELINE_MONTH, 4000),
        target('personal_income', BUDGET_BASELINE_MONTH, 10),
      ],
      transactions: [
        tx(700.456, 'entertainment'),
        tx(100, 'software'),
        tx(500, 'rent'),
        tx(-1000, 'royalties'),
        tx(-20, 'salary'),
        tx(999, 'travel', OTHER_ACCOUNT),
        tx(50, 'advertising'),
      ],
      now: MONTH_END,
    });
    expect(summary.reviewActions).toEqual([
      'over_budget:personal_discretionary:1199.46',
      'income_gap:creator_income:3000.00',
    ]);
  });

  it('computes totals and sustainability break-evens', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [
        target('personal_essentials', BUDGET_BASELINE_MONTH, 2000),
        target('personal_discretionary', BUDGET_BASELINE_MONTH, 500),
        target('creator_operating', BUDGET_BASELINE_MONTH, 800),
        target('creator_investment', BUDGET_BASELINE_MONTH, 300),
        target('taxes_reserves', BUDGET_BASELINE_MONTH, 400),
        target('personal_income', BUDGET_BASELINE_MONTH, 600),
        target('creator_income', BUDGET_BASELINE_MONTH, 3000),
      ],
      transactions: [
        tx(100, 'rent'),
        tx(40, 'travel'),
        tx(30, 'software'),
        tx(20, 'advertising'),
        tx(10, 'tax'),
        tx(-200, 'salary'),
        tx(-700, 'royalties'),
      ],
      now: MONTH_END,
    });
    expect(summary.totals).toEqual({
      targetExpenses: 4000,
      actualExpenses: 200,
      targetIncome: 3600,
      actualIncome: 900,
    });
    expect(summary.sustainability).toEqual({
      creatorCostBreakEven: 500,
      essentialsBreakEven: 2500,
      survivalBurnBreakEven: 3400,
      survivalBurnTarget: 4000,
      creatorIncomeCoverageTarget: 0.75,
    });
  });

  it('floors break-evens at zero and has no coverage without burn targets', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [target('personal_income', BUDGET_BASELINE_MONTH, 10_000)],
      transactions: [],
      now: MONTH_END,
    });
    expect(summary.sustainability).toEqual({
      creatorCostBreakEven: 0,
      essentialsBreakEven: 0,
      survivalBurnBreakEven: 0,
      survivalBurnTarget: 0,
      creatorIncomeCoverageTarget: null,
    });
    expect(summary.dataFreshness.latestTransactionAt).toBeNull();
    expect(summary.confidence).toBe('low');
  });

  it('reports the latest transaction time from Date or string values', () => {
    const summary = summarizeBudget({
      month: '2026-10',
      targets: [],
      transactions: [
        tx(10, 'rent', ACCOUNT, new Date('2026-10-03T00:00:00Z')),
        tx(10, 'rent', ACCOUNT, '2026-10-20T00:00:00.000Z'),
        tx(10, 'rent', ACCOUNT, new Date('2026-10-05T00:00:00Z')),
      ],
      now: MONTH_END,
    });
    expect(summary.dataFreshness.latestTransactionAt).toBe(
      '2026-10-20T00:00:00.000Z'
    );
  });

  it('scores confidence on included accounts only', () => {
    const transactions = [
      tx(10, 'rent', ACCOUNT),
      tx(10, 'mystery', ACCOUNT),
      ...Array.from({ length: 8 }, () => tx(10, 'rent', OTHER_ACCOUNT)),
    ];
    // Included: 1 of 2 unclassified (50%) → low. Counting every account would
    // dilute it to 10% and wrongly report high confidence.
    expect(
      summarizeBudget({
        month: '2026-10',
        targets: [],
        transactions,
        includedAccountIds: [ACCOUNT],
        now: MONTH_END,
      }).confidence
    ).toBe('low');
    expect(
      summarizeBudget({
        month: '2026-10',
        targets: [],
        transactions,
        includedAccountIds: [],
        now: MONTH_END,
      }).confidence
    ).toBe('high');
  });
});
