import { describe, expect, it } from 'vitest';
import type {
  AccountInput,
  ClassifiedTransaction,
  MetricEngineInput,
  MetricId,
} from '@/lib/finance/metrics/contracts';
import {
  CREATOR_SAFE_METRIC_IDS,
  computeMetrics,
  projectCreatorSafeMetrics,
} from '@/lib/finance/metrics/engine';
import {
  buildMetricSnapshot,
  recomputeSnapshot,
  snapshotFingerprint,
} from '@/lib/finance/metrics/snapshot';

const OWNER = '11111111-2222-3333-4444-555555555555';
const AS_OF = '2026-09-15T00:00:00.000Z';
const SYNC = '2026-09-14T12:00:00.000Z';
const HISTORY_START = '2026-01-01T00:00:00.000Z';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const asOfMs = Date.parse(AS_OF);
const ago = (ms: number) => new Date(asOfMs - ms).toISOString();

const acct = (
  id: string,
  cents: number | null,
  over: Partial<AccountInput> = {}
): AccountInput => ({
  id,
  include: true,
  availableBalanceCents: cents,
  currentBalanceCents: cents,
  balanceUpdatedAt: SYNC,
  ...over,
});

let seq = 0;
const tx = (
  occurredAt: string,
  amountCents: number,
  classification: ClassifiedTransaction['classification'],
  over: Partial<ClassifiedTransaction> = {}
): ClassifiedTransaction => ({
  id: `tx_${(seq++).toString().padStart(3, '0')}`,
  accountId: 'a1',
  occurredAt,
  amountCents,
  classification,
  ...over,
});

const day = (n: number) =>
  `2026-09-${String(n).padStart(2, '0')}T00:00:00.000Z`;

const baseInput = (
  over: Partial<MetricEngineInput> = {}
): MetricEngineInput => ({
  ownerUserId: OWNER,
  asOf: AS_OF,
  window: 'rolling_30d',
  accounts: [acct('a1', 1_000_000)],
  transactions: [],
  lastSyncAt: SYNC,
  historyStartAt: HISTORY_START,
  ...over,
});

/**
 * Canonical scenario over a fully covered rolling 30-day window
 * [2026-08-16, 2026-09-15) and its prior window [2026-07-17, 2026-08-16).
 * Amounts divide evenly by 30 so monthly rates are exact.
 */
const scenario = () => {
  const current = [
    tx(day(1), -60_000, 'personal_essential', { id: 'ess', ruleId: 'r2' }),
    tx(day(2), -30_000, 'personal_discretionary', { id: 'disc' }),
    tx(day(3), -40_000, 'creator_operating', { id: 'op' }),
    tx(day(4), -9_000, 'creator_investment', { id: 'inv' }),
    tx(day(5), 150_000, 'creator_income', { id: 'ci', ruleId: 'r2' }),
    tx(day(6), 24_000, 'personal_income', { id: 'pi', ruleId: 'r1' }),
    tx(day(7), -5_000, 'internal_transfer', { id: 'xfer' }),
    tx(day(8), -7_000, 'personal_essential', { id: 'hidden', accountId: 'a3' }),
  ];
  const prior = [
    tx('2026-08-01T00:00:00.000Z', -30_000, 'personal_essential', {
      id: 'p-ess',
    }),
    tx('2026-08-02T00:00:00.000Z', 90_000, 'creator_income', { id: 'p-ci' }),
  ];
  return baseInput({
    accounts: [
      acct('a2', null, { currentBalanceCents: 100_000 }),
      acct('a1', 900_000),
      acct('a3', 5_000_000, { include: false }),
    ],
    transactions: [...current, ...prior],
    budgets: {
      taxReserveRate: 0.2,
      personalEssentialCents: 50_000,
      creatorInvestmentCents: 6_000,
    },
  });
};

