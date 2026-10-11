import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import { trackHomepageEvent } from '@/components/homepage/homepage-analytics';
import {
  MarketingPosterHero,
  type MarketingPosterHeroCta,
} from '@/components/marketing/MarketingPosterHero';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

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
  it('binds a declared profile hero on the semantic root without duplicating it', () => {
    render(
      <MarketingPosterHero
        headline='Profile'
        subtitle='Your public profile.'
        primaryCta={primaryCta}
        media={<div>Product</div>}
        seam={null}
        sectionVariant='centered-phone'
        sectionOwner='apps/web/components/marketing/MarketingPosterHero.tsx'
      />
    );
    const root = screen.getByTestId('marketing-section-hero');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-marketing-variant', 'centered-phone');
    expect(root).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/MarketingPosterHero.tsx'
    );
    expect(screen.queryByTestId('homepage-hero-shell')).toBeNull();
  });
  it('renders one accessible heading and one primary CTA', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveClass(
      'homepage-poster-hero__headline',
      'marketing-h1-max-two-lines',
      'line-clamp-2'
    );
    expect(heading).not.toHaveAttribute('aria-label');
    const shell = screen.getByTestId('homepage-hero-shell');
    expect(shell).toHaveAttribute('aria-labelledby', heading.id);
    expect(shell).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.hero
    );
    expect(screen.getAllByTestId('homepage-primary-cta')).toHaveLength(1);
    const primaryLink = screen.getByRole('link', { name: 'Enter Jovie' });
    expect(primaryLink).toHaveAttribute('href', '/signup');
    expect(primaryLink).toHaveAttribute('data-size', 'marketing');
    expect(primaryLink).toHaveAttribute('data-variant', 'primary');
    expect(primaryLink).toHaveClass(
      'h-auto',
      'min-h-7',
      'text-sm',
      'rounded-full'
    );
    expect(primaryLink).toHaveClass(
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    for (const fixedHeight of ['h-7', 'h-11', 'h-11!', 'h-12']) {
      expect(primaryLink).not.toHaveClass(fixedHeight);
    }
    expect(primaryLink).toHaveClass('homepage-poster-hero__action-button');
    expect(primaryLink).not.toHaveClass('active:scale-[0.98]');

    const secondaryLink = screen.getByRole('link', { name: 'See proof' });
    expect(secondaryLink).toHaveAttribute('href', '/artist-profiles');
    expect(secondaryLink).toHaveAttribute('data-size', 'marketing');
    expect(secondaryLink).toHaveAttribute('data-variant', 'ghost');
    expect(secondaryLink).toHaveClass('homepage-poster-hero__action-button');
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

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    useLinkStatus: () => ({ pending: false }),
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function PrefetchObservedLink({ prefetch, href, ...props }, ref) {
      return (
        <a
          {...props}
          href={href ?? '#'}
          ref={ref}
          data-test-prefetch={String(prefetch)}
        />
      );
    }),
  };
});

it.each([false, true])(
  'preserves public defaults and defers auth through tracked=%s poster links',
  tracked => {
    renderHero(tracked ? HomepageTrackedLink : undefined);
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
      'data-test-prefetch',
      'false'
    );
    expect(screen.getByTestId('homepage-secondary-cta')).toHaveAttribute(
      'data-test-prefetch',
      'undefined'
    );
  }
);

it.each(['/signup', '/signin', '/start'])(
  'defers %s in both poster CTA positions',
  href => {
    render(
      <MarketingPosterHero
        headline='Share your work'
        subtitle='Choose a destination'
        primaryCta={{ label: 'Primary', href }}
        secondaryCta={{ label: 'Secondary', href }}
        media={null}
        seam={null}
      />
    );
    for (const id of ['homepage-primary-cta', 'homepage-secondary-cta']) {
      expect(screen.getByTestId(id)).toHaveAttribute('href', href);
      expect(screen.getByTestId(id)).toHaveAttribute(
        'data-test-prefetch',
        'false'
      );
    }
  }
);

it('preserves explicit choices for auth and public poster destinations', () => {
  const view = render(
    <MarketingPosterHero
      headline='Share your work'
      subtitle='Choose a destination'
      primaryCta={{ label: 'Primary', href: '/start', prefetch: true }}
      secondaryCta={{ label: 'Secondary', href: '/signin', prefetch: false }}
      media={null}
      seam={null}
    />
  );
  expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
    'data-test-prefetch',
    'true'
  );
  expect(screen.getByTestId('homepage-secondary-cta')).toHaveAttribute(
    'data-test-prefetch',
    'false'
  );
  view.rerender(
    <MarketingPosterHero
      headline='Share your work'
      subtitle='Choose a destination'
      primaryCta={{ label: 'Primary', href: '/pricing', prefetch: false }}
      secondaryCta={{ label: 'Secondary', href: '/support', prefetch: true }}
      media={null}
      seam={null}
    />
  );
  expect(screen.getByTestId('homepage-primary-cta')).toHaveAttribute(
    'data-test-prefetch',
    'false'
  );
  expect(screen.getByTestId('homepage-secondary-cta')).toHaveAttribute(
    'data-test-prefetch',
    'true'
  );
});
