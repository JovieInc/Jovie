import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';
import { checkExistingPlanSubscription } from '@/lib/stripe/checkout-helpers';
import { createCheckoutSession } from '@/lib/stripe/client';
import { getAvailablePricing } from '@/lib/stripe/config';
import { ensureStripeCustomer } from '@/lib/stripe/customer-sync';

export const runtime = 'nodejs';

export default async function RemoveBrandingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/signup');
  }

  const pricingOptions = getAvailablePricing();

  if (!pricingOptions || pricingOptions.length === 0) {
    redirect('/pricing');
  }

  const defaultPlan =
    pricingOptions.find(option => option.interval === 'month') ||
    pricingOptions[0];

  if (!defaultPlan?.priceId) {
    redirect('/pricing');
  }

  const customerResult = await ensureStripeCustomer();

  if (!customerResult.success || !customerResult.customerId) {
    redirect('/pricing');
  }

  // Check if already subscribed — redirect to portal instead of creating new checkout
  const subscriptionCheck = await checkExistingPlanSubscription(
    customerResult.customerId,
    'pro'
  );

  if (subscriptionCheck.alreadySubscribed) {
    if (subscriptionCheck.portalSession.url) {
      redirect(subscriptionCheck.portalSession.url);
    }
    redirect(APP_ROUTES.DASHBOARD);
  }

  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/billing/success`;
  const cancelUrl = `${baseUrl}/billing/cancel`;

  const idempotencyBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const idempotencyKey = `checkout:${userId}:${defaultPlan.priceId}:${idempotencyBucket}`;

  const session = await createCheckoutSession({
    customerId: customerResult.customerId,
    priceId: defaultPlan.priceId,
    userId,
    successUrl,
    cancelUrl,
    idempotencyKey,
  });

  if (!session.url) {
    redirect('/pricing');
  }

  redirect(session.url);
}
