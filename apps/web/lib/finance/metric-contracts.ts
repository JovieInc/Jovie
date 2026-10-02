import type { FinanceCategory } from './domain-contracts';

/** One source of truth for finance labels, formulas, windows, and semantics. */
export const FINANCE_METRIC_VERSION = 'finance-metrics/v1' as const;
export const DAYS_PER_MEAN_MONTH = 365.2425 / 12;
export const DEFAULT_TAX_RESERVE_RATE_BPS = 0;

export const FINANCE_WINDOW_IDS = [
  'point_in_time',
  'calendar_month_to_date',
  'trailing_30d',
  'trailing_90d',
  'trailing_365d',
  'forecast_monthly',
] as const;

export type FinanceWindowId = (typeof FINANCE_WINDOW_IDS)[number];

export interface FinanceWindowDefinition {
  readonly id: FinanceWindowId;
  readonly current: string;
  readonly comparison: string;
  readonly minimumHistoryDays: number;
  readonly monthlyNormalizationDays: number | null;
}

export const FINANCE_WINDOW_DEFINITIONS = {
  point_in_time: {
    id: 'point_in_time',
    current: 'Latest eligible snapshot at or before asOf.',
    comparison:
      'Latest eligible snapshot at or before asOf minus 30 days, no more than 7 days older.',
    minimumHistoryDays: 0,
    monthlyNormalizationDays: null,
  },
  calendar_month_to_date: {
    id: 'calendar_month_to_date',
    current: 'Owner-local calendar month start through asOf, end exclusive.',
    comparison:
      'Previous owner-local month through the same elapsed day count, end exclusive.',
    minimumHistoryDays: 1,
    monthlyNormalizationDays: null,
  },
  trailing_30d: {
    id: 'trailing_30d',
    current: '[asOf - 30 days, asOf).',
    comparison: '[asOf - 60 days, asOf - 30 days).',
    minimumHistoryDays: 30,
    monthlyNormalizationDays: DAYS_PER_MEAN_MONTH,
  },
  trailing_90d: {
    id: 'trailing_90d',
    current: '[asOf - 90 days, asOf).',
    comparison: '[asOf - 180 days, asOf - 90 days).',
    minimumHistoryDays: 30,
    monthlyNormalizationDays: DAYS_PER_MEAN_MONTH,
  },
  trailing_365d: {
    id: 'trailing_365d',
    current: '[asOf - 365 days, asOf).',
    comparison: '[asOf - 730 days, asOf - 365 days).',
    minimumHistoryDays: 90,
    monthlyNormalizationDays: DAYS_PER_MEAN_MONTH,
  },
  forecast_monthly: {
    id: 'forecast_monthly',
    current:
      'One mean month from scenario assumptions effective at asOf; never inferred from pending rows alone.',
    comparison: 'The persisted baseline scenario at the same asOf.',
    minimumHistoryDays: 0,
    monthlyNormalizationDays: DAYS_PER_MEAN_MONTH,
  },
} as const satisfies Readonly<Record<FinanceWindowId, FinanceWindowDefinition>>;

export const FINANCE_METRIC_IDS = [
  'cash_available',
  'personal_income_monthly',
  'creator_income_monthly',
  'personal_income_trailing_monthly',
  'creator_income_trailing_monthly',
  'personal_essential_burn',
  'personal_discretionary_spend',
  'creator_operating_burn',
  'creator_investment_spend',
  'tax_reserve',
  'total_survival_burn',
  'net_cash_flow',
  'runway',
  'creator_income_coverage_personal_life',
  'creator_income_coverage_total_burn',
] as const;

export type FinanceMetricId = (typeof FINANCE_METRIC_IDS)[number];
export const FINANCE_METRIC_STATES = [
  'ok',
  'insufficient_history',
  'stale_data',
  'reconciliation_anomaly',
  'positive_cash_flow',
  'zero_burn',
  'zero_cash',
  'unbounded_runway',
] as const;
export type FinanceMetricState = (typeof FINANCE_METRIC_STATES)[number];
export type FinanceMetricUnit = 'minor_currency' | 'months' | 'ratio';
export type FinanceDesiredDirection =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'neutral'
  | 'target_is_best';
export type FinanceSharedEligibility = 'never' | 'owner_opt_in_derived_only';

export interface FinanceMetricDefinition {
  readonly id: FinanceMetricId;
  readonly label: string;
  readonly unit: FinanceMetricUnit;
  readonly window: FinanceWindowId;
  readonly categories: readonly FinanceCategory[];
  readonly formula: string;
  readonly desiredDirection: FinanceDesiredDirection;
  readonly zeroDisplay: string;
  readonly unavailableDisplay: string;
  readonly sharedEligibility: FinanceSharedEligibility;
}

