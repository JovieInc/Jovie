/**
 * Durable capture for verified Stripe events that cannot be applied yet.
 *
 * A paid event (for example an active subscription on a price we have not
 * mapped to a plan) must never be acknowledged and forgotten. Handlers throw
 * `StripeReconciliationRequiredError`; the webhook route then marks the stored
 * `stripe_webhook_events` row `needs_reconciliation` and leaves `processed_at`
 * unset. Only after that write succeeds may the route return 2xx. If the write
 * fails, the route returns 5xx and Stripe retries.
 *
 * Because `processed_at` stays null, the billing-reconciliation cron replays
 * the stored event through the same handlers. Once the cause is fixed (the
 * price is mapped), replay applies it, and the existing processed_at lease plus
 * the billing audit log's stripe_event_id dedupe grant it exactly once.
 */

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

/**
 * Sentry gets identifiers needed to find the queued row, never customer,
 * subscription or email details (those stay in the database row).
 */
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
  /**
   * When set, the write only applies while this lease is still owned, and the
   * lease is released. Replay passes `keepLease: true` so a still-blocked
   * event rotates behind healthy ones until its lease expires.
   */
  readonly leaseStartedAt?: Date | null;
  readonly keepLease?: boolean;
  readonly now?: Date;
}

/**
 * Persist the reconciliation marker, then alert. Throws when the row could not
 * be written so the caller returns non-2xx and Stripe retries.
 */
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

/**
 * Value for `reconciliation_status` when an event is finally applied: a row
 * previously flagged becomes `reconciled`; any other row is left untouched.
 */
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

/**
 * For webhook routes that do not otherwise store events (tips): persist the
 * verified event as a terminal needs_reconciliation row. `processed_at` is set
 * so the subscription replay never re-drives it; a human reconciles it from
 * the queue. Throws on failure so the route returns non-2xx.
 */
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
