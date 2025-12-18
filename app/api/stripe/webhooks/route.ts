/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
 */

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { stripeWebhookEvents, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import {
  captureCriticalError,
  captureWarning,
  logFallback,
} from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { getPlanFromPriceId } from '@/lib/stripe/config';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';

// Force Node.js runtime for Stripe SDK compatibility
export const runtime = 'nodejs';

const webhookSecret = env.STRIPE_WEBHOOK_SECRET!;

let stripeWebhookEventsTableUnavailable = false;

const RECENT_EVENT_TTL_MS = 10 * 60 * 1000;
const recentWebhookEventIds = new Map<string, number>();

function getPostgresErrorCode(error: unknown): string | undefined {
  const maybe = error as { code?: string; cause?: { code?: string } } | null;
  return maybe?.code ?? maybe?.cause?.code;
}

function isMissingStripeWebhookEventsTable(error: unknown): boolean {
  const code = getPostgresErrorCode(error);
  if (!code) return false;
  if (code !== '42P01' && code !== '42703') return false;

  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? '');

  return message.toLowerCase().includes('stripe_webhook_events');
}

function wasProcessedRecently(eventId: string): boolean {
  const now = Date.now();
  const last = recentWebhookEventIds.get(eventId);
  if (typeof last === 'number' && now - last < RECENT_EVENT_TTL_MS) {
    return true;
  }
  return false;
}

function markProcessed(eventId: string): void {
  const now = Date.now();
  recentWebhookEventIds.set(eventId, now);

  if (recentWebhookEventIds.size > 2000) {
    for (const [key, timestamp] of recentWebhookEventIds) {
      if (now - timestamp > RECENT_EVENT_TTL_MS) {
        recentWebhookEventIds.delete(key);
      }
      if (recentWebhookEventIds.size <= 1500) break;
    }
  }
}

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
        stripeCustomerId,
        function: 'getUserIdFromStripeCustomer',
      }
    );
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      console.error('Missing Stripe signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      console.error('Invalid webhook signature:', error);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.log('Received webhook event:', {
      type: event.type,
      id: event.id,
    });

    if (stripeWebhookEventsTableUnavailable && wasProcessedRecently(event.id)) {
      return NextResponse.json(
        { received: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Record the event for auditing and idempotency. If an event with the same
    // Stripe event ID already exists, we skip further processing to keep
    // handlers idempotent under Stripe retries.
    const webhookRecord = await (async (): Promise<{ id: string } | null> => {
      if (stripeWebhookEventsTableUnavailable) {
        return { id: 'unavailable' };
      }

      try {
        const [row] = await db
          .insert(stripeWebhookEvents)
          .values({
            stripeEventId: event.id,
            type: event.type,
            stripeObjectId: getStripeObjectId(event),
            payload: event as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ id: stripeWebhookEvents.id });
        return row ?? null;
      } catch (error) {
        if (isMissingStripeWebhookEventsTable(error)) {
          stripeWebhookEventsTableUnavailable = true;
          await captureWarning(
            'Stripe webhook events table unavailable; proceeding without audit log',
            error,
            {
              eventId: event.id,
              type: event.type,
              route: '/api/stripe/webhooks',
            }
          );
          return { id: 'unavailable' };
        }

        throw error;
      }
    })();

    if (!webhookRecord) {
      console.log('Duplicate Stripe webhook event, skipping processing', {
        eventId: event.id,
        type: event.type,
      });
      return NextResponse.json(
        { received: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log('Unhandled webhook event type:', event.type);
        break;
    }

    if (stripeWebhookEventsTableUnavailable) {
      markProcessed(event.id);
    }

    return NextResponse.json(
      { received: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completion:', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
  });

  let userId = session.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof session.customer === 'string') {
    await logFallback('No user ID in checkout session metadata', {
      sessionId: session.id,
      customerId: session.customer,
      event: 'checkout.session.completed',
    });
    userId = (await getUserIdFromStripeCustomer(session.customer)) ?? undefined;
  }

  if (!userId) {
    await captureCriticalError(
      'Cannot identify user for checkout session',
      new Error('Missing user ID in checkout session'),
      {
        sessionId: session.id,
        customerId: session.customer,
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
    await processSubscription(subscription, userId);
  }

  // Revalidate dashboard to show updated billing status
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing subscription creation:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    console.warn(
      '[FALLBACK] No user ID in metadata, looking up by customer ID',
      {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      }
    );
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    console.error('[CRITICAL] Cannot identify user for subscription', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
    });
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(subscription, userId);
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing subscription update:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    console.warn(
      '[FALLBACK] No user ID in metadata, looking up by customer ID',
      {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      }
    );
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    console.error('[CRITICAL] Cannot identify user for subscription', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
    });
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(subscription, userId);
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription deletion:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  let userId: string | undefined = subscription.metadata?.clerk_user_id;

  // Fallback: Look up user by Stripe customer ID if metadata is missing
  if (!userId && typeof subscription.customer === 'string') {
    console.warn(
      '[FALLBACK] No user ID in metadata, looking up by customer ID',
      {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
      }
    );
    userId =
      (await getUserIdFromStripeCustomer(subscription.customer)) ?? undefined;
  }

  if (!userId) {
    console.error('[CRITICAL] Cannot identify user for subscription', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
    });
    throw new Error('Missing user ID in subscription');
  }

  // User is no longer pro
  const result = await updateUserBillingStatus({
    clerkUserId: userId,
    isPro: false,
    stripeSubscriptionId: null,
  });

  if (!result.success) {
    console.error('[CRITICAL] Failed to downgrade user:', {
      userId,
      error: result.error,
    });
    throw new Error(`Failed to downgrade user: ${result.error}`);
  }

  console.log('User downgraded to free plan:', { userId });
  revalidatePath('/app/dashboard');
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    const raw = invoice as unknown as Record<string, unknown>;
    const subField = raw['subscription'];
    const subscriptionId =
      typeof subField === 'string'
        ? subField
        : subField && typeof subField === 'object' && 'id' in subField
          ? (subField as Stripe.Subscription).id
          : null;

    console.log('Processing successful payment:', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId,
    });

    // If this is for a subscription, ensure the user's status is up to date
    if (subscriptionId && typeof subscriptionId === 'string') {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.clerk_user_id;

      if (userId) {
        await processSubscription(subscription, userId);
        revalidatePath('/app/dashboard');
      }
    }
  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as Record<string, unknown>;
  const subField = raw['subscription'];
  const subscriptionId =
    typeof subField === 'string'
      ? subField
      : subField && typeof subField === 'object' && 'id' in subField
        ? (subField as Stripe.Subscription).id
        : null;

  console.error('[PAYMENT_FAILED] Payment failed for invoice:', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    subscriptionId,
    amountDue: invoice.amount_due,
    attemptCount: invoice.attempt_count,
  });

  // If subscription payment failed, fetch subscription and downgrade user
  if (subscriptionId && typeof subscriptionId === 'string') {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata?.clerk_user_id;

    if (userId) {
      // Check if subscription status changed to past_due or unpaid
      if (
        subscription.status === 'past_due' ||
        subscription.status === 'unpaid'
      ) {
        const result = await updateUserBillingStatus({
          clerkUserId: userId,
          isPro: false,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: null,
        });

        if (!result.success) {
          console.error(
            '[CRITICAL] Failed to downgrade user after payment failure:',
            {
              userId,
              error: result.error,
            }
          );
          throw new Error(`Failed to downgrade user: ${result.error}`);
        }

        console.log('User downgraded after payment failure:', {
          userId,
          subscriptionStatus: subscription.status,
        });
      }
    }
  }
}

