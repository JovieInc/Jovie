/**
 * Webhook Handler Registry
 *
 * Central registry for mapping Stripe event types to their handlers.
 * Provides a factory function for retrieving the appropriate handler
 * based on event type.
 *
 * Architecture:
 * - Handlers are singleton instances (not recreated per request)
 * - The registry is built at module load time from handler eventTypes
 * - getHandler() provides O(1) lookup by event type
 * - Unhandled event types return null (caller should skip processing)
 */

import { captureWarning } from '@/lib/error-tracking';
import { checkoutSessionHandler } from './handlers/checkout-handler';
import { paymentHandler } from './handlers/payment-handler';
import { subscriptionHandler } from './handlers/subscription-handler';
import type { SupportedEventType, WebhookHandler } from './types';

/**
 * All registered webhook handlers.
 * Add new handlers here when extending webhook support.
 */
const handlers: readonly WebhookHandler[] = [
  checkoutSessionHandler,
  subscriptionHandler,
  paymentHandler,
] as const;

/**
 * Registry mapping event types to their handlers.
 * Built from handler eventTypes arrays for O(1) lookup.
 */
type HandlerRegistry = Map<SupportedEventType, WebhookHandler>;

/**
 * Build the handler registry from registered handlers.
 * Each handler's eventTypes array is used to create the mapping.
 *
 * @returns Map of event types to handler instances
 */
function buildRegistry(): HandlerRegistry {
  const registry = new Map<SupportedEventType, WebhookHandler>();

  for (const handler of handlers) {
    for (const eventType of handler.eventTypes) {
      // Warn if event type is already registered (indicates a bug)
      if (registry.has(eventType)) {
        captureWarning(
          `[Webhook Registry] Event type "${eventType}" is registered by multiple handlers. ` +
            `Only the first handler will be used.`
        );
        continue;
      }
      registry.set(eventType, handler);
    }
  }

  return registry;
}

/**
 * The singleton handler registry.
 * Built once at module load time.
 */
const handlerRegistry: HandlerRegistry = buildRegistry();

/**
 * Get the handler for a specific Stripe event type.
 *
 * Returns the registered handler for the event type, or null if
 * no handler is registered. Unhandled events should be acknowledged
 * but not processed (return 200 to Stripe).
 *
 * @param eventType - The Stripe event type to get a handler for
 * @returns The handler for the event type, or null if unhandled
 *
 * @example
 * ```ts
 * const handler = getHandler('checkout.session.completed');
 * if (handler) {
 *   const result = await handler.handle(context);
 * } else {
 *   // Unhandled event type - acknowledge but skip processing
 *   return { success: true, skipped: true };
 * }
 * ```
 */
export function getHandler(eventType: string): WebhookHandler | null {
  return handlerRegistry.get(eventType as SupportedEventType) ?? null;
}

/**
 * Get all registered event types.
 * Useful for logging, debugging, or validating webhook configuration.
 *
 * @returns Array of all event types that have handlers
 *
 * @example
 * ```ts
 * const types = getRegisteredEventTypes();
 * console.log('Handling events:', types.join(', '));
 * ```
 */
export function getRegisteredEventTypes(): readonly SupportedEventType[] {
  return Array.from(handlerRegistry.keys());
}

/**
 * Check if an event type has a registered handler.
 *
 * @param eventType - The event type to check
 * @returns True if a handler is registered for this event type
 *
 * @example
 * ```ts
 * if (isEventTypeRegistered(event.type)) {
 *   // Process the event
 * } else {
 *   // Log and skip
 * }
 * ```
 */
export function isEventTypeRegistered(eventType: string): boolean {
  return handlerRegistry.has(eventType as SupportedEventType);
}

/**
 * Get all registered handlers.
 * Useful for testing or introspection.
 *
 * @returns Array of all registered handler instances
 */
export function getRegisteredHandlers(): readonly WebhookHandler[] {
  return handlers;
}
