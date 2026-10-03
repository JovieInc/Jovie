import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { PRODUCT_COPY } from '@/data/productCopy';

vi.mock('@/app/(marketing)/product/ProductLanding', () => ({
  ProductLanding: () => <main data-testid='product-landing' />,
}));

vi.mock('@/components/organisms/PricingRecipeBody', () => ({
  PricingRecipeBody: ({ structuredData }: { structuredData?: ReactNode }) => (
    <>{structuredData}</>
  ),
}));
vi.mock('@/components/features/pricing/MarketingPricingPlans', () => ({
  MarketingPricingPlans: () => null,
}));
vi.mock('@/features/pricing/PricingComparisonChart', () => ({
  PricingComparisonChart: () => null,
}));

describe('seo:certify metadata fixes (JOV-7249)', () => {
  it('/product emits SoftwareApplication JSON-LD beside the landing', async () => {
    const { default: ProductPage } = await import(
      '@/app/(marketing)/product/page'
    );
    const { container, getByTestId } = render(<ProductPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const schema = JSON.parse(script?.textContent ?? '{}');

    expect(getByTestId('product-landing')).toBeInTheDocument();
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.description).toBe(PRODUCT_COPY.seo.description);
  });

  it('/pricing keeps the nested WebPage > ItemList > Product > Offer graph with absolute Offer URLs (JOV-7259)', {
    timeout: 20000,
  }, async () => {
    const { default: PricingPage } = await import(
      '@/app/(marketing)/pricing/page'
    );
    const { container } = render(<PricingPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const schema = JSON.parse(script?.textContent ?? '{}');

    expect(schema['@type']).toBe('WebPage');
    const itemList = schema.mainEntity;
    expect(itemList['@type']).toBe('ItemList');
    const products = itemList.itemListElement.map(
      (entry: { item: unknown }) => entry.item
    );
    expect(products.length).toBeGreaterThan(1);
    for (const product of products) {
      expect(product['@type']).toBe('Product');
      const offer = product.offers;
      expect(offer['@type']).toBe('Offer');
      // claude-seo rubric: schema.org url properties resolve off-origin, so
      // relative CTAs like /signup?plan=free or mailto: links are invalid.
      expect(offer.url).toMatch(/^https:\/\/jov\.ie\//);
    }
  });

  it('/pricing ships a branded title, site name and share image', async () => {
    const { metadata } = await import('@/app/(marketing)/pricing/page');
    const image = `${BASE_URL}/og/default.png`;

    expect(metadata.title).toBe(`Pricing | ${APP_NAME}`);
    expect(metadata.openGraph).toMatchObject({
      siteName: APP_NAME,
      images: [{ url: image, width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({ images: [image] });
  });
});
