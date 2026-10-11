import { describe, expect, it } from 'vitest';
import type {
  ClassifiedTransaction,
  MetricEngineInput,
} from '@/lib/finance/metrics/contracts';
import {
  computeMetrics,
  projectCreatorSafeMetrics,
} from '@/lib/finance/metrics/engine';
import {
  buildMetricSnapshot,
  recomputeSnapshot,
  snapshotFingerprint,
} from '@/lib/finance/metrics/snapshot';

const OWNER = '11111111-2222-3333-4444-555555555555';
const OTHER_OWNER = '99999999-8888-7777-6666-555555555555';
const AS_OF = '2026-09-15T00:00:00.000Z';
const SYNC = '2026-09-14T12:00:00.000Z';
const HISTORY_START = '2026-01-01T00:00:00.000Z';

const acct = (id: string, cents: number | null, over = {}) => ({
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

describe('computeMetrics — cash and transfers', () => {
  it('sums available cash across included accounts only', () => {
    const m = computeMetrics(
      baseInput({
        accounts: [
          acct('a1', 500_000),
          acct('a2', 300_000),
          acct('a3', 999_000, { include: false }),
        ],
      })
    );
    expect(m.available_cash.value).toBe(800_000);
    expect(m.available_cash.provenance.accountIds).toEqual(['a1', 'a2']);
  });

  it('handles negative balances', () => {
    const m = computeMetrics(baseInput({ accounts: [acct('a1', -50_000)] }));
    expect(m.available_cash.value).toBe(-50_000);
    expect(m.available_cash.state).toBe('zero_cash');
    expect(m.runway_months.value).toBe(0);
    expect(m.runway_months.state).toBe('zero_cash');
  });

  it('excludes internal transfers, card payments, and excluded rows', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), -200_000, 'internal_transfer'),
          tx(day(2), -150_000, 'credit_card_payment'),
          tx(day(3), -99_000, 'excluded'),
          tx(day(4), 100_000, 'personal_income'),
        ],
      })
    );
    expect(m.net_cash_flow.value).toBe(100_000);
    // Non-economic movements are listed as excluded in provenance.
    expect(m.net_cash_flow.provenance.excludedTransactionIds).toHaveLength(3);
    expect(m.net_cash_flow.provenance.transactionIds).toHaveLength(1);
  });

  it('excludes transactions on non-included accounts from every metric', () => {
    const m = computeMetrics(
      baseInput({
        accounts: [acct('a1', 1_000_000), acct('a2', 0, { include: false })],
        transactions: [
          tx(day(2), -10_000, 'personal_essential', { accountId: 'a2' }),
        ],
      })
    );
    expect(m.personal_essential_burn.provenance.transactionIds).toHaveLength(0);
    expect(
      m.personal_essential_burn.provenance.excludedTransactionIds
    ).toHaveLength(1);
  });
});

describe('computeMetrics — burn, refunds, income', () => {
  it('nets refunds against spend classes', () => {
    const m = computeMetrics(
      baseInput({
        transactions: [
          tx(day(1), -30_000, 'personal_essential'),
          tx(day(5), 5_000, 'personal_essential'), // refund reduces burn
        ],
      })
    );
    expect(m.personal_essential_burn.value).toBe(25_000);
  });

  it('labels creator income as a trailing monthly average', () => {
    const txs = [5_000, 20_000, 0, 8_000].map((amt, i) =>
      tx(day(2 + i * 3), amt, 'creator_income')
    );
    const m = computeMetrics(baseInput({ transactions: txs }));
    // 33_000 over 30 covered days → 33_000/mo trailing average.
    expect(m.creator_income_trailing_monthly.value).toBeCloseTo(33_000, 6);
    expect(m.creator_income.value).toBe(33_000);
  });

  it('annual charges count once inside their window', () => {
    const txs = [tx('2026-01-10T00:00:00.000Z', -120_000, 'creator_operating')];
    const rolling = computeMetrics(baseInput({ transactions: txs }));
    expect(rolling.creator_operating_burn.value).toBe(0);
    const annual = computeMetrics(
      baseInput({ window: 'annual', transactions: txs })
    );
    // 120_000 over 257 covered days (Jan 1 → Sep 15) → ~14_008/mo.
    expect(annual.creator_operating_burn.value).toBeCloseTo(14_007.78, 2);
  });
});

