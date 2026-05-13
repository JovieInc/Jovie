import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';

describe('MarketingPricingPlans', () => {
  it('renders only Free and Pro by default while Pro stays waitlisted', () => {
    render(<MarketingPricingPlans mode='compact' />);

    for (const plan of ['free', 'pro']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toBeInTheDocument();
    }
    expect(screen.queryByTestId('marketing-pricing-plan-team')).toBeNull();
    expect(
      screen.queryByTestId('marketing-pricing-plan-enterprise')
    ).toBeNull();

    expect(screen.getByTestId('marketing-pricing-plan-free')).toHaveAttribute(
      'data-plan-active',
      'true'
    );
    expect(screen.getByTestId('marketing-pricing-plan-pro')).toHaveAttribute(
      'data-plan-active',
      'false'
    );
  });

  it('stores requested paid plan ids in signup links', () => {
    render(<MarketingPricingPlans mode='compact' />);

    const requestLinks = screen.getAllByRole('link', {
      name: 'Request Access',
    });
    expect(requestLinks.map(link => link.getAttribute('href'))).toContain(
      '/signup?plan=pro'
    );
    expect(requestLinks.map(link => link.getAttribute('href'))).not.toContain(
      '/signup?plan=team'
    );
    expect(requestLinks.map(link => link.getAttribute('href'))).not.toContain(
      '/signup?plan=enterprise'
    );
    expect(
      screen.queryByRole('link', { name: 'Contact Sales' })
    ).not.toBeInTheDocument();
  });
});
