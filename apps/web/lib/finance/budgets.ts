import type {
  FinanceBudgetTarget,
  FinanceTransaction,
} from '@/lib/db/schema/finance';

/**
 * Budget domain logic (JOV-4620).
 *
 * Pure functions over owner-scoped rows. No I/O, no auth — callers must
 * already hold the financial owner's id and owner-filtered rows. Everything
 * here is deterministic so budget math is reproducible from the ledger.
 */

/** Sentinel `month` value for the recurring baseline target of a category. */
export const BUDGET_BASELINE_MONTH = 'baseline' as const;

/** Canonical budget categories. */
export const FINANCE_BUDGET_CATEGORIES = [
  'personal_essentials',
  'personal_discretionary',
  'creator_operating',
  'creator_investment',
  'taxes_reserves',
  'personal_income',
  'creator_income',
] as const;

export type FinanceBudgetCategory = (typeof FINANCE_BUDGET_CATEGORIES)[number];

export const FINANCE_EXPENSE_CATEGORIES = [
  'personal_essentials',
  'personal_discretionary',
  'creator_operating',
  'creator_investment',
  'taxes_reserves',
] as const satisfies readonly FinanceBudgetCategory[];

export const FINANCE_INCOME_CATEGORIES = [
  'personal_income',
  'creator_income',
] as const satisfies readonly FinanceBudgetCategory[];

const CATEGORY_SET: ReadonlySet<string> = new Set(FINANCE_BUDGET_CATEGORIES);
const INCOME_SET: ReadonlySet<string> = new Set(FINANCE_INCOME_CATEGORIES);

export function isFinanceBudgetCategory(
  value: unknown
): value is FinanceBudgetCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value);
}

