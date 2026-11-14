import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, forwardRef } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPosterHero } from './MarketingPosterHero';
import {
  LongContentCopy,
  PartialPrimaryOnly,
  RtlArabic,
} from './MarketingPosterHero.states.stories';
import { Default } from './MarketingPosterHero.stories';

// Composition, analytics forwarding, keyboard and axe coverage for the shared
// poster hero. Homepage wiring lives in tests/unit/home/HomepagePosterHero.test.tsx.
type PosterArgs = ComponentProps<typeof MarketingPosterHero>;
const args = (story: { args?: Partial<PosterArgs> }) =>
  story.args as PosterArgs;

// A stand-in for HomepageTrackedLink: it stamps the analytics props it was
// handed so a click can read back exactly what the hero forwarded.
const TrackedLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<'a'> & {
    eventName?: string;
    eventProperties?: Record<string, unknown>;
    prefetch?: boolean;
  }
>(function TrackedLink({ eventName, eventProperties, prefetch, ...rest }, ref) {
  return (
    <a
      ref={ref}
      {...rest}
      data-prefetch={String(prefetch)}
      data-event-name={eventName}
      data-event-properties={
        eventProperties ? JSON.stringify(eventProperties) : undefined
      }
    />
  );
});

/** Records each link click (and keeps jsdom from navigating). */
function recordClicks() {
  const clicks: Record<string, unknown>[] = [];
  const listener = (event: MouseEvent) => {
    const link = (event.target as Element).closest('a');
    if (!link) return;
    event.preventDefault();
    clicks.push({
      href: link.getAttribute('href'),
      eventName: link.dataset.eventName,
      eventProperties: link.dataset.eventProperties
        ? JSON.parse(link.dataset.eventProperties)
        : undefined,
    });
  };
  document.addEventListener('click', listener);
  return {
    clicks,
    stop: () => document.removeEventListener('click', listener),
  };
}

describe('MarketingPosterHero', () => {
  it('renders the headline, both actions, seam and media, reachable by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingPosterHero {...args(Default)} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your music. Still moving.',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText(
        'Keep your profile, links, and audience signals working together.'
      )
    ).toBeInTheDocument();
    const primary = screen.getByRole('link', { name: 'Get started' });
    const secondary = screen.getByRole('link', { name: 'See artist profiles' });
    expect(primary).toHaveAttribute('href', '/signup');
    expect(secondary).toHaveAttribute('href', '/artist-profiles');
    expect(screen.getByTestId('homepage-poster-hero-seam')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-poster-hero-media')).toHaveTextContent(
      'Credible product surface'
    );
    expect(screen.getByTestId('homepage-hero-shell')).toBeInTheDocument();

    await user.tab();
    expect(primary).toHaveFocus();
    await user.tab();
    expect(secondary).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('forwards analytics props and waits on auth prefetch through a tracked link', async () => {
    const user = userEvent.setup();
    const recorder = recordClicks();
    render(
      <MarketingPosterHero
        {...args(Default)}
        primaryCta={{
          label: 'Get started',
          href: '/start',
          eventName: 'poster_primary_clicked',
          eventProperties: { section: 'hero' },
          signUp: true,
        }}
        secondaryCta={{
          label: 'See pricing',
          href: '/pricing',
          eventName: 'poster_secondary_clicked',
        }}
        sectionVariant='centered-phone'
        sectionOwner='apps/web/components/marketing/MarketingPosterHero.tsx'
        trackedLinkComponent={TrackedLink}
      />
    );

    const primary = screen.getByTestId('homepage-primary-cta');
    expect(primary).toHaveAttribute('data-cta-sign-up', 'true');
    expect(primary).toHaveAttribute('data-prefetch', 'false');
    expect(screen.getByTestId('homepage-secondary-cta')).toHaveAttribute(
      'data-prefetch',
      'undefined'
    );
    expect(screen.getByTestId('marketing-section-hero')).toBeInTheDocument();

    await user.click(primary);
    await user.click(screen.getByRole('link', { name: 'See pricing' }));
    recorder.stop();
    expect(recorder.clicks).toEqual([
      {
        href: '/start',
        eventName: 'poster_primary_clicked',
        eventProperties: { section: 'hero' },
      },
      {
        href: '/pricing',
        eventName: 'poster_secondary_clicked',
        eventProperties: undefined,
      },
    ]);
  });

  it('renders the partial hero with no lede or secondary action', async () => {
    const { container } = render(
      <MarketingPosterHero {...args(PartialPrimaryOnly)} />
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByTestId('homepage-secondary-cta')).toBeNull();
    expect(container.querySelector('.homepage-poster-hero__lede')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'id',
      'poster-hero-partial-heading'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the full long headline in the accessible name under the clamp', async () => {
    const { container } = render(
      <MarketingPosterHero {...args(LongContentCopy)} />
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: args(LongContentCopy).headline,
      })
    ).toHaveClass('marketing-h1-max-two-lines', 'line-clamp-2');
    expect(
      screen.getByRole('link', {
        name: 'See every artist profile we have shipped',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingPosterHero {...args(RtlArabic)} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'موسيقاك. لا تزال تتحرك.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الأسعار' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expectNoA11yViolations(container);
  });
});
