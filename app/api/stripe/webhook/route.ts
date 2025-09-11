import { createClerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db, users } from '@/lib/db';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.clerk_user_id) {
          // Update user's plan to Pro in Clerk
          try {
            await clerkClient.users.updateUserMetadata(
              session.metadata.clerk_user_id,
              {
                publicMetadata: {
                  plan: 'pro',
                  stripe_customer_id: session.customer,
                  stripe_subscription_id: session.subscription,
                },
              }
            );

            await updateUserBillingStatus({
              clerkUserId: session.metadata.clerk_user_id,
              isPro: true,
              stripeCustomerId:
                typeof session.customer === 'string'
                  ? session.customer
                  : session.customer?.id,
              stripeSubscriptionId:
                typeof session.subscription === 'string'
                  ? session.subscription
                  : typeof session.subscription === 'object'
                    ? session.subscription?.id
                    : null,
            });

            console.log(
              `Updated user ${session.metadata.clerk_user_id} to Pro plan`
            );
          } catch (error) {
            console.error('Failed to update user metadata:', error);
          }
        }
        break;

      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;

        try {
          const [user] = await db
            .select({ clerkId: users.clerkId })
            .from(users)
            .where(eq(users.stripeSubscriptionId, subscription.id))
            .limit(1);

          if (user) {
            await updateUserBillingStatus({
              clerkUserId: user.clerkId,
              isPro: false,
              stripeCustomerId: null,
              stripeSubscriptionId: null,
            });

            await clerkClient.users.updateUserMetadata(user.clerkId, {
              publicMetadata: {
                plan: 'free',
                stripe_customer_id: null,
                stripe_subscription_id: null,
              },
            });

            console.log(`Downgraded user ${user.clerkId} to free plan`);
          } else {
            console.log(`No user found with subscription ${subscription.id}`);
          }
        } catch (error) {
          console.error('Failed to downgrade user:', error);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
