import { assertFinancialOwnerId } from '../owner';
import {
  type AccountInput,
  type ClassifiedTransaction,
  type MetricDirection,
  type MetricEngineInput,
  type MetricFreshness,
  type MetricId,
  type MetricProvenance,
  type MetricResult,
  type MetricState,
  type MetricWindow,
  NON_ECONOMIC_CLASSES,
} from './contracts';

/**
 * Canonical finance metric engine (JOV-4616).
 *
 * Pure and deterministic: `computeMetrics` is a total function of its input,
 * so recalculation is idempotent by construction — when transactions,
 * classifications, rules, account inclusion, or budgets change, re-running
 * the engine over the same range produces the corrected result. Nothing in
 * this module performs IO; repositories and jobs feed it owner-scoped rows.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;
/** Runway beyond this horizon is reported as effectively unbounded. */
const UNBOUNDED_RUNWAY_MONTHS = 120;
/** Minimum covered days before a monthly rate is reported (no misleading
 * annualization of sparse ledgers). */
const MIN_RATE_COVERAGE_DAYS = 14;
const MAX_PROVENANCE_IDS = 500;

const WINDOW_DAYS: Record<MetricWindow, number | null> = {
  rolling_30d: 30,
  trailing_90d: 90,
  annual: 365,
  history: null,
};

const METRIC_DIRECTIONS: Record<MetricId, MetricDirection> = {
  available_cash: 'higher_is_better',
  personal_income: 'higher_is_better',
  creator_income: 'higher_is_better',
  creator_income_trailing_monthly: 'higher_is_better',
  personal_essential_burn: 'lower_is_better',
  personal_discretionary_spend: 'lower_is_better',
  creator_operating_burn: 'lower_is_better',
  creator_investment_spend: 'lower_is_better',
  tax_reserve_requirement: 'lower_is_better',
  total_survival_burn: 'lower_is_better',
  net_cash_flow: 'higher_is_better',
  runway_months: 'higher_is_better',
  coverage_personal_burn: 'higher_is_better',
  coverage_survival_burn: 'higher_is_better',
  budget_variance: 'lower_is_better',
};

interface Range {
  start: Date;
  end: Date;
  days: number;
  coverageDays: number;
  coverage: number;
}

function windowRange(input: MetricEngineInput, prior: boolean): Range {
  const end = new Date(input.asOf);
  const windowDays = WINDOW_DAYS[input.window];
  const historyStart = input.historyStartAt
    ? new Date(input.historyStartAt).getTime()
    : Number.NEGATIVE_INFINITY;

  let start: Date;
  let endBound = end;
  if (windowDays === null) {
    start = new Date(
      historyStart === Number.NEGATIVE_INFINITY ? 0 : historyStart
    );
  } else {
    const length = windowDays * DAY_MS;
    if (prior) {
      endBound = new Date(end.getTime() - length);
    }
    start = new Date(endBound.getTime() - length);
    if (historyStart > start.getTime()) start = new Date(historyStart);
  }

  const days = Math.max(0, (endBound.getTime() - start.getTime()) / DAY_MS);
  const totalDays = windowDays ?? Math.max(days, 1);
  return {
    start,
    end: endBound,
    days,
    coverageDays: days,
    coverage: Math.min(1, days / totalDays),
  };
}

