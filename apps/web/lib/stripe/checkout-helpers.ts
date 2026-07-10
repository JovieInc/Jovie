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
  /**
   * true when the active subscription is for a DIFFERENT plan than the one
   * being checked out (i.e. an upgrade/downgrade that must go through the
   * billing portal, not a brand-new second subscription).
   */
  planChangeRequired: boolean;
  portalSession: { id: string; url: string | null };
}

type SubscriptionCheckResult =
  | ExistingSubscriptionResult
  | AlreadySubscribedResult;

/**
 * Guard against creating a second subscription for a customer who already has
 * an active one.
 *
 * Stripe checkout always creates a NEW subscription — it never mutates an
 * existing one. So if a customer with an active Pro subscription completes a
 * Max checkout, they end up billed for BOTH plans. Plan changes must go
 * through the billing portal (or plan-change flow) instead.
 *
 * Returns a portal session whenever ANY active subscription exists:
 * - same plan  → `planChangeRequired: false` (manage current plan)
 * - other plan → `planChangeRequired: true`  (upgrade/downgrade via portal)
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

  const activeSubscriptions = existingSubscriptions.data.filter(subscription =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
  );

  if (activeSubscriptions.length === 0) {
    return { alreadySubscribed: false };
  }

  // Any active subscription blocks a new checkout. Distinguish same-plan
  // (manage) from cross-plan (upgrade/downgrade) purely for UI messaging —
  // both route to the portal so no duplicate subscription is ever created.
  const hasSamePlanSubscription = activeSubscriptions.some(subscription =>
    hasMatchingPriceItem(subscription.items.data, planPriceIds)
  );

  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const returnUrl = `${baseUrl}/app/dashboard`;
  const portalSession = await createBillingPortalSession({
    customerId,
    returnUrl,
  });

  return {
    alreadySubscribed: true,
    planChangeRequired: !hasSamePlanSubscription,
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
