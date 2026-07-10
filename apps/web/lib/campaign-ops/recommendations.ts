/**
 * Campaign recommendation engine with timing + revenue math (JOV-2208).
 *
 * Deterministic, testable expected-order/revenue path from opportunity +
 * segment size + product assumptions.
 */

import { formatAmount } from '@/lib/utils/format-number';
import type {
  CampaignOption,
  CampaignRecommendationInput,
  CampaignRecommendationResult,
  ProductAssumption,
} from './types';

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

/** Expected orders = floor(segmentSize * conversionRate), min 0. */
export function computeExpectedOrders(
  segmentSize: number,
  conversionRate: number
): number {
  if (segmentSize <= 0 || conversionRate <= 0) return 0;
  const rate = Math.min(1, Math.max(0, conversionRate));
  return Math.floor(segmentSize * rate);
}

export function computeExpectedRevenueCents(
  expectedOrders: number,
  unitPriceCents: number
): number {
  if (expectedOrders <= 0 || unitPriceCents <= 0) return 0;
  return expectedOrders * unitPriceCents;
}

export function computeExpectedMarginCents(
  expectedOrders: number,
  unitPriceCents: number,
  cogsCents: number | undefined
): number | null {
  if (cogsCents === undefined) return null;
  if (expectedOrders <= 0) return 0;
  return expectedOrders * (unitPriceCents - cogsCents);
}

function optionRankScore(input: {
  readonly expectedRevenueCents: number;
  readonly confidence: number;
  readonly conversionRate: number;
}): number {
  // Normalize revenue to a soft 0..1 against a $15k demo ceiling.
  const revenueNorm = Math.min(1, input.expectedRevenueCents / 1_500_000);
  return Number(
    (
      revenueNorm * 0.55 +
      input.confidence * 0.3 +
      Math.min(1, input.conversionRate * 10) * 0.15
    ).toFixed(4)
  );
}

function buildWhyNow(
  input: CampaignRecommendationInput,
  product: ProductAssumption
): string {
  const windowHours = input.windowHours;
  const opp = input.opportunity;
  const collab = opp.collaboratorName
    ? ` while ${opp.collaboratorName} has attention`
    : '';
  return `Run a ${windowHours}-hour ${product.label} drop${collab} (${opp.title}).`;
}

function buildAssumptions(
  input: CampaignRecommendationInput,
  product: ProductAssumption,
  expectedOrders: number
): string[] {
  return [
    `Segment "${input.segmentName}" size ${input.segmentSize}`,
    `Conversion rate ${(product.expectedConversionRate * 100).toFixed(2)}%`,
    `Unit price ${formatAmount(product.unitPriceCents)}`,
    `Expected path: ${expectedOrders} orders × ${formatAmount(product.unitPriceCents)}`,
    `Campaign window ${input.windowHours}h`,
    `Opportunity confidence ${(input.opportunity.confidence * 100).toFixed(0)}%`,
  ];
}

/**
 * Build ranked campaign options for an opportunity. One option per product.
 */
export function buildCampaignRecommendations(
  input: CampaignRecommendationInput
): CampaignRecommendationResult {
  const generatedAt = input.now ?? new Date().toISOString();
  const options: CampaignOption[] = input.products.map(product => {
    const expectedOrders = computeExpectedOrders(
      input.segmentSize,
      product.expectedConversionRate
    );
    const expectedRevenueCents = computeExpectedRevenueCents(
      expectedOrders,
      product.unitPriceCents
    );
    const expectedMarginCents = computeExpectedMarginCents(
      expectedOrders,
      product.unitPriceCents,
      product.cogsCents
    );
    // Blend opportunity confidence with product conversion realism.
    const confidence = Number(
      Math.min(
        1,
        input.opportunity.confidence * 0.7 +
          Math.min(1, product.expectedConversionRate * 8) * 0.3
      ).toFixed(4)
    );

    const title = `${input.windowHours}-hour ${product.label} Drop`;
    const id = `rec_${slugPart(input.opportunity.id)}_${slugPart(product.sku)}`;

    return {
      id,
      title,
      whyNow: buildWhyNow(input, product),
      targetAudience: input.segmentName,
      channels: input.channels,
      productSku: product.sku,
      productLabel: product.label,
      unitPriceCents: product.unitPriceCents,
      expectedOrders,
      expectedRevenueCents,
      expectedMarginCents,
      assumptions: buildAssumptions(input, product, expectedOrders),
      confidence,
      rankScore: optionRankScore({
        expectedRevenueCents,
        confidence,
        conversionRate: product.expectedConversionRate,
      }),
    };
  });

  options.sort((a, b) => b.rankScore - a.rankScore);

  return {
    opportunityId: input.opportunity.id,
    options,
    generatedAt,
  };
}

/** Founder-demo product set (tee / poster / hoodie). */
export const DEMO_PRODUCT_ASSUMPTIONS: readonly ProductAssumption[] =
  Object.freeze([
    {
      sku: 'deep-end-festival-tee',
      label: 'The Deep End Festival Tee',
      unitPriceCents: 3800,
      expectedConversionRate: 0.05,
      cogsCents: 1400,
    },
    {
      sku: 'deep-end-poster',
      label: 'The Deep End Poster',
      unitPriceCents: 2500,
      expectedConversionRate: 0.035,
      cogsCents: 600,
    },
    {
      sku: 'deep-end-hoodie',
      label: 'The Deep End Hoodie',
      unitPriceCents: 6500,
      expectedConversionRate: 0.018,
      cogsCents: 2800,
    },
  ]);
