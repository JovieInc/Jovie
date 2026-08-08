import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { trackHomepageEvent } from '@/components/homepage/homepage-analytics';
import {
  MarketingPosterHero,
  type MarketingPosterHeroCta,
} from '@/components/marketing/MarketingPosterHero';

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));

const primaryCta: MarketingPosterHeroCta = {
  label: 'Enter Jovie',
  href: '/signup',
  eventName: 'homepage_poster_cta_clicked',
  eventProperties: { variant: 'A' },
};
const secondaryCta: MarketingPosterHeroCta = {
  label: 'See proof',
  href: '/artist-profiles',
};

function renderHero(
  trackedLinkComponent?: ComponentProps<
    typeof MarketingPosterHero
  >['trackedLinkComponent']
) {
  return render(
    <MarketingPosterHero
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

describe('MarketingPosterHero', () => {
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
    expect(primaryLink).toHaveAttribute('data-variant', 'primary');
    expect(primaryLink).not.toHaveClass('active:scale-[0.98]');

    const secondaryLink = screen.getByRole('link', { name: 'See proof' });
    expect(secondaryLink).toHaveAttribute('href', '/artist-profiles');
    expect(secondaryLink).toHaveAttribute('data-variant', 'ghost');
    expect(secondaryLink).not.toHaveClass('active:scale-[0.98]');
    // Secondary must stay quieter than the primary conversion control.
    expect(secondaryLink.getAttribute('data-variant')).not.toBe('primary');
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
