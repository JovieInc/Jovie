import type { ScheduledPriceChange } from './types';

/** A Stripe subscription currently on the old price. */
export interface AffectedSubscription {
  readonly subscriptionId: string;
  readonly customerId: string;
  /** Stripe's own customer email, the fallback when no app user matches. */
  readonly customerEmail: string | null;
  readonly status: string;
  /** The subscription item that carries the old price. */
  readonly itemId: string;
  /** True when a Stripe subscription schedule owns future phases. */
  readonly hasSchedule: boolean;
}

export interface StripePort {
  /** Every non-terminal subscription with an item on the change's old price. */
  listAffected(change: ScheduledPriceChange): Promise<AffectedSubscription[]>;
  /**
   * Swap the old price item for the new price with no proration. Throws
   * ScheduleOwnedError when a schedule owns the subscription.
   */
  switchPrice(
    change: ScheduledPriceChange,
    subscription: AffectedSubscription,
    idempotencyKey: string
  ): Promise<{ stripePriceId: string }>;
}

export class ScheduleOwnedError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is owned by a Stripe schedule`);
    this.name = 'ScheduleOwnedError';
  }
}

export interface Recipient {
  readonly userId: string | null;
  readonly email: string;
  readonly name: string;
}

export interface RecipientPort {
  /** Null when no deliverable address can be resolved. Never throws for "not found". */
  resolve(subscription: AffectedSubscription): Promise<Recipient | null>;
}

export type MailResult =
  | { readonly status: 'sent'; readonly messageId: string }
  | { readonly status: 'skipped' | 'error'; readonly detail: string };

export interface MailPort {
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }): Promise<MailResult>;
}

export interface IncidentPort {
  raise(incident: {
    changeId: string;
    summary: string;
    missing: readonly string[];
    reasons: Readonly<Record<string, string>>;
  }): Promise<void>;
}