const scenarioProvenance = {
  accountIds: ['a1', 'a2'],
  classificationCounts: {
    personal_essential: 1,
    personal_discretionary: 1,
    creator_operating: 1,
    creator_investment: 1,
    creator_income: 1,
    personal_income: 1,
  },
  ruleIds: ['r1', 'r2'],
  dateRange: {
    start: '2026-08-16T00:00:00.000Z',
    end: '2026-09-15T00:00:00.000Z',
  },
  transactionIds: ['ess', 'disc', 'op', 'inv', 'ci', 'pi'],
  transactionIdsTruncated: false,
  excludedTransactionIds: ['xfer', 'hidden'],
};

describe('computeMetrics — canonical scenario', () => {
  const m = computeMetrics(scenario());

  it('returns a full result for every metric with its direction', () => {
    expect(
      Object.fromEntries(
        Object.entries(m).map(([id, r]) => [id, [r.id, r.direction]])
      )
    ).toEqual({
      available_cash: ['available_cash', 'higher_is_better'],
      personal_income: ['personal_income', 'higher_is_better'],
      creator_income: ['creator_income', 'higher_is_better'],
      creator_income_trailing_monthly: [
        'creator_income_trailing_monthly',
        'higher_is_better',
      ],
      personal_essential_burn: ['personal_essential_burn', 'lower_is_better'],
      personal_discretionary_spend: [
        'personal_discretionary_spend',
        'lower_is_better',
      ],
      creator_operating_burn: ['creator_operating_burn', 'lower_is_better'],
      creator_investment_spend: ['creator_investment_spend', 'lower_is_better'],
      tax_reserve_requirement: ['tax_reserve_requirement', 'lower_is_better'],
      total_survival_burn: ['total_survival_burn', 'lower_is_better'],
      net_cash_flow: ['net_cash_flow', 'higher_is_better'],
      runway_months: ['runway_months', 'higher_is_better'],
      coverage_personal_burn: ['coverage_personal_burn', 'higher_is_better'],
      coverage_survival_burn: ['coverage_survival_burn', 'higher_is_better'],
      budget_variance: ['budget_variance', 'lower_is_better'],
    });
  });

  it('builds the full essential-burn result with delta and provenance', () => {
    expect(m.personal_essential_burn).toEqual({
      id: 'personal_essential_burn',
      value: 60_000,
      priorValue: 30_000,
      delta: 30_000,
      deltaPct: 1,
      direction: 'lower_is_better',
      deltaIsGood: false,
      state: 'ok',
      freshness: 'fresh',
      confidence: 'high',
      window: 'rolling_30d',
      coverage: 1,
      provenance: scenarioProvenance,
    });
  });

  it('computes values and prior values for every metric', () => {
    const summary = Object.fromEntries(
      Object.entries(m).map(([id, r]) => [
        id,
        { value: r.value, prior: r.priorValue, state: r.state },
      ])
    );
    expect(summary).toEqual({
      available_cash: { value: 1_000_000, prior: null, state: 'ok' },
      personal_income: { value: 24_000, prior: 0, state: 'ok' },
      creator_income: { value: 150_000, prior: 90_000, state: 'ok' },
      creator_income_trailing_monthly: {
        value: 150_000,
        prior: 90_000,
        state: 'ok',
      },
      personal_essential_burn: { value: 60_000, prior: 30_000, state: 'ok' },
      personal_discretionary_spend: { value: 30_000, prior: 0, state: 'ok' },
      creator_operating_burn: { value: 40_000, prior: 0, state: 'ok' },
      creator_investment_spend: { value: 9_000, prior: 0, state: 'ok' },
      tax_reserve_requirement: { value: 30_000, prior: 18_000, state: 'ok' },
      // essential 60k + operating 40k + 20% of 150k creator income.
      total_survival_burn: { value: 130_000, prior: 48_000, state: 'ok' },
      // 24k + 150k − 60k − 30k − 40k − 9k − 30k tax reserve.
      net_cash_flow: { value: 5_000, prior: null, state: 'positive_cash_flow' },
      runway_months: {
        value: 1_000_000 / 130_000,
        prior: null,
        state: 'positive_cash_flow',
      },
      coverage_personal_burn: {
        value: 150_000 / 90_000,
        prior: 3,
        state: 'ok',
      },
      coverage_survival_burn: {
        value: 150_000 / 130_000,
        prior: 90_000 / 48_000,
        state: 'ok',
      },
      // (60k − 50k essential) + (9k − 6k investment).
      budget_variance: { value: 13_000, prior: null, state: 'ok' },
    });
  });

  it('reports positive zero for empty spend classes', () => {
    expect(Object.is(m.personal_discretionary_spend.priorValue, 0)).toBe(true);
    expect(Object.is(m.creator_operating_burn.priorValue, 0)).toBe(true);
  });

  it('marks deltas good by metric direction', () => {
    // Income rose → good; spend rose → bad.
    expect(m.creator_income.deltaIsGood).toBe(true);
    expect(m.creator_income.deltaPct).toBeCloseTo(60_000 / 90_000, 10);
    expect(m.creator_operating_burn.deltaIsGood).toBe(false);
    // Prior of zero has no percentage change.
    expect(m.creator_operating_burn.delta).toBe(40_000);
    expect(m.creator_operating_burn.deltaPct).toBeNull();
    // Metrics without a prior have no delta at all.
    expect(m.available_cash).toMatchObject({
      delta: null,
      deltaPct: null,
      deltaIsGood: null,
    });
  });
});

