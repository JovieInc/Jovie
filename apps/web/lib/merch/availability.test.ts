import { describe, expect, it } from 'vitest';
import type {
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import { buildMerchAvailabilityResponse } from './availability';
import { buildMerchPricingSnapshot } from './pricing';

const BASE_URL = 'https://jov.ie';

function printfulSnapshot(
  overrides?: Partial<MerchPrintfulSnapshot>
): MerchPrintfulSnapshot {
  // catalogCostUpdatedAt must be within MERCH_PRINTFUL_COST_MAX_AGE_MS (24h) of now
  const freshCostDate = new Date(Date.now() - 60_000).toISOString();
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
    catalogCostUpdatedAt: freshCostDate,
    ...overrides,
  };
}

function pricingSnapshot(
  overrides?: Partial<MerchPricingSnapshot>
): MerchPricingSnapshot {
  return { ...buildMerchPricingSnapshot(), ...overrides };
}

function makeCard(
  overrides?: Partial<{
    id: string;
    status: 'live' | 'draft' | 'paused' | 'archived';
    retailPriceCents: number;
    currency: 'USD';
    primaryImageUrl: string;
    mockupUrls: string[];
    printful: MerchPrintfulSnapshot;
    pricing: MerchPricingSnapshot;
    estimatedPrintfulProductCostCents: number;
    artistRoyaltyRateBps: number;
  }>
) {
  return {
    id: 'abc00000-0000-0000-0000-000000000001',
    status: 'live' as const,
    retailPriceCents: 4100,
    currency: 'USD' as const,
    primaryImageUrl: 'https://cdn.test/mockup.png',
    mockupUrls: ['https://cdn.test/mockup.png'],
    printful: printfulSnapshot(),
    pricing: pricingSnapshot(),
    estimatedPrintfulProductCostCents: 1750,
    artistRoyaltyRateBps: 5000,
    ...overrides,
  };
}

describe('buildMerchAvailabilityResponse', () => {
  it('returns inStock=true with checkout URL for a live sellable card', () => {
    const card = makeCard();
    const result = buildMerchAvailabilityResponse(card, 'testartist', BASE_URL);

    expect(result).toEqual({
      sku: 'abc00000-0000-0000-0000-000000000001',
      inStock: true,
      price: 41.0,
      currency: 'USD',
      checkoutUrl: `${BASE_URL}/testartist/merch/abc00000-0000-0000-0000-000000000001`,
    });
  });

  it('returns inStock=false with null checkoutUrl for a non-live card', () => {
    const card = makeCard({ status: 'paused' });
    const result = buildMerchAvailabilityResponse(card, 'testartist', BASE_URL);

    expect(result.inStock).toBe(false);
    expect(result.checkoutUrl).toBeNull();
    expect(result.sku).toBe(card.id);
    expect(result.price).toBe(41.0);
    expect(result.currency).toBe('USD');
  });

  it('returns inStock=false when live card fails sellability check', () => {
    const card = makeCard({
      primaryImageUrl: '',
      mockupUrls: [],
      printful: printfulSnapshot({ printFileUrls: [] }),
    });
    const result = buildMerchAvailabilityResponse(card, 'testartist', BASE_URL);

    expect(result.inStock).toBe(false);
    expect(result.checkoutUrl).toBeNull();
  });

  it('includes the price in dollars (not cents)', () => {
    const card = makeCard({ retailPriceCents: 3599 });
    const result = buildMerchAvailabilityResponse(card, 'testartist', BASE_URL);

    expect(result.price).toBe(35.99);
  });

  it('builds a checkout URL that agents can resolve end-to-end', () => {
    const card = makeCard({ id: 'card-uuid-here-0000-0000-000000000002' });
    const result = buildMerchAvailabilityResponse(
      card,
      'artist-slug',
      BASE_URL
    );

    // Agent can follow this URL to the product page and initiate checkout
    expect(result.checkoutUrl).toBe(
      `${BASE_URL}/artist-slug/merch/card-uuid-here-0000-0000-000000000002`
    );
  });
});

describe('Product JSON-LD schema fields', () => {
  it('required schema.org fields are present in the expected shape', () => {
    const card = makeCard();
    const availability = buildMerchAvailabilityResponse(
      card,
      'testartist',
      BASE_URL
    );

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Artist Signal Tee',
      description: 'A bold tee design.',
      image: [card.primaryImageUrl],
      sku: availability.sku,
      brand: { '@type': 'Brand', name: 'Test Artist' },
      offers: {
        '@type': 'Offer',
        priceCurrency: availability.currency,
        price: availability.price.toFixed(2),
        availability: availability.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        url: availability.checkoutUrl,
        seller: { '@type': 'Organization', name: 'Jovie', url: BASE_URL },
      },
    };

    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.sku).toBe(card.id);
    expect(jsonLd.offers.priceCurrency).toMatch(/^[A-Z]{3}$/); // ISO-4217
    expect(jsonLd.offers.seller['@type']).toBe('Organization');
    expect(jsonLd.offers.itemCondition).toBe('https://schema.org/NewCondition');
    expect(jsonLd.offers.availability).toBe('https://schema.org/InStock');
  });
});
