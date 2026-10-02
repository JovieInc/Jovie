/**
 * Ovie company cost ledger — read-only domain contract (JOV-5311).
 *
 * Shape and policy only: no database, provider client, or auth dependency is
 * allowed here. This is the company operating-cost ledger, not the
 * owner-scoped creator finance domain in `lib/finance/*` (JOV-4610), and not
 * a bookkeeping system. Every value is evidence-graded; unknown stays unknown.
 *
 * Entity chain:
 *   organization -> vendor -> account/subscription -> billing obligation
 *     -> payment instrument -> invoice/transaction evidence
 *     -> capacity/credit entitlement -> reconciliation evidence
 */

export const COST_LEDGER_VERSION = 'ovie-cost-ledger/v1' as const;

/**
 * Source authority ladder. Higher-authority sources prove; lower-authority
 * sources observe. An email receipt can never prove a ledger settlement.
 */
export const COST_LEDGER_SOURCE_KINDS = [
  /** Bank/card ledger settlement or provider-of-record transaction export. */
  'ledger-settlement',
  /** Vendor billing/account API or billing-settings endpoint read. */
  'vendor-billing-api',
  /** Vendor account page observed by an authorized operator/agent. */
  'vendor-account-page',
  /** Internal runtime/account-health telemetry (e.g. capacity horizon). */
  'runtime-telemetry',
  /** Billing-scoped invoice/receipt/renewal email — evidence only. */
  'billing-email',
  /** Founder-confirmed or operator-entered manual evidence. */
  'manual',
] as const;

export type CostLedgerSourceKind = (typeof COST_LEDGER_SOURCE_KINDS)[number];

/** How much a source may prove on its own. */
export type CostLedgerAuthority = 'authoritative' | 'secondary' | 'observation';

export interface CostLedgerEvidenceRef {
  readonly source: CostLedgerSourceKind;
  /**
   * Opaque or hashed pointer into the source system (invoice id, txn id,
   * artifact ref). Raw provider payloads and raw email bodies are never
   * persisted here.
   */
  readonly ref: string;
  /** When the source was last read (ISO-8601). */
  readonly observedAt: string;
  /** Source freshness deadline; evidence past this is `stale`. */
  readonly freshUntil?: string;
  readonly authority: CostLedgerAuthority;
}

export const COST_LEDGER_RECONCILIATION_STATES = [
  /** Obligation/invoice/account matched to settled ledger evidence. */
  'reconciled',
  /** Credible vendor/email evidence exists; payment not proven. */
  'observed',
  /** Payment exists without subscription/account mapping, or vice versa. */
  'unreconciled',
  /** Evidence disagrees materially (amount, currency, instrument). */
  'conflict',
  /** Source was once valid but exceeded its freshness contract. */
  'stale',
  /** No trustworthy evidence. */
  'unknown',
] as const;

export type CostLedgerReconciliation =
  (typeof COST_LEDGER_RECONCILIATION_STATES)[number];

export const COST_LEDGER_CADENCES = [
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'usage-based',
  'one-time',
  'unknown',
] as const;

export type CostLedgerCadence = (typeof COST_LEDGER_CADENCES)[number];

export const COST_LEDGER_ACCOUNT_STATES = [
  'active',
  'payment-grace',
  'suspended',
  'expired',
  'cancelled',
  'unknown',
] as const;

export type CostLedgerAccountState =
  (typeof COST_LEDGER_ACCOUNT_STATES)[number];

export const COST_LEDGER_INSTRUMENT_TYPES = [
  'business-card',
  'personal-card',
  'bank-account',
  'vendor-wallet',
  'other',
] as const;

export type CostLedgerInstrumentType =
  (typeof COST_LEDGER_INSTRUMENT_TYPES)[number];

/**
 * Payment instrument. Label + last4 only. Full PAN, account numbers,
 * credentials, and tokens are prohibited — enforced by
 * `assertPaymentInstrumentSafety`.
 */
export interface CostLedgerInstrument {
  readonly id: string;
  readonly type: CostLedgerInstrumentType;
  readonly label: string;
  /** Up to 4 trailing digits; required to be digits-only when present. */
  readonly last4?: string;
  /** Owning entity label, e.g. 'Jovie Inc' or 'founder'. */
  readonly ownerEntity?: string;
  readonly evidence?: CostLedgerEvidenceRef;
}