describe('computeMetrics — deltas', () => {
  it('treats an unchanged value as good in both directions', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), -30_000, 'personal_essential'),
          tx('2026-08-10T00:00:00.000Z', -30_000, 'personal_essential'),
          tx(day(2), 30_000, 'creator_income'),
          tx('2026-08-10T00:00:00.000Z', 30_000, 'creator_income'),
        ],
      })
    );
    expect(m.personal_essential_burn).toMatchObject({
      delta: 0,
      deltaPct: 0,
      deltaIsGood: true,
    });
    expect(m.creator_income).toMatchObject({
      delta: 0,
      deltaPct: 0,
      deltaIsGood: true,
    });
  });

  it('scales percentage change by the magnitude of a negative prior', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), 30_000, 'personal_income'),
          tx('2026-08-10T00:00:00.000Z', -60_000, 'personal_income'),
        ],
      })
    );
    expect(m.personal_income).toMatchObject({
      value: 30_000,
      priorValue: -60_000,
      delta: 90_000,
      deltaPct: 1.5,
      deltaIsGood: true,
    });
  });

  it('reports a falling income as bad', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), 10_000, 'creator_income'),
          tx('2026-08-10T00:00:00.000Z', 40_000, 'creator_income'),
        ],
      })
    );
    expect(m.creator_income).toMatchObject({
      delta: -30_000,
      deltaPct: -0.75,
      deltaIsGood: false,
    });
  });
});

