/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
 *
 * Hardened with:
 * - Event ordering via stripeCreatedAt to skip stale events
 * - Optimistic locking to prevent concurrent overwrites
 * - Audit logging for all state changes
 * - Expanded payment failure handling
 *
 * Security Notes:
 * - Stripe customer IDs and subscription IDs are considered PII and are NOT logged
 * - Only internal user IDs, event IDs, event types, and price IDs are safe to log
 * - All errors are sent to error tracking with sanitized context
 */

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db, withTransaction } from '@/lib/db';
import { stripeWebhookEvents, users } from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import {
  captureCriticalError,
  captureWarning,
  logFallback,
} from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { getPlanFromPriceId } from '@/lib/stripe/config';
import {
  updateUserBillingStatus,
  type BillingAuditEventType,
} from '@/lib/stripe/customer-sync';

// Force Node.js runtime for Stripe SDK compatibility
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const webhookSecret = env.STRIPE_WEBHOOK_SECRET!;

/**
 * Safely extract the Stripe object ID from a webhook event
 * @param event - Stripe webhook event
 * @returns The object ID if present, null otherwise
 */
function getStripeObjectId(event: Stripe.Event): string | null {
  // Stripe webhook events always have data.object with an 'id' field
  // Cast to unknown first to satisfy TypeScript
  const object = event.data?.object as unknown as
    | { id?: string }
    | null
    | undefined;

  if (object && typeof object.id === 'string' && object.id.length > 0) {
    return object.id;
  }

  return null;
}

/**
 * Convert Stripe Unix timestamp to Date
 */
function stripeTimestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Safely extract customer ID from Stripe objects
 * Handles both string IDs and expanded customer objects
 */
function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('id' in customer && typeof customer.id === 'string') return customer.id;
  return null;
}

/**
 * Fallback: Look up Clerk user ID by Stripe customer ID
 * Used when subscription metadata is missing (e.g., old subscriptions, metadata loss)
 */