const NEVER_SHARED = 'never' as const;
const OPT_IN_DERIVED = 'owner_opt_in_derived_only' as const;

/**
 * Formulas consume posted, non-removed rows only. Amounts are signed integer
 * minor units (inflow positive, outflow negative), after linked refunds,
 * chargebacks, splits, transfers, and corrections are resolved.
 */
export const FINANCE_METRIC_DEFINITIONS = {
  cash_available: {
    id: 'cash_available',
    label: 'Cash available',
    unit: 'minor_currency',
    window: 'point_in_time',
    categories: [],
    formula:
      'Sum latest available balance (fallback current balance with lower confidence) for included liquid asset accounts; exclude liabilities, credit limits, and foreign currency without an explicit FX assumption.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No cash available',
    unavailableDisplay: 'Cash unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  personal_income_monthly: {
    id: 'personal_income_monthly',
    label: 'Personal income this month',
    unit: 'minor_currency',
    window: 'calendar_month_to_date',
    categories: ['personal_income'],
    formula: 'Sum positive posted personal_income after linked chargebacks.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No personal income this month',
    unavailableDisplay: 'Personal income unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  creator_income_monthly: {
    id: 'creator_income_monthly',
    label: 'Creator income this month',
    unit: 'minor_currency',
    window: 'calendar_month_to_date',
    categories: ['creator_income'],
    formula: 'Sum positive posted creator_income after linked chargebacks.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No creator income this month',
    unavailableDisplay: 'Creator income unavailable',
    sharedEligibility: OPT_IN_DERIVED,
  },
  personal_income_trailing_monthly: {
    id: 'personal_income_trailing_monthly',
    label: 'Typical monthly personal income',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: ['personal_income'],
    formula:
      'Posted personal_income in the covered trailing window / covered days * 365.2425 / 12; require at least 30 covered days.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No trailing personal income',
    unavailableDisplay: 'Not enough income history',
    sharedEligibility: NEVER_SHARED,
  },
  creator_income_trailing_monthly: {
    id: 'creator_income_trailing_monthly',
    label: 'Typical monthly creator income',
    unit: 'minor_currency',
    window: 'trailing_365d',
    categories: ['creator_income'],
    formula:
      'Posted creator_income in the covered trailing window / covered days * 365.2425 / 12; require 90 covered days so irregular royalties are not annualized from one payout.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No trailing creator income',
    unavailableDisplay: 'Not enough creator income history',
    sharedEligibility: OPT_IN_DERIVED,
  },
  personal_essential_burn: {
    id: 'personal_essential_burn',
    label: 'Monthly essential burn',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: ['personal_essential'],
    formula:
      'Posted personal_essential outflow less linked refunds/reimbursements, clamped at zero, / covered days * 365.2425 / 12.',
    desiredDirection: 'lower_is_better',
    zeroDisplay: 'No essential burn',
    unavailableDisplay: 'Not enough spending history',
    sharedEligibility: NEVER_SHARED,
  },
  personal_discretionary_spend: {
    id: 'personal_discretionary_spend',
    label: 'Monthly discretionary spend',
    unit: 'minor_currency',
    window: 'trailing_30d',
    categories: ['personal_discretionary'],
    formula:
      'Posted personal_discretionary outflow less linked refunds/reimbursements, clamped at zero, normalized to one mean month.',
    desiredDirection: 'lower_is_better',
    zeroDisplay: 'No discretionary spend',
    unavailableDisplay: 'Not enough spending history',
    sharedEligibility: NEVER_SHARED,
  },
  creator_operating_burn: {
    id: 'creator_operating_burn',
    label: 'Monthly creator operating burn',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: ['creator_operating'],
    formula:
      'Posted creator_operating outflow less linked refunds/reimbursements, clamped at zero, / covered days * 365.2425 / 12.',
    desiredDirection: 'lower_is_better',
    zeroDisplay: 'No creator operating burn',
    unavailableDisplay: 'Not enough creator spending history',
    sharedEligibility: OPT_IN_DERIVED,
  },
  creator_investment_spend: {
    id: 'creator_investment_spend',
    label: 'Monthly creator investment',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: ['creator_investment'],
    formula:
      'Posted creator_investment outflow less linked refunds, clamped at zero, / covered days * 365.2425 / 12.',
    desiredDirection: 'target_is_best',
    zeroDisplay: 'No creator investment',
    unavailableDisplay: 'Not enough creator investment history',
    sharedEligibility: OPT_IN_DERIVED,
  },
  tax_reserve: {
    id: 'tax_reserve',
    label: 'Monthly tax reserve',
    unit: 'minor_currency',
    window: 'trailing_365d',
    categories: ['creator_income', 'tax_reserve'],
    formula:
      'max(0, creator_income_trailing_monthly) * owner taxReserveRateBps / 10,000; missing configuration is an explicit 0% assumption shown in provenance.',
    desiredDirection: 'target_is_best',
    zeroDisplay: 'No tax reserve configured',
    unavailableDisplay: 'Tax reserve unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  total_survival_burn: {
    id: 'total_survival_burn',
    label: 'Monthly survival burn',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: ['personal_essential', 'creator_operating', 'tax_reserve'],
    formula:
      'personal_essential_burn + creator_operating_burn + tax_reserve; exclude discretionary and creator investment by definition.',
    desiredDirection: 'lower_is_better',
    zeroDisplay: 'No survival burn',
    unavailableDisplay: 'Survival burn unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  net_cash_flow: {
    id: 'net_cash_flow',
    label: 'Monthly net cash flow',
    unit: 'minor_currency',
    window: 'trailing_90d',
    categories: [
      'personal_income',
      'creator_income',
      'personal_essential',
      'personal_discretionary',
      'creator_operating',
      'creator_investment',
      'tax_reserve',
    ],
    formula:
      'Monthly-equivalent posted personal and creator income minus all personal, creator, and configured tax-reserve outflows; exclude transfers, card payments, debt principal, and unclassified cash withdrawals.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'Cash flow is break-even',
    unavailableDisplay: 'Net cash flow unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  runway: {
    id: 'runway',
    label: 'Zero-income runway',
    unit: 'months',
    window: 'trailing_90d',
    categories: [],
    formula:
      'cash_available / total_survival_burn. Cash <= 0 yields 0; burn = 0 yields unbounded; positive net cash flow adds a “Cash increasing” state but does not assume future income.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'No runway',
    unavailableDisplay: 'Runway unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  creator_income_coverage_personal_life: {
    id: 'creator_income_coverage_personal_life',
    label: 'Creator coverage of personal life',
    unit: 'ratio',
    window: 'trailing_90d',
    categories: [
      'creator_income',
      'personal_essential',
      'personal_discretionary',
    ],
    formula:
      'creator_income_trailing_monthly / (personal_essential_burn + personal_discretionary_spend); zero denominator is unavailable, not infinity.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'Creator income covers 0%',
    unavailableDisplay: 'Personal coverage unavailable',
    sharedEligibility: NEVER_SHARED,
  },
  creator_income_coverage_total_burn: {
    id: 'creator_income_coverage_total_burn',
    label: 'Creator coverage of total burn',
    unit: 'ratio',
    window: 'trailing_90d',
    categories: [
      'creator_income',
      'personal_essential',
      'personal_discretionary',
      'creator_operating',
      'creator_investment',
      'tax_reserve',
    ],
    formula:
      'creator_income_trailing_monthly / (essential + discretionary + creator operating + creator investment + tax reserve); zero denominator is unavailable.',
    desiredDirection: 'higher_is_better',
    zeroDisplay: 'Creator income covers 0%',
    unavailableDisplay: 'Total coverage unavailable',
    sharedEligibility: NEVER_SHARED,
  },
} as const satisfies Readonly<Record<FinanceMetricId, FinanceMetricDefinition>>;

