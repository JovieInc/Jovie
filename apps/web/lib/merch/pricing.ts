import 'server-only';

import type { MerchPricingSnapshot } from '@/lib/db/schema/merch';

export const MERCH_DEFAULT_CURRENCY = 'USD' as const;
export const MERCH_DEFAULT_ARTIST_ROYALTY_RATE_BPS = 5000;
export const MERCH_DEFAULT_REFUND_RESERVE_CENTS = 200;
export const MERCH_DEFAULT_SHIPPING_CENTS = 525;
export const MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS = 1750;
export const MERCH_DEFAULT_RETAIL_PRICE_CENTS = 4500;
export const MERCH_MIN_JOVIE_MARGIN_CENTS = 500;
export const MERCH_MIN_JOVIE_MARGIN_RATE_BPS = 1000;
export const MERCH_TARGET_JOVIE_MARGIN_CENTS = 800;
export const MERCH_TARGET_JOVIE_MARGIN_RATE_BPS = 1500;
export const MERCH_PRINTFUL_COST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface MerchEconomicsInput {
  readonly currency?: string;
  readonly retailPriceCents: number;
  readonly estimatedPrintfulProductCostCents: number;
  readonly estimatedShippingCostCents?: number;
  readonly stripeFeeEstimateCents: number;
  readonly refundReserveCents: number;
  readonly artistRoyaltyRateBps: number;
  readonly artistPayoutPerUnitEstimateCents: number;
  readonly jovieMarginPerUnitEstimateCents: number;
}

export type MerchEconomicsSnapshot = MerchPricingSnapshot;

export interface MerchSellabilityResult {
  readonly sellable: boolean;
  readonly reasons: string[];
}

export interface MerchSellabilityOptions {
  readonly requireKnownPrintfulCost?: boolean;
  readonly printfulCostUpdatedAt?: Date | string | null;
  readonly now?: Date;
  readonly maxPrintfulCostAgeMs?: number;
}

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

function formatFloorAmount(cents: number): string {
  return formatMerchMoney(cents);
}

export function getJovieMarginFloorCents(retailPriceCents: number): number {
  const rateFloor = Math.ceil(
    (retailPriceCents * MERCH_MIN_JOVIE_MARGIN_RATE_BPS) / 10_000
  );
  return Math.max(MERCH_MIN_JOVIE_MARGIN_CENTS, rateFloor);
}

export function getJovieTargetMarginCents(retailPriceCents: number): number {
  const rateTarget = Math.ceil(
    (retailPriceCents * MERCH_TARGET_JOVIE_MARGIN_RATE_BPS) / 10_000
  );
  return Math.max(MERCH_TARGET_JOVIE_MARGIN_CENTS, rateTarget);
}

function parseFreshnessDate(value: Date | string | null | undefined): number {
  if (!value) return Number.NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

export function getMerchSellability(
  economics: MerchEconomicsInput,
  options?: MerchSellabilityOptions
): MerchSellabilityResult {
  const reasons: string[] = [];
  const cost = economics.estimatedPrintfulProductCostCents;
  const retail = economics.retailPriceCents;

  if (economics.currency && economics.currency !== MERCH_DEFAULT_CURRENCY) {
    reasons.push('Merch currency must be USD.');
  }
  if (!Number.isInteger(retail) || retail <= 0) {
    reasons.push('Retail price must be greater than zero.');
  }
  if (!Number.isInteger(cost) || cost < 0) {
    reasons.push('Printful product cost must be a non-negative integer.');
  }
  if (options?.requireKnownPrintfulCost && cost <= 0) {
    reasons.push('Printful product cost must be known before sale.');
  }
  if (cost > 0 && retail <= cost) {
    reasons.push('Retail price must be greater than Printful product cost.');
  }
  if (
    economics.artistRoyaltyRateBps < 0 ||
    economics.artistRoyaltyRateBps > 10_000
  ) {
    reasons.push('Artist royalty rate must be between 0 and 10000.');
  }
  if (economics.artistPayoutPerUnitEstimateCents <= 0) {
    reasons.push('Artist payout must be positive before sale.');
  }

  const marginFloor = getJovieMarginFloorCents(Math.max(0, retail));
  if (economics.jovieMarginPerUnitEstimateCents < marginFloor) {
    reasons.push(
      `Jovie margin must be at least ${formatFloorAmount(marginFloor)} per unit.`
    );
  }

  if (options?.requireKnownPrintfulCost) {
    const now = options.now ?? new Date();
    const maxAgeMs =
      options.maxPrintfulCostAgeMs ?? MERCH_PRINTFUL_COST_MAX_AGE_MS;
    const updatedAt = parseFreshnessDate(options.printfulCostUpdatedAt);
    if (
      !Number.isFinite(updatedAt) ||
      updatedAt > now.getTime() ||
      now.getTime() - updatedAt > maxAgeMs
    ) {
      reasons.push(
        'Printful product cost must come from a fresh provider snapshot.'
      );
    }
  }

  return {
    sellable: reasons.length === 0,
    reasons,
  };
}

export function assertSellableMerchEconomics(
  economics: MerchEconomicsInput,
  options?: MerchSellabilityOptions
): void {
  const result = getMerchSellability(economics, options);
  if (!result.sellable) {
    throw new Error(`Merch item is not sellable: ${result.reasons.join(' ')}`);
  }
}

export function buildMerchPricingSnapshot(params?: {
  readonly retailPriceCents?: number;
  readonly printfulProductCostCents?: number;
  readonly shippingCostCents?: number;
  readonly refundReserveCents?: number;
  readonly artistRoyaltyRateBps?: number;
  readonly printfulCostSource?: MerchPricingSnapshot['printfulCostSource'];
  readonly printfulCostUpdatedAt?: string | null;
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
    printfulCostSource: params?.printfulCostSource ?? 'jovie_default',
    printfulCostUpdatedAt: params?.printfulCostUpdatedAt ?? null,
    minimumJovieMarginCents: getJovieMarginFloorCents(retailPriceCents),
    targetJovieMarginCents: getJovieTargetMarginCents(retailPriceCents),
  };
}
