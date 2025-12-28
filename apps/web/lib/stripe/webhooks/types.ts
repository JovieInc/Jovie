/**
 * Stripe Webhook Handler Types
 *
 * Shared TypeScript interfaces for the modular webhook handler architecture.
 * These types define the contract between the main route handler and
 * domain-specific event processors.
 */

import type Stripe from 'stripe';

/**
 * Union type of all Stripe event types handled by our webhook system.
 * Add new event types here when extending webhook handling.
 */
export type SupportedEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed';

/**
 * Context passed to webhook handlers containing event metadata.
 * Provides the event data along with timing information for event ordering.
 */
export interface WebhookContext {
  /** The Stripe event being processed */
  event: Stripe.Event;

  /** Unique Stripe event ID (used for idempotency and audit logging) */
  stripeEventId: string;

  /** When Stripe created the event (used for event ordering to skip stale events) */
  stripeEventTimestamp: Date;
}

/**
 * Result returned from a webhook handler after processing.
 * Follows the same pattern as UpdateBillingStatusResult for consistency.
 */
export interface HandlerResult {
  /** Whether the handler completed successfully */
  success: boolean;

  /** Whether processing was skipped (e.g., stale event, already handled) */
  skipped?: boolean;

  /** Error message if success is false and not skipped */
  error?: string;

  /** Reason for skipping (if skipped is true) */
  reason?: string;
}

/**
 * Interface for domain-specific webhook event handlers.
 *
 * Handlers are stateless singletons that process specific event types.
 * Each handler is responsible for:
 * - Extracting relevant data from the event
 * - Looking up the associated user
 * - Updating billing status as needed
 * - Invalidating caches
 *
 * Handlers throw on unrecoverable errors to trigger transaction rollback.
 */
export interface WebhookHandler {
  /**
   * The event types this handler can process.
   * Used by the registry to route events to the correct handler.
   */
  readonly eventTypes: readonly SupportedEventType[];

  /**
   * Process a webhook event.
   *
   * @param context - The webhook context containing the event and metadata
   * @returns A promise resolving to the handler result
   * @throws On unrecoverable errors to trigger transaction rollback
   */
  handle(context: WebhookContext): Promise<HandlerResult>;
}

/**
 * Type guard to check if an event type is one we handle.
 * Useful for filtering events before processing.
 */
export function isSupportedEventType(
  eventType: string
): eventType is SupportedEventType {
  const supportedTypes: readonly string[] = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ];
  return supportedTypes.includes(eventType);
}

/**
 * Factory function type for creating handlers.
 * Handlers are typically singletons, but this type supports
 * alternative instantiation patterns if needed.
 */
export type HandlerFactory = () => WebhookHandler;
