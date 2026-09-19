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

  it('drives the system-b switch styling from Radix data-state', () => {
    render(<PricingComparisonChart />);

    const root = screen.getByRole('switch', {
      name: 'Toggle Annual Billing',
    }) as HTMLElement;
    expect(root).toHaveAttribute('data-state', 'unchecked');
    expect(root).toHaveClass('h-4', 'w-7');
    const thumb = root.firstElementChild;
    expect(thumb).toHaveClass('h-3', 'w-3');

    fireEvent.click(root);

    expect(root).toHaveAttribute('data-state', 'checked');
  });
});
