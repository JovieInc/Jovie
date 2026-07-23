import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  HomepagePosterHero,
  type HomepagePosterHeroCta,
} from '@/components/homepage/HomepagePosterHero';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { trackHomepageEvent } from '@/components/homepage/homepage-analytics';

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));

const primaryCta: HomepagePosterHeroCta = {
  label: 'Enter Jovie',
  href: '/signup',
  eventName: 'homepage_poster_cta_clicked',
  eventProperties: { variant: 'A' },
};

const secondaryCta: HomepagePosterHeroCta = {
  label: 'See a live profile',
  href: '/timwhite',
};

function renderHero(
  trackedLinkComponent?: ComponentProps<
    typeof HomepagePosterHero
  >['trackedLinkComponent']
) {
  return render(
    <HomepagePosterHero
      headline='Your artist work, in motion'
      subtitle='A focused workspace for the next release.'
      primaryCta={primaryCta}
      secondaryCta={secondaryCta}
      media={<div>Poster media</div>}
      seam={<div>Reserved seam</div>}
      trackedLinkComponent={trackedLinkComponent}
    />
  );
}

describe('HomepagePosterHero', () => {
  it('renders one accessible heading and one primary CTA', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('homepage-hero-shell')).toHaveAttribute(
      'aria-labelledby',
      heading.id
    );
    expect(screen.getAllByTestId('homepage-primary-cta')).toHaveLength(1);
    const primaryLink = screen.getByRole('link', { name: 'Enter Jovie' });
    expect(primaryLink).toHaveAttribute('href', '/signup');
    expect(primaryLink).toHaveAttribute('data-size', 'md');
    expect(primaryLink).toHaveClass('homepage-poster-hero__primary-cta');

    const secondaryLink = screen.getByRole('link', {
      name: 'See a live profile',
    });
    expect(secondaryLink).toHaveAttribute('href', '/timwhite');
    expect(secondaryLink).toHaveAttribute('data-variant', 'ghost');
    expect(secondaryLink).toHaveClass('homepage-poster-hero__secondary-cta');
  });

  it('keeps the copy, media, and reserved seam slots present', () => {
    renderHero();

    expect(screen.getByText('Your artist work, in motion')).toBeInTheDocument();
    expect(
      screen.getByText('A focused workspace for the next release.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-poster-hero-media')).toHaveTextContent(
      'Poster media'
    );
    expect(screen.getByTestId('homepage-poster-hero-seam')).toHaveTextContent(
      'Reserved seam'
    );

    const seam = screen.getByTestId('homepage-poster-hero-seam');
    const media = screen.getByTestId('homepage-poster-hero-media');
    expect(seam.compareDocumentPosition(media)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('forwards tracked link props to the optional link component', () => {
    const trackedLink = vi.fn(
      ({
        children,
        eventName,
        eventProperties,
        ...props
      }: {
        readonly children: ReactNode;
        readonly eventName?: string;
        readonly eventProperties?: Record<string, unknown>;
        readonly href?: string;
      }) => {
        void eventName;
        void eventProperties;
        return <a {...props}>{children}</a>;
      }
    );

    renderHero(trackedLink);

    expect(trackedLink.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        eventName: primaryCta.eventName,
        eventProperties: primaryCta.eventProperties,
        href: primaryCta.href,
      })
    );
  });

  it('emits the mounted hero CTA analytics event when clicked', () => {
    renderHero(HomepageTrackedLink);
    window.addEventListener('click', event => event.preventDefault(), {
      capture: true,
      once: true,
    });

    fireEvent.click(screen.getByRole('link', { name: 'Enter Jovie' }));

    expect(trackHomepageEvent).toHaveBeenCalledWith(
      primaryCta.eventName,
      primaryCta.eventProperties
    );
  });
});
