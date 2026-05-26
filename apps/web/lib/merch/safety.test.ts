import { describe, expect, it } from 'vitest';
import type {
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import { buildMerchPricingSnapshot } from './pricing';
import {
  getMerchCardSellability,
  getMerchOrderSellability,
  getPrintfulCostUpdatedAt,
} from './safety';

const freshDate = new Date('2026-05-26T05:00:00.000Z');

function printfulSnapshot(
  overrides?: Partial<MerchPrintfulSnapshot>
): MerchPrintfulSnapshot {
  return {
    catalogProductId: 71,
    catalogVariantIds: [4011, 4012],
    variantMap: { S_black: 4011, M_black: 4012 },
    placements: ['front'],
    techniques: ['dtg'],
    printFileUrls: ['https://cdn.test/print.png'],
    availabilityRegion: 'US',
    shippingProfile: 'printful_standard_us',
    catalogCostSource: 'printful',
    catalogCostUpdatedAt: freshDate.toISOString(),
    ...overrides,
  };
}

function pricing(
  overrides?: Partial<MerchPricingSnapshot>
): MerchPricingSnapshot {
  return {
    ...buildMerchPricingSnapshot(),
    ...overrides,
  };
}

describe('merch safety', () => {
  it('reads provider cost freshness from Printful snapshot metadata', () => {
    expect(getPrintfulCostUpdatedAt(printfulSnapshot())).toBe(
      freshDate.toISOString()
    );
  });

  it('blocks publishing without provider-backed Printful cost', () => {
    const result = getMerchCardSellability(
      {
        currency: 'USD',
        retailPriceCents: 4500,
        estimatedPrintfulProductCostCents: 1750,
        artistRoyaltyRateBps: 5000,
        pricing: pricing(),
        primaryImageUrl: 'https://cdn.test/mockup.png',
        mockupUrls: ['https://cdn.test/mockup.png'],
        printful: printfulSnapshot({
          catalogCostSource: 'jovie_default',
          catalogCostUpdatedAt: null,
        }),
      },
      { now: freshDate }
    );

    expect(result.sellable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Printful product cost must come from Printful before sale.',
        'Printful product cost must come from a fresh provider snapshot.',
      ])
    );
  });

  it('blocks publishing when sellable economics are missing required assets', () => {
    const result = getMerchCardSellability(
      {
        currency: 'USD',
        retailPriceCents: 4500,
        estimatedPrintfulProductCostCents: 1750,
        artistRoyaltyRateBps: 5000,
        pricing: pricing(),
        primaryImageUrl: '',
        mockupUrls: [],
        printful: printfulSnapshot({ printFileUrls: [] }),
      },
      { now: freshDate }
    );

    expect(result.sellable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['Missing mockups.', 'Missing print files.'])
    );
  });

  it('accepts publish-ready cards with fresh provider economics', () => {
    const result = getMerchCardSellability(
      {
        currency: 'USD',
        retailPriceCents: 4500,
        estimatedPrintfulProductCostCents: 1750,
        artistRoyaltyRateBps: 5000,
        pricing: pricing(),
        primaryImageUrl: 'https://cdn.test/mockup.png',
        mockupUrls: ['https://cdn.test/mockup.png'],
        printful: printfulSnapshot(),
      },
      { now: freshDate }
    );

    expect(result).toEqual({ sellable: true, reasons: [] });
  });

  it('blocks fulfillment when order economics violate the card guard', () => {
    const result = getMerchOrderSellability({
      quantity: 1,
      subtotalCents: 2500,
      printfulProductCostCents: 2300,
      stripeFeeEstimateCents: 180,
      refundReserveCents: 200,
      artistPayoutEstimateCents: 0,
      jovieShareEstimateCents: 0,
    });

    expect(result.sellable).toBe(false);
    expect(result.reasons).toContain(
      'Jovie margin must be at least $5.00 per unit.'
    );
  });
});
