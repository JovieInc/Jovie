import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';

describe('MarketingPricingPlans', () => {
  it('renders all public plans while paid plans stay waitlisted by default', () => {
    render(<MarketingPricingPlans mode='compact' />);

    for (const plan of ['free', 'pro', 'team', 'enterprise']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toBeInTheDocument();
    }

    expect(screen.getByTestId('marketing-pricing-plan-free')).toHaveAttribute(
      'data-plan-active',
      'true'
    );
    expect(screen.getByTestId('marketing-pricing-plan-pro')).toHaveAttribute(
      'data-plan-active',
      'false'
    );
    expect(screen.getByTestId('marketing-pricing-plan-team')).toHaveAttribute(
      'data-plan-active',
      'false'
    );
    expect(
      screen.getByTestId('marketing-pricing-plan-enterprise')
    ).toHaveAttribute('data-plan-active', 'false');
  });

  it('stores requested paid plan ids in signup links', () => {
    render(<MarketingPricingPlans mode='compact' />);

    const requestLinks = screen.getAllByRole('link', {
      name: 'Request Access',
    });
    expect(requestLinks.map(link => link.getAttribute('href'))).toContain(
      '/signup?plan=pro'
    );
    expect(requestLinks.map(link => link.getAttribute('href'))).toContain(
      '/signup?plan=team'
    );
    expect(screen.getByRole('link', { name: 'Contact Sales' })).toHaveAttribute(
      'href',
      '/signup?plan=enterprise'
    );
  });
});
