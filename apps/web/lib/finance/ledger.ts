import { createHash } from 'node:crypto';

/**
 * Canonical ledger domain + reconciliation engine (JOV-4612).
 *
 * Pure: no I/O, no clock, no db. `./sync.ts` feeds it provider batches in
 * the JOV-4611 adapter shape and applies the returned mutations.
 *
 * Conventions: amounts are integer 1/10000 units (matching numeric(19,4)),
 * positive = inflow to the account (bank convention). `dedupeKey` is stable
 * across re-syncs so re-running any sync range converges on the same rows.
 */

// Adapter contract (provider-agnostic, read-only) ---------------------------

export interface ProviderAccount {
  readonly providerAccountId: string;
  readonly name: string;
  /** Provider account class; 'credit' marks credit-card accounts. */
  readonly accountType: string;
  readonly subtype?: string | null;
  readonly currency: string;
  readonly currentBalance?: string | number | null;
  readonly availableBalance?: string | number | null;
}

export interface ProviderTransaction {
  readonly providerTransactionId: string | null;
  readonly providerAccountId: string;
  /** Signed amount, positive = inflow to the account. */
  readonly amount: string | number;
  readonly currency: string;
  /** ISO timestamp or YYYY-MM-DD. */
  readonly occurredAt: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly pending: boolean;
  /** Id of the pending record this posted record replaces, if reported. */
  readonly pendingTransactionId?: string | null;
}

export interface ProviderBalance {
  readonly providerAccountId: string;
  readonly current: string | number;
  readonly available?: string | number | null;
}

