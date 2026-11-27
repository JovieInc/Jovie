/**
 * Pure merch Stripe webhook routing + claim-interval helpers.
 *
 * Kept free of DB/Stripe I/O so mutation testing can kill weak assertions
 * on which event types run which handlers and when a lease is stealable.
 */

export const MERCH_STALE_PROCESSING_CLAIM_MS = 10 * 60 * 1000;

export type MerchWebhookAction =
  | 'checkout_completed'
  | 'payment_failed'
  | 'charge_refunded'
  | 'unhandled';

export function resolveMerchWebhookAction(
  eventType: string
): MerchWebhookAction {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return 'checkout_completed';
    case 'checkout.session.async_payment_failed':
      return 'payment_failed';
    case 'charge.refunded':
      return 'charge_refunded';
    default:
      return 'unhandled';
  }
}

/**
 * A lease with no start time is free. Otherwise steal only after the claim interval.
 */
export function isMerchProcessingClaimStale(
  processingStartedAt: Date | null | undefined,
  now: Date,
  claimIntervalMs: number = MERCH_STALE_PROCESSING_CLAIM_MS
): boolean {
  if (processingStartedAt == null) return true;
  if (!Number.isFinite(claimIntervalMs) || claimIntervalMs < 0) return false;
  return processingStartedAt.getTime() < now.getTime() - claimIntervalMs;
}
