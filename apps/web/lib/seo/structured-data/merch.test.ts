import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/app';
import { generateMerchStructuredData } from './merch';
import { validateMerchRichResults } from './validate';

const product = {
  title: 'Tour Tee',
  description: 'Soft cotton tee.',
  imageUrl: null,
  artistName: 'Test Artist',
  handle: 'testartist',
  cardId: 'abc00000-0000-0000-0000-000000000001',
  retailPriceCents: 3599,
};

describe('merch product discovery truth', () => {
  it('does not claim stock from a published product and price alone', () => {
    const data = generateMerchStructuredData(product);

    expect(data.offers).toEqual({
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: '35.99',
      url: `${BASE_URL}/testartist/merch/${product.cardId}`,
    });
    expect(validateMerchRichResults(data)).toEqual([]);
  });

  it('uses the persisted product ID as SKU independently of creator handle', () => {
    const original = generateMerchStructuredData(product);
    const renamed = generateMerchStructuredData({
      ...product,
      handle: 'newhandle',
    });

    expect(original.sku).toBe(product.cardId);
    expect(renamed.sku).toBe(original.sku);
    expect(original.url).toBe(`${BASE_URL}/testartist/merch/${product.cardId}`);
    expect(renamed.url).toBe(`${BASE_URL}/newhandle/merch/${product.cardId}`);
  });

  it.each(['InStock', 'OutOfStock'] as const)(
    'emits an explicit %s observation without changing the product identity',
    availability => {
      const data = generateMerchStructuredData({ ...product, availability });

      expect(data.sku).toBe(product.cardId);
      expect(data.offers).toMatchObject({
        availability: `https://schema.org/${availability}`,
      });
      expect(validateMerchRichResults(data)).toEqual([]);
    }
  );

  it('keeps explicitly unknown stock unknown', () => {
    const data = generateMerchStructuredData({
      ...product,
      availability: null,
    });

    expect(data.offers).not.toHaveProperty('availability');
    expect(data.aggregateRating).toBeUndefined();
    expect(data.image).toBeUndefined();
  });

  it('preserves supplied product media and verified reviews', () => {
    const data = generateMerchStructuredData({
      ...product,
      imageUrl: 'https://example.com/tee.jpg',
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
    });

    expect(data.image).toEqual(['https://example.com/tee.jpg']);
    expect(data.aggregateRating).toMatchObject({
      ratingValue: 4.8,
      reviewCount: 12,
    });
  });

  it.each([
    { ratingValue: 4.8, reviewCount: 0 },
    { ratingValue: 0, reviewCount: 12 },
  ])('omits incomplete review evidence: %j', aggregateRating => {
    expect(
      generateMerchStructuredData({ ...product, aggregateRating })
    ).not.toHaveProperty('aggregateRating');
  });
});
