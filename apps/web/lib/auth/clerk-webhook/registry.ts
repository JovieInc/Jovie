/**
 * Clerk Webhook Handler Registry
 *
 * Central registry for mapping Clerk event types to their handlers.
 * Based on the Stripe webhook registry pattern in lib/stripe/webhooks/registry.ts.
 *
 * Architecture:
 * - Handlers are singleton instances (not recreated per request)
 * - The registry is built at module load time from handler eventTypes
 * - getHandler() provides O(1) lookup by event type
 * - Unhandled event types return null (caller should acknowledge but skip)
 */

import { userCreatedHandler } from './handlers/user-created-handler';
import { userDeletedHandler } from './handlers/user-deleted-handler';
import { userUpdatedHandler } from './handlers/user-updated-handler';
import type { ClerkEventType, ClerkWebhookHandler } from './types';

/**
 * All registered webhook handlers.
 */
const handlers: readonly ClerkWebhookHandler[] = [
  userCreatedHandler,
  userUpdatedHandler,
  userDeletedHandler,
] as const;

/**
 * Registry mapping event types to their handlers.
 */
type HandlerRegistry = Map<ClerkEventType, ClerkWebhookHandler>;

/**
 * Build the handler registry from registered handlers.
 */
function buildRegistry(): HandlerRegistry {
  const registry = new Map<ClerkEventType, ClerkWebhookHandler>();

  for (const handler of handlers) {
    for (const eventType of handler.eventTypes) {
      if (registry.has(eventType)) {
        console.warn(
          `[Clerk Webhook Registry] Event type "${eventType}" is registered by multiple handlers.`
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
 */
const handlerRegistry: HandlerRegistry = buildRegistry();

/**
 * Get the handler for a specific Clerk event type.
 *
 * @param eventType - The Clerk event type
 * @returns The handler for the event type, or null if unhandled
 */
export function getClerkHandler(eventType: string): ClerkWebhookHandler | null {
  return handlerRegistry.get(eventType as ClerkEventType) ?? null;
}

/**
 * Get all registered event types.
 */
export function getRegisteredClerkEventTypes(): readonly ClerkEventType[] {
  return Array.from(handlerRegistry.keys());
}

/**
 * Check if an event type has a registered handler.
 */
export function isClerkEventTypeRegistered(eventType: string): boolean {
  return handlerRegistry.has(eventType as ClerkEventType);
}