describe('computeMetrics — windows and ranges', () => {
  it('includes the window start and excludes asOf itself', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx('2026-08-16T00:00:00.000Z', 3_000, 'personal_income', {
            id: 'start',
          }),
          tx(AS_OF, 6_000, 'personal_income', { id: 'asof' }),
          tx('2026-08-15T23:59:59.999Z', 9_000, 'personal_income', {
            id: 'before',
          }),
        ],
      })
    );
    expect(m.personal_income.value).toBe(3_000);
    expect(m.personal_income.priorValue).toBe(9_000);
    expect(m.personal_income.provenance.transactionIds).toEqual(['start']);
  });

  it.each([
    ['rolling_30d', '2026-08-16T00:00:00.000Z'],
    ['trailing_90d', '2026-06-17T00:00:00.000Z'],
    ['annual', HISTORY_START],
  ] as const)(
    '%s window starts at %s (clamped to history)',
    (window, start) => {
      const m = computeMetrics(baseInput({ window }));
      expect(m.available_cash.provenance.dateRange).toEqual({
        start,
        end: AS_OF,
      });
    }
  );

  it('measures partial coverage when history starts inside the window', () => {
    const m = computeMetrics(
      baseInput({
        window: 'trailing_90d',
        historyStartAt: ago(45 * DAY),
        transactions: [tx(day(1), -45_000, 'personal_essential')],
      })
    );
    expect(m.personal_essential_burn.coverage).toBe(0.5);
    expect(m.personal_essential_burn.confidence).toBe('medium');
    // 45_000 over 45 covered days → 30_000 per 30-day month.
    expect(m.personal_essential_burn.value).toBe(30_000);
    expect(m.personal_essential_burn.priorValue).toBeNull();
  });

  it('uses the whole history for the history window without a prior period', () => {
    const m = computeMetrics(
      baseInput({
        window: 'history',
        historyStartAt: ago(60 * DAY),
        transactions: [
          tx(ago(59 * DAY), -60_000, 'personal_essential'),
          tx(ago(61 * DAY), -99_000, 'personal_essential'),
        ],
      })
    );
    expect(m.personal_essential_burn).toMatchObject({
      value: 30_000,
      priorValue: null,
      delta: null,
      coverage: 1,
      window: 'history',
    });
    expect(m.personal_essential_burn.provenance.dateRange.start).toBe(
      ago(60 * DAY)
    );
    expect(m.personal_income.priorValue).toBeNull();
  });

  it('starts the history window at the epoch when no history start is known', () => {
    const m = computeMetrics(
      baseInput({ window: 'history', historyStartAt: undefined })
    );
    expect(m.available_cash.provenance.dateRange.start).toBe(
      '1970-01-01T00:00:00.000Z'
    );
  });

  it('reports zero coverage for an empty history window', () => {
    const m = computeMetrics(
      baseInput({ window: 'history', historyStartAt: AS_OF })
    );
    expect(m.personal_income.coverage).toBe(0);
    expect(m.personal_income.confidence).toBe('low');
    expect(m.personal_income.state).toBe('insufficient_data');
  });

  it('reports rates only from 14 covered days onward', () => {
    const at = (days: number) =>
      computeMetrics(
        baseInput({
          historyStartAt: ago(days * DAY),
          transactions: [tx(ago(DAY), -14_000, 'personal_essential')],
        })
      );
    expect(at(14).personal_essential_burn).toMatchObject({
      value: 30_000,
      state: 'ok',
    });
    expect(at(13.99).personal_essential_burn).toMatchObject({
      value: null,
      state: 'insufficient_data',
    });
    expect(at(13.99).personal_income.state).toBe('insufficient_data');
    expect(at(14).personal_income.state).toBe('ok');
  });
});

