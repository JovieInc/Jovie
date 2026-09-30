import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { PRODUCT_COPY } from '@/data/productCopy';

vi.mock('@/app/(marketing)/product/ProductLanding', () => ({
  ProductLanding: () => <main data-testid='product-landing' />,
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
