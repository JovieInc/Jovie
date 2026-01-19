/**
 * Clerk Webhook Handler Types
 *
 * Shared TypeScript interfaces for the modular Clerk webhook handler architecture.
 * Based on the Stripe webhook handler pattern in lib/stripe/webhooks/types.ts.
 */

/**
 * Clerk webhook event data structure for user events.
 */
export interface ClerkUserEventData {
  id: string;
  username?: string | null;
  primary_email_address_id?: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string };
  }>;
  first_name: string | null;
  last_name: string | null;
  private_metadata: Record<string, unknown>;
  public_metadata: Record<string, unknown>;
  deleted?: boolean;
}

/**
 * Clerk webhook event structure.
 */
export interface ClerkWebhookEvent {
  data: ClerkUserEventData;
  object: 'event';
  type: ClerkEventType | string;
}

/**
 * Union type of all Clerk event types handled by our webhook system.
 */
export type ClerkEventType = 'user.created' | 'user.updated' | 'user.deleted';

/**
 * Context passed to webhook handlers.
 */
export interface ClerkWebhookContext {
  event: ClerkWebhookEvent;
  clerkUserId: string;
}

/**
 * Result returned from a webhook handler.
 */
export interface ClerkHandlerResult {
  success: boolean;
  error?: string;
  message?: string;
  /** Full name (user.created only) */
  fullName?: string;
  /** Suggested username (user.created only) */
  suggestedUsername?: string;
}

/**
 * Interface for Clerk webhook event handlers.
 */
export interface ClerkWebhookHandler {
  /**
   * The event types this handler can process.
   */
  readonly eventTypes: readonly ClerkEventType[];

  /**
   * Process a webhook event.
   */
  handle(context: ClerkWebhookContext): Promise<ClerkHandlerResult>;
}

/**
 * Type guard to check if an event type is one we handle.
 */
export function isClerkEventType(
  eventType: string
): eventType is ClerkEventType {
  return ['user.created', 'user.updated', 'user.deleted'].includes(eventType);
}
