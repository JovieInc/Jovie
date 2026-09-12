/**
 * Stripe Pricing Options API
 * Returns available pricing options for the frontend
 */

import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { getAvailablePricing, isMaxPlanEnabled } from '@/lib/stripe/config';
import { assertCheckoutPriceContract } from '@/lib/stripe/price-contract';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  try {
    const options = getAvailablePricing().filter(
      option => isMaxPlanEnabled() || option.plan !== 'max'
    );

    await Promise.all(
      options.map(option =>
        assertCheckoutPriceContract(option.priceId, id =>
          stripe.prices.retrieve(id)
        )
      )
    );

    const pricingOptions = options.map(option => ({
      priceId: option.priceId,
      amount: option.amount,
      currency: option.currency,
      interval: option.interval,
      description: option.description,
    }));

    return NextResponse.json({
      pricingOptions,
      options: pricingOptions,
    });
  } catch (error) {
    logger.error('Error getting pricing options:', error);
    await captureError('Failed to get pricing options', error, {
      route: '/api/stripe/pricing-options',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to get pricing options' },
      { status: 500 }
    );
  }
}