describe('computeMetrics — sparse data and determinism', () => {
  it('reports insufficient_data instead of annualizing sparse history', () => {
    const m = computeMetrics(
      baseInput({ historyStartAt: '2026-09-10T00:00:00.000Z' }) // 5 days
    );
    expect(m.personal_essential_burn.state).toBe('insufficient_data');
    expect(m.personal_essential_burn.value).toBeNull();
    expect(m.runway_months.state).toBe('insufficient_data');
    expect(m.personal_income.state).toBe('insufficient_data');
  });

  it('is deterministic and idempotent', () => {
    const input = baseInput({
      transactions: [
        tx(day(1), -10_000, 'personal_essential'),
        tx(day(2), 40_000, 'creator_income'),
        tx(day(3), -5_000, 'internal_transfer'),
      ],
    });
    expect(computeMetrics(input)).toEqual(computeMetrics(input));
    expect(snapshotFingerprint(input)).toBe(snapshotFingerprint(input));
  });

  it('flags stale syncs', () => {
    const m = computeMetrics(
      baseInput({
        lastSyncAt: '2026-08-01T00:00:00.000Z',
        accounts: [
          acct('a1', 1_000_000, {
            balanceUpdatedAt: '2026-08-01T00:00:00.000Z',
          }),
        ],
      })
    );
    expect(m.available_cash.freshness).toBe('stale');
    expect(m.available_cash.state).toBe('stale_data');
  });
});

describe('computeMetrics — survival burn, runway, coverage, variance', () => {
  const txs = () => [
    tx(day(1), -60_000, 'personal_essential'),
    tx(day(2), -30_000, 'personal_discretionary'),
    tx(day(3), -40_000, 'creator_operating'),
    tx(day(4), -10_000, 'creator_investment'),
    tx(day(5), 150_000, 'creator_income'),
    tx(day(6), 20_000, 'personal_income'),
  ];

  it('computes survival burn = essential + operating + tax reserve', () => {
    const m = computeMetrics(
      baseInput({
        transactions: txs(),
        budgets: { taxReserveRate: 0.3 },
      })
    );
    // essential 60k + operating 40k + tax 30%*150k=45k → 145k/mo
    expect(m.total_survival_burn.value).toBeCloseTo(145_000, 6);
    expect(m.tax_reserve_requirement.value).toBeCloseTo(45_000, 6);
  });

  it('computes runway and positive-cash-flow state', () => {
    const m = computeMetrics(
      baseInput({
        transactions: txs(),
        budgets: { taxReserveRate: 0.3 },
      })
    );
    // 1_000_000 / 145_000 ≈ 6.9 months; income 170k vs outflow 185k → negative.
    expect(m.runway_months.value).toBeCloseTo(1_000_000 / 145_000, 6);
    expect(m.runway_months.state).toBe('ok');
    expect(m.net_cash_flow.value).toBeCloseTo(-15_000, 6);

    const rich = computeMetrics(
      baseInput({
        transactions: [
          tx(day(5), 500_000, 'creator_income'),
          tx(day(1), -60_000, 'personal_essential'),
        ],
      })
    );
    expect(rich.net_cash_flow.state).toBe('positive_cash_flow');
    expect(rich.runway_months.state).toBe('positive_cash_flow');
  });

  it('reports unbounded runway and zero_burn deterministically', () => {
    const m = computeMetrics(
      baseInput({
        accounts: [acct('a1', 100_000_000)],
        transactions: [tx(day(1), -10, 'personal_essential')],
      })
    );
    expect(m.runway_months.state).toBe('unbounded_runway');

    const noBurn = computeMetrics(baseInput({ transactions: [] }));
    expect(noBurn.total_survival_burn.state).toBe('zero_burn');
    expect(noBurn.runway_months.state).toBe('zero_burn');
    expect(noBurn.runway_months.value).toBeNull();
  });

  it('computes creator-income coverage of personal and survival burn', () => {
    const m = computeMetrics(
      baseInput({
        transactions: txs(),
        budgets: { taxReserveRate: 0.3 },
      })
    );
    expect(m.coverage_personal_burn.value).toBeCloseTo(150_000 / 90_000, 6);
    expect(m.coverage_survival_burn.value).toBeCloseTo(150_000 / 145_000, 6);
    expect(m.coverage_personal_burn.direction).toBe('higher_is_better');
  });

  it('computes budget variance across configured budgets', () => {
    const m = computeMetrics(
      baseInput({
        transactions: txs(),
        budgets: {
          personalEssentialCents: 50_000,
          creatorOperatingCents: 50_000,
        },
      })
    );
    // (60k-50k) + (40k-50k) = 0
    expect(m.budget_variance.value).toBe(0);
    expect(m.budget_variance.direction).toBe('lower_is_better');
  });
});

