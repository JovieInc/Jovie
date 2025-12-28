/**
 * Stripe Pricing Options API
 * Returns available pricing options for the frontend
 */

import { NextResponse } from 'next/server';
import { getAvailablePricing } from '@/lib/stripe/config';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

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

    return NextResponse.json(
      {
        pricingOptions,
        options: pricingOptions,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error getting pricing options:', error);
    return NextResponse.json(
      { error: 'Failed to get pricing options' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
