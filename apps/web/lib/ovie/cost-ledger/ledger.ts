/**
 * Ovie company cost ledger — deterministic evaluation (JOV-5311).
 *
 * Pure functions over the `CostLedger` projection. No I/O, no clock reads —
 * `now` is always an argument so results are reproducible and testable.
 * Unknown stays unknown: evaluators never fabricate missing amounts, seats,
 * instruments, dates, or usage.
 */

import type {
  CostLedger,
  CostLedgerAccount,
  CostLedgerAmount,
  CostLedgerEvidenceRef,
  CostLedgerReconciliation,
  CostLedgerTransaction,
} from './contract';

const MS_PER_MONTH_APPROX = 30.4375 * 24 * 60 * 60 * 1000;

export function isStale(
  evidence: readonly CostLedgerEvidenceRef[],
  now: Date
): boolean {
  return evidence.some(
    item =>
      item.freshUntil !== undefined &&
      Date.parse(item.freshUntil) < now.getTime()
  );
}

/**
 * Monthly-equivalent of an account's cost, or null when it cannot be
 * computed without inventing precision (usage-based, unknown cadence or
 * amount). The returned `kind` distinguishes settled truth from projection.
 */
export function monthlyEquivalent(account: CostLedgerAccount): {
  cents: number;
  currency: string;
  kind: 'settled' | 'normalized' | 'invoiced' | 'observed';
} | null {
  const amount = account.amount;
  if (!amount || !Number.isSafeInteger(amount.cents)) return null;
  const kind =
    account.costBasis === 'normalized' ? 'normalized' : account.costBasis;
  switch (account.cadence) {
    case 'monthly':
      return { cents: amount.cents, currency: amount.currency, kind };
    case 'weekly':
      return {
        cents: Math.round((amount.cents * 52) / 12),
        currency: amount.currency,
        kind: 'normalized',
      };
    case 'quarterly':
      return {
        cents: Math.round(amount.cents / 3),
        currency: amount.currency,
        kind: 'normalized',
      };
    case 'annual':
      return {
        cents: Math.round(amount.cents / 12),
        currency: amount.currency,
        kind: 'normalized',
      };
    default:
      return null;
  }
}

function amountsAgree(a: CostLedgerAmount, b: CostLedgerAmount): boolean {
  return a.currency === b.currency && a.cents === b.cents;
}

/**
 * Reconciliation state for one account.
 *
 * - `reconciled`: settled transaction matched to this account.
 * - `conflict`: matched settled evidence disagrees materially on
 *   amount/currency with the recorded obligation.
 * - `observed`: credible vendor/email/account evidence exists but no settled
 *   ledger proof — billing-email alone can never reach `reconciled`.
 * - `stale`: only evidence that has passed its freshness contract.
 * - `unreconciled`: some evidence exists but no match and nothing credible
 *   enough to call `observed`.
 * - `unknown`: no evidence at all.
 */
export function reconcileAccount(
  account: CostLedgerAccount,
  transactions: readonly CostLedgerTransaction[],
  now: Date
): CostLedgerReconciliation {
  const matched = transactions.filter(
    txn => txn.accountId === account.id && txn.state === 'settled'
  );
  const allEvidence = [
    ...account.evidence,
    ...matched.flatMap(txn => txn.evidence),
  ];
  if (allEvidence.length === 0 && matched.length === 0) return 'unknown';
  if (matched.length > 0) {
    const conflicts = account.amount
      ? matched.some(
          txn => !amountsAgree(txn.amount, account.amount as CostLedgerAmount)
        )
      : false;
    if (conflicts) return 'conflict';
    if (isStale(allEvidence, now)) return 'stale';
    return 'reconciled';
  }
  if (account.evidence.length > 0) {
    if (isStale(account.evidence, now)) return 'stale';
    return 'observed';
  }
  return 'unreconciled';
}

export const COST_LEDGER_EXCEPTION_KINDS = [
  /** Renewal or expiry inside `soonWindowMs`. */
  'renews-soon',
  /** Prepaid credit expires inside `soonWindowMs`. */
  'credit-expires-soon',
  /** Capacity health is banked/cooldown/exhausted. */
  'capacity-limited',
  /** Settled transaction with no account mapping. */
  'unmatched-transaction',
  /** Account evidence exists but no settled transaction matched. */
  'unproven-obligation',
  /** Reconciliation state is conflict. */
  'conflicting-evidence',
  /** All evidence on an account is past freshness. */
  'stale-evidence',
  /** Two accounts share vendor + plan + instrument — possible duplicate. */
  'possible-duplicate',
] as const;

