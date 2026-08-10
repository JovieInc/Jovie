import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';

describe('MarketingPricingPlans', () => {
  it('renders the canonical Free, Pro, and Max plans by default', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'max']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toHaveAttribute('data-plan-active', 'true');
    }
    expect(screen.queryByTestId('marketing-pricing-plan-team')).toBeNull();
    expect(
      screen.queryByTestId('marketing-pricing-plan-enterprise')
    ).toBeNull();
  });

  it('stores selected plan ids in signup links', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    expect(
      screen.getByRole('link', { name: 'Claim your profile' })
    ).toHaveAttribute('href', '/signup?plan=free');
    expect(
      screen
        .getAllByRole('link', { name: 'Start Free Trial' })
        .map(link => link.getAttribute('href'))
    ).toContain('/signup?plan=pro');
    expect(
      screen
        .getAllByRole('link', { name: 'Start Free Trial' })
        .map(link => link.getAttribute('href'))
    ).toContain('/signup?plan=max');
    expect(
      screen.getAllByRole('link').map(link => link.getAttribute('href'))
    ).not.toContain('/signup?plan=team');
    expect(
      screen.getAllByRole('link').map(link => link.getAttribute('href'))
    ).not.toContain('/signup?plan=enterprise');
    expect(screen.queryByRole('link', { name: 'Request Access' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Contact Sales' })
    ).not.toBeInTheDocument();
  });

  it('keeps default pricing plan cards neutral instead of plan-accented', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'max']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`).className
      ).not.toMatch(/marketing-pricing-plan-card--(?:blue|pink|violet)/);
    }
  });

  it('marks the neutral variant with equal-weight cards and 44px CTAs', () => {
    render(
      <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
    );

    expect(
      screen.getByTestId('marketing-pricing-plan-free').parentElement
    ).toHaveAttribute('data-variant', 'tier-cards-neutral');
    for (const plan of ['free', 'pro', 'max']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      const cta = within(card).getByRole('link');
      expect(cta).toHaveAttribute('data-variant', 'secondary');
      expect(cta).toHaveAttribute('data-size', 'lg');
    }
  });

  it('marks only Pro as recommended and gives it the primary CTA', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-recommended' />
    );

    const proCard = screen.getByTestId('marketing-pricing-plan-pro');
    expect(proCard.parentElement).toHaveAttribute(
      'data-variant',
      'tier-cards-recommended'
    );
    expect(proCard).toHaveAttribute('data-recommended', 'true');
    expect(within(proCard).getByRole('link')).toHaveAttribute(
      'data-variant',
      'primary'
    );
    expect(within(proCard).getByText('Recommended')).toBeInTheDocument();

    for (const plan of ['free', 'max']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      expect(within(card).getByRole('link')).toHaveAttribute(
        'data-variant',
        'ghost'
      );
    }
  });
});
