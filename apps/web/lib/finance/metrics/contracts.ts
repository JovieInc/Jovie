/**
 * Canonical finance metric contracts (JOV-4616; consumes the JOV-4610 domain
 * model and the JOV-4615 classified ledger).
 *
 * These types are the single vocabulary for dashboard, drilldown, forecast,
 * export, and assistant surfaces. Money is ALWAYS integer minor units
 * (cents) — the classified ledger converts provider `numeric` strings once at
 * the boundary so every downstream calculation is deterministic.
 */

/** Canonical transaction classification (JOV-4610 contract). */
export const TRANSACTION_CLASSES = [
  'personal_income',
  'creator_income',
  'personal_essential',
  'personal_discretionary',
  'creator_operating',
  'creator_investment',
  'tax_reserve',
  'internal_transfer',
  'credit_card_payment',
  'excluded',
] as const;

export type TransactionClass = (typeof TRANSACTION_CLASSES)[number];

/**
 * Classes that never represent economic movement and are always excluded
 * from income, burn, and cash-flow math (they still appear in provenance as
 * excluded so every displayed value can show its exclusions).
 */
export const NON_ECONOMIC_CLASSES: ReadonlySet<TransactionClass> = new Set([
  'internal_transfer',
  'credit_card_payment',
  'excluded',
]);

/** A classified ledger entry (JOV-4615 output shape). */
export interface ClassifiedTransaction {
  readonly id: string;
  readonly accountId: string;
  /** ISO-8601 timestamp. */
  readonly occurredAt: string;
  /** Signed minor units: positive = inflow, negative = outflow. */
  readonly amountCents: number;
  readonly classification: TransactionClass;
  /** Pending transactions are included in sums but lower confidence. */
  readonly pending?: boolean;
  /** Id of the classification rule that produced `classification`, if any. */
  readonly ruleId?: string;
  /** Id of a transaction this entry corrects/supersedes, if any. */
  readonly correctedTransactionId?: string;
}

/** An account inclusion + balance view for the cash metric. */
export interface AccountInput {
  readonly id: string;
  /** Excluded accounts contribute to no metric. */
  readonly include: boolean;
  /** Minor units; `availableBalanceCents` preferred over current. */
  readonly availableBalanceCents: number | null;
  readonly currentBalanceCents: number | null;
  readonly balanceUpdatedAt?: string;
}

export const METRIC_WINDOWS = [
  'rolling_30d',
  'trailing_90d',
  'annual',
  'history',
] as const;

export type MetricWindow = (typeof METRIC_WINDOWS)[number];

/** Monthly budget targets in minor units. */
export interface MetricBudgets {
  readonly personalEssentialCents?: number;
  readonly personalDiscretionaryCents?: number;
  readonly creatorOperatingCents?: number;
  readonly creatorInvestmentCents?: number;
  /** Configurable tax/reserve requirement as a fraction of creator income. */
  readonly taxReserveRate?: number;
}

/** Everything the engine needs; a pure function of these inputs. */
export interface MetricEngineInput {
  readonly ownerUserId: string;
  /** ISO-8601 instant the metrics describe (usually "now"). */
  readonly asOf: string;
  readonly window: MetricWindow;
  readonly accounts: readonly AccountInput[];
  /** Classified ledger entries; the engine applies the window filter. */
  readonly transactions: readonly ClassifiedTransaction[];
  readonly budgets?: MetricBudgets;
  /** Earliest date the ledger is known to be complete from. */
  readonly historyStartAt?: string;
  /** Last successful provider sync; drives stale-data state. */
  readonly lastSyncAt?: string;
  /** Defaults to 48 hours. */
  readonly staleAfterHours?: number;
}

export const METRIC_IDS = [
  'available_cash',
  'personal_income',
  'creator_income',
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
  'budget_variance',
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

/**
 * Deterministic metric states. `ok` is the only state implying a normally
 * comparable value; every other state is a labeled, deliberate condition.
 */
export const METRIC_STATES = [
  'ok',
  'insufficient_data',
  'stale_data',
  'reconciliation_anomaly',
  'zero_burn',
  'zero_cash',
  'positive_cash_flow',
  'unbounded_runway',
] as const;

export type MetricState = (typeof METRIC_STATES)[number];

/** Whether an increase is good or bad — arrows must encode this per metric. */
export type MetricDirection = 'higher_is_better' | 'lower_is_better';

export type MetricFreshness = 'fresh' | 'stale' | 'unknown';
export type MetricConfidence = 'high' | 'medium' | 'low';

/** Provenance from a metric back to everything that produced it. */
export interface MetricProvenance {
  readonly accountIds: readonly string[];
  readonly classificationCounts: Readonly<Record<string, number>>;
  readonly ruleIds: readonly string[];
  readonly dateRange: { readonly start: string; readonly end: string };
  readonly transactionIds: readonly string[];
  readonly transactionIdsTruncated: boolean;
  readonly excludedTransactionIds: readonly string[];
}

export interface MetricResult {
  readonly id: MetricId;
  /** Minor units, ratio (0–1+), or months, depending on the metric. */
  readonly value: number | null;
  readonly priorValue: number | null;
  readonly delta: number | null;
  /** Fractional change (0.05 = +5%); null when undefined (e.g. 0 → x). */
  readonly deltaPct: number | null;
  readonly direction: MetricDirection;
  /** True when the movement direction is favorable for this metric. */
  readonly deltaIsGood: boolean | null;
  readonly state: MetricState;
  readonly freshness: MetricFreshness;
  readonly confidence: MetricConfidence;
  readonly window: MetricWindow;
  /** Coverage fraction (0–1) of the window with complete ledger data. */
  readonly coverage: number;
  readonly provenance: MetricProvenance;
}
