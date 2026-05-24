import 'server-only';

import type { MerchPricingSnapshot } from '@/lib/db/schema/merch';

export const MERCH_DEFAULT_CURRENCY = 'USD' as const;
export const MERCH_DEFAULT_ARTIST_ROYALTY_RATE_BPS = 5000;
export const MERCH_DEFAULT_REFUND_RESERVE_CENTS = 200;
export const MERCH_DEFAULT_SHIPPING_CENTS = 525;
export const MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS = 1750;
export const MERCH_DEFAULT_RETAIL_PRICE_CENTS = 4500;

export function formatMerchMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: MERCH_DEFAULT_CURRENCY,
  }).format(cents / 100);
}

export function estimateStripeFeeCents(amountCents: number): number {
  return Math.round(amountCents * 0.029 + 30);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function buildMerchPricingSnapshot(params?: {
  readonly retailPriceCents?: number;
  readonly printfulProductCostCents?: number;
  readonly shippingCostCents?: number;
  readonly refundReserveCents?: number;
  readonly artistRoyaltyRateBps?: number;
}): MerchPricingSnapshot {
  const retailPriceCents =
    params?.retailPriceCents ?? MERCH_DEFAULT_RETAIL_PRICE_CENTS;
  const estimatedPrintfulProductCostCents =
    params?.printfulProductCostCents ??
    MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS;
  const estimatedShippingCostCents =
    params?.shippingCostCents ?? MERCH_DEFAULT_SHIPPING_CENTS;
  const refundReserveCents =
    params?.refundReserveCents ?? MERCH_DEFAULT_REFUND_RESERVE_CENTS;
  const artistRoyaltyRateBps =
    params?.artistRoyaltyRateBps ?? MERCH_DEFAULT_ARTIST_ROYALTY_RATE_BPS;
  assertNonNegativeInteger(retailPriceCents, 'retailPriceCents');
  assertNonNegativeInteger(
    estimatedPrintfulProductCostCents,
    'printfulProductCostCents'
  );
  assertNonNegativeInteger(estimatedShippingCostCents, 'shippingCostCents');
  assertNonNegativeInteger(refundReserveCents, 'refundReserveCents');
  assertNonNegativeInteger(artistRoyaltyRateBps, 'artistRoyaltyRateBps');
  if (artistRoyaltyRateBps > 10_000) {
    throw new Error('artistRoyaltyRateBps must be between 0 and 10000');
  }
  const stripeFeeEstimateCents = estimateStripeFeeCents(
    retailPriceCents + estimatedShippingCostCents
  );
  const netProfitEstimateCents = Math.max(
    0,
    retailPriceCents -
      estimatedPrintfulProductCostCents -
      stripeFeeEstimateCents -
      refundReserveCents
  );
  const artistPayoutPerUnitEstimateCents = Math.floor(
    (netProfitEstimateCents * artistRoyaltyRateBps) / 10_000
  );
  const jovieMarginPerUnitEstimateCents =
    netProfitEstimateCents - artistPayoutPerUnitEstimateCents;

  return {
    currency: MERCH_DEFAULT_CURRENCY,
    retailPriceCents,
    estimatedPrintfulProductCostCents,
    estimatedShippingCostCents,
    stripeFeeEstimateCents,
    refundReserveCents,
    artistRoyaltyRateBps,
    artistPayoutPerUnitEstimateCents,
    jovieMarginPerUnitEstimateCents,
  };
}
