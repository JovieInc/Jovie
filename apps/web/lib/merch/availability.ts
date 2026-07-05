import 'server-only';

import type { MerchCard } from '@/lib/db/schema/merch';
import { getMerchCardSellability } from './safety';

type AvailabilityInput = Pick<
  MerchCard,
  | 'id'
  | 'status'
  | 'retailPriceCents'
  | 'currency'
  | 'estimatedPrintfulProductCostCents'
  | 'artistRoyaltyRateBps'
  | 'pricing'
  | 'primaryImageUrl'
  | 'mockupUrls'
  | 'printful'
>;

export interface MerchAvailabilityResponse {
  readonly sku: string;
  readonly inStock: boolean;
  readonly price: number;
  readonly currency: string;
  readonly checkoutUrl: string | null;
}

/**
 * Pure builder for the machine-readable availability payload.
 * Used by GET /api/merch/[sku]/availability and the Product JSON-LD schema.
 */
export function buildMerchAvailabilityResponse(
  card: AvailabilityInput,
  usernameNormalized: string,
  baseUrl: string
): MerchAvailabilityResponse {
  if (card.status !== 'live') {
    return {
      sku: card.id,
      inStock: false,
      price: card.retailPriceCents / 100,
      currency: card.currency,
      checkoutUrl: null,
    };
  }

  const { sellable } = getMerchCardSellability(card);
  const checkoutUrl = sellable
    ? `${baseUrl}/${usernameNormalized}/merch/${card.id}`
    : null;
  return {
    sku: card.id,
    inStock: sellable,
    price: card.retailPriceCents / 100,
    currency: card.currency,
    checkoutUrl,
  };
}
