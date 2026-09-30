import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import SolutionsArtistsPage, { metadata } from './page';

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileLandingRoute',
  () => ({
    ArtistProfileLandingRoute: () => (
      <main data-testid='artist-profile-landing-route' />
    ),
  })
);

describe('SolutionsArtistsPage (JOV-5861)', () => {
  it('renders the artist profile landing route', () => {
    render(<SolutionsArtistsPage />);

    expect(
      screen.getByTestId('artist-profile-landing-route')
    ).toBeInTheDocument();
  });

  it('declares the product as SoftwareApplication JSON-LD', () => {
    const { container } = render(<SolutionsArtistsPage />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const schema = JSON.parse(script?.textContent ?? '{}');

    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.description).toBe(ARTIST_PROFILE_COPY.seo.description);
  });

  it('publishes canonical, Open Graph, and Twitter metadata for /solutions/artists', () => {
    const canonicalUrl = `${BASE_URL}${APP_ROUTES.SOLUTIONS_ARTISTS}`;

    expect(metadata.title).toBe(ARTIST_PROFILE_COPY.seo.title);
    expect(metadata.description).toBe(ARTIST_PROFILE_COPY.seo.description);
    expect(metadata.keywords).toEqual(ARTIST_PROFILE_COPY.seo.keywords);
    expect(metadata.alternates?.canonical).toBe(canonicalUrl);
    expect(metadata.openGraph).toMatchObject({
      title: `For Artists | ${APP_NAME}`,
      description: ARTIST_PROFILE_COPY.seo.description,
      url: canonicalUrl,
      siteName: APP_NAME,
      type: 'website',
      images: [
        {
          url: `${BASE_URL}/og/default.png`,
          secureUrl: `${BASE_URL}/og/default.png`,
          width: 1200,
          height: 630,
          alt: ARTIST_PROFILE_COPY.seo.title,
          type: 'image/png',
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: `For Artists | ${APP_NAME}`,
      description: ARTIST_PROFILE_COPY.seo.description,
      images: [`${BASE_URL}/og/default.png`],
      creator: '@meetjovie',
      site: '@meetjovie',
    });
  });
});
