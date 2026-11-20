import 'server-only';

import type {
  MerchCard,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import { getMerchContentReviewBlockers } from './content-contract';
import {
  MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER,
  MERCH_MOCKUP_PENDING_PUBLISH_BLOCKER,
  readOptionMockupStatus,
} from './generation-contract';
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
> & {
  readonly qualityReview?: Record<string, unknown> | null;
};

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
    ...getMerchContentReviewBlockers(card.qualityReview),
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

/**
 * Publish eligibility for the truthful-mockup lifecycle (JOV-4743): a card may
 * only go live once its real Printful mockup is attached (`mockup_ready`).
 * `pending_mockup` and `mockup_failed` cannot go live. Options generated
 * before the mockup-status contract carry no stamp and keep their historical
 * (publishable) behavior — a documented legacy carve-out so existing rows
 * never deadlock.
 */
export function getMerchMockupPublishBlocker(
  qualityReview: Record<string, unknown> | null | undefined
): string | null {
  const status = readOptionMockupStatus(qualityReview);
  if (status === 'pending_mockup') {
    return MERCH_MOCKUP_PENDING_PUBLISH_BLOCKER;
  }
  if (status === 'mockup_failed') {
    return MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER;
  }
  return null;
}

export function isMerchMockupPublishable(
  qualityReview: Record<string, unknown> | null | undefined
): boolean {
  return getMerchMockupPublishBlocker(qualityReview) === null;
}

/**
 * The full publish gate for a merch card: checkout sellability plus the
 * selected option's truthful-mockup lifecycle. Every publication entry point
 * (select-with-publish, publishMerchCard, update-to-live, status → live)
 * must go through this so a `pending_mockup` or `mockup_failed` option can
 * never reach `live`.
 */
export function getMerchCardPublishBlockers(
  card: MerchCardSellabilityInput,
  qualityReview?: Record<string, unknown> | null
): string[] {
  const reasons = getMerchCardSellability({
    ...card,
    qualityReview: qualityReview ?? undefined,
  }).reasons;
  const mockupBlocker = getMerchMockupPublishBlocker(qualityReview);
  return mockupBlocker && !reasons.includes(mockupBlocker)
    ? [...reasons, mockupBlocker]
    : reasons;
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

export function assertMerchCardCheckoutSellable(card: MerchCard): void {
  const result = getMerchCardSellability(card);
  if (!result.sellable) {
    throw new Error(`Merch item is not sellable: ${result.reasons.join(' ')}`);
  }
}

export function assertMerchOrderSellable(
  order: MerchOrderSellabilityInput
): void {
  const result = getMerchOrderSellability(order);
  if (!result.sellable) {
    throw new Error(`Merch order is not sellable: ${result.reasons.join(' ')}`);
  }
}
