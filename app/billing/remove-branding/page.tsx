import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
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

  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/billing/success`;
  const cancelUrl = `${baseUrl}/billing/cancel`;

  const session = await createCheckoutSession({
    customerId: customerResult.customerId,
    priceId: defaultPlan.priceId,
    userId,
    successUrl,
    cancelUrl,
  });

  if (!session.url) {
    redirect('/pricing');
  }

  redirect(session.url);
}
