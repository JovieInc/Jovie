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
    // The proof is the template profile capture in the canonical phone
    // frame, beside the lead and never a person (no face on `/`).
    const proof = screen.getByTestId('homepage-hero-proof');
    expect(
      proof.querySelector(
        '[data-testid="product-screenshot-frame-template-profile-live-mobile"]'
      )
    ).not.toBeNull();
    expect(proof.querySelector('.mobile-web-screen')).not.toBeNull();
    const shot = screen.getByRole('img', { name: hero.profile.alt });
    expect(shot.getAttribute('src')).toMatch(
      /^\/product-screenshots\/template-profile-live-phone\.png/
    );
    expect(shot).toHaveAttribute('data-priority', 'true');
    expect(
      document
        .querySelector('.homepage-hero-canvas__copy')
        ?.getAttribute('data-has-proof')
    ).toBe('true');
  });

  it('keeps the canonical shell header and moves the claim into the copy column', () => {
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

    // The docked marketing shell (PublicPageShell) owns the page header:
    // the canvas renders no private bar, so brand, nav, Log in, and the
    // claim CTA are never duplicated or hidden behind a second chrome.
    expect(document.querySelector('.homepage-hero-canvas__bar')).toBeNull();
    const copy = document.querySelector('.homepage-hero-canvas__copy');
    expect(copy).not.toBeNull();
    expect(copy?.classList.contains('ap-section-container')).toBe(true);
    // The claim form is the hero's one conversion control, in the copy
    // column on the shared spine, next to the proof it supports.
    expect(
      copy?.querySelector('[data-testid="homepage-claim-form"]')
    ).not.toBeNull();
    expect(
      copy?.querySelector('[data-testid="homepage-primary-cta"]')
    ).not.toBeNull();
    // The hero opts into the docked-header bleed instead of replacing it.
    expect(
      document
        .querySelector('.homepage-hero-canvas')
        ?.classList.contains('marketing-hero-dock')
    ).toBe(true);
  });

  it('paints each headline sentence beat on its own line without editing the copy', () => {
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

    const heading = screen.getByRole('heading', { level: 1 });
    // Byte-identical accessible text: the beats only control wrapping.
    expect(heading).toHaveTextContent(hero.headline);
    const beats = heading.querySelectorAll(
      '.homepage-hero-canvas__headline-beat'
    );
    expect(beats).toHaveLength(2);
  });

  it('ships no partner-logo rail on the homepage hero', () => {
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

    // Proof is earned, not borrowed: the homepage hero carries no
    // distribution-partner logo rail (night-dj-harmony-v1 + the ICP gate:
    // the trust strip's permitted-logo chain stays off the homepage graph).
    expect(document.querySelector('.homepage-hero-canvas__logos')).toBeNull();
    expect(
      document.querySelector('[aria-label="Distribution partners"]')
    ).toBeNull();
  });

  it('renders no proof phone when no profile capture is passed', () => {
    render(
      <HomepageHeroCanvas
        headingId='home-hero-heading'
        headline={hero.headline}
        subhead={hero.subhead}
        claim={hero.claim}
        supportNote={hero.supportNote}
        sectionOwner='apps/web/components/homepage/HomepageArtistProfile.tsx'
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      hero.headline
    );
    expect(document.querySelector('.homepage-hero-canvas__proof')).toBeNull();
    expect(screen.queryByTestId('homepage-hero-proof')).toBeNull();
    expect(
      document
        .querySelector('.homepage-hero-canvas__copy')
        ?.hasAttribute('data-has-proof')
    ).toBe(false);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
