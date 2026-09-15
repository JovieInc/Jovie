import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';

describe('MarketingPricingPlans', () => {
  it('renders the canonical Free, Pro, and Enterprise plans by default', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'enterprise']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toHaveAttribute('data-plan-active', 'false');
    }
    expect(screen.queryByTestId('marketing-pricing-plan-team')).toBeNull();
  });

  it('offers access requests with canonical trial terms and Enterprise contact', () => {
    render(
      <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
    );
    for (const link of screen.getAllByRole('link', {
      name: 'Request access',
    })) {
      expect(link).toHaveAttribute('href', 'https://jov.ie/waitlist');
    }
    const pro = within(screen.getByTestId('marketing-pricing-plan-pro'));
    expect(pro.getByText('$199')).toBeInTheDocument();
    expect(pro.getByText('Limited access')).toBeInTheDocument();
    expect(
      pro.getByText(/14-day Pro trial\. No credit card/)
    ).toBeInTheDocument();
    expect(pro.getByText(/not yet generally available/)).toBeInTheDocument();
    const enterprise = within(
      screen.getByTestId('marketing-pricing-plan-enterprise')
    );
    expect(
      enterprise.getByRole('link', { name: 'Contact sales' })
    ).toHaveAttribute('href', 'mailto:support@jov.ie');
    expect(screen.queryByText('Max', { exact: true })).toBeNull();
    expect(screen.queryByRole('link', { name: /trial/i })).toBeNull();
  });

  it('keeps default pricing plan cards neutral instead of plan-accented', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'enterprise']) {
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
    ).toHaveAttribute('data-marketing-variant', 'tier-cards-neutral');
    for (const plan of ['free', 'pro', 'enterprise']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      if (plan === 'enterprise') continue;
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
      'data-marketing-variant',
      'tier-cards-recommended'
    );
    expect(proCard).toHaveAttribute('data-recommended', 'true');
    expect(within(proCard).getByRole('link')).toHaveAttribute(
      'data-variant',
      'primary'
    );
    expect(within(proCard).getByText('Limited access')).toBeInTheDocument();

    for (const plan of ['free']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      expect(within(card).getByRole('link')).toHaveAttribute(
        'data-variant',
        'ghost'
      );
    }
  });
});