async function getUserIdFromStripeCustomer(
  stripeCustomerId: string
): Promise<string | null> {
  try {
    const [user] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(eq(users.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return user?.clerkId || null;
  } catch (error) {
    await captureWarning(
      'Failed to lookup user by Stripe customer ID in fallback',
      error,
      {
        function: 'getUserIdFromStripeCustomer',
        route: '/api/stripe/webhooks',
      }
    );
    return null;
  }
}

/**
 * Invalidate client-side billing cache by setting a short revalidation window
 * This triggers clients to refetch billing status
 */
async function invalidateBillingCache(): Promise<void> {
  // Revalidate the dashboard and any pages that display billing info
  revalidatePath('/app/dashboard');
  revalidatePath('/billing');
  revalidatePath('/app/settings');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      await captureCriticalError(
        'Missing Stripe webhook signature',
        new Error('Missing signature header'),
        { route: '/api/stripe/webhooks' }
      );
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      await captureCriticalError('Invalid Stripe webhook signature', error, {
        route: '/api/stripe/webhooks',
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const stripeCreatedAt = stripeTimestampToDate(event.created);

    // Use a transaction for atomic webhook processing:
    // 1. Insert or get existing webhook record
    // 2. Check if already processed (idempotency)
    // 3. Process the event
    // 4. Mark as processed
    // If any step fails, the transaction rolls back for clean retry
    const { error: txError } = await withTransaction(async tx => {
      // Check if event already exists
      const [existingEvent] = await tx
        .select({
          id: stripeWebhookEvents.id,
          processedAt: stripeWebhookEvents.processedAt,
        })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, event.id))
        .limit(1);

      if (existingEvent?.processedAt) {
        // Already processed - skip (idempotent)
        return { skipped: true, reason: 'already_processed' };
      }

      let webhookRecordId: string;

      if (existingEvent) {
        // Event exists but wasn't processed (previous failure) - retry processing
        webhookRecordId = existingEvent.id;
      } else {
        // New event - insert record
        const [newRecord] = await tx
          .insert(stripeWebhookEvents)
          .values({
            stripeEventId: event.id,
            type: event.type,
            stripeObjectId: getStripeObjectId(event),
            stripeCreatedAt,
            payload: event as unknown as Record<string, unknown>,
          })
          .returning({ id: stripeWebhookEvents.id });

        if (!newRecord) {
          throw new Error('Failed to insert webhook event record');
        }
        webhookRecordId = newRecord.id;
      }

      // Process the event (handlers throw on failure)
      await processWebhookEvent(event, stripeCreatedAt);

      // Mark event as processed atomically within the transaction
      await tx
        .update(stripeWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeWebhookEvents.id, webhookRecordId));

      return { skipped: false, processed: true };
    });

    if (txError) {
      await captureCriticalError('Stripe webhook transaction failed', txError, {
        route: '/api/stripe/webhooks',
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureCriticalError('Stripe webhook processing failed', error, {
      route: '/api/stripe/webhooks',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Process a webhook event based on its type
 * Extracted for use within transaction context
 */
async function processWebhookEvent(
  event: Stripe.Event,
  stripeCreatedAt: Date
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        event.id,
        stripeCreatedAt
      );
      break;

    case 'customer.subscription.created':
      await handleSubscriptionCreated(
        event.data.object as Stripe.Subscription,
        event.id,
        stripeCreatedAt
      );
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        event.id,
        stripeCreatedAt
      );
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
        event.id,
        stripeCreatedAt
      );
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(
        event.data.object as Stripe.Invoice,
        event.id,
        stripeCreatedAt
      );
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(
        event.data.object as Stripe.Invoice,
        event.id,
        stripeCreatedAt
      );
      break;

    default:
      // Unhandled event types are expected - Stripe sends many event types
      break;
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  let userId = session.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof session.customer === 'string') {
    await logFallback('No user ID in checkout session metadata', {
      event: 'checkout.session.completed',
    });
    userId = (await getUserIdFromStripeCustomer(session.customer)) ?? undefined;
  }

  if (!userId) {
    await captureCriticalError(
      'Cannot identify user for checkout session',
      new Error('Missing user ID in checkout session'),
      {
        route: '/api/stripe/webhooks',
        event: 'checkout.session.completed',
      }
    );
    throw new Error('Missing user ID in checkout session');
  }

  // Get subscription details to determine the plan
  if (session.subscription && typeof session.subscription === 'string') {
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription
    );
    await processSubscription(
      subscription,
      userId,
      stripeEventId,
      stripeEventTimestamp,
      'subscription_created'
    );
  }

  // Invalidate client cache
  await invalidateBillingCache();
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    await logFallback('No user ID in subscription metadata', {
      event: 'customer.subscription.created',
    });
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    await captureCriticalError(
      'Cannot identify user for subscription creation',
      new Error('Missing user ID in subscription'),
      {
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.created',
      }
    );
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(
    subscription,
    userId,
    stripeEventId,
    stripeEventTimestamp,
    'subscription_created'
  );
  await invalidateBillingCache();
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    await logFallback('No user ID in subscription metadata', {
      event: 'customer.subscription.updated',
    });
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    await captureCriticalError(
      'Cannot identify user for subscription update',
      new Error('Missing user ID in subscription'),
      {
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.updated',
      }
    );
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(
    subscription,
    userId,
    stripeEventId,
    stripeEventTimestamp,
    'subscription_updated'
  );
  await invalidateBillingCache();
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    await logFallback('No user ID in subscription metadata', {
      event: 'customer.subscription.deleted',
    });
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    await captureCriticalError(
      'Cannot identify user for subscription deletion',
      new Error('Missing user ID in subscription'),
      {
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.deleted',
      }
    );
    throw new Error('Missing user ID in subscription');
  }

  // User is no longer pro
  const result = await updateUserBillingStatus({
    clerkUserId: userId,
    isPro: false,
    stripeSubscriptionId: null,
    stripeEventId,
    stripeEventTimestamp,
    eventType: 'subscription_deleted',
    source: 'webhook',
    metadata: {
      subscriptionStatus: subscription.status,
      canceledAt: subscription.canceled_at,
    },
  });

  if (!result.success && !result.skipped) {
    await captureCriticalError(
      'Failed to downgrade user on subscription deletion',
      new Error(result.error || 'Unknown error'),
      {
        userId,
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.deleted',
      }
    );
    throw new Error(`Failed to downgrade user: ${result.error}`);
  }

  await invalidateBillingCache();
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  try {
    const raw = invoice as unknown as Record<string, unknown>;
    const subField = raw['subscription'];
    const subscriptionId =
      typeof subField === 'string'
        ? subField
        : subField && typeof subField === 'object' && 'id' in subField
          ? (subField as Stripe.Subscription).id
          : null;

    // If this is for a subscription, ensure the user's status is up to date
    if (subscriptionId && typeof subscriptionId === 'string') {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.clerk_user_id;

      if (userId) {
        await processSubscription(
          subscription,
          userId,
          stripeEventId,
          stripeEventTimestamp,
          'payment_succeeded'
        );
        await invalidateBillingCache();
      }
    }
  } catch (error) {
    await captureCriticalError(
      'Error handling payment success webhook',
      error,
      {
        invoiceId: invoice.id,
        route: '/api/stripe/webhooks',
        event: 'invoice.payment_succeeded',
      }
    );
  }
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  stripeEventId: string,
  stripeEventTimestamp: Date
) {
  const raw = invoice as unknown as Record<string, unknown>;
  const subField = raw['subscription'];
  const subscriptionId =
    typeof subField === 'string'
      ? subField
      : subField && typeof subField === 'object' && 'id' in subField
        ? (subField as Stripe.Subscription).id
        : null;

  // Log payment failure with safe metadata only (invoice ID is safe, no customer/subscription IDs)
  await captureCriticalError(
    'Payment failed for invoice',
    new Error('Invoice payment failed'),
    {
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      attemptCount: invoice.attempt_count,
      route: '/api/stripe/webhooks',
      event: 'invoice.payment_failed',
    }
  );

  // If subscription payment failed, fetch subscription and downgrade user
  if (subscriptionId && typeof subscriptionId === 'string') {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    let userId: string | undefined = subscription.metadata?.clerk_user_id;

    // Fallback: Look up user by Stripe customer ID
    if (!userId && typeof subscription.customer === 'string') {
      const lookedUpUserId = await getUserIdFromStripeCustomer(
        subscription.customer
      );
      userId = lookedUpUserId ?? undefined;
    }

    if (userId) {
      // Expanded payment failure handling: Handle all failure statuses
      // past_due: Payment is late but subscription is still technically active
      // unpaid: Multiple payment attempts failed
      // incomplete: Initial payment failed (new subscription)
      // incomplete_expired: Initial payment failed and grace period expired
      const failureStatuses = [
        'past_due',
        'unpaid',
        'incomplete',
        'incomplete_expired',
      ];

      if (failureStatuses.includes(subscription.status)) {
        const customerId = getCustomerId(subscription.customer);
        const result = await updateUserBillingStatus({
          clerkUserId: userId,
          isPro: false,
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: null,
          stripeEventId,
          stripeEventTimestamp,
          eventType: 'payment_failed',
          source: 'webhook',
          metadata: {
            subscriptionStatus: subscription.status,
            invoiceId: invoice.id,
            amountDue: invoice.amount_due,
            attemptCount: invoice.attempt_count,
          },
        });

        if (!result.success && !result.skipped) {
          await captureCriticalError(
            'Failed to downgrade user after payment failure',
            new Error(result.error || 'Unknown error'),
            {
              userId,
              subscriptionStatus: subscription.status,
              route: '/api/stripe/webhooks',
              event: 'invoice.payment_failed',
            }
          );
          throw new Error(`Failed to downgrade user: ${result.error}`);
        }

        await invalidateBillingCache();
      }
    }
  }
}

async function processSubscription(
  subscription: Stripe.Subscription,
  userId: string,
  stripeEventId: string,
  stripeEventTimestamp: Date,
  eventType: BillingAuditEventType
) {
  // Determine if subscription is active
  const isActive =
    subscription.status === 'active' || subscription.status === 'trialing';

  if (!isActive) {
    // Subscription is not active, downgrade user
    // Determine the appropriate event type
    const downgradeEventType: BillingAuditEventType =
      eventType === 'payment_failed'
        ? 'payment_failed'
        : 'subscription_downgraded';

    const customerId = getCustomerId(subscription.customer);
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: null,
      stripeEventId,
      stripeEventTimestamp,
      eventType: downgradeEventType,
      source: 'webhook',
      metadata: {
        subscriptionStatus: subscription.status,
      },
    });

    if (!result.success && !result.skipped) {
      await captureCriticalError(
        'Failed to downgrade inactive subscription',
        new Error(result.error || 'Unknown error'),
        {
          userId,
          subscriptionStatus: subscription.status,
          route: '/api/stripe/webhooks',
        }
      );
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }
    return;
  }

  // Get the price ID from the subscription to determine the plan
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    await captureCriticalError(
      'No price ID found in subscription',
      new Error('Missing price ID'),
      {
        userId,
        route: '/api/stripe/webhooks',
      }
    );
    throw new Error('No price ID in subscription');
  }

  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    await captureCriticalError(
      'Unknown price ID in subscription',
      new Error(`Unknown price ID: ${priceId}`),
      {
        priceId,
        userId,
        route: '/api/stripe/webhooks',
      }
    );
    throw new Error(`Unknown price ID: ${priceId}`);
  }

  // Update user's billing status
  const customerId = getCustomerId(subscription.customer);
  const result = await updateUserBillingStatus({
    clerkUserId: userId,
    isPro: true,
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscription.id,
    stripeEventId,
    stripeEventTimestamp,
    eventType,
    source: 'webhook',
    metadata: {
      plan,
      priceId,
      subscriptionStatus: subscription.status,
    },
  });

  if (!result.success && !result.skipped) {
    await captureCriticalError(
      'Failed to update user billing status',
      new Error(result.error || 'Unknown error'),
      {
        userId,
        plan,
        route: '/api/stripe/webhooks',
      }
    );
    throw new Error(`Failed to update billing status: ${result.error}`);
  }
}

// Only allow POST requests (webhooks)
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