async function processSubscription(
  subscription: Stripe.Subscription,
  userId: string
) {
  // Determine if subscription is active
  const isActive =
    subscription.status === 'active' || subscription.status === 'trialing';

  if (!isActive) {
    // Subscription is not active, downgrade user
    const result = await updateUserBillingStatus({
      clerkUserId: userId,
      isPro: false,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: null,
    });

    if (!result.success) {
      console.error('[CRITICAL] Failed to downgrade inactive subscription:', {
        userId,
        status: subscription.status,
        error: result.error,
      });
      throw new Error(`Failed to downgrade user: ${result.error}`);
    }

    console.log('User subscription inactive, downgraded:', {
      userId,
      status: subscription.status,
    });
    return;
  }

  // Get the price ID from the subscription to determine the plan
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    console.error('[CRITICAL] No price ID found in subscription:', {
      subscriptionId: subscription.id,
      userId,
    });
    throw new Error('No price ID in subscription');
  }

  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    console.error('[CRITICAL] Unknown price ID:', {
      priceId,
      subscriptionId: subscription.id,
      userId,
    });
    throw new Error(`Unknown price ID: ${priceId}`);
  }

  // Update user's billing status
  const result = await updateUserBillingStatus({
    clerkUserId: userId,
    isPro: true,
    stripeCustomerId: subscription.customer as string,
    stripeSubscriptionId: subscription.id,
  });

  if (!result.success) {
    console.error('[CRITICAL] Failed to update user billing status:', {
      userId,
      error: result.error,
    });
    throw new Error(`Failed to update billing status: ${result.error}`);
  }

  console.log('User billing status updated:', {
    userId,
    plan,
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

// Only allow POST requests (webhooks)
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
