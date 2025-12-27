/**
 * Billing Status API
 * Returns the current user's billing information
 */

import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { withAuthAndErrorHandler } from '@/lib/api/middleware';
import { successResponse } from '@/lib/api/responses';

export const runtime = 'nodejs';

export const GET = withAuthAndErrorHandler(
  async () => {
    const billingResult = await getUserBillingInfo();

    if (!billingResult.success || !billingResult.data) {
      return successResponse({
        isPro: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
    }

    const { isPro, stripeCustomerId, stripeSubscriptionId } = billingResult.data;

    return successResponse({
      isPro,
      stripeCustomerId,
      stripeSubscriptionId,
    });
  },
  { route: '/api/billing/status', tags: { errorType: 'billing_error' } }
);