/** Cost basis — distinguishes settled truth from normalized projection. */
export const COST_LEDGER_COST_BASIS = [
  /** Settled ledger amount for the period. */
  'settled',
  /** Invoiced/contracted amount not yet proven settled. */
  'invoiced',
  /** Normalized monthly-equivalent projection of a non-monthly cadence. */
  'normalized',
  /** Vendor-observed price/plan cost without payment proof. */
  'observed',
] as const;

export type CostLedgerCostBasis = (typeof COST_LEDGER_COST_BASIS)[number];

export interface CostLedgerAmount {
  /** Integer minor units (cents for USD). Never a float. */
  readonly cents: number;
  /** ISO-4217 currency code, e.g. 'USD'. */
  readonly currency: string;
}

export interface CostLedgerAccount {
  readonly id: string;
  readonly vendorName: string;
  /** Product/service, e.g. 'ChatGPT Pro', 'Codex seat', 'Cloudflare'. */
  readonly product?: string;
  readonly category?: string;
  /** Internal owner/purpose, e.g. 'fleet', 'marketing'. */
  readonly ownerPurpose?: string;
  /** Account identity label — email or opaque account alias. */
  readonly accountLabel?: string;
  readonly plan?: string;
  readonly seatCount?: number;
  readonly state: CostLedgerAccountState;
  readonly cadence: CostLedgerCadence;
  /**
   * Per-period amount in `cadence` units (annual means per-year), or the
   * observed recurring price when basis is 'observed'. Null when unmeasured.
   */
  readonly amount?: CostLedgerAmount;
  readonly costBasis: CostLedgerCostBasis;
  /** ISO-8601 renewal/expiry timestamp where evidence exists. */
  readonly renewsAt?: string;
  readonly instrumentId?: string;
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

/** Capacity/credit is first-class: banked, reset, and cooldown semantics. */
export interface CostLedgerCapacity {
  readonly accountId: string;
  /** Included usage allowance, provider-denominated unit label. */
  readonly allowance?: number;
  readonly consumed?: number;
  readonly remaining?: number;
  /** Next reset timestamp/window where known. */
  readonly resetsAt?: string;
  readonly health:
    | 'ok'
    | 'banked'
    | 'rate-limited'
    | 'cooldown'
    | 'exhausted'
    | 'unknown';
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

/**
 * Prepaid/vendor credit. `cashEquivalent` is normally false: vendor credits
 * are owned operating capacity, never bank cash, and never count in runway.
 */
export interface CostLedgerCredit {
  readonly accountId: string;
  readonly granted?: CostLedgerAmount;
  readonly remaining?: CostLedgerAmount;
  /** Provider-denominated units when the credit is not monetary. */
  readonly unitLabel?: string;
  readonly remainingUnits?: number;
  readonly expiresAt?: string;
  /** Must be false — credits are not runway cash. Reserved field. */
  readonly cashEquivalent: false;
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

export const COST_LEDGER_TRANSACTION_STATES = [
  'settled',
  'pending',
  'refunded',
  'failed',
] as const;

export type CostLedgerTransactionState =
  (typeof COST_LEDGER_TRANSACTION_STATES)[number];

/** Ledger/payment-side evidence row. */
export interface CostLedgerTransaction {
  readonly id: string;
  readonly amount: CostLedgerAmount;
  readonly occurredAt: string;
  readonly state: CostLedgerTransactionState;
  readonly instrumentId?: string;
  /** Matched account id when a mapping exists. */
  readonly accountId?: string;
  /** Merchant/description label as reported by the ledger source. */
  readonly merchantLabel?: string;
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

/** Verified recurring revenue input for net-burn/runway evaluation. */
export interface CostLedgerRevenue {
  /** Monthly-normalized verified recurring revenue, minor units. */
  readonly mrr?: CostLedgerAmount;
  /** Trailing settled inflow over `windowDays`, minor units. */
  readonly trailingInflow?: CostLedgerAmount;
  readonly windowDays?: number;
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

/** Verified cash position input for runway evaluation. */
export interface CostLedgerCash {
  readonly balance?: CostLedgerAmount;
  readonly evidence: readonly CostLedgerEvidenceRef[];
}

export interface CostLedger {
  readonly schema: typeof COST_LEDGER_VERSION;
  readonly generatedAt: string;
  readonly accounts: readonly CostLedgerAccount[];
  readonly instruments: readonly CostLedgerInstrument[];
  readonly transactions: readonly CostLedgerTransaction[];
  readonly capacity: readonly CostLedgerCapacity[];
  readonly credits: readonly CostLedgerCredit[];
  readonly revenue?: CostLedgerRevenue;
  readonly cash?: CostLedgerCash;
}