describe('computeMetrics — confidence and freshness', () => {
  it.each([
    { coverageDays: 27, pending: 0, total: 20, want: 'high' },
    { coverageDays: 26, pending: 0, total: 20, want: 'medium' },
    { coverageDays: 30, pending: 1, total: 21, want: 'high' },
    { coverageDays: 30, pending: 1, total: 20, want: 'medium' },
    { coverageDays: 15, pending: 0, total: 1, want: 'medium' },
    { coverageDays: 14, pending: 0, total: 1, want: 'low' },
  ])(
    '$coverageDays/30 days, $pending/$total pending → $want',
    ({ coverageDays, pending, total, want }) => {
      const transactions = Array.from({ length: total }, (_, i) =>
        tx(ago(DAY), -100, 'personal_essential', { pending: i < pending })
      );
      const m = computeMetrics(
        baseInput({ historyStartAt: ago(coverageDays * DAY), transactions })
      );
      expect(m.personal_essential_burn.confidence).toBe(want);
    }
  );

  it('is high confidence for a fully covered window with no rows', () => {
    expect(computeMetrics(baseInput()).personal_income.confidence).toBe('high');
  });

  it.each([
    { age: 48 * HOUR, staleAfterHours: undefined, want: 'fresh' },
    { age: 48 * HOUR + 1, staleAfterHours: undefined, want: 'stale' },
    { age: 2 * HOUR, staleAfterHours: 1, want: 'stale' },
    { age: HOUR, staleAfterHours: 1, want: 'fresh' },
  ])(
    'sync $age ms old (stale after $staleAfterHours h) → $want',
    ({ age, staleAfterHours, want }) => {
      const stamp = ago(age);
      const m = computeMetrics(
        baseInput({
          staleAfterHours,
          lastSyncAt: stamp,
          accounts: [acct('a1', 1_000_000, { balanceUpdatedAt: stamp })],
        })
      );
      expect(m.available_cash.freshness).toBe(want);
    }
  );

  it('uses the newest of the sync and balance timestamps', () => {
    const m = computeMetrics(
      baseInput({
        lastSyncAt: ago(30 * DAY),
        accounts: [acct('a1', 1_000_000, { balanceUpdatedAt: ago(HOUR) })],
      })
    );
    expect(m.available_cash.freshness).toBe('fresh');
  });

  it('ignores excluded accounts when judging freshness', () => {
    const m = computeMetrics(
      baseInput({
        lastSyncAt: undefined,
        accounts: [
          acct('a1', 1_000_000, { balanceUpdatedAt: ago(30 * DAY) }),
          acct('a2', 0, { include: false, balanceUpdatedAt: ago(HOUR) }),
        ],
      })
    );
    expect(m.available_cash.freshness).toBe('stale');
  });

  it('reports unknown freshness without any timestamps', () => {
    const m = computeMetrics(
      baseInput({
        lastSyncAt: undefined,
        accounts: [acct('a1', 1_000_000, { balanceUpdatedAt: undefined })],
      })
    );
    expect(m.available_cash.freshness).toBe('unknown');
    expect(m.available_cash.state).toBe('ok');
  });

  it('overlays stale_data only on otherwise-ok metrics', () => {
    const stale = ago(30 * DAY);
    const m = computeMetrics(
      baseInput({
        lastSyncAt: stale,
        accounts: [acct('a1', 1_000_000, { balanceUpdatedAt: stale })],
        transactions: [tx(day(1), -30_000, 'personal_essential')],
      })
    );
    expect(m.available_cash.state).toBe('stale_data');
    expect(m.personal_income.state).toBe('stale_data');
    expect(m.personal_essential_burn.state).toBe('stale_data');
    expect(m.runway_months.state).toBe('stale_data');
    expect(m.coverage_personal_burn.state).toBe('stale_data');
    // A more specific state wins over the stale overlay.
    expect(m.budget_variance.state).toBe('insufficient_data');
  });
});

