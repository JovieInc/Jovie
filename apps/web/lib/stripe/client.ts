/**
 * Stripe Client Configuration
 * Server-side only Stripe client initialization
 */

import 'server-only';
import Stripe from 'stripe';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

let stripeSingleton: Stripe | undefined;

function getStripe(): Stripe {
  if (stripeSingleton) {
    return stripeSingleton;
  }

  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  // Stripe constructor is synchronous - no race condition possible
  // JavaScript is single-threaded, so concurrent calls cannot interleave
  // Worst case: two instances created momentarily, one gets garbage collected
  stripeSingleton = new Stripe(stripeSecretKey, {
    appInfo: {
      name: 'Jovie',
      version: '1.0.0',
      url: publicEnv.NEXT_PUBLIC_PROFILE_URL,
    },
    typescript: true,
    timeout: 10000,
    maxNetworkRetries: 3,
  });

  return stripeSingleton;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: keyof Stripe) {
    return getStripe()[prop];
  },
});

function escapeStripeSearchValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

/**
 * Get or create a Stripe customer for a user
 * Idempotent operation - safe to call multiple times
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<Stripe.Customer> {
  try {
    const stripeClient = getStripe();
    // Prefer an explicit metadata match to avoid cross-account collisions.
    const existingByUserId = await stripeClient.customers.search({
      query: `metadata['clerk_user_id']:'${escapeStripeSearchValue(userId)}'`,
      limit: 1,
    });

    if (existingByUserId.data.length > 0) return existingByUserId.data[0];

    // Fallback: attempt to claim a legacy customer by email only if it looks like
    // an unclaimed Jovie-created record.
    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 0) {
      const existingByEmail = await stripeClient.customers.search({
        query: `email:'${escapeStripeSearchValue(trimmedEmail)}'`,
        limit: 5,
      });

      const unclaimed = existingByEmail.data.filter(customer => {
        const clerkUserId = customer.metadata?.clerk_user_id;
        if (typeof clerkUserId === 'string' && clerkUserId.length > 0) {
          return false;
        }
        const createdVia = customer.metadata?.created_via;
        return createdVia === 'jovie_app';
      });

      if (unclaimed.length === 1) {
        const customer = unclaimed[0];
        const updated = await stripeClient.customers.update(customer.id, {
          metadata: {
            ...customer.metadata,
            clerk_user_id: userId,
            created_via: 'jovie_app',
          },
        });
        return updated;
      }
    }

    // If no customer found, create a new one
    const customer = await stripeClient.customers.create({
      email,
      name,
      metadata: {
        clerk_user_id: userId,
        created_via: 'jovie_app',
      },
    });

    return customer;
  } catch (error) {
    captureError('Error creating/retrieving Stripe customer', error, {
      userId,
      email,
    });
    throw new Error('Failed to create or retrieve customer');
  }
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession({
  customerId,
  priceId,
  userId,
  successUrl,
  cancelUrl,
  idempotencyKey,
}: {
  customerId: string;
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}): Promise<Stripe.Checkout.Session> {
  try {
    const stripeClient = getStripe();
    const requestOptions: Stripe.RequestOptions | undefined = idempotencyKey
      ? { idempotencyKey }
      : undefined;
    const session = await stripeClient.checkout.sessions.create(
      {
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,

        // Add metadata for tracking
        metadata: {
          clerk_user_id: userId,
        },

        // Subscription settings
        subscription_data: {
          metadata: {
            clerk_user_id: userId,
          },
        },

        // Billing settings
        allow_promotion_codes: true,
        automatic_tax: {
          enabled: false,
        },

        // Customer settings
        customer_update: {
          name: 'auto',
          address: 'auto',
        },
      },
      requestOptions
    );

    return session;
  } catch (error) {
    const stripeError = error as {
      type?: string;
      message?: string;
      code?: string;
      param?: string;
      requestId?: string;
      statusCode?: number;
    };

    if (stripeError && typeof stripeError === 'object' && stripeError.message) {
      captureError('Error creating checkout session', error, {
        type: stripeError.type,
        message: stripeError.message,
        code: stripeError.code,
        param: stripeError.param,
        requestId: stripeError.requestId,
        statusCode: stripeError.statusCode,
        customerId,
        priceId,
        userId,
      });
      throw new Error(stripeError.message);
    }

    captureError('Error creating checkout session', error, {
      customerId,
      priceId,
      userId,
    });
    throw new Error('Failed to create checkout session');
  }
}

/**
 * Create a billing portal session for customer management
 */
export async function createBillingPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  } catch (error) {
    captureError('Error creating billing portal session', error, {
      customerId,
    });
    throw new Error('Failed to create billing portal session');
  }
}

/**
 * Get subscription details for a customer
 */
export async function getCustomerSubscription(
  customerId: string
): Promise<Stripe.Subscription | null> {
  try {
    const subscriptions = await getStripe().subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    return subscriptions.data[0] || null;
  } catch (error) {
    captureError('Error retrieving customer subscription', error, {
      customerId,
    });
    return null;
  }
}

/**
 * Cancel a subscription immediately
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  try {
    const subscription = await getStripe().subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    captureError('Error canceling subscription', error, { subscriptionId });
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Get upcoming invoice for a subscription
 */
export async function getUpcomingInvoice(
  customerId: string
): Promise<Stripe.Invoice | null> {
  try {
    // Use createPreview to fetch an upcoming invoice preview in this SDK version
    const resp = await getStripe().invoices.createPreview({
      customer: customerId,
    });
    return resp;
  } catch (error) {
    captureError('Error retrieving upcoming invoice', error, { customerId });
    return null;
  }
}
