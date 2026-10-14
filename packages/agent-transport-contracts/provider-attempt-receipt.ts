import { createHash } from 'node:crypto';
import { z } from 'zod';
import { providerFailureClassSchema } from './provider-incident.js';

/**
 * One immutable evidence chain for a consumed Eve turnStep provider request.
 *
 * A replay-guard refusal proves only that the request identity was consumed.
 * This receipt keeps that refusal distinct from the original request and
 * failure, then binds usage, claim, charge, admission reconciliation, and the
 * only supported continuation to the same sessions and runtime deployments.
 */
export const PROVIDER_ATTEMPT_RECEIPT_SCHEMA =
  'jovie.provider-attempt-receipt/v1' as const;
export const PROVIDER_REQUEST_REPLAY_REFUSAL =
  'provider-request-already-attempted' as const;

const timestamp = z.string().datetime();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const wrunId = z.string().regex(/^wrun_[A-Za-z0-9]{10,64}$/u);
const deploymentId = z.string().regex(/^dpl_[A-Za-z0-9]{10,64}$/u);
const safeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u);
const resourceRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/u);
const evidenceRef = z
  .string()
  .min(8)
  .max(512)
  .regex(
    /^(?:https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/-]*)?|(?:artifact|record):\/\/[A-Za-z0-9._~:/-]+)$/u
  );
const nonNegativeInt = z.number().int().min(0);
const tokenCount = z.number().int().min(0);

const reportedUsageSchema = z
  .object({
    status: z.literal('reported'),
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheTokens: tokenCount.nullable(),
  })
  .strict();

const usageSchema = z.discriminatedUnion('status', [
  reportedUsageSchema,
  z.object({ status: z.literal('none') }).strict(),
  z.object({ status: z.literal('unknown') }).strict(),
]);

const bindingSchema = z
  .object({
    parentWrunId: wrunId,
    attemptWrunId: wrunId,
    parentDeploymentId: deploymentId,
    attemptDeploymentId: deploymentId,
    turnIndex: nonNegativeInt,
    stepIndex: nonNegativeInt,
  })
  .strict();
export type ProviderAttemptBinding = z.infer<typeof bindingSchema>;

const providerRequestSchema = z
  .object({
    requestId: safeId,
    requestDigest: sha256,
    provider: resourceRef,
    model: resourceRef,
    route: resourceRef,
    evidenceRef,
  })
  .strict();
export type ProviderAttemptRequest = z.infer<typeof providerRequestSchema>;

const firstFailureSchema = z
  .object({
    observedAt: timestamp,
    errorClass: providerFailureClassSchema,
    errorId: safeId.nullable(),
    errorCode: safeId.nullable(),
    errorDigest: sha256,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    evidenceRef,
  })
  .strict();
export type ProviderAttemptFirstFailure = z.infer<typeof firstFailureSchema>;

const guardRefusalSchema = z
  .object({
    code: z.literal(PROVIDER_REQUEST_REPLAY_REFUSAL),
    errorId: safeId,
    observedAt: timestamp,
  })
  .strict();

const outcomeSchema = z
  .object({
    completed: z.boolean(),
    completedAt: timestamp.nullable(),
    reconciledAt: timestamp,
    usage: usageSchema,
    claim: z.enum(['none', 'recorded', 'unknown']),
    charge: z.enum(['none', 'accrued', 'unknown']),
    evidenceRef,
  })
  .strict();
export type ProviderAttemptOutcome = z.infer<typeof outcomeSchema>;

const admissionSchema = z
  .object({
    receiptId: sha256,
    returnedAt: timestamp,
    serverSidePersisted: z.literal(true),
    sameSession: z.literal(true),
    evidenceRef,
  })
  .strict();
export type ProviderAttemptAdmission = z.infer<typeof admissionSchema>;

const continuationSchema = z
  .object({
    action: z.literal('resume-preserved-state'),
    admissionReceiptId: sha256,
    sessionStatePreserved: z.literal(true),
    replayProtectionPreserved: z.literal(true),
    freshAdmission: z.literal(false),
    paidReplay: z.literal(false),
    renewedTrial: z.literal(false),
    ownershipReset: z.literal(false),
    secondWriter: z.literal(false),
    authorizedAt: timestamp,
  })
  .strict();

