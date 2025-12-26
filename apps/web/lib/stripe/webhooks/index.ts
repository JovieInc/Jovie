/**
 * Stripe Webhook Handlers
 *
 * Modular webhook handler architecture for processing Stripe events.
 * This module provides domain-specific handlers for subscription lifecycle,
 * checkout sessions, and payment events.
 *
 * Usage:
 * ```ts
 * import { getHandler, type WebhookContext, type HandlerResult } from '@/lib/stripe/webhooks';
 *
 * const handler = getHandler(event.type);
 * if (handler) {
 *   const result = await handler.handle(context);
 * }
 * ```
 */

// Types
export type {
  HandlerFactory,
  HandlerResult,
  SupportedEventType,
  WebhookContext,
  WebhookHandler,
} from './types';

export { isSupportedEventType } from './types';

// Registry - Primary API for event routing
export {
  getHandler,
  getRegisteredEventTypes,
  getRegisteredHandlers,
  isEventTypeRegistered,
} from './registry';

// Utilities - Common functions for webhook processing
export {
  getCustomerId,
  getStripeObjectId,
  getUserIdFromStripeCustomer,
  invalidateBillingCache,
  stripeTimestampToDate,
} from './utils';

// Base handler for extending
export type {
  ProcessSubscriptionOptions,
  ProcessSubscriptionResult,
} from './base-handler';

export { BaseSubscriptionHandler } from './base-handler';

// Handler instances (for testing and introspection)
export { CheckoutSessionHandler, checkoutSessionHandler } from './handlers/checkout-handler';
export { PaymentHandler, paymentHandler } from './handlers/payment-handler';
export { SubscriptionHandler, subscriptionHandler } from './handlers/subscription-handler';
