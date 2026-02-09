/**
 * Stripe Pricing Options API
 * Returns available pricing options for the frontend
 */

import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getAvailablePricing } from '@/lib/stripe/config';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET() {
  try {
    const options = getAvailablePricing();

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
