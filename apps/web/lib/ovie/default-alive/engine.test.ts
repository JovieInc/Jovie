import { describe, expect, it } from 'vitest';
import {
  type DefaultAliveInputs,
  evaluateDefaultAlive,
  type SourcedInput,
} from './engine';
import {
  breakevenMonth,
  capitalToProfitability,
  cumulativeNetBurn,
  peakNetBurn,
} from './growth-model';
import {
  assembleDefaultAliveInputs,
  attestedFinanceSchema,
  mrrFromSummerRevenue,
  raisePlanSchema,
  variableBurnFromSpendRegistry,
} from './inputs';

// Synthetic figures only. Jovie's real numbers never live in this repo.
const NOW = '2026-10-31T00:00:00.000Z';
const FRESH = '2026-10-30T00:00:00.000Z';

function n(
  value: number | null,
  asOf: string | null = FRESH
): SourcedInput<number> {
  return { value, source: 'test', asOf, basis: 'measured' };
}

function inputs(
  overrides: Partial<DefaultAliveInputs> = {}
): DefaultAliveInputs {
  return {
    cashUsd: n(100_000),
    fixedBurnUsdPerMonth: n(8_000),
    variableBurnUsdPerMonth: n(2_000),
    mrrUsd: n(1_000),
    mrrGrowthRateMonthly: n(0.2),
    expenseGrowthRateMonthly: n(0),
    ...overrides,
  };
}

describe('growth model (Blackwell calculator math)', () => {
  const path = { e0: 10_000, r0: 1_000, le: 0, lr: Math.log(1.2) };

  it('finds breakeven where revenue reaches expenses', () => {
    const t = breakevenMonth(path) as number;
    expect(t).toBeCloseTo(Math.log(10) / Math.log(1.2), 6);
    expect(1_000 * 1.2 ** t).toBeCloseTo(10_000, 3);
  });

  it('integrates expense minus revenue to breakeven', () => {
    const t = Math.log(10) / Math.log(1.2);
    const expected = 10_000 * t - (1_000 * 9) / Math.log(1.2);
    expect(capitalToProfitability(path)).toBeCloseTo(expected, 3);
    expect(cumulativeNetBurn(path, t)).toBeCloseTo(expected, 3);
  });

  it('never breaks even when revenue is zero or grows no faster than cost', () => {
    expect(breakevenMonth({ ...path, r0: 0 })).toBeNull();
    expect(breakevenMonth({ ...path, le: path.lr })).toBeNull();
    expect(breakevenMonth({ ...path, r0: 20_000 })).toBe(0);
  });

  it('caps peak burn at breakeven', () => {
    expect(peakNetBurn(path, 1_000)).toBeCloseTo(
      capitalToProfitability(path) as number,
      6
    );
  });
});