describe('computeMetrics — comparison windows', () => {
  it('compares against the shifted prior window with direction-aware deltas', () => {
    const txs = [
      tx(day(1), -30_000, 'personal_essential'),
      tx('2026-08-10T00:00:00.000Z', -60_000, 'personal_essential'),
    ];
    const m = computeMetrics(baseInput({ transactions: txs }));
    expect(m.personal_essential_burn.value).toBeCloseTo(30_000, 6);
    expect(m.personal_essential_burn.priorValue).toBeCloseTo(60_000, 5);
    expect(m.personal_essential_burn.delta).toBeCloseTo(-30_000, 5);
    // Burn fell → good movement even though delta is negative.
    expect(m.personal_essential_burn.deltaIsGood).toBe(true);
    expect(m.personal_essential_burn.deltaPct).toBeCloseTo(-0.5, 3);
  });

  it('returns null prior values for the history window', () => {
    const m = computeMetrics(
      baseInput({
        window: 'history',
        transactions: [tx(day(1), -30_000, 'personal_essential')],
      })
    );
    expect(m.personal_essential_burn.priorValue).toBeNull();
    expect(m.personal_essential_burn.delta).toBeNull();
  });
});

describe('snapshots', () => {
  it('reproduces historical values and preserves correction provenance', () => {
    const input = baseInput({
      transactions: [tx(day(1), -30_000, 'personal_essential')],
    });
    const snap = buildMetricSnapshot(input);
    expect(snap.asOfDate).toBe('2026-09-15');
    expect(snap.metrics.personal_essential_burn.value).toBeCloseTo(30_000, 6);

    // Same inputs → same fingerprint (idempotent recompute / dedupe).
    const again = buildMetricSnapshot({ ...input });
    expect(again.fingerprint).toBe(snap.fingerprint);

    // Reclassification produces a new snapshot linked to the old one.
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
    expect(fixed.metrics.personal_discretionary_spend.value).toBeCloseTo(
      30_000,
      6
    );
  });

  it('rejects non-owner ids', () => {
    expect(() =>
      buildMetricSnapshot(baseInput({ ownerUserId: 'creator_123' }))
    ).toThrow();
    expect(() =>
      computeMetrics(baseInput({ ownerUserId: OTHER_OWNER.replace(/./g, 'x') }))
    ).toThrow();
  });
});

describe('creator-safe projection (privacy boundary)', () => {
  it('exposes only creator spend metrics to shared surfaces', () => {
    const m = computeMetrics(baseInput({ transactions: [] }));
    const shared = projectCreatorSafeMetrics(m);
    expect(Object.keys(shared).sort()).toEqual([
      'creator_investment_spend',
      'creator_operating_burn',
    ]);
    expect('runway_months' in shared).toBe(false);
    expect('personal_essential_burn' in shared).toBe(false);
    expect('available_cash' in shared).toBe(false);
  });
});
