import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingComparisonChart } from './PricingComparisonChart';

describe('PricingComparisonChart', () => {
  it('renders named comparison tables and toggles annual billing', () => {
    render(<PricingComparisonChart />);

    const desktopTable = screen.getByRole('table', {
      name: 'Feature comparison by plan',
    });
    const mobileTable = screen.getByRole('table', {
      name: 'Feature comparison for selected plan',
    });

    expect(within(desktopTable).getByText('Free')).toBeInTheDocument();
    expect(within(desktopTable).getByText('Pro')).toBeInTheDocument();
    expect(within(mobileTable).getByText('Pro')).toBeInTheDocument();
    expect(
      screen.getByText('All limits subject to fair-use guardrails.')
    ).toBeInTheDocument();

    const billingSwitch = screen.getByRole('switch', {
      name: 'Toggle Annual Billing',
    });
    expect(billingSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(billingSwitch);

    expect(billingSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Annual', { exact: false })).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