export type CostLedgerExceptionKind =
  (typeof COST_LEDGER_EXCEPTION_KINDS)[number];

export interface CostLedgerException {
  readonly kind: CostLedgerExceptionKind;
  /** Account or transaction id this exception concerns. */
  readonly subjectId: string;
  readonly detail: string;
}

const DEFAULT_SOON_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function detectExceptions(
  ledger: CostLedger,
  now: Date,
  soonWindowMs: number = DEFAULT_SOON_WINDOW_MS
): CostLedgerException[] {
  const exceptions: CostLedgerException[] = [];
  const soon = now.getTime() + soonWindowMs;

  for (const account of ledger.accounts) {
    if (account.renewsAt) {
      const at = Date.parse(account.renewsAt);
      if (Number.isFinite(at) && at <= soon && at >= now.getTime()) {
        exceptions.push({
          kind: 'renews-soon',
          subjectId: account.id,
          detail: `${account.vendorName} renews ${account.renewsAt}`,
        });
      }
    }
    const state = reconcileAccount(account, ledger.transactions, now);
    if (state === 'observed' && account.evidence.length > 0) {
      exceptions.push({
        kind: 'unproven-obligation',
        subjectId: account.id,
        detail: `${account.vendorName} has ${account.evidence[0]?.source} evidence but no settled transaction`,
      });
    }
    if (state === 'conflict') {
      exceptions.push({
        kind: 'conflicting-evidence',
        subjectId: account.id,
        detail: `${account.vendorName} evidence disagrees with settled amount`,
      });
    }
    if (state === 'stale') {
      exceptions.push({
        kind: 'stale-evidence',
        subjectId: account.id,
        detail: `${account.vendorName} evidence exceeded its freshness contract`,
      });
    }
  }

  for (const credit of ledger.credits) {
    if (credit.expiresAt) {
      const at = Date.parse(credit.expiresAt);
      if (Number.isFinite(at) && at <= soon && at >= now.getTime()) {
        exceptions.push({
          kind: 'credit-expires-soon',
          subjectId: credit.accountId,
          detail: `credit on ${credit.accountId} expires ${credit.expiresAt}`,
        });
      }
    }
  }

  for (const cap of ledger.capacity) {
    if (
      cap.health === 'banked' ||
      cap.health === 'cooldown' ||
      cap.health === 'exhausted'
    ) {
      exceptions.push({
        kind: 'capacity-limited',
        subjectId: cap.accountId,
        detail: `${cap.accountId} capacity is ${cap.health}`,
      });
    }
  }

  for (const txn of ledger.transactions) {
    if (txn.state === 'settled' && !txn.accountId) {
      exceptions.push({
        kind: 'unmatched-transaction',
        subjectId: txn.id,
        detail: `settled ${txn.merchantLabel ?? 'transaction'} has no account mapping`,
      });
    }
  }

  const seen = new Map<string, string>();
  for (const account of ledger.accounts) {
    if (!account.plan || !account.instrumentId) continue;
    const key = `${account.vendorName}|${account.plan}|${account.instrumentId}`;
    const prior = seen.get(key);
    if (prior) {
      exceptions.push({
        kind: 'possible-duplicate',
        subjectId: account.id,
        detail: `${account.vendorName} ${account.plan} also appears on ${prior}`,
      });
    } else {
      seen.set(key, account.id);
    }
  }

  return exceptions;
}

/** Summary metric value; null means "Not measured"/"Unknown", never zero. */
export interface CostLedgerMetric {
  readonly value: CostLedgerAmount | null;
  readonly state: 'measured' | 'not-measured';
  /** Forecast/projection vs settled actual, for honest display. */
  readonly basis: 'settled' | 'projected' | 'mixed';
}

export type DefaultAliveState = 'default-alive' | 'default-dead' | 'unknown';

export interface CostLedgerSummary {
  /** Normalized monthly recurring obligations (mixed basis). */
  readonly recurringMonthlySpend: CostLedgerMetric;
  /** Settled outflow over the trailing window, if ledger evidence exists. */
  readonly trailingOutflow: CostLedgerMetric;
  /** Verified monthly recurring revenue, if a trusted source exists. */
  readonly verifiedMrr: CostLedgerMetric;
  /** verifiedMrr - recurringMonthlySpend when both are measured. */
  readonly netBurn: CostLedgerMetric;
  /** cash / monthly net burn months, only when inputs are verified. */
  readonly runwayMonths: number | null;
  readonly defaultAlive: DefaultAliveState;
}

