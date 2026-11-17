import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  HomepageStoryHeader,
  HomepageV2FinalCta,
  HomepageV2Pricing,
} from './HomepageV2Ctas';

describe('HomepageStoryHeader', () => {
  it('centers the heading and body by default', async () => {
    const { container } = render(
      <HomepageStoryHeader
        headline='Free to start.'
        body='Profiles are free.'
        headlineTestId='story-heading'
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Free to start.'
    );
    expect(screen.getByTestId('story-heading')).toHaveClass('line-clamp-2');
    expect(container.firstElementChild).toHaveClass('text-center');
    expect(screen.getByText('Profiles are free.')).toHaveClass('mx-auto');
    await expectNoA11yViolations(container);
  });

  it('left-aligns a header without body copy', async () => {
    const { container } = render(
      <HomepageStoryHeader align='left' headline='Free to start.' />
    );

    expect(container.firstElementChild).toHaveClass('max-w-xl');
    expect(container.querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe('HomepageV2FinalCta', () => {
  it('renders the default close with its sign-up action', async () => {
    const { container } = render(<HomepageV2FinalCta />);

    expect(
      screen.getByTestId('homepage-v2-final-cta-heading')
    ).toHaveTextContent(HOMEPAGE_V2_COPY.finalCta.headline);
    expect(
      screen.getByRole('link', {
        name: HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel,
      })
    ).toHaveAttribute('href', '/start');
    await expectNoA11yViolations(container);
  });

  it('keeps a long page-specific headline and its analytics tags', async () => {
    const headline =
      'Keep your work moving, from the first demo to the release-day page and every pitch after it.';
    const { container } = render(
      <HomepageV2FinalCta
        headline={headline}
        ctaLabel='Claim your artist profile'
        ctaHref='/artist-profiles'
        sectionTestId='page-close'
        analyticsEventName='cta_click'
        analyticsSource='page_close'
      />
    );

    expect(screen.getByTestId('page-close')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: headline })).toBeVisible();
    const action = screen.getByRole('link', {
      name: 'Claim your artist profile',
    });
    expect(action).toHaveAttribute('href', '/artist-profiles');
    expect(action).toHaveAttribute('data-analytics-event', 'cta_click');
    expect(action).toHaveAttribute('data-analytics-source', 'page_close');
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic close right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageV2FinalCta headline='واصل عملك.' ctaLabel='ابدأ الآن' />
      </div>
    );

    expect(screen.getByRole('link', { name: 'ابدأ الآن' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

describe('HomepageV2Pricing', () => {
  it('renders the pricing header with the public price claim', async () => {
    const { container } = render(<HomepageV2Pricing />);

    expect(screen.getByTestId('homepage-v2-pricing')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: HOMEPAGE_V2_COPY.pricing.headline })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Jovie profiles are free forever\. Artist Presence is/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