function inRange(tx: ClassifiedTransaction, range: Range): boolean {
  const t = new Date(tx.occurredAt).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

function buildProvenance(
  range: Range,
  included: readonly ClassifiedTransaction[],
  excluded: readonly ClassifiedTransaction[],
  accountIds: readonly string[]
): MetricProvenance {
  const classificationCounts: Record<string, number> = {};
  const ruleIds = new Set<string>();
  for (const tx of included) {
    classificationCounts[tx.classification] =
      (classificationCounts[tx.classification] ?? 0) + 1;
    if (tx.ruleId) ruleIds.add(tx.ruleId);
  }
  const transactionIds = included.map(tx => tx.id);
  return {
    accountIds,
    classificationCounts,
    ruleIds: [...ruleIds].sort(),
    dateRange: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    transactionIds: transactionIds.slice(0, MAX_PROVENANCE_IDS),
    transactionIdsTruncated: transactionIds.length > MAX_PROVENANCE_IDS,
    excludedTransactionIds: excluded.map(tx => tx.id),
  };
}

function freshness(
  input: MetricEngineInput,
  accounts: readonly AccountInput[]
): MetricFreshness {
  const staleAfterMs = (input.staleAfterHours ?? 48) * 60 * 60 * 1000;
  const asOf = new Date(input.asOf).getTime();
  const stamps = [
    input.lastSyncAt,
    ...accounts.map(a => a.balanceUpdatedAt),
  ].filter((s): s is string => Boolean(s));
  if (stamps.length === 0) return 'unknown';
  const newest = Math.max(...stamps.map(s => new Date(s).getTime()));
  return asOf - newest > staleAfterMs ? 'stale' : 'fresh';
}

function confidence(
  range: Range,
  txs: readonly ClassifiedTransaction[]
): 'high' | 'medium' | 'low' {
  const pending = txs.filter(tx => tx.pending).length;
  if (range.coverage >= 0.9 && pending / Math.max(1, txs.length) < 0.05)
    return 'high';
  if (range.coverage >= 0.5) return 'medium';
  return 'low';
}

function result(
  id: MetricId,
  input: MetricEngineInput,
  args: {
    value: number | null;
    priorValue: number | null;
    state?: MetricState;
    range: Range;
    included: readonly ClassifiedTransaction[];
    excluded: readonly ClassifiedTransaction[];
    accountIds: readonly string[];
    freshness: MetricFreshness;
  }
): MetricResult {
  const { value, priorValue, range } = args;
  const delta =
    value === null || priorValue === null ? null : value - priorValue;
  const deltaPct =
    delta === null || priorValue === null || priorValue === 0
      ? null
      : delta / Math.abs(priorValue);
  const direction = METRIC_DIRECTIONS[id];
  return {
    id,
    value,
    priorValue,
    delta,
    deltaPct,
    direction,
    deltaIsGood:
      delta === null
        ? null
        : direction === 'higher_is_better'
          ? delta >= 0
          : delta <= 0,
    state: args.state ?? 'ok',
    freshness: args.freshness,
    confidence: confidence(range, args.included),
    window: input.window,
    coverage: range.coverage,
    provenance: buildProvenance(
      range,
      args.included,
      args.excluded,
      args.accountIds
    ),
  };
}

/**
 * Sum signed amounts for one class. `in` returns net inflow (reversals on an
 * income class reduce it); `out` returns net outflow as a positive magnitude
 * (refunds on a spend class reduce it).
 */
function sum(
  txs: readonly ClassifiedTransaction[],
  cls: string,
  sign: 'in' | 'out'
): number {
  let total = 0;
  for (const tx of txs) {
    if (tx.classification === cls) total += tx.amountCents;
  }
  return (sign === 'in' ? total : -total) || 0;
}

/** Monthly rate in cents, or null when coverage is too sparse to annualize. */
function monthlyRate(totalCents: number, range: Range): number | null {
  if (range.coverageDays < MIN_RATE_COVERAGE_DAYS) return null;
  return (totalCents / range.coverageDays) * DAYS_PER_MONTH;
}

/**
 * Compute every canonical metric for one owner, one window. Deterministic
 * and total: the same input always yields the same output, and all states
 * (insufficient data, stale sync, zero burn, positive cash flow, unbounded
 * runway, …) are explicit labels rather than thrown errors.
 */
export function computeMetrics(
  input: MetricEngineInput
): Readonly<Record<MetricId, MetricResult>> {
  assertFinancialOwnerId(input.ownerUserId);

  const accounts = input.accounts.filter(a => a.include);
  const accountIds = accounts.map(a => a.id).sort();
  const fresh = freshness(input, accounts);
  const stale = fresh === 'stale';

  const current = windowRange(input, false);
  // The 'history' window has no meaningful prior period.
  const hasPrior = input.window !== 'history';
  const prior = hasPrior
    ? windowRange(input, true)
    : {
        start: new Date(input.asOf),
        end: new Date(input.asOf),
        days: 0,
        coverageDays: 0,
        coverage: 0,
      };
  const txOf = (range: Range) => {
    const all = input.transactions.filter(tx => inRange(tx, range));
    return {
      included: all.filter(
        tx =>
          !NON_ECONOMIC_CLASSES.has(tx.classification) &&
          accountIds.includes(tx.accountId)
      ),
      excluded: all.filter(
        tx =>
          NON_ECONOMIC_CLASSES.has(tx.classification) ||
          !accountIds.includes(tx.accountId)
      ),
    };
  };
  const cur = txOf(current);
  const pri = txOf(prior);

  const stateFor = (base?: MetricState): MetricState | undefined =>
    base ?? (stale ? 'stale_data' : undefined);

  const totals = (r: typeof cur) => ({
    personalIncome: sum(r.included, 'personal_income', 'in'),
    creatorIncome: sum(r.included, 'creator_income', 'in'),
    personalEssential: sum(r.included, 'personal_essential', 'out'),
    personalDiscretionary: sum(r.included, 'personal_discretionary', 'out'),
    creatorOperating: sum(r.included, 'creator_operating', 'out'),
    creatorInvestment: sum(r.included, 'creator_investment', 'out'),
    taxReservePaid: sum(r.included, 'tax_reserve', 'out'),
  });
  const c = totals(cur);
  const p = totals(pri);

  const availableCash = accounts.reduce(
    (acc, a) => acc + (a.availableBalanceCents ?? a.currentBalanceCents ?? 0),
    0
  );

  // Monthly rates (null → insufficient data, never annualized from a trickle).
  const essentialM = monthlyRate(c.personalEssential, current);
  const discretionaryM = monthlyRate(c.personalDiscretionary, current);
  const operatingM = monthlyRate(c.creatorOperating, current);
  const investmentM = monthlyRate(c.creatorInvestment, current);
  const creatorIncomeM = monthlyRate(c.creatorIncome, current);
  const personalIncomeM = monthlyRate(c.personalIncome, current);

  const pEssentialM = monthlyRate(p.personalEssential, prior);
  const pDiscretionaryM = monthlyRate(p.personalDiscretionary, prior);
  const pOperatingM = monthlyRate(p.creatorOperating, prior);
  const pInvestmentM = monthlyRate(p.creatorInvestment, prior);
  const pCreatorIncomeM = monthlyRate(p.creatorIncome, prior);

  const taxRate = input.budgets?.taxReserveRate ?? 0;
  const taxReserveM = creatorIncomeM === null ? null : creatorIncomeM * taxRate;
  const pTaxReserveM =
    pCreatorIncomeM === null ? null : pCreatorIncomeM * taxRate;

  const add = (...xs: (number | null)[]) =>
    xs.some(x => x === null)
      ? null
      : (xs as number[]).reduce((a, b) => a + b, 0);

  const personalBurnM = add(essentialM, discretionaryM);
  const survivalM = add(essentialM, operatingM, taxReserveM);
  const pSurvivalM = add(pEssentialM, pOperatingM, pTaxReserveM);
  const pPersonalBurnM = add(pEssentialM, pDiscretionaryM);

  const netFlowM = add(
    personalIncomeM,
    creatorIncomeM,
    essentialM === null ? null : -essentialM,
    discretionaryM === null ? null : -discretionaryM,
    operatingM === null ? null : -operatingM,
    investmentM === null ? null : -investmentM,
    taxReserveM === null ? null : -taxReserveM
  );

  // Runway
  let runway: number | null = null;
  let runwayState: MetricState = 'ok';
  if (accounts.length === 0 || survivalM === null) {
    runwayState = 'insufficient_data';
  } else if (availableCash <= 0) {
    runway = 0;
    runwayState = 'zero_cash';
  } else if (survivalM <= 0) {
    runwayState = 'zero_burn';
  } else {
    runway = availableCash / survivalM;
    if (runway > UNBOUNDED_RUNWAY_MONTHS) {
      runwayState = 'unbounded_runway';
    } else if ((netFlowM ?? 0) > 0) {
      runwayState = 'positive_cash_flow';
    }
  }

  const coverageOf = (income: number | null, burn: number | null) =>
    income === null || burn === null || burn <= 0 ? null : income / burn;

  const budgetVariance = (() => {
    const b = input.budgets;
    if (!b) return null;
    const parts = [
      b.personalEssentialCents !== undefined && essentialM !== null
        ? essentialM - b.personalEssentialCents
        : null,
      b.personalDiscretionaryCents !== undefined && discretionaryM !== null
        ? discretionaryM - b.personalDiscretionaryCents
        : null,
      b.creatorOperatingCents !== undefined && operatingM !== null
        ? operatingM - b.creatorOperatingCents
        : null,
      b.creatorInvestmentCents !== undefined && investmentM !== null
        ? investmentM - b.creatorInvestmentCents
        : null,
    ].filter((x): x is number => x !== null);
    return parts.length === 0 ? null : parts.reduce((a, v) => a + v, 0);
  })();

  const base = {
    range: current,
    included: cur.included,
    excluded: cur.excluded,
    accountIds,
    freshness: fresh,
  };

  const insufficient = current.coverageDays < MIN_RATE_COVERAGE_DAYS;

  return {
    available_cash: result('available_cash', input, {
      ...base,
      value: accounts.length === 0 ? null : availableCash,
      priorValue: null,
      state:
        accounts.length === 0
          ? 'insufficient_data'
          : stateFor(availableCash <= 0 ? 'zero_cash' : undefined),
    }),
    personal_income: result('personal_income', input, {
      ...base,
      value: c.personalIncome,
      priorValue: hasPrior ? p.personalIncome : null,
      state: stateFor(insufficient ? 'insufficient_data' : undefined),
    }),
    creator_income: result('creator_income', input, {
      ...base,
      value: c.creatorIncome,
      priorValue: hasPrior ? p.creatorIncome : null,
      state: stateFor(insufficient ? 'insufficient_data' : undefined),
    }),
    // Trailing monthly average — a labeled average of irregular creator
    // income, never a recurring-guarantee projection.
    creator_income_trailing_monthly: result(
      'creator_income_trailing_monthly',
      input,
      {
        ...base,
        value: creatorIncomeM,
        priorValue: hasPrior ? pCreatorIncomeM : null,
        state: stateFor(
          creatorIncomeM === null ? 'insufficient_data' : undefined
        ),
      }
    ),
    personal_essential_burn: result('personal_essential_burn', input, {
      ...base,
      value: essentialM,
      priorValue: hasPrior ? pEssentialM : null,
      state: stateFor(essentialM === null ? 'insufficient_data' : undefined),
    }),
    personal_discretionary_spend: result(
      'personal_discretionary_spend',
      input,
      {
        ...base,
        value: discretionaryM,
        priorValue: hasPrior ? pDiscretionaryM : null,
        state: stateFor(
          discretionaryM === null ? 'insufficient_data' : undefined
        ),
      }
    ),
    creator_operating_burn: result('creator_operating_burn', input, {
      ...base,
      value: operatingM,
      priorValue: hasPrior ? pOperatingM : null,
      state: stateFor(operatingM === null ? 'insufficient_data' : undefined),
    }),
    creator_investment_spend: result('creator_investment_spend', input, {
      ...base,
      value: investmentM,
      priorValue: hasPrior ? pInvestmentM : null,
      state: stateFor(investmentM === null ? 'insufficient_data' : undefined),
    }),
    tax_reserve_requirement: result('tax_reserve_requirement', input, {
      ...base,
      value: taxReserveM,
      priorValue: hasPrior ? pTaxReserveM : null,
      state: stateFor(taxReserveM === null ? 'insufficient_data' : undefined),
    }),
    total_survival_burn: result('total_survival_burn', input, {
      ...base,
      value: survivalM,
      priorValue: hasPrior ? pSurvivalM : null,
      state: stateFor(
        survivalM === null
          ? 'insufficient_data'
          : survivalM <= 0
            ? 'zero_burn'
            : undefined
      ),
    }),
    net_cash_flow: result('net_cash_flow', input, {
      ...base,
      value: netFlowM,
      priorValue: null,
      state: stateFor(
        netFlowM === null
          ? 'insufficient_data'
          : netFlowM > 0
            ? 'positive_cash_flow'
            : undefined
      ),
    }),
    runway_months: result('runway_months', input, {
      ...base,
      value: runway,
      priorValue: null,
      state: stale && runwayState === 'ok' ? 'stale_data' : runwayState,
    }),
    coverage_personal_burn: result('coverage_personal_burn', input, {
      ...base,
      value: coverageOf(creatorIncomeM, personalBurnM),
      priorValue: hasPrior ? coverageOf(pCreatorIncomeM, pPersonalBurnM) : null,
      state: stateFor(
        coverageOf(creatorIncomeM, personalBurnM) === null
          ? 'insufficient_data'
          : undefined
      ),
    }),
    coverage_survival_burn: result('coverage_survival_burn', input, {
      ...base,
      value: coverageOf(creatorIncomeM, survivalM),
      priorValue: hasPrior ? coverageOf(pCreatorIncomeM, pSurvivalM) : null,
      state: stateFor(
        coverageOf(creatorIncomeM, survivalM) === null
          ? 'insufficient_data'
          : undefined
      ),
    }),
    budget_variance: result('budget_variance', input, {
      ...base,
      value: budgetVariance,
      priorValue: null,
      state: stateFor(
        budgetVariance === null ? 'insufficient_data' : undefined
      ),
    }),
  };
}

/**
 * Creator/workspace-safe projection (JOV-4609 boundary): shared creator
 * surfaces may only see creator-business spend metrics — never personal
 * burn, income, cash position, coverage, or runway. The returned object is a
 * new map containing only creator-scoped ids, so handing the engine output
 * to a shared surface through this function cannot leak personal data.
 */
export const CREATOR_SAFE_METRIC_IDS: ReadonlySet<MetricId> = new Set([
  'creator_operating_burn',
  'creator_investment_spend',
]);

export function projectCreatorSafeMetrics(
  results: Readonly<Record<MetricId, MetricResult>>
): Readonly<Record<string, MetricResult>> {
  const out: Record<string, MetricResult> = {};
  for (const id of CREATOR_SAFE_METRIC_IDS) {
    out[id] = results[id];
  }
  return out;
}

export type { AccountInput };
