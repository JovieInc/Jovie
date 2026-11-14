import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingHero } from './MarketingHero';
import { MARKETING_HERO_DEFAULT_PROPS } from './MarketingHero.stories';

// Rendered-state, keyboard and axe coverage for each hero mode. The layout,
// clamp and Pen contract lives in MarketingHero.test.tsx.
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

describe('MarketingHero states', () => {
  it('renders the content hero and reaches both actions by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarketingHero {...MARKETING_HERO_DEFAULT_PROPS} />
    );

    const primary = screen.getByRole('link', { name: 'Claim my workspace' });
    const secondary = screen.getByRole('link', { name: 'See pricing' });
    expect(primary).toHaveAttribute('data-primary-action', 'true');
    expect(secondary).not.toHaveAttribute('data-primary-action');

    await user.tab();
    expect(primary).toHaveFocus();
    await user.tab();
    expect(secondary).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('forwards analytics props to a tracked link renderer', () => {
    const received = vi.fn();
    const TrackedLink = forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & {
        eventName?: string;
        eventProperties?: Record<string, unknown>;
        prefetch?: boolean;
      }
    >(function TrackedLink(
      { eventName, eventProperties, prefetch, ...rest },
      ref
    ) {
      received({ eventName, eventProperties, prefetch });
      return <a ref={ref} {...rest} />;
    });
    render(
      <MarketingHero
        headline='Pricing'
        subtitle='Free profiles.'
        primaryCta={{
          label: 'Claim',
          href: '/start',
          signUp: true,
          eventName: 'hero_claim',
          eventProperties: { section: 'hero' },
        }}
        linkComponent={TrackedLink}
      />
    );

    const claim = screen.getByRole('link', { name: 'Claim' });
    expect(claim).toHaveAttribute('href', '/start');
    expect(claim).toHaveAttribute('data-cta-sign-up', 'true');
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'hero_claim',
        eventProperties: { section: 'hero' },
      })
    );
  });

  it('renders a primary-only content hero without an empty action or proof slot', async () => {
    const { container } = render(
      <MarketingHero
        headingId='partial-heading'
        headline='Drop more music, with less work.'
        subtitle='Plan releases from one workspace.'
        primaryCta={{ label: 'Claim my workspace', href: '/start' }}
        logos={false}
      />
    );

    const actions = container.querySelector('.marketing-hero-actions');
    expect(actions?.children).toHaveLength(1);
    expect(container.querySelector('.marketing-hero-logos')).toBeNull();
    expect(container.querySelector('.marketing-hero-media')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders a landing hero with no proof points or subcopy', async () => {
    const { container } = render(
      <MarketingHero
        eyebrow='Releases'
        headingId='empty-proof-heading'
        title='Every release, ready on day one.'
        body='Each release gets its own page.'
        media={null}
        proofPoints={[]}
      />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Every release, ready on day one.',
      })
    ).toBeInTheDocument();
    expect(container.querySelector('span.rounded-full')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders every landing row and keeps the proof points in order', async () => {
    const user = userEvent.setup();
    const proofPoints = ['Release plans in minutes', 'Pitch-ready assets'];
    const { container } = render(
      <MarketingHero
        eyebrow='Voice'
        headingId='landing-heading'
        title='Talk through a release.'
        body='Jovie turns it into a dated plan.'
        media={<p>Product preview</p>}
        headlineMaxLines='none'
        secondaryCtaLabel='See pricing'
        secondaryCtaHref='/pricing'
        subcopy='No credit card required.'
        proofPoints={proofPoints}
      />
    );

    const section = screen.getByTestId('marketing-hero-section');
    expect(within(section).getByText('No credit card required.')).toBeVisible();
    expect(
      proofPoints.map(label => within(section).getByText(label).textContent)
    ).toEqual(proofPoints);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps a long headline on the two-line clamp with its full accessible name', async () => {
    const headline =
      'Drop more music with less work, from the first demo to the release-day page and every playlist pitch after it';
    const { container } = render(
      <MarketingHero
        headingId='long-heading'
        headline={headline}
        subtitle={'The AI workspace for artists. '.repeat(6).trim()}
        primaryCta={{ label: 'Claim my workspace', href: '/start' }}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: headline })
    ).toHaveClass('line-clamp-2');
    await expectNoA11yViolations(container);
  });

  it('renders the shell and right-to-left content heroes without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingHero variant='centered' headingId='shell-heading'>
          <h1 id='shell-heading'>سجل التغييرات</h1>
        </MarketingHero>
        <MarketingHero
          headingId='rtl-heading'
          headline='أصدر موسيقى أكثر بجهد أقل.'
          subtitle='مساحة عمل للفنانين.'
          primaryCta={{ label: 'احجز مساحتك', href: '/start' }}
        />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'احجز مساحتك' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
