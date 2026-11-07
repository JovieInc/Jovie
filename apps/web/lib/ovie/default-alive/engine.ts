/**
 * Default-alive engine (headless). Pure and deterministic: no I/O, no clock.
 *
 * Model: Paul Graham, "Default Alive or Default Dead?" (2015,
 * paulgraham.com/aord.html): "Assuming their expenses remain constant and
 * their revenue growth is what it has been over the last several months, do
 * they make it to profitability on the money they have left?"
 *
 * Math: Trevor Blackwell's growth calculator (growth.tlb.org, source at
 * gitlab.com/tlb/startuptools), reproduced exactly in continuous time:
 *   revenue(t) = R0 * e^(lr*t), lr = ln(1 + revenue growth per period)
 *   expense(t) = E0 * e^(le*t), le = ln(1 + expense growth per period)
 *   breakeven  t* = (ln E0 - ln R0) / (lr - le)
 *   capital needed = integral of (expense - revenue) from 0 to t*
 * Default alive means capital needed <= cash on hand. The calculator's own
 * note: raising exactly that amount leaves $0 the month you hit
 * profitability, "so raise a comfortable margin above it."
 *
 * Units are months and USD. Every input carries its source and as-of date;
 * a missing input is an explicit gap and is never guessed.
 */

import {
  bisect,
  breakevenMonth,
  capitalToProfitability,
  type GrowthPath,
  monthsUntilCashZero,
  peakNetBurn,
} from './growth-model';
import { evaluatePlan, type PlanEvaluation, type RaisePlan } from './plan';
import { DEFAULT_FUNDRAISE_POLICY, type FundraisePolicy } from './policy';

const DEFAULT_ALIVE_ENGINE_VERSION = 'jovie.default-alive/v1' as const;

/** Average Gregorian month, used to turn month offsets into dates. */
const DAYS_PER_MONTH = 30.436875;
const MS_PER_DAY = 86_400_000;
/** Upper bound for the required-growth search: 1000% per month. */
const MAX_GROWTH_SEARCH = 10;

type InputBasis = 'measured' | 'founder-attested' | 'registry-cap' | 'derived';

export interface SourcedInput<T> {
  /** null means not available. It is reported as a gap, never as zero. */
  readonly value: T | null;
  readonly source: string;
  /** ISO timestamp or date the value was true. */
  readonly asOf: string | null;
  readonly basis: InputBasis;
}

export interface DefaultAliveInputs {
  readonly cashUsd: SourcedInput<number>;
  /** Fixed monthly expenses (subscriptions, people, base plans). */
  readonly fixedBurnUsdPerMonth: SourcedInput<number>;
  /** Usage-driven monthly expenses (API, compute, metered infra). */
  readonly variableBurnUsdPerMonth: SourcedInput<number>;
  readonly mrrUsd: SourcedInput<number>;
  /** Month-over-month MRR growth, 0.1 = 10%. Not required when MRR is 0. */
  readonly mrrGrowthRateMonthly: SourcedInput<number>;
  /** Month-over-month expense growth, 0.05 = 5%. */
  readonly expenseGrowthRateMonthly: SourcedInput<number>;
  /** Use of funds to the next milestone. A raise funds a plan, not survival. */
  readonly plan?: RaisePlan | null;
}

type DefaultAliveVerdict = 'default-alive' | 'default-dead' | 'unknown';

type InputName = Exclude<keyof DefaultAliveInputs, 'plan'>;

interface DefaultAliveGap {
  readonly input: InputName;
  readonly kind: 'missing' | 'stale' | 'invalid';
  readonly detail: string;
}