describe('computeMetrics — cash and runway states', () => {
  it('falls back from available to current balance, then zero', () => {
    const m = computeMetrics(
      baseInput({
        accounts: [
          acct('a1', 500_000, { currentBalanceCents: 1 }),
          acct('a2', null, { currentBalanceCents: 300_000 }),
          acct('a3', null, { currentBalanceCents: null }),
        ],
      })
    );
    expect(m.available_cash.value).toBe(800_000);
    expect(m.available_cash.provenance.accountIds).toEqual(['a1', 'a2', 'a3']);
  });

  it('reports insufficient data without any included account', () => {
    const m = computeMetrics(
      baseInput({ accounts: [acct('a1', 10, { include: false })] })
    );
    expect(m.available_cash).toMatchObject({
      value: null,
      state: 'insufficient_data',
    });
    expect(m.runway_months).toMatchObject({
      value: null,
      state: 'insufficient_data',
    });
  });

  it.each([0, -50_000])('reports zero_cash for a balance of %i', cents => {
    const m = computeMetrics(
      baseInput({
        accounts: [acct('a1', cents)],
        transactions: [tx(day(1), -30_000, 'personal_essential')],
      })
    );
    expect(m.available_cash).toMatchObject({
      value: cents,
      state: 'zero_cash',
    });
    expect(m.runway_months).toMatchObject({ value: 0, state: 'zero_cash' });
  });

  it('reports zero_burn when nothing is spent', () => {
    const m = computeMetrics(baseInput());
    expect(m.total_survival_burn).toMatchObject({
      value: 0,
      state: 'zero_burn',
    });
    expect(m.runway_months).toMatchObject({ value: null, state: 'zero_burn' });
    expect(m.net_cash_flow).toMatchObject({ value: 0, state: 'ok' });
  });

  it('reports zero_burn when refunds exceed spend', () => {
    const m = computeMetrics(
      baseInput({ transactions: [tx(day(1), 3_000, 'personal_essential')] })
    );
    expect(m.total_survival_burn).toMatchObject({
      value: -3_000,
      state: 'zero_burn',
    });
    expect(m.runway_months.state).toBe('zero_burn');
    expect(m.coverage_survival_burn.value).toBeNull();
  });

  it('marks runway unbounded only beyond 120 months', () => {
    const runway = (cash: number) =>
      computeMetrics(
        baseInput({
          accounts: [acct('a1', cash)],
          transactions: [tx(day(1), -30_000, 'personal_essential')],
        })
      ).runway_months;
    expect(runway(3_600_000)).toEqual(
      expect.objectContaining({ value: 120, state: 'ok' })
    );
    expect(runway(3_600_030)).toEqual(
      expect.objectContaining({ value: 120.001, state: 'unbounded_runway' })
    );
  });

  it('keeps runway ok when net cash flow is exactly zero', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), -30_000, 'personal_essential'),
          tx(day(2), 30_000, 'personal_income'),
        ],
      })
    );
    expect(m.net_cash_flow).toMatchObject({ value: 0, state: 'ok' });
    expect(m.runway_months).toMatchObject({
      value: 1_000_000 / 30_000,
      state: 'ok',
    });
  });

  it('reports insufficient data for derived metrics on sparse history', () => {
    const m = computeMetrics(baseInput({ historyStartAt: ago(5 * DAY) }));
    for (const id of [
      'creator_income_trailing_monthly',
      'personal_essential_burn',
      'personal_discretionary_spend',
      'creator_operating_burn',
      'creator_investment_spend',
      'tax_reserve_requirement',
      'total_survival_burn',
      'net_cash_flow',
      'runway_months',
      'coverage_personal_burn',
      'coverage_survival_burn',
      'creator_income',
      'personal_income',
    ] as MetricId[]) {
      expect(m[id].state, id).toBe('insufficient_data');
    }
    for (const id of [
      'creator_income_trailing_monthly',
      'personal_essential_burn',
      'total_survival_burn',
      'net_cash_flow',
      'runway_months',
    ] as MetricId[]) {
      expect(m[id].value, id).toBeNull();
    }
  });
});

describe('computeMetrics — tax reserve, coverage, and budget variance', () => {
  it('defaults the tax reserve rate to zero', () => {
    const m = computeMetrics(
      baseInput({ transactions: [tx(day(1), 60_000, 'creator_income')] })
    );
    expect(m.tax_reserve_requirement.value).toBe(0);
    expect(m.total_survival_burn.value).toBe(0);
  });

  it('counts discretionary and investment spend in net flow but not survival burn', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), -30_000, 'personal_discretionary'),
          tx(day(2), -60_000, 'creator_investment'),
        ],
      })
    );
    expect(m.total_survival_burn.value).toBe(0);
    expect(m.net_cash_flow.value).toBe(-90_000);
    expect(m.coverage_personal_burn.value).toBe(0);
  });

  it('nets income reversals and spend refunds within a class', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), 90_000, 'creator_income'),
          tx(day(2), -30_000, 'creator_income'),
          tx(day(3), -30_000, 'personal_essential'),
          tx(day(4), 6_000, 'personal_essential'),
          tx(day(5), -3_000, 'tax_reserve'),
        ],
      })
    );
    expect(m.creator_income.value).toBe(60_000);
    expect(m.personal_essential_burn.value).toBe(24_000);
    // Tax reserve payments are economic but not a metric of their own.
    expect(m.tax_reserve_requirement.value).toBe(0);
    expect(m.personal_essential_burn.provenance.classificationCounts).toEqual({
      creator_income: 2,
      personal_essential: 2,
      tax_reserve: 1,
    });
  });

  it.each([
    ['personalEssentialCents', 'personal_essential', 10_000],
    ['personalDiscretionaryCents', 'personal_discretionary', 10_000],
    ['creatorOperatingCents', 'creator_operating', 10_000],
    ['creatorInvestmentCents', 'creator_investment', 10_000],
  ] as const)('includes %s in budget variance', (budget, cls, want) => {
    const m = computeMetrics(
      baseInput({
        transactions: [tx(day(1), -30_000, cls)],
        budgets: { [budget]: 20_000 },
      })
    );
    expect(m.budget_variance).toMatchObject({ value: want, state: 'ok' });
  });

  it('has no budget variance without budgets or rates', () => {
    expect(computeMetrics(baseInput()).budget_variance.value).toBeNull();
    expect(
      computeMetrics(baseInput({ budgets: { taxReserveRate: 0.3 } }))
        .budget_variance.value
    ).toBeNull();
    expect(
      computeMetrics(
        baseInput({
          historyStartAt: ago(5 * DAY),
          budgets: { personalEssentialCents: 1 },
        })
      ).budget_variance.value
    ).toBeNull();
  });
});

