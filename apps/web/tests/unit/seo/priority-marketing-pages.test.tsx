import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage, {
  metadata as artistMetadata,
} from '@/app/(marketing)/artist-profiles/page';
import PricingPage, {
  metadata as pricingMetadata,
} from '@/app/(marketing)/pricing/page';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileLandingRoute',
  () => ({
    ArtistProfileLandingRoute: () => <main>Artist profiles</main>,
  })
);
vi.mock('@/components/organisms/PricingRecipeBody', () => ({
  PricingRecipeBody: ({
    structuredData,
  }: {
    structuredData: React.ReactNode;
  }) => <main>{structuredData}</main>,
}));

describe('priority marketing page crawler contracts', () => {
  it('publishes a usable pricing title and the existing real social image', () => {
    expect(pricingMetadata.title).toBe(`Pricing | ${APP_NAME}`);
    expect(pricingMetadata.openGraph).toMatchObject({
      url: `${BASE_URL}/pricing`,
      images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
    });
    expect(pricingMetadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [`${BASE_URL}/og/default.png`],
    });
  });

  it('renders parseable artist-page structured data with the canonical copy and URL', () => {
    const { container } = render(<ArtistProfilesPage />);
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    expect(scripts).toHaveLength(1);
    const schema = JSON.parse(scripts[0].textContent ?? '');
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      url: `${BASE_URL}/artist-profiles`,
      name: ARTIST_PROFILE_COPY.seo.title,
      description: artistMetadata.description,
      isPartOf: { '@type': 'WebSite', url: BASE_URL },
    });
    // This is a product explainer, so do not invent a customer ProfilePage,
    // ratings, availability, or testimonials to satisfy structured-data checks.
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(schema).not.toHaveProperty('offers');
    expect(container.querySelector('main')).toHaveTextContent(
      'Artist profiles'
    );
  });

  it('keeps the pricing offer schema aligned with limited paid access', () => {
    const { container } = render(<PricingPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(script).not.toBeNull();
    const schema = JSON.parse(script?.textContent ?? '');
    expect(schema.url).toBe(`${BASE_URL}/pricing`);
    const products = schema.mainEntity.itemListElement.map(
      (entry: { item: { offers: Record<string, string> } }) => entry.item
    );
    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offers: expect.objectContaining({
            price: '0',
            availability: 'https://schema.org/InStock',
          }),
        }),
        expect.objectContaining({
          offers: expect.objectContaining({
            price: '199',
            availability: 'https://schema.org/LimitedAvailability',
          }),
        }),
      ])
    );
  });
});