export const FINANCE_EDGE_CASE_IDS = [
  'transfer',
  'credit_card_payment',
  'refund',
  'chargeback',
  'pending_transaction',
  'cash_withdrawal',
  'debt',
  'savings',
  'reimbursement',
  'one_time_purchase',
  'annual_subscription',
  'irregular_royalty_income',
  'positive_cash_flow',
  'insufficient_history',
] as const;

export type FinanceEdgeCaseId = (typeof FINANCE_EDGE_CASE_IDS)[number];

export interface FinanceEdgeCaseDefinition {
  readonly id: FinanceEdgeCaseId;
  readonly actuals: string;
  readonly cash: string;
  readonly forecast: string;
  readonly unresolvedState: 'include' | 'insufficient_data' | 'needs_review';
}

export const FINANCE_EDGE_CASES = {
  transfer: {
    id: 'transfer',
    actuals:
      'Exclude both linked sides from income, spend, burn, and cash flow.',
    cash: 'Balances already reflect the movement; never add the transaction.',
    forecast: 'Exclude.',
    unresolvedState: 'needs_review',
  },
  credit_card_payment: {
    id: 'credit_card_payment',
    actuals:
      'Exclude the payment; classify posted card purchases and fees once.',
    cash: 'Exclude liability and credit limit from cash available.',
    forecast: 'Forecast purchases or fees, never the payment transfer.',
    unresolvedState: 'needs_review',
  },
  refund: {
    id: 'refund',
    actuals:
      'Offset the linked expense category in the refund posting window, clamped at zero; excess is a recovery adjustment, not income.',
    cash: 'Use the balance snapshot only.',
    forecast: 'Do not recur unless an explicit scenario assumption says so.',
    unresolvedState: 'needs_review',
  },
  chargeback: {
    id: 'chargeback',
    actuals:
      'Reverse the linked income in the chargeback posting window; unmatched chargebacks are adjustments and lower confidence.',
    cash: 'Use the balance snapshot only.',
    forecast: 'Exclude unless an explicit loss-rate assumption exists.',
    unresolvedState: 'needs_review',
  },
  pending_transaction: {
    id: 'pending_transaction',
    actuals:
      'Exclude until posted; a posted replacement supersedes the pending row.',
    cash: 'Use provider available balance so pending activity is not double-counted.',
    forecast: 'May appear as pending context, never as historical actual.',
    unresolvedState: 'include',
  },
  cash_withdrawal: {
    id: 'cash_withdrawal',
    actuals:
      'Treat as a transfer to cash and exclude until the owner classifies its disposition.',
    cash: 'Include only when the destination cash account has a balance snapshot.',
    forecast: 'Exclude while unclassified.',
    unresolvedState: 'needs_review',
  },
  debt: {
    id: 'debt',
    actuals:
      'Exclude borrowed principal and principal repayment; classify interest and fees to their economic category.',
    cash: 'Exclude liabilities and unused credit; loan proceeds count only through asset balances.',
    forecast:
      'Include scheduled interest/fees only through explicit assumptions.',
    unresolvedState: 'needs_review',
  },
  savings: {
    id: 'savings',
    actuals: 'Exclude transfers between owned deposit accounts.',
    cash: 'Include unrestricted savings only when includeInCash is enabled.',
    forecast: 'Exclude transfer activity.',
    unresolvedState: 'include',
  },
  reimbursement: {
    id: 'reimbursement',
    actuals:
      'Offset the linked expense category; unmatched or excess value is excluded pending review, not income.',
    cash: 'Use the balance snapshot only.',
    forecast: 'Exclude unless contractually recurring and explicitly assumed.',
    unresolvedState: 'needs_review',
  },
  one_time_purchase: {
    id: 'one_time_purchase',
    actuals: 'Include once in its posted category and window.',
    cash: 'Use the balance snapshot only.',
    forecast: 'Do not recur without an explicit scenario assumption.',
    unresolvedState: 'include',
  },
  annual_subscription: {
    id: 'annual_subscription',
    actuals:
      'Include once on the posted date; never silently amortize actuals.',
    cash: 'Use the balance snapshot only.',
    forecast:
      'Amortize monthly only when recurrence is confirmed in an assumption.',
    unresolvedState: 'include',
  },
  irregular_royalty_income: {
    id: 'irregular_royalty_income',
    actuals: 'Include posted creator income on receipt.',
    cash: 'Use the balance snapshot only.',
    forecast:
      'Use trailing 365-day monthly equivalent after 90 covered days; never infer from one payout.',
    unresolvedState: 'include',
  },
  positive_cash_flow: {
    id: 'positive_cash_flow',
    actuals: 'Show the positive signed net value.',
    cash: 'Cash available remains point-in-time.',
    forecast:
      'Label runway “Cash increasing”; zero-income runway remains cash / survival burn.',
    unresolvedState: 'include',
  },
  insufficient_history: {
    id: 'insufficient_history',
    actuals:
      'Show observed totals only; do not monthly-normalize, calculate runway, or calculate coverage below the window minimum.',
    cash: 'Cash may display if a fresh eligible balance exists.',
    forecast:
      'Require explicit assumptions; do not extrapolate sparse history.',
    unresolvedState: 'insufficient_data',
  },
} as const satisfies Readonly<
  Record<FinanceEdgeCaseId, FinanceEdgeCaseDefinition>
>;

export const FINANCE_SHARED_CREATOR_CONTEXT_DEFAULT = 'disabled' as const;
export const OWNER_OPT_IN_CREATOR_METRIC_IDS = FINANCE_METRIC_IDS.filter(
  id => FINANCE_METRIC_DEFINITIONS[id].sharedEligibility === OPT_IN_DERIVED
);
