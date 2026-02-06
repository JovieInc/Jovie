import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';
import {
  createBillingPortalSession,
  createCheckoutSession,
  stripe,
} from '@/lib/stripe/client';
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

  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/billing/success`;
  const cancelUrl = `${baseUrl}/billing/cancel`;

  const activeSubscriptionStatuses = new Set([
    'active',
    'trialing',
    'past_due',
    'unpaid',
  ]);

  const existingSubscriptions = await stripe.subscriptions.list({
    customer: customerResult.customerId,
    status: 'all',
    limit: 25,
  });

  const alreadySubscribedToPrice = existingSubscriptions.data.some(
    subscription =>
      activeSubscriptionStatuses.has(subscription.status) &&
      subscription.items.data.some(
        item => item.price?.id === defaultPlan.priceId
      )
  );

  if (alreadySubscribedToPrice) {
    const returnUrl = `${baseUrl}${APP_ROUTES.DASHBOARD}`;
    const portalSession = await createBillingPortalSession({
      customerId: customerResult.customerId,
      returnUrl,
    });
    if (portalSession.url) {
      redirect(portalSession.url);
    }
    redirect(APP_ROUTES.DASHBOARD);
  }

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
