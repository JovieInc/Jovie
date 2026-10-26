/**
 * Scheduled price changes. A live price for an existing plan is never edited in
 * place: the change is declared in registry.ts first, subscribers are notified,
 * and the Stripe switch only happens at the effective date once every notice is
 * on record (gate.ts). Pure types, no server-only imports.
 */

/** Stable key of one live price, e.g. `pro:month` or `legacy:foundingMonthly`. */
export type LivePriceKey = string;

export type LivePriceTable = Readonly<Record<LivePriceKey, number>>;

export interface ScheduledPriceChange {
  /** Stable id, never reused. Used in idempotency keys and notice rows. */
  readonly id: string;
  readonly priceKey: LivePriceKey;
  /** Display name used in the notice, e.g. "Artist Presence". */
  readonly planName: string;
  /** Monthly only until a renewal-aligned annual notice window exists. */
  readonly interval: 'month';
  readonly currency: 'usd';
  readonly oldAmountCents: number;
  readonly newAmountCents: number;
  /** Env key naming the Stripe price subscribers are on today. */
  readonly oldStripePriceEnvKey: string;
  /** Env key naming the new Stripe price (Stripe prices are immutable). */
  readonly newStripePriceEnvKey: string;
  /** UTC calendar day (YYYY-MM-DD) the new price first applies. */
  readonly effectiveDate: string;
  /** UTC calendar day (YYYY-MM-DD) the record was committed. */
  readonly scheduledAt: string;
  readonly reason: string;
  /** Set to cancel before the effective date. */
  readonly cancelledAt?: string;
}

export type NoticeStatus =
  /** Waiting to be sent. */
  | 'queued'
  /** Claimed by one worker; provider call in flight or crashed. */
  | 'sending'
  /** Provider accepted the message and returned a message id. */
  | 'sent'
  /** Provider reported a retryable (soft) bounce after acceptance. */
  | 'bounced'
  /** Provider call failed or the provider skipped the send. Retryable. */
  | 'failed'
  /** Address is permanently undeliverable (hard bounce, complaint). */
  | 'permanent_bounce'
  /** No usable recipient address could be resolved. Blocks the switch. */
  | 'no_recipient';

export interface NoticeRow {
  readonly changeId: string;
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly userId: string | null;
  readonly status: NoticeStatus;
  readonly attempts: number;
  /** Confirmed-bounce retries; part of the provider idempotency key. */
  readonly bounceRetries: number;
  readonly nextAttemptAt: Date | null;
  readonly providerMessageId: string | null;
  readonly contentHash: string | null;
  readonly templateVersion: string | null;
  readonly queuedAt: Date;
  readonly claimedAt: Date | null;
  readonly sentAt: Date | null;
  readonly lastError: string | null;
  /** Alternate-channel notice (in-app banner, Stripe customer email). */
  readonly fallbackNoticeAt: Date | null;
  readonly appliedAt: Date | null;
  readonly appliedStripePriceId: string | null;
  readonly applyError: string | null;
}
