import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';

describe('MarketingPricingPlans', () => {
  it('renders the canonical Free, Pro, and Max plans by default', () => {
    render(<MarketingPricingPlans mode='compact' />);

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
    render(<MarketingPricingPlans mode='compact' />);

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
});