/** One page of a provider sync; `nextCursor` continues the range. */
export interface ProviderSyncBatch {
  readonly accounts?: readonly ProviderAccount[];
  readonly transactions?: readonly ProviderTransaction[];
  readonly removedTransactionIds?: readonly string[];
  readonly removedAccountIds?: readonly string[];
  readonly balances?: readonly ProviderBalance[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export type FinanceSyncMode = 'incremental' | 'backfill' | 'webhook';

/** Read-only provider adapter produced by the linking layer (JOV-4611). */
export interface FinanceProviderAdapter {
  readonly provider: string;
  fetchBatch(input: {
    readonly ownerUserId: string;
    readonly institutionId: string;
    readonly cursor: string | null;
    readonly mode: FinanceSyncMode;
  }): Promise<ProviderSyncBatch>;
}

// Canonical transaction -----------------------------------------------------

export const TRANSACTION_STATUSES = [
  'pending',
  'posted',
  'removed',
  'superseded',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const FLOW_KINDS = [
  'unclassified',
  'spend',
  'income',
  'transfer',
  'cc_payment',
  'refund',
  'reversal',
  'duplicate',
] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** Flow kinds excluded from income/burn metrics. */
const NON_EARNING_FLOWS: ReadonlySet<FlowKind> = new Set([
  'transfer',
  'cc_payment',
  'reversal',
  'duplicate',
]);

export interface CanonicalTransaction {
  readonly dedupeKey: string;
  readonly providerTransactionId: string | null;
  readonly providerAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly occurredDay: number;
  readonly occurredAt: Date;
  readonly merchantName: string | null;
  readonly description: string | null;
  readonly textNorm: string;
  readonly category: string | null;
  readonly status: TransactionStatus;
  readonly pendingProviderId: string | null;
}

const MINOR_SCALE = 10_000;
const MS_PER_DAY = 86_400_000;

export function toMinorUnits(amount: string | number): number {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) {
    throw new TypeError(`Invalid transaction amount: ${String(amount)}`);
  }
  return Math.round(n * MINOR_SCALE);
}

export function minorUnitsToDecimal(amountMinor: number): string {
  return (amountMinor / MINOR_SCALE).toFixed(4);
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function occurredDay(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`Invalid transaction date: ${iso}`);
  }
  return Math.floor(ms / MS_PER_DAY);
}

/** Dedupe key for a record identified only by provider transaction id. */
export function providerIdDedupeKey(providerTransactionId: string): string {
  return sha256(`id:${providerTransactionId}`);
}

/**
 * Stable record identity: provider transaction id when present, else a
 * fingerprint of immutable content so duplicates and id-less records
 * converge.
 */
export function transactionDedupeKey(
  txn: Pick<
    ProviderTransaction,
    | 'providerTransactionId'
    | 'providerAccountId'
    | 'amount'
    | 'occurredAt'
    | 'description'
    | 'merchantName'
  >
): string {
  if (txn.providerTransactionId) {
    return providerIdDedupeKey(txn.providerTransactionId);
  }
  const fingerprint = [
    txn.providerAccountId,
    toMinorUnits(txn.amount),
    occurredDay(txn.occurredAt),
    normalizeText(txn.description ?? txn.merchantName),
  ].join('|');
  return sha256(`fp:${fingerprint}`);
}

/** Normalize one provider record into the canonical ledger shape. */
export function normalizeProviderTransaction(
  txn: ProviderTransaction
): CanonicalTransaction {
  const day = occurredDay(txn.occurredAt);
  return {
    dedupeKey: transactionDedupeKey(txn),
    providerTransactionId: txn.providerTransactionId,
    providerAccountId: txn.providerAccountId,
    amountMinor: toMinorUnits(txn.amount),
    currency: txn.currency,
    occurredDay: day,
    occurredAt: new Date(day * MS_PER_DAY),
    merchantName: txn.merchantName ?? null,
    description: txn.description ?? null,
    textNorm: normalizeText(txn.description ?? txn.merchantName),
    category: txn.category ?? null,
    status: txn.pending ? 'pending' : 'posted',
    pendingProviderId: txn.pendingTransactionId ?? null,
  };
}

// Reconciliation ------------------------------------------------------------

/** A stored row presented to the reconciler. */
export interface LedgerEntry {
  readonly id: string;
  readonly dedupeKey: string | null;
  readonly providerTransactionId: string | null;
  readonly pendingProviderId?: string | null;
  /** Provider account key grouping rows on one account. */
  readonly accountKey: string;
  /** 'credit' | 'depository' | other provider class. */
  readonly accountKind: string;
  readonly amountMinor: number;
  readonly occurredDay: number;
  readonly textNorm: string;
  readonly status: TransactionStatus;
  readonly flowKind: FlowKind;
  readonly matchedTransactionId: string | null;
  readonly supersededById: string | null;
}

export interface LedgerMutation {
  readonly id: string;
  readonly status?: TransactionStatus;
  readonly flowKind?: FlowKind;
  readonly matchedTransactionId?: string | null;
  readonly supersededById?: string | null;
  readonly reason: string;
}

/** Windows are inclusive, in days. */
export const RECONCILE_WINDOWS = {
  pendingToPostedDays: 3,
  reversalDays: 3,
  transferDays: 5,
  refundDays: 90,
} as const;

const TRANSFER_RE =
  /\b(transfer|xfer|ach|zelle|venmo|paypal tfr|payment to|payment from|autopay|online payment|credit card|bill pay)\b/;

function isActive(status: TransactionStatus): boolean {
  return status === 'posted' || status === 'pending';
}

/** True when the row counts toward owner-visible spend/income totals. */
export function isLedgerEffective(
  entry: Pick<LedgerEntry, 'status' | 'flowKind'>
): boolean {
  return entry.status === 'posted' && !NON_EARNING_FLOWS.has(entry.flowKind);
}

/**
 * Deterministically reconcile ledger rows into mutations. Input is sorted
 * by (occurredDay, id) and every pass iterates that canonical order, so
 * re-running the same provider range yields the same result. Rows already
 * classified keep their classification.
 */
export function reconcileLedger(
  entries: readonly LedgerEntry[]
): LedgerMutation[] {
  const rows = [...entries].sort(
    (a, b) => a.occurredDay - b.occurredDay || a.id.localeCompare(b.id)
  );
  const mutations = new Map<string, LedgerMutation>();
  const mutated = (id: string, patch: Omit<LedgerMutation, 'id'>) =>
    mutations.set(id, { id, ...mutations.get(id), ...patch });
  const state = (e: LedgerEntry) => ({
    status: mutations.get(e.id)?.status ?? e.status,
    flowKind: mutations.get(e.id)?.flowKind ?? e.flowKind,
    matched:
      mutations.get(e.id)?.matchedTransactionId ?? e.matchedTransactionId,
    supersededBy: mutations.get(e.id)?.supersededById ?? e.supersededById,
  });
  // Passes 2–5 track their own pairings so a posted row that superseded a
  // pending one in pass 1 remains eligible for transfer/refund matching.
  const pairMatched = new Set<string>();
  const paired = (e: LedgerEntry) =>
    pairMatched.has(e.id) ||
    state(e).matched !== null ||
    state(e).supersededBy !== null;
  const pairable = (e: LedgerEntry) =>
    isActive(state(e).status) && !pairMatched.has(e.id);

  // Pass 1 — pending → posted supersession: exact provider link, else
  // same account + |amount| + text within the window.
  const pendings = rows.filter(e => state(e).status === 'pending');
  for (const p of rows.filter(e => state(e).status === 'posted')) {
    const link = pendings.find(
      e =>
        !paired(e) &&
        e.accountKey === p.accountKey &&
        (p.pendingProviderId
          ? e.providerTransactionId === p.pendingProviderId
          : e.amountMinor === p.amountMinor &&
            Math.abs(e.occurredDay - p.occurredDay) <=
              RECONCILE_WINDOWS.pendingToPostedDays &&
            e.textNorm === p.textNorm)
    );
    if (link) {
      mutated(link.id, {
        status: 'superseded',
        supersededById: p.id,
        reason: 'pending_superseded',
      });
      mutated(p.id, {
        matchedTransactionId: link.id,
        reason: 'posted_replaces_pending',
      });
    }
  }

  // Pass 2 — reversals: same account, exact negation, same text, within 3
  // days. Both rows become 'reversal' so the pair nets to zero.
  for (const a of rows.filter(pairable)) {
    const b = rows.find(
      e =>
        e.id !== a.id &&
        pairable(e) &&
        e.accountKey === a.accountKey &&
        e.amountMinor === -a.amountMinor &&
        e.textNorm === a.textNorm &&
        e.occurredDay >= a.occurredDay &&
        e.occurredDay - a.occurredDay <= RECONCILE_WINDOWS.reversalDays
    );
    if (b) {
      pairMatched.add(a.id).add(b.id);
      for (const e of [a, b]) {
        mutated(e.id, {
          flowKind: 'reversal',
          matchedTransactionId: e.id === a.id ? b.id : a.id,
          reason: 'reversal_pair',
        });
      }
    }
  }

  // Pass 3 — transfers and credit-card payments across accounts: opposite
  // signs, equal magnitude, within window. A transfer-ish text signal or a
  // credit account is required to avoid coincidental same-amount matches.
  for (const a of rows.filter(pairable)) {
    const b = rows.find(
      e =>
        e.id !== a.id &&
        pairable(e) &&
        e.accountKey !== a.accountKey &&
        e.amountMinor === -a.amountMinor &&
        Math.abs(e.occurredDay - a.occurredDay) <=
          RECONCILE_WINDOWS.transferDays &&
        (TRANSFER_RE.test(`${a.textNorm} ${e.textNorm}`) ||
          a.accountKind === 'credit' ||
          e.accountKind === 'credit')
    );
    if (b) {
      const kind: FlowKind =
        a.accountKind === 'credit' || b.accountKind === 'credit'
          ? 'cc_payment'
          : 'transfer';
      pairMatched.add(a.id).add(b.id);
      for (const e of [a, b]) {
        mutated(e.id, {
          flowKind: kind,
          matchedTransactionId: e.id === a.id ? b.id : a.id,
          reason: `${kind}_pair`,
        });
      }
    }
  }

  // Pass 4 — refunds: a later inflow matching an earlier outflow on the
  // same account and text. The inflow is 'refund' (excluded from income);
  // the original spend keeps its kind.
  for (const a of rows.filter(
    e => pairable(e) && state(e).flowKind === 'unclassified'
  )) {
    if (a.amountMinor <= 0) continue;
    const b = rows.find(
      e =>
        e.id !== a.id &&
        pairable(e) &&
        state(e).flowKind === 'unclassified' &&
        e.accountKey === a.accountKey &&
        e.amountMinor === -a.amountMinor &&
        e.textNorm === a.textNorm &&
        e.occurredDay < a.occurredDay &&
        a.occurredDay - e.occurredDay <= RECONCILE_WINDOWS.refundDays
    );
    if (b) {
      pairMatched.add(a.id).add(b.id);
      mutated(a.id, {
        flowKind: 'refund',
        matchedTransactionId: b.id,
        reason: 'refund_of_spend',
      });
      mutated(b.id, {
        matchedTransactionId: a.id,
        reason: 'spend_refunded',
      });
    }
  }

  // Pass 5 — duplicate imports: same account, amount, day, and text under
  // different dedupe keys. The later canonical row is the duplicate.
  for (const a of rows.filter(
    e => pairable(e) && state(e).flowKind === 'unclassified'
  )) {
    const b = rows.find(
      e =>
        e.id !== a.id &&
        pairable(e) &&
        state(e).flowKind === 'unclassified' &&
        e.accountKey === a.accountKey &&
        e.amountMinor === a.amountMinor &&
        e.occurredDay === a.occurredDay &&
        e.textNorm === a.textNorm &&
        e.dedupeKey !== a.dedupeKey
    );
    if (b) {
      pairMatched.add(a.id).add(b.id);
      mutated(b.id, {
        flowKind: 'duplicate',
        matchedTransactionId: a.id,
        reason: 'duplicate_import',
      });
    }
  }

  // Pass 6 — default classification for unclassified posted rows.
  for (const e of rows) {
    if (state(e).status === 'posted' && state(e).flowKind === 'unclassified') {
      mutated(e.id, {
        flowKind: e.amountMinor < 0 ? 'spend' : 'income',
        reason: 'default_classification',
      });
    }
  }

  return [...mutations.values()];
}

// Balance reconciliation ----------------------------------------------------

/**
 * Drift between a provider-reported balance and the ledger expectation:
 * `reported - (previous snapshot + posted delta since)`.
 */
export function balanceDrift(args: {
  readonly previousSnapshotMinor: number;
  readonly deltaMinor: number;
  readonly reportedMinor: number;
}): number {
  return args.reportedMinor - (args.previousSnapshotMinor + args.deltaMinor);
}

/**
 * Documented tolerance: exact-cent equality up to `absFloorMinor`
 * (default $1.00 in 1e-4 units), then 0.1% of the reported balance to
 * absorb provider rounding on large accounts.
 */
export function balanceWithinTolerance(
  reportedMinor: number,
  driftMinor: number,
  absFloorMinor = 10_000
): boolean {
  const rel = Math.floor(Math.abs(reportedMinor) / 1000);
  return Math.abs(driftMinor) <= Math.max(absFloorMinor, rel);
}