describe('computeMetrics — provenance', () => {
  it('truncates transaction ids at 500 and flags it', () => {
    const transactions = Array.from({ length: 501 }, (_, i) =>
      tx(day(1), -1, 'personal_essential', { id: `t${i}` })
    );
    const p = computeMetrics(baseInput({ transactions })).personal_income
      .provenance;
    expect(p.transactionIds).toHaveLength(500);
    expect(p.transactionIds[499]).toBe('t499');
    expect(p.transactionIdsTruncated).toBe(true);
  });

  it('does not flag exactly 500 transaction ids as truncated', () => {
    const transactions = Array.from({ length: 500 }, (_, i) =>
      tx(day(1), -1, 'personal_essential', { id: `t${i}` })
    );
    const p = computeMetrics(baseInput({ transactions })).personal_income
      .provenance;
    expect(p.transactionIds).toHaveLength(500);
    expect(p.transactionIdsTruncated).toBe(false);
  });

  it('rejects non-owner ids', () => {
    expect(() =>
      computeMetrics(baseInput({ ownerUserId: 'creator_123' }))
    ).toThrow('Invalid financial owner id');
  });
});

describe('snapshots', () => {
  it('reproduces historical values and preserves correction provenance', () => {
    const input = baseInput({
      transactions: [tx(day(1), -30_000, 'personal_essential')],
    });
    const snap = buildMetricSnapshot(input);
    expect(snap.asOfDate).toBe('2026-09-15');
    expect(snap.metrics.personal_essential_burn.value).toBe(30_000);
    expect(buildMetricSnapshot({ ...input }).fingerprint).toBe(
      snap.fingerprint
    );
    expect(snapshotFingerprint(input)).toBe(snapshotFingerprint({ ...input }));

    const reclassified: MetricEngineInput = {
      ...input,
      transactions: [
        { ...input.transactions[0], classification: 'personal_discretionary' },
      ],
    };
    const fixed = recomputeSnapshot(reclassified, snap);
    expect(fixed.fingerprint).not.toBe(snap.fingerprint);
    expect(fixed.correctsFingerprint).toBe(snap.fingerprint);
    expect(fixed.metrics.personal_essential_burn.value).toBe(0);
    expect(fixed.metrics.personal_discretionary_spend.value).toBe(30_000);
  });
});

describe('creator-safe projection (privacy boundary)', () => {
  it('exposes only the creator spend metrics, unchanged', () => {
    const m = computeMetrics(scenario());
    expect([...CREATOR_SAFE_METRIC_IDS]).toEqual([
      'creator_operating_burn',
      'creator_investment_spend',
    ]);
    expect(projectCreatorSafeMetrics(m)).toEqual({
      creator_operating_burn: m.creator_operating_burn,
      creator_investment_spend: m.creator_investment_spend,
    });
  });
});
