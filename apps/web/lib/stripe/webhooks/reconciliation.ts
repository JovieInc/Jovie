// Persist unapplied paid events before returning 2xx; failed capture must return
// 5xx for Stripe retry. Unprocessed rows reuse billing replay and audit dedupe.
import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { captureCriticalError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

export const NEEDS_RECONCILIATION = 'needs_reconciliation' as const;
export const RECONCILED = 'reconciled' as const;

export type StripeReconciliationReason =
  | 'unknown_price_id'
  | 'merch_order_not_found'
  | 'tip_unattributed';

export type StripeReconciliationContext = Readonly<
  Record<string, string | number | boolean | null | readonly string[]>
>;

export class StripeReconciliationRequiredError extends Error {
  readonly reason: StripeReconciliationReason;
  readonly context: StripeReconciliationContext;

  constructor(
    reason: StripeReconciliationReason,
    message: string,
    context: StripeReconciliationContext
  ) {
    super(message);
    this.name = 'StripeReconciliationRequiredError';
    this.reason = reason;
    this.context = context;
  }
}

export function isStripeReconciliationRequiredError(
  error: unknown
): error is StripeReconciliationRequiredError {
  return error instanceof StripeReconciliationRequiredError;
}

// Alert with identifiers only; customer details stay in the database.
function alertContext(
  error: StripeReconciliationRequiredError,
  stripeEventId: string,
  eventType: string,
  route: string,
  webhookRecordId: string
): Record<string, unknown> {
  const priceIds = error.context.priceIds;
  return {
    route,
    stripeEventId,
    eventType,
    webhookRecordId,
    reconciliationReason: error.reason,
    ...(priceIds ? { priceIds } : {}),
  };
}

export interface MarkNeedsReconciliationInput {
  readonly webhookRecordId: string;
  readonly stripeEventId: string;
  readonly eventType: string;
  readonly route: string;
  readonly error: StripeReconciliationRequiredError;
  // Compare the owned lease; keepLease lets blocked replay rows rotate.
  readonly leaseStartedAt?: Date | null;
  readonly keepLease?: boolean;
  readonly now?: Date;
}

// Capture must succeed before alerting or acknowledging the event.
export async function markStripeEventNeedsReconciliation(
  input: MarkNeedsReconciliationInput
): Promise<void> {
  const now = input.now ?? new Date();
  const context = {
    ...input.error.context,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    route: input.route,
  };

  const leaseCondition = input.leaseStartedAt
    ? eq(stripeWebhookEvents.processingStartedAt, input.leaseStartedAt)
    : undefined;

  const [marked] = await withSystemIngestionSession(tx =>
    tx
      .update(stripeWebhookEvents)
      .set({
        reconciliationStatus: NEEDS_RECONCILIATION,
        reconciliationReason: input.error.reason,
        reconciliationContext: context,
        reconciliationFlaggedAt: now,
        reconciledAt: null,
        ...(input.keepLease ? {} : { processingStartedAt: null }),
      })
      .where(
        and(
          eq(stripeWebhookEvents.id, input.webhookRecordId),
          isNull(stripeWebhookEvents.processedAt),
          leaseCondition
        )
      )
      .returning({ id: stripeWebhookEvents.id })
  );

  if (!marked) {
    throw new Error(
      `Stripe event ${input.stripeEventId} could not be marked for reconciliation`
    );
  }

  await captureCriticalError(
    'Stripe event needs reconciliation',
    input.error,
    alertContext(
      input.error,
      input.stripeEventId,
      input.eventType,
      input.route,
      input.webhookRecordId
    )
  );
}

// Successful replay reconciles only previously flagged rows.
export const reconciledStatusOnSuccess = drizzleSql`CASE WHEN ${stripeWebhookEvents.reconciliationStatus} = ${NEEDS_RECONCILIATION} THEN ${RECONCILED} ELSE ${stripeWebhookEvents.reconciliationStatus} END`;

export const reconciledAtOnSuccess = (now: Date) =>
  drizzleSql`CASE WHEN ${stripeWebhookEvents.reconciliationStatus} = ${NEEDS_RECONCILIATION} THEN ${drizzleSql.param(now, stripeWebhookEvents.reconciledAt)} ELSE ${stripeWebhookEvents.reconciledAt} END`;

export interface CaptureStripeEventForReconciliationInput {
  readonly event: {
    readonly id: string;
    readonly type: string;
    readonly created: number;
    readonly data: { readonly object: unknown };
  };
  readonly route: string;
  readonly error: StripeReconciliationRequiredError;
  readonly now?: Date;
}

// Tips are terminal reconciliation rows: processed_at excludes them from
// subscription replay. Failed capture throws so Stripe retries.
export async function captureStripeEventForReconciliation(
  input: CaptureStripeEventForReconciliationInput
): Promise<void> {
  const now = input.now ?? new Date();
  const context = {
    ...input.error.context,
    stripeEventId: input.event.id,
    eventType: input.event.type,
    route: input.route,
  };
  const object = input.event.data.object as { readonly id?: unknown };
  const reconciliation = {
    reconciliationStatus: NEEDS_RECONCILIATION,
    reconciliationReason: input.error.reason,
    reconciliationContext: context,
    reconciliationFlaggedAt: now,
    reconciledAt: null,
    processedAt: now,
    processingStartedAt: null,
  };

  const [captured] = await withSystemIngestionSession(tx =>
    tx
      .insert(stripeWebhookEvents)
      .values({
        stripeEventId: input.event.id,
        type: input.event.type,
        stripeObjectId: typeof object.id === 'string' ? object.id : null,
        stripeCreatedAt: new Date(input.event.created * 1000),
        payload: input.event as unknown as Record<string, unknown>,
        ...reconciliation,
      })
      .onConflictDoUpdate({
        target: stripeWebhookEvents.stripeEventId,
        set: reconciliation,
        // A redelivery after a human reconciled the event must not re-open it.
        setWhere: drizzleSql`${stripeWebhookEvents.reconciliationStatus} IS DISTINCT FROM ${RECONCILED}`,
      })
      .returning({ id: stripeWebhookEvents.id })
  );

  if (!captured) {
    const [existing] = await withSystemIngestionSession(tx =>
      tx
        .select({ status: stripeWebhookEvents.reconciliationStatus })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, input.event.id))
        .limit(1)
    );
    if (existing?.status === RECONCILED) return;
    throw new Error(
      `Stripe event ${input.event.id} could not be captured for reconciliation`
    );
  }

  await captureCriticalError(
    'Stripe event needs reconciliation',
    input.error,
    alertContext(
      input.error,
      input.event.id,
      input.event.type,
      input.route,
      captured.id
    )
  );
}