function sameCurrency(items: readonly CostLedgerAmount[]): string | null {
  const currencies = new Set(items.map(item => item.currency));
  return currencies.size === 1 ? (items[0]?.currency ?? null) : null;
}

export function summarizeLedger(ledger: CostLedger): CostLedgerSummary {
  const monthlyParts: CostLedgerAmount[] = [];
  let anyProjected = false;
  for (const account of ledger.accounts) {
    if (account.state === 'expired' || account.state === 'cancelled') continue;
    const monthly = monthlyEquivalent(account);
    if (monthly) {
      monthlyParts.push({ cents: monthly.cents, currency: monthly.currency });
      if (monthly.kind !== 'settled') anyProjected = true;
    }
  }
  const monthlyCurrency = sameCurrency(monthlyParts);
  const recurringMonthlySpend: CostLedgerMetric =
    monthlyCurrency !== null && monthlyParts.length > 0
      ? {
          value: {
            cents: monthlyParts.reduce((sum, item) => sum + item.cents, 0),
            currency: monthlyCurrency,
          },
          state: 'measured',
          basis: anyProjected ? 'mixed' : 'settled',
        }
      : { value: null, state: 'not-measured', basis: 'settled' };

  const nowMs = ledger.generatedAt
    ? Date.parse(ledger.generatedAt)
    : Number.NaN;
  const windowMs = 30 * 24 * 60 * 60 * 1000;
  const settled = ledger.transactions.filter(
    txn =>
      txn.state === 'settled' &&
      Number.isFinite(nowMs) &&
      nowMs - Date.parse(txn.occurredAt) <= windowMs &&
      nowMs - Date.parse(txn.occurredAt) >= 0
  );
  const outflowCurrency = sameCurrency(settled.map(txn => txn.amount));
  const trailingOutflow: CostLedgerMetric =
    settled.length > 0 && outflowCurrency !== null
      ? {
          value: {
            cents: settled.reduce((sum, txn) => sum + txn.amount.cents, 0),
            currency: outflowCurrency,
          },
          state: 'measured',
          basis: 'settled',
        }
      : { value: null, state: 'not-measured', basis: 'settled' };

  const verifiedMrr: CostLedgerMetric =
    ledger.revenue?.mrr && ledger.revenue.evidence.length > 0
      ? {
          value: ledger.revenue.mrr,
          state: 'measured',
          basis: 'settled',
        }
      : { value: null, state: 'not-measured', basis: 'settled' };

  let netBurn: CostLedgerMetric = {
    value: null,
    state: 'not-measured',
    basis: 'settled',
  };
  if (
    verifiedMrr.value &&
    recurringMonthlySpend.value &&
    verifiedMrr.value.currency === recurringMonthlySpend.value.currency
  ) {
    netBurn = {
      value: {
        cents: recurringMonthlySpend.value.cents - verifiedMrr.value.cents,
        currency: recurringMonthlySpend.value.currency,
      },
      state: 'measured',
      basis: 'mixed',
    };
  }

  let runwayMonths: number | null = null;
  if (
    ledger.cash?.balance &&
    ledger.cash.evidence.length > 0 &&
    netBurn.value &&
    ledger.cash.balance.currency === netBurn.value.currency &&
    netBurn.value.cents > 0
  ) {
    runwayMonths =
      Math.round((ledger.cash.balance.cents / netBurn.value.cents) * 10) / 10;
  }

  // The default-alive label requires MRR, all-in burn, and cash all verified.
  let defaultAlive: DefaultAliveState = 'unknown';
  if (
    verifiedMrr.value &&
    recurringMonthlySpend.value &&
    ledger.cash?.balance
  ) {
    defaultAlive =
      verifiedMrr.value.cents >= recurringMonthlySpend.value.cents
        ? 'default-alive'
        : 'default-dead';
  }

  return {
    recurringMonthlySpend,
    trailingOutflow,
    verifiedMrr,
    netBurn,
    runwayMonths,
    defaultAlive,
  };
}

/** Approximate months until an ISO timestamp; null if unparseable. */
export function monthsUntil(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.round(((at - now.getTime()) / MS_PER_MONTH_APPROX) * 10) / 10;
}