/** Income categories measure money in; all others measure money out. */
export function isIncomeCategory(category: FinanceBudgetCategory): boolean {
  return INCOME_SET.has(category);
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidBudgetMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

export function isValidBudgetScope(
  value: unknown
): value is typeof BUDGET_BASELINE_MONTH | string {
  return value === BUDGET_BASELINE_MONTH || isValidBudgetMonth(value);
}

/**
 * Map a raw ledger `category` string to a budget bucket.
 *
 * Provider classifications (e.g. Plaid personal-finance categories) are
 * normalized case-insensitively. Unknown or missing categories return null
 * — those transactions still count toward confidence so the owner can see
 * how much of the ledger is unclassified.
 */
const CATEGORY_ALIASES: Readonly<Record<string, FinanceBudgetCategory>> = {
  personal_essentials: 'personal_essentials',
  rent: 'personal_essentials',
  mortgage: 'personal_essentials',
  utilities: 'personal_essentials',
  groceries: 'personal_essentials',
  food_and_drink: 'personal_essentials',
  groceries_and_dining: 'personal_essentials',
  healthcare: 'personal_essentials',
  medical: 'personal_essentials',
  insurance: 'personal_essentials',
  transportation: 'personal_essentials',
  personal_discretionary: 'personal_discretionary',
  entertainment: 'personal_discretionary',
  travel: 'personal_discretionary',
  shopping: 'personal_discretionary',
  general_merchandise: 'personal_discretionary',
  personal_care: 'personal_discretionary',
  creator_operating: 'creator_operating',
  business_software: 'creator_operating',
  software: 'creator_operating',
  subscriptions: 'creator_operating',
  equipment: 'creator_operating',
  studio: 'creator_operating',
  contractor: 'creator_operating',
  contractor_services: 'creator_operating',
  creator_investment: 'creator_investment',
  advertising: 'creator_investment',
  marketing: 'creator_investment',
  campaign: 'creator_investment',
  promotion: 'creator_investment',
  taxes_reserves: 'taxes_reserves',
  tax: 'taxes_reserves',
  taxes: 'taxes_reserves',
  savings: 'taxes_reserves',
  reserves: 'taxes_reserves',
  personal_income: 'personal_income',
  salary: 'personal_income',
  payroll: 'personal_income',
  wages: 'personal_income',
  creator_income: 'creator_income',
  royalties: 'creator_income',
  royalty: 'creator_income',
  streaming: 'creator_income',
  merchandise: 'creator_income',
  tips: 'creator_income',
  payout: 'creator_income',
};

export function classifyBudgetCategory(
  rawCategory: string | null | undefined
): FinanceBudgetCategory | null {
  if (!rawCategory) return null;
  return CATEGORY_ALIASES[rawCategory.trim().toLowerCase()] ?? null;
}

export type BudgetTargetSource = 'override' | 'baseline' | 'none';

export interface ResolvedBudgetTarget {
  readonly category: FinanceBudgetCategory;
  readonly amount: number | null;
  readonly source: BudgetTargetSource;
}

/**
 * Resolve the effective target for a category in a month. A month-specific
 * override row always wins over the recurring baseline; history stays stable
 * because overrides never mutate the baseline row.
 */
export function resolveBudgetTarget(
  targets: readonly FinanceBudgetTarget[],
  category: FinanceBudgetCategory,
  month: string
): ResolvedBudgetTarget {
  const override = targets.find(
    t => t.category === category && t.month === month
  );
  if (override) {
    return {
      category,
      amount: Number(override.targetAmount),
      source: 'override',
    };
  }
  const baseline = targets.find(
    t => t.category === category && t.month === BUDGET_BASELINE_MONTH
  );
  if (baseline) {
    return {
      category,
      amount: Number(baseline.targetAmount),
      source: 'baseline',
    };
  }
  return { category, amount: null, source: 'none' };
}

/**
 * Sum ledger actuals per budget bucket for a month.
 *
 * Amount sign convention matches the ledger: positive = money out (spend),
 * negative = money in (income). Expense buckets sum positive amounts;
 * income buckets sum the absolute value of negative amounts. Transactions
 * whose sign contradicts the bucket direction (e.g. a refund into an expense
 * bucket) still net against that bucket so totals reconcile exactly to the
 * classified ledger.
 */
export function sumActualsByCategory(
  transactions: readonly Pick<
    FinanceTransaction,
    'amount' | 'category' | 'accountId'
  >[],
  includedAccountIds?: readonly string[] | null
): Record<FinanceBudgetCategory, number> & {
  unclassifiedTotal: number;
  unclassifiedCount: number;
} {
  const sums = Object.fromEntries(
    FINANCE_BUDGET_CATEGORIES.map(c => [c, 0])
  ) as Record<FinanceBudgetCategory, number>;
  const include =
    includedAccountIds && includedAccountIds.length > 0
      ? new Set(includedAccountIds)
      : null;
  let unclassifiedTotal = 0;
  let unclassifiedCount = 0;
  for (const tx of transactions) {
    if (include && !include.has(tx.accountId)) continue;
    const bucket = classifyBudgetCategory(tx.category);
    const amount = Number(tx.amount);
    if (!bucket) {
      unclassifiedTotal += Math.abs(amount);
      unclassifiedCount += 1;
      continue;
    }
    sums[bucket] += isIncomeCategory(bucket) ? -amount : amount;
  }
  return { ...sums, unclassifiedTotal, unclassifiedCount };
}

export type VarianceDirection = 'favorable' | 'unfavorable' | 'on_target';

export interface BudgetLineVariance {
  readonly category: FinanceBudgetCategory;
  readonly target: number | null;
  readonly actual: number;
  /** actual − target for expenses; target − actual for income. */
  readonly variance: number | null;
  /** Signed percent vs target; null when the target is zero or absent. */
  readonly variancePercent: number | null;
  /**
   * Category-aware direction: spending under budget and earning over target
   * are both favorable.
   */
  readonly direction: VarianceDirection;
  /** Straight-line month-end projection from elapsed days. */
  readonly projectedMonthEnd: number;
  readonly source: BudgetTargetSource;
}

export interface BudgetSustainability {
  /** Target creator income needed to cover creator cost targets. */
  readonly creatorCostBreakEven: number;
  /** Creator income needed to also cover personal essentials. */
  readonly essentialsBreakEven: number;
  /** Creator income needed to cover the full survival burn. */
  readonly survivalBurnBreakEven: number;
  /** Total survival-burn target (all expense categories). */
  readonly survivalBurnTarget: number;
  /** Share of survival burn covered by the creator-income target (0-1+). */
  readonly creatorIncomeCoverageTarget: number | null;
}

export type BudgetConfidence = 'high' | 'medium' | 'low';

export interface BudgetSummary {
  readonly month: string;
  readonly lines: readonly BudgetLineVariance[];
  readonly totals: {
    readonly targetExpenses: number;
    readonly actualExpenses: number;
    readonly targetIncome: number;
    readonly actualIncome: number;
  };
  readonly sustainability: BudgetSustainability;
  readonly dataFreshness: { readonly latestTransactionAt: string | null };
  readonly confidence: BudgetConfidence;
  /** Machine-readable review actions for over-budget lines / income gaps. */
  readonly reviewActions: readonly string[];
}

export function projectMonthEnd(
  actual: number,
  daysElapsed: number,
  daysInMonth: number
): number {
  if (daysElapsed <= 0 || daysInMonth <= 0) return actual;
  return (actual / Math.min(daysElapsed, daysInMonth)) * daysInMonth;
}

function directionFor(
  category: FinanceBudgetCategory,
  target: number,
  actual: number
): VarianceDirection {
  const diff = isIncomeCategory(category) ? actual - target : target - actual;
  const tolerance = Math.max(Math.abs(target) * 0.005, 0.01);
  if (Math.abs(diff) <= tolerance) return 'on_target';
  return diff > 0 ? 'favorable' : 'unfavorable';
}

function daysInUtcMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function elapsedDays(month: string, now: Date): number {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const nowMs = now.getTime();
  if (nowMs < start) return 0;
  const end = Date.UTC(y, m, 1);
  if (nowMs >= end) return daysInUtcMonth(month);
  return Math.max(1, Math.floor((nowMs - start) / 86_400_000) + 1);
}

export function assessBudgetConfidence(input: {
  readonly transactionCount: number;
  readonly unclassifiedCount: number;
  readonly unclassifiedTotal: number;
  readonly actualTotal: number;
  readonly daysElapsed: number;
  readonly daysInMonth: number;
}): BudgetConfidence {
  if (input.transactionCount === 0) return 'low';
  const unclassifiedShare =
    input.transactionCount === 0
      ? 0
      : input.unclassifiedCount / input.transactionCount;
  const elapsedShare =
    input.daysInMonth === 0 ? 0 : input.daysElapsed / input.daysInMonth;
  if (unclassifiedShare > 0.25 || elapsedShare < 0.25) return 'low';
  if (unclassifiedShare > 0.1 || elapsedShare < 0.5) return 'medium';
  return 'high';
}

function buildReviewActions(lines: readonly BudgetLineVariance[]): string[] {
  const actions: string[] = [];
  for (const line of lines) {
    if (line.target === null || line.direction !== 'unfavorable') continue;
    const gap = Math.abs(line.variance ?? 0);
    actions.push(
      isIncomeCategory(line.category)
        ? `income_gap:${line.category}:${gap.toFixed(2)}`
        : `over_budget:${line.category}:${gap.toFixed(2)}`
    );
  }
  return actions;
}

/**
 * Build the full month budget summary: effective targets, actuals, variance,
 * projections, break-even, freshness, confidence, and review actions.
 */
export function summarizeBudget(input: {
  readonly month: string;
  readonly targets: readonly FinanceBudgetTarget[];
  readonly transactions: readonly Pick<
    FinanceTransaction,
    'amount' | 'category' | 'accountId' | 'occurredAt'
  >[];
  readonly includedAccountIds?: readonly string[] | null;
  readonly now?: Date;
}): BudgetSummary {
  const { month, targets, transactions, includedAccountIds } = input;
  const now = input.now ?? new Date();
  const dim = daysInUtcMonth(month);
  const elapsed = elapsedDays(month, now);

  const actuals = sumActualsByCategory(transactions, includedAccountIds);

  const lines: BudgetLineVariance[] = FINANCE_BUDGET_CATEGORIES.map(
    category => {
      const resolved = resolveBudgetTarget(targets, category, month);
      const actual = actuals[category];
      const target = resolved.amount;
      const variance = target === null ? null : actual - target;
      const variancePercent =
        target === null || target === 0 ? null : (variance as number) / target;
      return {
        category,
        target,
        actual,
        variance,
        variancePercent,
        direction:
          target === null
            ? 'on_target'
            : directionFor(category, target, actual),
        projectedMonthEnd: projectMonthEnd(actual, elapsed, dim),
        source: resolved.source,
      };
    }
  );

  const targetOf = (c: FinanceBudgetCategory) =>
    lines.find(l => l.category === c)?.target ?? 0;

  const creatorCostTarget =
    targetOf('creator_operating') + targetOf('creator_investment');
  const essentialsTarget = targetOf('personal_essentials');
  const survivalBurnTarget = FINANCE_EXPENSE_CATEGORIES.reduce(
    (sum, c) => sum + targetOf(c),
    0
  );
  const personalIncomeTarget = targetOf('personal_income');
  const creatorIncomeTarget = targetOf('creator_income');

  const latestTx = transactions.reduce<Date | null>((acc, tx) => {
    const at =
      tx.occurredAt instanceof Date ? tx.occurredAt : new Date(tx.occurredAt);
    return acc === null || at > acc ? at : acc;
  }, null);

  const countedTransactions = transactions.filter(
    tx =>
      !includedAccountIds ||
      includedAccountIds.length === 0 ||
      includedAccountIds.includes(tx.accountId)
  );

  return {
    month,
    lines,
    totals: {
      targetExpenses: survivalBurnTarget,
      actualExpenses: FINANCE_EXPENSE_CATEGORIES.reduce(
        (sum, c) => sum + actuals[c],
        0
      ),
      targetIncome: personalIncomeTarget + creatorIncomeTarget,
      actualIncome: actuals.personal_income + actuals.creator_income,
    },
    sustainability: {
      creatorCostBreakEven: Math.max(
        0,
        creatorCostTarget - personalIncomeTarget
      ),
      essentialsBreakEven: Math.max(
        0,
        creatorCostTarget + essentialsTarget - personalIncomeTarget
      ),
      survivalBurnBreakEven: Math.max(
        0,
        survivalBurnTarget - personalIncomeTarget
      ),
      survivalBurnTarget,
      creatorIncomeCoverageTarget:
        survivalBurnTarget === 0
          ? null
          : creatorIncomeTarget / survivalBurnTarget,
    },
    dataFreshness: {
      latestTransactionAt: latestTx ? latestTx.toISOString() : null,
    },
    confidence: assessBudgetConfidence({
      transactionCount: countedTransactions.length,
      unclassifiedCount: actuals.unclassifiedCount,
      unclassifiedTotal: actuals.unclassifiedTotal,
      actualTotal:
        FINANCE_EXPENSE_CATEGORIES.reduce((s, c) => s + actuals[c], 0) +
        actuals.personal_income +
        actuals.creator_income,
      daysElapsed: elapsed,
      daysInMonth: dim,
    }),
    reviewActions: buildReviewActions(lines),
  };
}
