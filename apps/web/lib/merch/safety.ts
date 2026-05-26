import 'server-only';

import type {
  MerchCard,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import {
  getMerchSellability,
  type MerchSellabilityOptions,
  type MerchSellabilityResult,
} from './pricing';

type MerchCardSellabilityInput = Pick<
  MerchCard,
  | 'currency'
  | 'retailPriceCents'
  | 'estimatedPrintfulProductCostCents'
  | 'artistRoyaltyRateBps'
  | 'pricing'
  | 'primaryImageUrl'
  | 'mockupUrls'
  | 'printful'
>;

export interface MerchOrderSellabilityInput {
  readonly quantity: number;
  readonly subtotalCents: number;
  readonly printfulProductCostCents: number;
  readonly stripeFeeEstimateCents: number;
  readonly refundReserveCents: number;
  readonly artistPayoutEstimateCents: number;
  readonly jovieShareEstimateCents: number;
}

export function getPrintfulCostUpdatedAt(
  printful: MerchPrintfulSnapshot
): string | null {
  return printful.catalogCostUpdatedAt ?? null;
}

function getPrintfulCostSource(printful: MerchPrintfulSnapshot): string | null {
  return printful.catalogCostSource ?? null;
}

export function getPrintfulSnapshotBlockers(
  printful: MerchPrintfulSnapshot
): string[] {
  const reasons: string[] = [];
  if (!printful.catalogProductId) {
    reasons.push('Missing Printful catalog product.');
  }
  if (printful.catalogVariantIds.length === 0) {
    reasons.push('Missing Printful catalog variants.');
  }
  if (Object.keys(printful.variantMap).length === 0) {
    reasons.push('Missing Printful variant map.');
  }
  if (printful.placements.length === 0) {
    reasons.push('Missing Printful placements.');
  }
  if (printful.techniques.length === 0) {
    reasons.push('Missing Printful print technique.');
  }
  if (printful.printFileUrls.length === 0) {
    reasons.push('Missing print files.');
  }
  if (printful.availabilityRegion !== 'US') {
    reasons.push('Unsupported availability region.');
  }
  if (getPrintfulCostSource(printful) !== 'printful') {
    reasons.push('Printful product cost must come from Printful before sale.');
  }
  if (printful.providerWarnings?.length) {
    reasons.push(...printful.providerWarnings);
  }
  return reasons;
}

export function getMerchCardSellability(
  card: MerchCardSellabilityInput,
  options?: MerchSellabilityOptions
): MerchSellabilityResult {
  const reasons: string[] = [];
  reasons.push(...getPrintfulSnapshotBlockers(card.printful));
  if (!card.primaryImageUrl || card.mockupUrls.length === 0) {
    reasons.push('Missing mockups.');
  }
  reasons.push(
    ...getMerchSellability(
      {
        currency: card.currency,
        retailPriceCents: card.retailPriceCents,
        estimatedPrintfulProductCostCents:
          card.estimatedPrintfulProductCostCents,
        estimatedShippingCostCents: card.pricing.estimatedShippingCostCents,
        stripeFeeEstimateCents: card.pricing.stripeFeeEstimateCents,
        refundReserveCents: card.pricing.refundReserveCents,
        artistRoyaltyRateBps: card.artistRoyaltyRateBps,
        artistPayoutPerUnitEstimateCents:
          card.pricing.artistPayoutPerUnitEstimateCents,
        jovieMarginPerUnitEstimateCents:
          card.pricing.jovieMarginPerUnitEstimateCents,
      },
      {
        ...options,
        requireKnownPrintfulCost: true,
        printfulCostUpdatedAt: getPrintfulCostUpdatedAt(card.printful),
      }
    ).reasons
  );

  return { sellable: reasons.length === 0, reasons };
}

export function getMerchOrderSellability(
  order: MerchOrderSellabilityInput
): MerchSellabilityResult {
  const quantity = Math.max(1, order.quantity);
  const retailPriceCents = Math.floor(order.subtotalCents / quantity);
  const pricing: MerchPricingSnapshot = {
    currency: 'USD',
    retailPriceCents,
    estimatedPrintfulProductCostCents: Math.ceil(
      order.printfulProductCostCents / quantity
    ),
    estimatedShippingCostCents: 0,
    stripeFeeEstimateCents: Math.ceil(order.stripeFeeEstimateCents / quantity),
    refundReserveCents: Math.ceil(order.refundReserveCents / quantity),
    artistRoyaltyRateBps: 5000,
    artistPayoutPerUnitEstimateCents: Math.floor(
      order.artistPayoutEstimateCents / quantity
    ),
    jovieMarginPerUnitEstimateCents: Math.floor(
      order.jovieShareEstimateCents / quantity
    ),
  };
  return getMerchSellability(pricing);
}
