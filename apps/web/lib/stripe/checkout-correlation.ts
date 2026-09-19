/**
 * JOV-6444 durable checkout correlation for M2/M3 IRPAA.
 *
 * Optional claim/run/offer/first-touch fields travel from `/api/stripe/checkout`
 * into Stripe Checkout Session + Subscription metadata, then back through
 * webhook handlers into existing receipt tables (`billing_audit_log.metadata`
 * and `lead_funnel_events.metadata` on `paid_converted`).
 *
 * TypeScript names match existing acquisition/claim identifiers
 * (`claimId`, `runId`, `candidateId`). `offerVersion` and `firstTouch` have
 * no prior shared type — they are the issue's durable offer/version and
 * first-touch source fields.
 */

import { createHash } from 'node:crypto';

export const CHECKOUT_CORRELATION_FIELDS = [
  'claimId',
  'runId',
  'candidateId',
  'offerVersion',
  'firstTouch',
] as const;

export type CheckoutCorrelationField =
  (typeof CHECKOUT_CORRELATION_FIELDS)[number];

export type CheckoutCorrelation = {
  readonly [K in CheckoutCorrelationField]?: string;
};

export const CHECKOUT_CORRELATION_STRIPE_KEYS = {
  claimId: 'claim_id',
  runId: 'run_id',
  candidateId: 'candidate_id',
  offerVersion: 'offer_version',
  firstTouch: 'first_touch',
} as const satisfies Record<CheckoutCorrelationField, string>;

export const CHECKOUT_CORRELATION_BODY_ALIASES = {
  claimId: ['claimId', 'claim_id'],
  runId: ['runId', 'run_id'],
  candidateId: ['candidateId', 'candidate_id'],
  offerVersion: ['offerVersion', 'offer_version'],
  firstTouch: ['firstTouch', 'first_touch'],
} as const satisfies Record<
  CheckoutCorrelationField,
  readonly [string, string]
>;

/** Stripe metadata values are capped at 500 characters; keep IDs well under. */
export const CHECKOUT_CORRELATION_MAX_LENGTH = 128;

export class CheckoutCorrelationValidationError extends Error {
  constructor(readonly field: CheckoutCorrelationField) {
    super(`Invalid checkout correlation field: ${field}`);
    this.name = 'CheckoutCorrelationValidationError';
  }
}

function normalizeCorrelationValue(
  field: CheckoutCorrelationField,
  raw: unknown
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new CheckoutCorrelationValidationError(field);
  }
  const value = raw.trim();
  if (value.length === 0) return undefined;
  if (value.length > CHECKOUT_CORRELATION_MAX_LENGTH) {
    throw new CheckoutCorrelationValidationError(field);
  }
  return value;
}

export function parseCheckoutCorrelation(input: unknown): CheckoutCorrelation {
  if (input === undefined || input === null || typeof input !== 'object') {
    return {};
  }

  const record = input as Record<string, unknown>;
  const correlation: {
    -readonly [K in CheckoutCorrelationField]?: string;
  } = {};

  for (const field of CHECKOUT_CORRELATION_FIELDS) {
    const aliases = CHECKOUT_CORRELATION_BODY_ALIASES[field];
    const raw = record[aliases[0]] ?? record[aliases[1]];
    const value = normalizeCorrelationValue(field, raw);
    if (value) {
      correlation[field] = value;
    }
  }

  return correlation;
}

export function hasCheckoutCorrelation(
  correlation: CheckoutCorrelation | null | undefined
): correlation is CheckoutCorrelation {
  if (!correlation) return false;
  return CHECKOUT_CORRELATION_FIELDS.some(field => {
    const value = correlation[field];
    return typeof value === 'string' && value.length > 0;
  });
}

export function mergeCheckoutCorrelation(
  ...sources: Array<CheckoutCorrelation | null | undefined>
): CheckoutCorrelation {
  const merged: {
    -readonly [K in CheckoutCorrelationField]?: string;
  } = {};

  for (const source of sources) {
    if (!hasCheckoutCorrelation(source)) continue;
    for (const field of CHECKOUT_CORRELATION_FIELDS) {
      const value = source[field];
      if (typeof value === 'string' && value.length > 0 && !merged[field]) {
        merged[field] = value;
      }
    }
  }

  return merged;
}

export function toStripeCheckoutCorrelationMetadata(
  correlation: CheckoutCorrelation | null | undefined
): Record<string, string> {
  if (!hasCheckoutCorrelation(correlation)) return {};

  const metadata: Record<string, string> = {};
  for (const field of CHECKOUT_CORRELATION_FIELDS) {
    const value = correlation[field];
    if (typeof value === 'string' && value.length > 0) {
      metadata[CHECKOUT_CORRELATION_STRIPE_KEYS[field]] = value;
    }
  }
  return metadata;
}

export function extractCheckoutCorrelation(
  ...metadataSources: Array<
    Record<string, string | null | undefined> | null | undefined
  >
): CheckoutCorrelation {
  const merged: {
    -readonly [K in CheckoutCorrelationField]?: string;
  } = {};

  for (const metadata of metadataSources) {
    if (!metadata) continue;
    const parsed = parseCheckoutCorrelation(metadata);
    for (const field of CHECKOUT_CORRELATION_FIELDS) {
      const value = parsed[field];
      if (typeof value === 'string' && value.length > 0 && !merged[field]) {
        merged[field] = value;
      }
    }
  }

  return merged;
}

/**
 * CamelCase fields for existing jsonb receipt columns
 * (`billing_audit_log.metadata`, `lead_funnel_events.metadata`).
 */
export function toCheckoutCorrelationReceiptFields(
  correlation: CheckoutCorrelation | null | undefined
): CheckoutCorrelation {
  if (!hasCheckoutCorrelation(correlation)) return {};
  const receipt: {
    -readonly [K in CheckoutCorrelationField]?: string;
  } = {};
  for (const field of CHECKOUT_CORRELATION_FIELDS) {
    const value = correlation[field];
    if (typeof value === 'string' && value.length > 0) {
      receipt[field] = value;
    }
  }
  return receipt;
}

export function checkoutCorrelationIdempotencyPart(
  correlation: CheckoutCorrelation | null | undefined
): string | undefined {
  if (!hasCheckoutCorrelation(correlation)) return undefined;
  const stable = JSON.stringify(
    CHECKOUT_CORRELATION_FIELDS.map(field => [field, correlation[field] ?? ''])
  );
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}
