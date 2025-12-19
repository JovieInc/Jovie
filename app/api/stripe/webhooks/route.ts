/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
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

    // Record the event for auditing and idempotency. If an event with the same
    // Stripe event ID already exists, we skip further processing to keep
    // handlers idempotent under Stripe retries.
    const [webhookRecord] = await db
      .insert(stripeWebhookEvents)
      .values({
        stripeEventId: event.id,
        type: event.type,
        stripeObjectId: getStripeObjectId(event),
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: stripeWebhookEvents.id });

    if (!webhookRecord) {
      // Duplicate event - skip processing (this is expected behavior)
      return NextResponse.json(
        { received: true },
        { headers: NO_STORE_HEADERS }
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
        // Unhandled event types are expected - Stripe sends many event types
        break;
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
    await processSubscription(subscription, userId);
  }

  // Revalidate dashboard to show updated billing status
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
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

  await processSubscription(subscription, userId);
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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

  await processSubscription(subscription, userId);
  revalidatePath('/app/dashboard');
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
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
  });

  if (!result.success) {
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

async function handlePaymentFailed(invoice: Stripe.Invoice) {
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
  const result = await updateUserBillingStatus({
    clerkUserId: userId,
    isPro: true,
    stripeCustomerId: subscription.customer as string,
    stripeSubscriptionId: subscription.id,
  });

  if (!result.success) {
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
