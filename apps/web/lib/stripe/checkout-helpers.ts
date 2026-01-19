/**
 * Checkout Session Helpers
 *
 * Pure helper functions for Stripe checkout session creation.
 */

import type Stripe from 'stripe';
import { publicEnv } from '@/lib/env-public';
import { createBillingPortalSession, stripe } from './client';
import { PRICE_MAPPINGS } from './config';

/**
 * Active subscription statuses that indicate an existing subscription.
 */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
]);

interface ExistingSubscriptionResult {
  alreadySubscribed: false;
}

interface AlreadySubscribedResult {
  alreadySubscribed: true;
  portalSession: { id: string; url: string | null };
}

type SubscriptionCheckResult =
  | ExistingSubscriptionResult
  | AlreadySubscribedResult;

/**
 * Check if customer already has an active subscription to the same plan.
 * If so, returns a billing portal session for managing the subscription.
 */
export async function checkExistingPlanSubscription(
  customerId: string,
  plan: string
): Promise<SubscriptionCheckResult> {
  const planPriceIds = Object.values(PRICE_MAPPINGS)
    .filter(mapping => mapping.plan === plan)
    .map(mapping => mapping.priceId);

  const existingSubscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 25,
  });

  const alreadySubscribed = existingSubscriptions.data.some(
    subscription =>
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
      hasMatchingPriceItem(subscription.items.data, planPriceIds)
  );

  if (!alreadySubscribed) {
    return { alreadySubscribed: false };
  }

  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const returnUrl = `${baseUrl}/app/dashboard`;
  const portalSession = await createBillingPortalSession({
    customerId,
    returnUrl,
  });

  return {
    alreadySubscribed: true,
    portalSession: { id: portalSession.id, url: portalSession.url },
  };
}

/**
 * Check if any subscription item has a price matching the plan.
 */
function hasMatchingPriceItem(
  items: Stripe.SubscriptionItem[],
  planPriceIds: string[]
): boolean {
  return items.some(item => {
    const itemPriceId = item.price?.id;
    return (
      typeof itemPriceId === 'string' && planPriceIds.includes(itemPriceId)
    );
  });
}

/**
 * Error type lookup map for checkout errors.
 */
const ERROR_TYPE_MAP: Record<string, { message: string; status: number }> = {
  customer: { message: 'Customer setup failed', status: 500 },
  price: { message: 'Invalid pricing configuration', status: 400 },
};

/**
 * Get appropriate error response based on error message content.
 */
export function getCheckoutErrorResponse(error: Error): {
  message: string;
  status: number;
} | null {
  for (const [keyword, response] of Object.entries(ERROR_TYPE_MAP)) {
    if (error.message.includes(keyword)) {
      return response;
    }
  }
  return null;
}