export const providerAttemptReceiptSchema = z
  .object({
    schema: z.literal(PROVIDER_ATTEMPT_RECEIPT_SCHEMA),
    version: z.number().int().positive(),
    receiptId: sha256,
    idempotencyKey: z.string().regex(/^provider-attempt:[a-f0-9]{64}$/u),
    sourceOwner: resourceRef,
    sourceOwnerPreserved: z.literal(true),
    binding: bindingSchema,
    providerRequest: providerRequestSchema,
    firstFailure: firstFailureSchema,
    guardRefusal: guardRefusalSchema.nullable(),
    outcome: outcomeSchema.nullable(),
    admission: admissionSchema.nullable(),
    continuation: continuationSchema.nullable(),
    contentDigest: sha256,
  })
  .strict();

export type ProviderAttemptReceipt = z.infer<
  typeof providerAttemptReceiptSchema
>;

export interface ProviderAttemptBindInput {
  readonly sourceOwner: string;
  readonly binding: z.input<typeof bindingSchema>;
  readonly providerRequest: z.input<typeof providerRequestSchema>;
  readonly firstFailure: z.input<typeof firstFailureSchema>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function receiptIdFor(
  binding: ProviderAttemptBinding,
  providerRequest: ProviderAttemptRequest
): string {
  return digest({
    schema: PROVIDER_ATTEMPT_RECEIPT_SCHEMA,
    binding,
    providerRequest,
  });
}

function occursBefore(left: string, right: string): boolean {
  return Date.parse(left) < Date.parse(right);
}

function assertOutcome(outcome: ProviderAttemptOutcome): void {
  if (outcome.completed !== (outcome.completedAt !== null)) {
    throw new Error(
      'provider attempt completion and completion time must agree'
    );
  }
}

function seal(
  value: Omit<ProviderAttemptReceipt, 'contentDigest'> & {
    readonly contentDigest?: string;
  }
): ProviderAttemptReceipt {
  const { contentDigest: _ignored, ...unsigned } = value;
  return providerAttemptReceiptSchema.parse({
    ...unsigned,
    contentDigest: digest(unsigned),
  });
}

/**
 * Bind the exact provider request and its original failure before recording
 * the later replay refusal. Ownership is copied from the existing source
 * owner and cannot be reassigned by any receipt transition.
 */
export function bindProviderAttempt(
  input: ProviderAttemptBindInput
): ProviderAttemptReceipt {
  const sourceOwner = resourceRef.parse(input.sourceOwner);
  const binding = bindingSchema.parse(input.binding);
  const providerRequest = providerRequestSchema.parse(input.providerRequest);
  const firstFailure = firstFailureSchema.parse(input.firstFailure);
  const receiptId = receiptIdFor(binding, providerRequest);
  return seal({
    schema: PROVIDER_ATTEMPT_RECEIPT_SCHEMA,
    version: 1,
    receiptId,
    idempotencyKey: `provider-attempt:${receiptId}`,
    sourceOwner,
    sourceOwnerPreserved: true,
    binding,
    providerRequest,
    firstFailure,
    guardRefusal: null,
    outcome: null,
    admission: null,
    continuation: null,
  });
}

/** Record the replay refusal as guard evidence, never as first failure. */
export function recordProviderAttemptGuardRefusal(
  current: unknown,
  input: { readonly errorId: string; readonly observedAt: string }
): ProviderAttemptReceipt {
  const receipt = verifyProviderAttemptReceipt(current);
  const guardRefusal = guardRefusalSchema.parse({
    code: PROVIDER_REQUEST_REPLAY_REFUSAL,
    errorId: input.errorId,
    observedAt: input.observedAt,
  });
  if (receipt.guardRefusal !== null) {
    if (canonical(receipt.guardRefusal) === canonical(guardRefusal)) {
      return receipt;
    }
    throw new Error('provider attempt guard refusal conflicts with receipt');
  }
  if (occursBefore(guardRefusal.observedAt, receipt.firstFailure.observedAt)) {
    throw new Error('guard refusal cannot precede the first failure');
  }
  return seal({ ...receipt, version: receipt.version + 1, guardRefusal });
}

/**
 * Reconcile the consumed request's completion, usage, claim, and charge.
 * Failed attempts may still report partial usage or accrued charges.
 */
export function recordProviderAttemptOutcome(
  current: unknown,
  input: z.input<typeof outcomeSchema>
): ProviderAttemptReceipt {
  const receipt = verifyProviderAttemptReceipt(current);
  const outcome = outcomeSchema.parse(input);
  assertOutcome(outcome);
  if (occursBefore(outcome.reconciledAt, receipt.firstFailure.observedAt)) {
    throw new Error('provider attempt outcome cannot predate first failure');
  }
  if (receipt.outcome !== null) {
    if (canonical(receipt.outcome) === canonical(outcome)) return receipt;
    throw new Error('provider attempt outcome conflicts with receipt');
  }
  return seal({ ...receipt, version: receipt.version + 1, outcome });
}

/** Bind the returned, server-side persisted admission receipt. */
export function recordProviderAttemptAdmissionReconciliation(
  current: unknown,
  input: Omit<
    z.input<typeof admissionSchema>,
    'sameSession' | 'serverSidePersisted'
  >
): ProviderAttemptReceipt {
  const receipt = verifyProviderAttemptReceipt(current);
  const admission = admissionSchema.parse({
    ...input,
    serverSidePersisted: true,
    sameSession: true,
  });
  if (occursBefore(admission.returnedAt, receipt.firstFailure.observedAt)) {
    throw new Error('admission reconciliation cannot predate first failure');
  }
  if (receipt.admission !== null) {
    if (canonical(receipt.admission) === canonical(admission)) return receipt;
    throw new Error('provider attempt admission conflicts with receipt');
  }
  return seal({ ...receipt, version: receipt.version + 1, admission });
}

/**
 * Authorize only same-session continuation. The original outcome, replay
 * guard, and exact persisted admission receipt must all reconcile first.
 */
export function authorizeProviderAttemptContinuation(
  current: unknown,
  input: { readonly authorizedAt: string }
): ProviderAttemptReceipt {
  const receipt = verifyProviderAttemptReceipt(current);
  if (receipt.guardRefusal === null) {
    throw new Error('provider replay guard must reconcile before continuation');
  }
  if (receipt.outcome === null) {
    throw new Error(
      'provider attempt outcome must reconcile before continuation'
    );
  }
  if (receipt.admission === null) {
    throw new Error('server-side admission must reconcile before continuation');
  }
  const continuation = continuationSchema.parse({
    action: 'resume-preserved-state',
    admissionReceiptId: receipt.admission.receiptId,
    sessionStatePreserved: true,
    replayProtectionPreserved: true,
    freshAdmission: false,
    paidReplay: false,
    renewedTrial: false,
    ownershipReset: false,
    secondWriter: false,
    authorizedAt: input.authorizedAt,
  });
  if (
    [
      receipt.guardRefusal.observedAt,
      receipt.outcome.reconciledAt,
      receipt.admission.returnedAt,
    ].some(observedAt => occursBefore(continuation.authorizedAt, observedAt))
  ) {
    throw new Error('continuation cannot predate reconciliation');
  }
  if (receipt.continuation !== null) {
    if (canonical(receipt.continuation) === canonical(continuation)) {
      return receipt;
    }
    throw new Error('provider attempt continuation conflicts with receipt');
  }
  return seal({ ...receipt, version: receipt.version + 1, continuation });
}

export function verifyProviderAttemptReceipt(
  value: unknown
): ProviderAttemptReceipt {
  const receipt = providerAttemptReceiptSchema.parse(value);
  const receiptId = receiptIdFor(receipt.binding, receipt.providerRequest);
  if (
    receipt.receiptId !== receiptId ||
    receipt.idempotencyKey !== `provider-attempt:${receiptId}`
  ) {
    throw new Error('provider attempt identity is invalid');
  }
  if (
    receipt.guardRefusal !== null &&
    occursBefore(
      receipt.guardRefusal.observedAt,
      receipt.firstFailure.observedAt
    )
  ) {
    throw new Error('guard refusal cannot precede the first failure');
  }
  if (receipt.outcome !== null) {
    assertOutcome(receipt.outcome);
    if (
      occursBefore(
        receipt.outcome.reconciledAt,
        receipt.firstFailure.observedAt
      )
    ) {
      throw new Error('provider attempt outcome cannot predate first failure');
    }
  }
  if (
    receipt.admission !== null &&
    occursBefore(receipt.admission.returnedAt, receipt.firstFailure.observedAt)
  ) {
    throw new Error('admission reconciliation cannot predate first failure');
  }
  const continuation = receipt.continuation;
  if (continuation !== null) {
    if (
      receipt.guardRefusal === null ||
      receipt.outcome === null ||
      receipt.admission === null ||
      continuation.admissionReceiptId !== receipt.admission.receiptId
    ) {
      throw new Error('provider attempt continuation is unreconciled');
    }
    if (
      [
        receipt.guardRefusal.observedAt,
        receipt.outcome.reconciledAt,
        receipt.admission.returnedAt,
      ].some(observedAt => occursBefore(continuation.authorizedAt, observedAt))
    ) {
      throw new Error('continuation cannot predate reconciliation');
    }
  }
  const { contentDigest, ...unsigned } = receipt;
  if (contentDigest !== digest(unsigned)) {
    throw new Error('provider attempt receipt digest is invalid');
  }
  return receipt;
}
