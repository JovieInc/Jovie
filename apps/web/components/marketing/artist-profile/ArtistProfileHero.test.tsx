import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

// Render next/image as a plain img so JSDOM can render the hero media
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(
      ({
        src,
        alt,
        priority: _p,
        fill: _f,
        blurDataURL: _b,
        placeholder: _ph,
        quality: _q,
        unoptimized: _u,
        ...rest
      }: Record<string, unknown>) => (
        <img src={src as string} alt={alt as string} {...rest} />
      )
    ),
}));

import { ArtistProfileHero } from './ArtistProfileHero';
import storyMeta from './ArtistProfileHero.stories';

describe('ArtistProfileHero', () => {
  it('renders the canonical hero with headline, claim CTA, and product stage', () => {
    render(<ArtistProfileHero hero={ARTIST_PROFILE_COPY.hero} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: ARTIST_PROFILE_COPY.hero.headline,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: ARTIST_PROFILE_COPY.hero.ctaLabel,
      })
    ).toBeInTheDocument();

    const productStage = screen.getByTestId('artist-profile-hero-product');
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'data-marketing-variant',
      'centered-phone'
    );
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/MarketingPosterHero.tsx'
    );
    expect(productStage).toHaveClass('ap-hero__product-stage');
    expect(productStage.querySelector('img')).toBeInTheDocument();
    expect(productStage.querySelector('img')?.getAttribute('alt')).toMatch(
      /Demo/i
    );
    expect(productStage.querySelector('img')?.getAttribute('sizes')).toBe(
      '(min-width: 768px) 19rem, (min-width: 440px) 17.5rem, 74vw'
    );
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistProfileHero);
    expect(storyMeta.args?.hero).toBe(ARTIST_PROFILE_COPY.hero);
  });
});
