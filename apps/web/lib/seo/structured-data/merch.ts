import { BASE_URL } from '@/constants/app';

export interface MerchAggregateRatingInput {
  readonly ratingValue: number;
  readonly reviewCount: number;
}

export interface MerchStructuredDataInput {
  readonly title: string;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly artistName: string;
  readonly handle: string;
  readonly cardId: string;
  readonly retailPriceCents: number;
  readonly aggregateRating?: MerchAggregateRatingInput | null;
}

/**
 * Generate Product JSON-LD for merch pages.
 * AggregateRating is included only when verified review data is supplied.
 */
export function generateMerchStructuredData(
  input: MerchStructuredDataInput
): Record<string, unknown> {
  const productUrl = `${BASE_URL}/${input.handle}/merch/${input.cardId}`;

  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.title,
    description: input.description,
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    brand: {
      '@type': 'Brand',
      name: input.artistName,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: (input.retailPriceCents / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      url: productUrl,
    },
  };

  if (
    input.aggregateRating &&
    input.aggregateRating.reviewCount > 0 &&
    input.aggregateRating.ratingValue > 0
  ) {
    product.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.aggregateRating.ratingValue,
      reviewCount: input.aggregateRating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return product;
}
