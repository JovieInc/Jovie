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
  /** Current stock observation; publication or price alone is not evidence. */
  readonly availability?: 'InStock' | 'OutOfStock' | null;
  readonly aggregateRating?: MerchAggregateRatingInput | null;
}

/**
 * Generate Product JSON-LD for merch pages.
 * Availability and AggregateRating are included only when supplied by their
 * evidence-owning callers. Unknown stock is omitted rather than invented.
 */
export function generateMerchStructuredData(
  input: MerchStructuredDataInput
): Record<string, unknown> {
  const productUrl = `${BASE_URL}/${input.handle}/merch/${input.cardId}`;

  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku: input.cardId,
    url: productUrl,
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
      ...(input.availability
        ? { availability: `https://schema.org/${input.availability}` }
        : {}),
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
