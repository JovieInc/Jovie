/**
 * Stripe Pricing Options API
 * Returns available pricing options for the frontend
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { stripe } from '@/lib/stripe/client';
import { getAvailablePricing, isMaxPlanEnabled } from '@/lib/stripe/config';
import { assertCheckoutPriceContract } from '@/lib/stripe/price-contract';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const revalidate = 3600;

function isMissingStripePriceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly type?: unknown;
  };
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  return (
    candidate.code === 'resource_missing' ||
    (candidate.type === 'StripeInvalidRequestError' &&
      /no such price|resource_missing/i.test(message))
  );
}

export async function GET() {
  try {
    const options = getAvailablePricing().filter(
      option => isMaxPlanEnabled() || option.plan !== 'max'
    );

    const validatedOptions = await Promise.all(
      options.map(async option => {
        try {
          await assertCheckoutPriceContract(option.priceId, id =>
            stripe.prices.retrieve(id)
          );
          return option;
        } catch (error) {
          if (!isMissingStripePriceError(error)) throw error;

          const context = {
            event: 'stripe_pricing_option_skipped',
            priceId: option.priceId,
            reason: 'price_not_found',
            route: '/api/stripe/pricing-options',
          } as const;
          logger.error('Skipping unavailable Stripe pricing option', context);
          Sentry.addBreadcrumb({
            category: 'stripe.pricing-options',
            message: 'Skipped unavailable Stripe pricing option',
            level: 'warning',
            data: context,
          });
          Sentry.captureMessage('Skipping unavailable Stripe pricing option', {
            level: 'error',
            tags: {
              event: context.event,
              priceId: context.priceId,
              route: context.route,
            },
            fingerprint: [context.event, context.priceId],
          });
          return null;
        }
      })
    );

    const pricingOptions = validatedOptions
      .filter((option): option is NonNullable<(typeof options)[number]> =>
        Boolean(option)
      )
      .map(option => ({
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
