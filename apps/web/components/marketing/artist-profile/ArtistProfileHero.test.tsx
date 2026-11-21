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
  it('renders the left-aligned hero with homepage CTA and one mode-morphing mock', () => {
    render(
      <ArtistProfileHero
        hero={ARTIST_PROFILE_COPY.hero}
        adaptive={ARTIST_PROFILE_COPY.adaptive}
      />
    );

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
    ).toHaveAttribute('data-testid', 'homepage-primary-cta');
    // Secondary CTA stays sentence case (JOV-14240).
    expect(
      screen.getByRole('link', {
        name: ARTIST_PROFILE_COPY.hero.secondaryCtaLabel,
      })
    ).toHaveTextContent('See how it adapts');

    const productStage = screen.getByTestId('artist-profile-hero-product');
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'data-marketing-variant',
      'left-phone'
    );
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/MarketingPosterHero.tsx'
    );
    expect(productStage).toHaveClass('ap-hero__product-stage');
    expect(
      screen.getByTestId('artist-profile-section-adaptive')
    ).toBeInTheDocument();
    expect(productStage.querySelector('img')).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'Profile Modes' })
    ).toBeVisible();
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistProfileHero);
    expect(storyMeta.args?.hero).toBe(ARTIST_PROFILE_COPY.hero);
    expect(storyMeta.args?.adaptive).toBe(ARTIST_PROFILE_COPY.adaptive);
  });
});
