/**
 * Canonical API usage-pricing proposal (JOV-4875).
 *
 * Public executable schema for free-to-start API usage. Exact amounts are
 * absent: they are not approved. This module cannot create a Stripe meter,
 * invoice, charge, or checkout. Subscription prices stay in plan-prices.ts.
 * Unapproved numeric strategy stays in the private pricing document.
 *
 * EVENT: a consumer API principal never receives Summer/Ovie operator, admin,
 * publication, or payment authority, and this proposal never mutates billing.
 *
 * Account signup, durable ledgers, and live cache leases stay with JOV-4073,
 * JOV-4075, JOV-7831, and JOV-8746. Those owners must satisfy this admission
 * contract.
 *
 * Ship now: fail-closed free admission and cache reuse rules.
 * Re-evaluate when: shadow usage and cache receipts exist, or Tim records
 * exact amounts.
 * Then: paid activation still requires the PM brief's payment gates.
 */

export const API_USAGE_PRICING_PROPOSAL_SCHEMA =
  'jovie.api-usage-pricing-proposal/v1' as const;

export const API_USAGE_PRICING_FIELDS = [
  'approval',
  'billable_unit',
  'billing_period',
  'cache_hits',
  'free_allowance',
  'limits',
  'overage',
  'spend_cap',
  'subsidy_exit',
] as const;

export type ApiUsagePricingField = (typeof API_USAGE_PRICING_FIELDS)[number];

export const API_USAGE_PRICING_PROPOSAL = {
  schema: API_USAGE_PRICING_PROPOSAL_SCHEMA,
  issue: 'JOV-4875',
  status: 'proposal',
  paidActivation: 'disabled',
  approval: 'unverified',
  currency: null,
  unitRate: null,
  includedUnits: null,
  numericLimits: null,
  fields: API_USAGE_PRICING_FIELDS,
  identity: {
    operatorAuthority: false,
    adminAuthority: false,
    publicationAuthority: false,
    paymentAuthority: false,
    billingMutation: false,
    summerIdentityShared: false,
  },
} as const;

/** TTL stays null until a dated approval supplies a duration. */
export const API_CACHE_CLASSES = {
  public_discovery: { serveStale: false, ttl: null },
  generated_output: { serveStale: false, crossTenant: false, ttl: null },
  merchant_product: { serveStale: false, ttl: null },
  negative_result: {
    serveStale: false,
    authDenialCached: false,
    ttl: null,
  },
} as const;

export type ApiWorkCache = 'miss' | 'fresh_hit' | 'replay' | 'stale_denied';

export type ApiWorkAdmission =
  | 'allow_free'
  | 'allow_replay'
  | 'stop_free'
  | 'deny_unapproved_paid'
  | 'deny_stale';

export interface ApiWorkAdmissionInput {
  readonly cache: ApiWorkCache;
  /**
   * Included units still available to this account. Null means the allowance
   * is unresolved and must not be treated as unlimited.
   */
  readonly freeUnitsRemaining: number | null;
  readonly paidOptIn: boolean;
}

export interface ApiWorkAdmissionDecision {
  readonly billableUnits: 0 | 1;
  readonly admission: ApiWorkAdmission;
  /** Reserved before work. Settlement releases it when the outcome is not a completed unit. */
  readonly reservedUnits: 0 | 1;
  readonly charge: false;
  readonly checkout: false;
  readonly serveCached: boolean;
  readonly serveStale: false;
  readonly invokeUpstream: boolean;
}

export type ApiWorkOutcome =
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'unauthorized'
  | 'validation_blocked'
  | 'rate_limited';

export interface ApiWorkSettlement {
  readonly consumedUnits: 0 | 1;
  readonly releaseReservation: boolean;
  readonly charge: false;
}

function closed(
  decision: Omit<ApiWorkAdmissionDecision, 'charge' | 'checkout' | 'serveStale'>
): ApiWorkAdmissionDecision {
  return {
    ...decision,
    charge: false,
    checkout: false,
    serveStale: false,
  };
}

/**
 * Decide whether a new or repeated API operation may run, and whether it
 * may reuse a cached result. A fresh hit of a new logical operation still
 * reserves one included unit and does not call upstream again. A replay
 * reserves nothing. Stale merchant/product data is never served.
 */
export function admitApiWork(
  input: ApiWorkAdmissionInput
): ApiWorkAdmissionDecision {
  if (input.cache === 'stale_denied') {
    return closed({
      billableUnits: 0,
      admission: 'deny_stale',
      reservedUnits: 0,
      serveCached: false,
      invokeUpstream: false,
    });
  }

  if (input.cache === 'replay') {
    return closed({
      billableUnits: 0,
      admission: 'allow_replay',
      reservedUnits: 0,
      serveCached: true,
      invokeUpstream: false,
    });
  }

  const allowanceOpen =
    input.freeUnitsRemaining !== null &&
    Number.isFinite(input.freeUnitsRemaining) &&
    input.freeUnitsRemaining >= 1;

  if (!allowanceOpen) {
    return closed({
      billableUnits: 0,
      admission: input.paidOptIn ? 'deny_unapproved_paid' : 'stop_free',
      reservedUnits: 0,
      serveCached: false,
      invokeUpstream: false,
    });
  }

  return closed({
    billableUnits: 1,
    admission: 'allow_free',
    reservedUnits: 1,
    serveCached: input.cache === 'fresh_hit',
    invokeUpstream: input.cache === 'miss',
  });
}

/**
 * Turn a reservation into consumed units. Only a completed free admission
 * consumes one unit. Failed, canceled, unauthorized, validation-blocked,
 * and rate-limited outcomes release the reservation. Nothing is charged.
 */
export function settleApiWork(
  admission: ApiWorkAdmissionDecision,
  outcome: ApiWorkOutcome
): ApiWorkSettlement {
  const consumedUnits =
    admission.admission === 'allow_free' &&
    admission.reservedUnits === 1 &&
    outcome === 'completed'
      ? 1
      : 0;
  return {
    consumedUnits,
    releaseReservation: admission.reservedUnits === 1 && consumedUnits === 0,
    charge: false,
  };
}