type RaiseTiming =
  | { readonly kind: 'now'; readonly reason: string }
  | {
      readonly kind: 'by-date';
      readonly startBy: string;
      readonly closeBy: string;
      readonly reason: string;
    }
  | { readonly kind: 'optional'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

export interface DefaultAliveResult {
  readonly schema: typeof DEFAULT_ALIVE_ENGINE_VERSION;
  readonly evaluatedAt: string;
  readonly verdict: DefaultAliveVerdict;
  readonly confidence: 'high' | 'medium' | 'low' | 'none';
  readonly gaps: readonly DefaultAliveGap[];
  readonly inputs: DefaultAliveInputs;
  readonly policy: FundraisePolicy;
  readonly burn: {
    readonly totalUsdPerMonth: number | null;
    readonly netUsdPerMonth: number | null;
  };
  /** Months until cash hits zero on the modelled path. null: never/unknown. */
  readonly runwayMonths: number | null;
  /** cash / (burn - MRR) with no growth, for reference. */
  readonly runwayMonthsFlat: number | null;
  readonly cashZeroDate: string | null;
  readonly breakevenMonths: number | null;
  /** Total cash burned before profitability. null: never profitable. */
  readonly capitalToProfitabilityUsd: number | null;
  /**
   * Minimum month-over-month MRR growth that makes the company default alive
   * on current cash. null with requiredGrowthNote when no growth rate can.
   */
  readonly requiredMrrGrowthRateMonthly: number | null;
  readonly requiredGrowthNote: string;
  readonly raise: {
    /** Margin-adjusted capital to profitability, minus cash. */
    readonly toDefaultAliveUsd: number | null;
    readonly forRunwayTargetUsd: {
      readonly min: number;
      readonly max: number;
    } | null;
    /** Plan cost to the milestone x margin, minus cash. */
    readonly forPlanUsd: number | null;
    /**
     * Need before subtracting cash: max(survival floor, plan cost), both with
     * margin. Available when cash is the only gap.
     */
    readonly grossNeedUsd: number | null;
    /** Rounded recommendation: max(default alive, survival floor, plan). */
    readonly recommendedUsd: number | null;
    readonly rangeUsd: { readonly low: number; readonly high: number } | null;
    readonly basis: string;
  };
  readonly timing: RaiseTiming;
  readonly plan:
    | (PlanEvaluation & {
        /** If the offer closed at evaluation time and cash were zero. */
        readonly offerRunsOutOn: string | null;
      })
    | null;
  /** Plain-language reasoning, in order. */
  readonly reasoning: readonly string[];
}

function addMonths(iso: string, months: number): string {
  const ms = Date.parse(iso) + months * DAYS_PER_MONTH * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

function roundUp(value: number, step: number): number {
  return step > 0 ? Math.ceil(value / step) * step : Math.ceil(value);
}

function usd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function round(value: number | null, places = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function inputGaps(
  inputs: DefaultAliveInputs,
  evaluatedAt: string,
  staleAfterDays: number
): DefaultAliveGap[] {
  const gaps: DefaultAliveGap[] = [];
  const mrr = inputs.mrrUsd.value;
  const checks: [InputName, SourcedInput<number>, boolean, boolean][] = [
    // name, input, required, allowNegative
    ['cashUsd', inputs.cashUsd, true, false],
    ['fixedBurnUsdPerMonth', inputs.fixedBurnUsdPerMonth, true, false],
    ['variableBurnUsdPerMonth', inputs.variableBurnUsdPerMonth, true, false],
    ['mrrUsd', inputs.mrrUsd, true, false],
    // Growth on $0 revenue changes nothing, so it is not required then.
    ['mrrGrowthRateMonthly', inputs.mrrGrowthRateMonthly, mrr !== 0, true],
    ['expenseGrowthRateMonthly', inputs.expenseGrowthRateMonthly, true, true],
  ];
  const now = Date.parse(evaluatedAt);
  for (const [name, input, required, allowNegative] of checks) {
    if (input.value === null) {
      if (required) {
        gaps.push({
          input: name,
          kind: 'missing',
          detail: `No value. Source: ${input.source}.`,
        });
      }
      continue;
    }
    const v = input.value;
    const invalid =
      !Number.isFinite(v) ||
      (!allowNegative && v < 0) ||
      (allowNegative && v <= -1);
    if (invalid) {
      gaps.push({
        input: name,
        kind: 'invalid',
        detail: `Value ${v} is out of range.`,
      });
      continue;
    }
    const asOf = input.asOf ? Date.parse(input.asOf) : Number.NaN;
    if (!Number.isFinite(asOf)) {
      gaps.push({ input: name, kind: 'stale', detail: 'No as-of date.' });
    } else if ((now - asOf) / MS_PER_DAY > staleAfterDays) {
      const days = Math.floor((now - asOf) / MS_PER_DAY);
      gaps.push({
        input: name,
        kind: 'stale',
        detail: `As of ${input.asOf} (${days} days old; limit ${staleAfterDays}).`,
      });
    }
  }
  return gaps;
}

function pathFrom(inputs: DefaultAliveInputs): GrowthPath {
  return {
    e0:
      (inputs.fixedBurnUsdPerMonth.value ?? 0) +
      (inputs.variableBurnUsdPerMonth.value ?? 0),
    r0: inputs.mrrUsd.value ?? 0,
    le: Math.log(1 + (inputs.expenseGrowthRateMonthly.value ?? 0)),
    lr: Math.log(1 + (inputs.mrrGrowthRateMonthly.value ?? 0)),
  };
}

/**
 * Evaluate default alive / dead, runway, required growth, and the raise
 * amount and timing. Deterministic for a given (inputs, evaluatedAt, policy).
 */
export function evaluateDefaultAlive(
  inputs: DefaultAliveInputs,
  evaluatedAt: string,
  policy: FundraisePolicy = DEFAULT_FUNDRAISE_POLICY
): DefaultAliveResult {
  const gaps = inputGaps(inputs, evaluatedAt, policy.staleAfterDays.value);
  const blocking = gaps.filter(gap => gap.kind !== 'stale');
  const base = {
    schema: DEFAULT_ALIVE_ENGINE_VERSION,
    evaluatedAt,
    gaps,
    inputs,
    policy,
  };

  const evaluated = inputs.plan ? evaluatePlan(inputs.plan, policy) : null;
  const plan = evaluated && {
    ...evaluated,
    offerRunsOutOn:
      evaluated.offerRunwayMonths === null
        ? null
        : addMonths(evaluatedAt, evaluated.offerRunwayMonths),
  };
  const margin = policy.marginRate.value;
  const target = policy.runwayTargetMonths.value;
  const planLine = (p: PlanEvaluation) =>
    `Plan to ${p.milestone}: ${usd(p.monthlyBurnUsd)}/mo for ${p.months} months (milestone plus raising the next round) = ${usd(p.grossCostUsd)}, ${usd(p.withMarginUsd)} with margin.${p.offerUsd !== null ? ` An offer of ${usd(p.offerUsd)} funds ${p.offerRunwayMonths} months at planned burn and ${p.offerCoversPlan ? 'covers' : 'does not cover'} the plan, leaving ${p.offerMonthsAfterMilestone} months after the milestone to raise the next round.` : ''}`;

  if (blocking.length > 0) {
    // Cash alone missing: the need before cash is still computable.
    const onlyCash = blocking.every(gap => gap.input === 'cashUsd');
    const survivalGross = onlyCash
      ? peakNetBurn(pathFrom(inputs), target.min) * (1 + margin)
      : null;
    const grossNeed =
      survivalGross === null && plan === null
        ? null
        : Math.max(survivalGross ?? 0, plan?.withMarginUsd ?? 0);
    const reasoning = blocking.map(
      gap => `Gap: ${gap.input} is ${gap.kind}. ${gap.detail}`
    );
    if (survivalGross !== null) {
      reasoning.push(
        `Survival floor before cash: ${target.min} months of current burn x ${1 + margin} = ${usd(survivalGross)}.`
      );
    }
    if (plan) reasoning.push(planLine(plan));
    if (grossNeed !== null) {
      reasoning.push(
        `Need before cash: ${usd(grossNeed)}. Subtract cash once it is known.`
      );
    }
    return {
      ...base,
      verdict: 'unknown',
      confidence: 'none',
      burn: { totalUsdPerMonth: null, netUsdPerMonth: null },
      runwayMonths: null,
      runwayMonthsFlat: null,
      cashZeroDate: null,
      breakevenMonths: null,
      capitalToProfitabilityUsd: null,
      requiredMrrGrowthRateMonthly: null,
      requiredGrowthNote: 'Unknown until every required input is present.',
      raise: {
        toDefaultAliveUsd: null,
        forRunwayTargetUsd: null,
        forPlanUsd: null,
        grossNeedUsd: grossNeed === null ? null : Math.round(grossNeed),
        recommendedUsd: null,
        rangeUsd: null,
        basis: 'Not computed: required inputs are missing or invalid.',
      },
      timing: { kind: 'unknown', reason: 'Required inputs are missing.' },
      plan,
      reasoning,
    };
  }

  const cash = inputs.cashUsd.value as number;
  const e0 =
    (inputs.fixedBurnUsdPerMonth.value as number) +
    (inputs.variableBurnUsdPerMonth.value as number);
  const r0 = inputs.mrrUsd.value as number;
  const gR = inputs.mrrGrowthRateMonthly.value ?? 0;
  const gE = inputs.expenseGrowthRateMonthly.value as number;
  const path = pathFrom(inputs);
  const reasoning: string[] = [];

  reasoning.push(
    `Burn ${usd(e0)}/mo (fixed ${usd(inputs.fixedBurnUsdPerMonth.value as number)} + variable ${usd(inputs.variableBurnUsdPerMonth.value as number)}), growing ${pct(gE)}/mo. MRR ${usd(r0)}${r0 > 0 ? `, growing ${pct(gR)}/mo` : ''}. Cash ${usd(cash)}.`
  );

  const breakeven = breakevenMonth(path);
  const capital = capitalToProfitability(path);
  const alive = e0 <= r0 || (capital !== null && capital <= cash);
  const verdict: DefaultAliveVerdict = alive ? 'default-alive' : 'default-dead';

  if (e0 <= r0) {
    reasoning.push('Revenue already covers expenses: profitable now.');
  } else if (breakeven === null) {
    reasoning.push(
      r0 <= 0
        ? 'MRR is $0, so no growth rate reaches profitability: default dead until there is revenue to grow.'
        : `MRR growth (${pct(gR)}/mo) does not exceed expense growth (${pct(gE)}/mo), so revenue never catches expenses.`
    );
  } else {
    reasoning.push(
      `Profitable in ${breakeven.toFixed(1)} months after burning ${usd(capital ?? 0)}; cash is ${usd(cash)}, so ${alive ? 'cash lasts: default alive' : 'cash runs out first: default dead'}.`
    );
  }

  const runway = alive ? null : monthsUntilCashZero(path, cash);
  const net = e0 - r0;
  const runwayFlat = net > 0 ? cash / net : null;
  const cashZeroDate = runway === null ? null : addMonths(evaluatedAt, runway);
  if (runway !== null) {
    reasoning.push(
      `Cash hits zero in ${runway.toFixed(1)} months (${cashZeroDate}) on this path.`
    );
  }

  // Required growth: smallest MRR growth whose capital need fits in cash.
  let requiredGrowth: number | null = null;
  let requiredGrowthNote: string;
  if (alive) {
    requiredGrowth = e0 <= r0 ? 0 : gR;
    requiredGrowthNote = 'Already default alive at current growth.';
  } else if (r0 <= 0) {
    requiredGrowthNote =
      'No growth rate works on $0 MRR. The first paying customers come before any growth target.';
  } else {
    const fits = (g: number) => {
      const c = capitalToProfitability({ ...path, lr: Math.log(1 + g) });
      return c !== null && c <= cash;
    };
    if (!fits(MAX_GROWTH_SEARCH)) {
      requiredGrowthNote = `Even ${pct(MAX_GROWTH_SEARCH)}/mo growth does not fit in current cash.`;
    } else {
      const lo = Math.max(gE, -0.99);
      requiredGrowth = bisect(g => (fits(g) ? 1 : -1), lo, MAX_GROWTH_SEARCH);
      requiredGrowthNote = `Default alive needs at least ${pct(requiredGrowth)}/mo MRR growth (current ${pct(gR)}/mo).`;
    }
  }
  reasoning.push(requiredGrowthNote);

  // Raise sizing. Margin applies to the modelled gross need, then cash is
  // subtracted, so a large balance never inflates the ask.
  const need = (gross: number) => Math.max(0, gross * (1 + margin) - cash);
  const toDefaultAlive = capital === null ? null : need(capital);
  const forRunway = {
    min: need(peakNetBurn(path, target.min)),
    max: need(peakNetBurn(path, target.max)),
  };
  const forPlan = plan ? Math.max(0, plan.withMarginUsd - cash) : null;
  if (plan) reasoning.push(planLine(plan));
  const step = policy.roundToUsd.value;
  const low = roundUp(
    Math.max(toDefaultAlive ?? 0, forRunway.min, forPlan ?? 0),
    step
  );
  const high = roundUp(
    Math.max(toDefaultAlive ?? 0, forRunway.max, forPlan ?? 0),
    step
  );
  const basis =
    forPlan !== null && forPlan >= Math.max(toDefaultAlive ?? 0, forRunway.min)
      ? `Plan cost to ${plan?.milestone} x ${1 + margin} margin, minus cash; larger than the survival floor, rounded up to ${usd(step)}.`
      : toDefaultAlive !== null && toDefaultAlive >= forRunway.min
        ? `Capital to profitability x ${1 + margin} margin, minus cash (Blackwell), rounded up to ${usd(step)}.`
        : `${target.min} months of modelled net burn x ${1 + margin} margin, minus cash (PG ${target.min}-month sizing), rounded up to ${usd(step)}.${toDefaultAlive === null ? ' No finite raise reaches default alive on the current path, so runway buys time to find growth.' : ''}`;
  reasoning.push(
    `Raise ${usd(low)} (range ${usd(low)} to ${usd(high)}). ${basis}`
  );

  // Timing: start early enough to close with a buffer before the cliff.
  let timing: RaiseTiming;
  const lead =
    policy.fundraiseDurationMonths.value + policy.closeBufferMonths.value;
  if (runway === null) {
    timing = {
      kind: 'optional',
      reason:
        'Default alive: raising is a choice to grow faster, not survival.',
    };
  } else if (runway <= policy.raiseNowRunwayMonths.value || runway <= lead) {
    timing = {
      kind: 'now',
      reason: `Runway ${runway.toFixed(1)} months is at or under ${Math.max(policy.raiseNowRunwayMonths.value, lead)} months (PG fatal-pinch rule and a ${lead}-month raise lead time).`,
    };
  } else {
    timing = {
      kind: 'by-date',
      startBy: addMonths(evaluatedAt, runway - lead),
      closeBy: addMonths(evaluatedAt, runway - policy.closeBufferMonths.value),
      reason: `Start ${lead} months before the cash cliff: ${policy.fundraiseDurationMonths.value} to raise plus ${policy.closeBufferMonths.value} of buffer.`,
    };
  }
  reasoning.push(`Timing: ${timing.kind}. ${timing.reason}`);

  const stale = gaps.some(gap => gap.kind === 'stale');
  const attested = [
    inputs.cashUsd,
    inputs.fixedBurnUsdPerMonth,
    inputs.variableBurnUsdPerMonth,
  ].some(input => input.basis !== 'measured');
  if (stale) {
    reasoning.push(
      'Some inputs are stale; refresh them and re-run before quoting numbers.'
    );
  }

  return {
    ...base,
    verdict,
    confidence: stale ? 'low' : attested ? 'medium' : 'high',
    burn: { totalUsdPerMonth: round(e0), netUsdPerMonth: round(net) },
    runwayMonths: round(runway),
    runwayMonthsFlat: round(runwayFlat),
    cashZeroDate,
    breakevenMonths: round(breakeven),
    capitalToProfitabilityUsd: round(capital, 0),
    requiredMrrGrowthRateMonthly: round(requiredGrowth, 4),
    requiredGrowthNote,
    raise: {
      toDefaultAliveUsd: round(toDefaultAlive, 0),
      forRunwayTargetUsd: {
        min: round(forRunway.min, 0) as number,
        max: round(forRunway.max, 0) as number,
      },
      forPlanUsd: round(forPlan, 0),
      grossNeedUsd: Math.round(
        Math.max(
          peakNetBurn(path, target.min) * (1 + margin),
          plan?.withMarginUsd ?? 0
        )
      ),
      recommendedUsd: low,
      rangeUsd: { low, high },
      basis,
    },
    timing,
    plan,
    reasoning,
  };
}