describe('evaluateDefaultAlive', () => {
  it('reports every missing required input as a gap, never a guess', () => {
    const result = evaluateDefaultAlive(
      inputs({ cashUsd: n(null), fixedBurnUsdPerMonth: n(null) }),
      NOW
    );
    expect(result.verdict).toBe('unknown');
    expect(result.confidence).toBe('none');
    expect(result.gaps.map(gap => [gap.input, gap.kind])).toEqual([
      ['cashUsd', 'missing'],
      ['fixedBurnUsdPerMonth', 'missing'],
    ]);
    expect(result.raise.recommendedUsd).toBeNull();
    expect(result.timing.kind).toBe('unknown');
  });

  it('is default alive when capital to profitability fits in cash', () => {
    const result = evaluateDefaultAlive(inputs({ cashUsd: n(200_000) }), NOW);
    expect(result.verdict).toBe('default-alive');
    expect(result.runwayMonths).toBeNull();
    expect(result.cashZeroDate).toBeNull();
    expect(result.timing.kind).toBe('optional');
    expect(result.capitalToProfitabilityUsd).toBe(76_929);
  });

  it('is default dead when cash runs out before profitability', () => {
    const result = evaluateDefaultAlive(inputs({ cashUsd: n(50_000) }), NOW);
    expect(result.verdict).toBe('default-dead');
    expect(result.runwayMonths).toBeGreaterThan(5);
    expect(result.cashZeroDate).toMatch(/^2027-/);
    // Margin-adjusted capital to profitability minus cash.
    const capital = capitalToProfitability({
      e0: 10_000,
      r0: 1_000,
      le: 0,
      lr: Math.log(1.2),
    }) as number;
    expect(result.raise.toDefaultAliveUsd).toBe(
      Math.round(capital * 1.25 - 50_000)
    );
  });

  it('solves the MRR growth that makes the company exactly default alive', () => {
    const result = evaluateDefaultAlive(inputs({ cashUsd: n(50_000) }), NOW);
    const g = result.requiredMrrGrowthRateMonthly as number;
    expect(g).toBeGreaterThan(0.2);
    const capital = capitalToProfitability({
      e0: 10_000,
      r0: 1_000,
      le: 0,
      lr: Math.log(1 + g),
    });
    expect(capital).toBeCloseTo(50_000, -1);
  });

  it('handles $0 MRR: dead, flat runway, raise sized by runway policy', () => {
    const result = evaluateDefaultAlive(
      inputs({
        cashUsd: n(20_000),
        mrrUsd: n(0),
        mrrGrowthRateMonthly: n(null),
      }),
      NOW
    );
    expect(result.gaps).toEqual([]);
    expect(result.verdict).toBe('default-dead');
    expect(result.runwayMonths).toBeCloseTo(2, 6);
    expect(result.requiredMrrGrowthRateMonthly).toBeNull();
    expect(result.raise.toDefaultAliveUsd).toBeNull();
    // 18 months x $10K x 1.25 - $20K = $205K -> rounds up to $225K.
    expect(result.raise.forRunwayTargetUsd?.min).toBe(205_000);
    expect(result.raise.recommendedUsd).toBe(225_000);
    // 24 months x $10K x 1.25 - $20K = $280K -> $300K.
    expect(result.raise.rangeUsd).toEqual({ low: 225_000, high: 300_000 });
    expect(result.timing.kind).toBe('now');
  });

  it('applies expense growth to runway and raise', () => {
    const flat = evaluateDefaultAlive(
      inputs({ mrrUsd: n(0), mrrGrowthRateMonthly: n(null) }),
      NOW
    );
    const growing = evaluateDefaultAlive(
      inputs({
        mrrUsd: n(0),
        mrrGrowthRateMonthly: n(null),
        expenseGrowthRateMonthly: n(0.05),
      }),
      NOW
    );
    expect(growing.runwayMonths as number).toBeLessThan(
      flat.runwayMonths as number
    );
    expect(growing.raise.recommendedUsd as number).toBeGreaterThan(
      flat.raise.recommendedUsd as number
    );
  });

  it('schedules the raise a lead time before the cliff when runway is long', () => {
    const result = evaluateDefaultAlive(
      inputs({
        cashUsd: n(240_000),
        mrrUsd: n(0),
        mrrGrowthRateMonthly: n(null),
      }),
      NOW
    );
    expect(result.runwayMonths).toBeCloseTo(24, 6);
    expect(result.timing.kind).toBe('by-date');
    if (result.timing.kind === 'by-date') {
      // 24 months of runway minus 3 to raise and 2 of buffer.
      expect(result.timing.startBy).toBe('2028-05-31');
      expect(result.timing.closeBy).toBe('2028-08-30');
    }
  });

  it('flags stale inputs and drops confidence without discarding them', () => {
    const result = evaluateDefaultAlive(
      inputs({ cashUsd: n(50_000, '2026-07-02') }),
      NOW
    );
    expect(result.verdict).toBe('default-dead');
    expect(result.confidence).toBe('low');
    expect(result.gaps).toEqual([
      expect.objectContaining({ input: 'cashUsd', kind: 'stale' }),
    ]);
  });

  it('rejects out-of-range values', () => {
    const result = evaluateDefaultAlive(inputs({ cashUsd: n(-5) }), NOW);
    expect(result.verdict).toBe('unknown');
    expect(result.gaps[0]).toMatchObject({ input: 'cashUsd', kind: 'invalid' });
  });

  const plan = {
    milestone: '10 paying customers',
    milestoneMonths: 12,
    milestoneSource: 'test',
    lines: [
      {
        label: 'base',
        usdPerMonth: 10_000,
        source: 'test',
        basis: 'measured' as const,
      },
      {
        label: 'founder',
        usdPerMonth: 6_000,
        source: 'test',
        basis: 'assumption' as const,
      },
    ],
    offer: { usd: 500_000, source: 'test program' },
  };

  it('sizes the raise by the plan when the plan costs more than survival', () => {
    const result = evaluateDefaultAlive(
      inputs({
        cashUsd: n(0),
        mrrUsd: n(0),
        mrrGrowthRateMonthly: n(null),
        plan,
      }),
      NOW
    );
    // $16K/mo x (12 + 3 to raise + 2 buffer) = $272K; x 1.25 = $340K.
    expect(result.plan).toMatchObject({
      months: 17,
      monthlyBurnUsd: 16_000,
      grossCostUsd: 272_000,
      withMarginUsd: 340_000,
      offerRunwayMonths: 31.3,
      offerCoversPlan: true,
      offerMonthsAfterMilestone: 19.3,
      offerReachesMilestoneWithRaiseTime: true,
      offerRunsOutOn: '2029-06-09',
    });
    expect(result.plan?.assumptions).toEqual(['founder: 6000/mo (test)']);
    expect(result.raise.forPlanUsd).toBe(340_000);
    // Survival floor is 18 x $10K x 1.25 = $225K, so the plan wins.
    expect(result.raise.recommendedUsd).toBe(350_000);
    expect(result.raise.basis).toContain('Plan cost');
  });

  it('keeps cash as a gap but still reports the need before cash', () => {
    const result = evaluateDefaultAlive(
      inputs({
        cashUsd: n(null),
        mrrUsd: n(0),
        mrrGrowthRateMonthly: n(null),
        plan,
      }),
      NOW
    );
    expect(result.verdict).toBe('unknown');
    expect(result.raise.recommendedUsd).toBeNull();
    expect(result.raise.grossNeedUsd).toBe(340_000);
    expect(result.plan?.offerCoversPlan).toBe(true);
  });

  it('withholds the need before cash when burn is also missing', () => {
    const result = evaluateDefaultAlive(
      inputs({ cashUsd: n(null), fixedBurnUsdPerMonth: n(null) }),
      NOW
    );
    expect(result.raise.grossNeedUsd).toBeNull();
  });

  it('is deterministic', () => {
    const a = evaluateDefaultAlive(inputs(), NOW);
    const b = evaluateDefaultAlive(inputs(), NOW);
    expect(a).toEqual(b);
  });
});

