/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import { stripe } from '@/lib/stripe/client';
import { getPlanFromPriceId } from '@/lib/stripe/config';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';

// Force Node.js runtime for Stripe SDK compatibility
export const runtime = 'nodejs';

const webhookSecret = env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      console.error('Missing Stripe signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      console.error('Invalid webhook signature:', error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('Received webhook event:', {
      type: event.type,
      id: event.id,
    });

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

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completion:', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
  });

  const userId = session.metadata?.clerk_user_id;
  if (!userId) {
    console.error('[CRITICAL] No user ID in checkout session metadata', {
      sessionId: session.id,
    });
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
  revalidatePath('/dashboard');
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing subscription creation:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  const userId = subscription.metadata?.clerk_user_id;
  if (!userId) {
    console.error('[CRITICAL] No user ID in subscription metadata', {
      subscriptionId: subscription.id,
    });
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(subscription, userId);
  revalidatePath('/dashboard');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing subscription update:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  const userId = subscription.metadata?.clerk_user_id;
  if (!userId) {
    console.error('[CRITICAL] No user ID in subscription metadata', {
      subscriptionId: subscription.id,
    });
    throw new Error('Missing user ID in subscription');
  }

  await processSubscription(subscription, userId);
  revalidatePath('/dashboard');
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription deletion:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  const userId = subscription.metadata?.clerk_user_id;
  if (!userId) {
    console.error('[CRITICAL] No user ID in subscription metadata', {
      subscriptionId: subscription.id,
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
  revalidatePath('/dashboard');
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
        revalidatePath('/dashboard');
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
