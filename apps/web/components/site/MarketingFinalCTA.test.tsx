import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingFinalCTA } from './MarketingFinalCTA';

describe('MarketingFinalCTA', () => {
  it('renders the default headline and action', async () => {
    const { container } = render(<MarketingFinalCTA />);

    expect(screen.getByTestId('marketing-final-cta')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Request private launch access.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', HOMEPAGE_FRONT_DOOR_CTA.primary.href);
    await expectNoA11yViolations(container);
  });

  it('renders custom copy, body and a secondary action', async () => {
    const { container } = render(
      <MarketingFinalCTA
        title='Keep your next release moving.'
        body='One adaptive profile for every drop.'
        ctaLabel='Start free'
        ctaHref='/signup'
        secondaryLabel='See pricing'
        secondaryHref='/pricing'
        testId='page-close'
      />
    );

    expect(screen.getByTestId('page-close')).toBeInTheDocument();
    expect(
      screen.getByText('One adaptive profile for every drop.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long headline whole and stays axe-clean', async () => {
    const title =
      'Keep your next release moving, from the first demo to the release-day page and every pitch after it.';
    const { container } = render(<MarketingFinalCTA title={title} />);

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingFinalCTA title='اطلب الوصول المبكر.' ctaLabel='اطلب الوصول' />
      </div>
    );

    expect(screen.getByRole('link', { name: 'اطلب الوصول' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
