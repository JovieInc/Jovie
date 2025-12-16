/**
 * Stripe Client Configuration
 * Server-side only Stripe client initialization
 */

import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

const stripeSecretKey = env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

// Initialize Stripe client with proper configuration
export const stripe = new Stripe(stripeSecretKey, {
  // Add app info for better Stripe support
  appInfo: {
    name: 'Jovie',
    version: '1.0.0',
    url: 'https://jov.ie',
  },

  // TypeScript configuration
  typescript: true,

  // Timeout configuration
  timeout: 10000, // 10 seconds

  // Retry configuration
  maxNetworkRetries: 3,
});

function escapeStripeSearchValue(value: string): string {
  return value.replace(/'/g, "\\'");
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
    // Prefer an explicit metadata match to avoid cross-account collisions.
    const existingByUserId = await stripe.customers.search({
      query: `metadata['clerk_user_id']:'${escapeStripeSearchValue(userId)}'`,
      limit: 1,
    });

    if (existingByUserId.data.length > 0) return existingByUserId.data[0];

    // Fallback: attempt to claim a legacy customer by email only if it looks like
    // an unclaimed Jovie-created record.
    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 0) {
      const existingByEmail = await stripe.customers.search({
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
        const updated = await stripe.customers.update(customer.id, {
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
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        clerk_user_id: userId,
        created_via: 'jovie_app',
      },
    });

    return customer;
  } catch (error) {
    console.error('Error creating/retrieving Stripe customer:', error);
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
    const requestOptions: Stripe.RequestOptions | undefined = idempotencyKey
      ? { idempotencyKey }
      : undefined;
    const session = await stripe.checkout.sessions.create(
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
      console.error('Error creating checkout session:', {
        type: stripeError.type,
        message: stripeError.message,
        code: stripeError.code,
        param: stripeError.param,
        requestId: stripeError.requestId,
        statusCode: stripeError.statusCode,
      });
      throw new Error(stripeError.message);
    }

    console.error('Error creating checkout session:', error);
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
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  } catch (error) {
    console.error('Error creating billing portal session:', error);
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
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    return subscriptions.data[0] || null;
  } catch (error) {
    console.error('Error retrieving customer subscription:', error);
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
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
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
    const resp = await stripe.invoices.createPreview({
      customer: customerId,
    });
    return resp;
  } catch {
    // It's normal for there to be no upcoming invoice
    return null;
  }
}