describe('input assembly', () => {
  it('sums cash-funded caps and skips credit-funded lines', () => {
    const result = variableBurnFromSpendRegistry({
      updatedAt: FRESH,
      providers: [
        {
          id: 'a',
          kind: 'capped-spend',
          cap: { amountUsd: 100, period: 'month' },
        },
        { id: 'b', kind: 'capped-spend', cap: { amountUsd: 1, period: 'day' } },
        {
          id: 'c',
          kind: 'trial-sub-cap',
          funding: { source: 'credits' },
          cap: { amountUsd: 50, period: 'month' },
        },
        {
          id: 'd',
          kind: 'capped-spend',
          funding: { source: 'credits' },
          cap: { amountUsd: 500, period: 'month' },
        },
        {
          id: 'e',
          kind: 'prepaid-credit',
          cap: { amountUsd: 9, period: 'total' },
        },
      ],
    });
    expect(result.value).toBeCloseTo(130.44, 2);
    expect(result.basis).toBe('registry-cap');
    expect(result.source).toContain('a, b');
  });

  it('maps an unavailable Stripe read to a gap, not zero', () => {
    const mrr = mrrFromSummerRevenue({
      observedAt: NOW,
      jovie: { status: 'unavailable', reason: 'stripe_not_configured' },
    });
    expect(mrr.value).toBeNull();
    const result = evaluateDefaultAlive(
      assembleDefaultAliveInputs({ attested: null, mrr }),
      NOW
    );
    expect(result.verdict).toBe('unknown');
    expect(result.gaps.map(gap => gap.input)).toContain('mrrUsd');
    expect(result.gaps.map(gap => gap.input)).toContain('cashUsd');
  });

  it('takes the plan from the financial-plan source over an attested plan', () => {
    const attested = attestedFinanceSchema.parse({
      cashUsd: { value: null, source: 'unknown', asOf: null },
      fixedBurnUsdPerMonth: { value: 5, source: 'founder', asOf: FRESH },
      plan: {
        milestone: 'old',
        milestoneMonths: 6,
        milestoneSource: 'founder',
        lines: [
          { label: 'x', usdPerMonth: 1, source: 's', basis: 'assumption' },
        ],
      },
    });
    const plan = raisePlanSchema.parse({
      milestone: 'new',
      milestoneMonths: 12,
      milestoneSource: 'financial plan',
      lines: [{ label: 'y', usdPerMonth: 2, source: 's', basis: 'measured' }],
    });
    expect(assembleDefaultAliveInputs({ attested, plan }).plan?.milestone).toBe(
      'new'
    );
    expect(assembleDefaultAliveInputs({ attested }).plan?.milestone).toBe(
      'old'
    );
  });

  it('prefers measured MRR over an attested one', () => {
    const attested = attestedFinanceSchema.parse({
      cashUsd: { value: 10, source: 'founder', asOf: FRESH },
      fixedBurnUsdPerMonth: { value: 5, source: 'founder', asOf: FRESH },
      mrrUsd: { value: 999, source: 'founder', asOf: FRESH },
    });
    const assembled = assembleDefaultAliveInputs({
      attested,
      mrr: mrrFromSummerRevenue({
        observedAt: NOW,
        jovie: { mrrUsd: 42, source: 'stripe' },
      }),
    });
    expect(assembled.mrrUsd.value).toBe(42);
    expect(assembled.cashUsd.basis).toBe('founder-attested');
    expect(assembled.expenseGrowthRateMonthly.value).toBeNull();
  });
});
