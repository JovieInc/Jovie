import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroCanvas } from './HomepageHeroCanvas';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

const hero = HOMEPAGE_COPY.hero;

describe('HomepageHeroCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('ships the locked headline on the CSS poster', () => {
    render(
      <HomepageHeroCanvas
        headingId='home-hero-heading'
        headline={hero.headline}
        subhead={hero.subhead}
        claim={hero.claim}
        supportNote={hero.supportNote}
        profile={hero.profile}
        sectionOwner='apps/web/components/homepage/HomepageArtistProfile.tsx'
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      hero.headline
    );
    const light = screen.getByTestId('homepage-hero-light');
    expect(light).toHaveAttribute('data-renderer', 'css');
    expect(light.querySelector('canvas')).toBeNull();
    expect(
      document.querySelector('.homepage-artist-hero__phone')
    ).not.toBeNull();
  });
});
