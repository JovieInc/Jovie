import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingComparisonChart } from './PricingComparisonChart';

describe('PricingComparisonChart', () => {
  it('shows monthly Pro and planned capabilities without legacy acquisition offers', () => {
    render(<PricingComparisonChart />);
    const desktop = within(
      screen.getByRole('table', { name: 'Feature comparison by plan' })
    );
    for (const name of ['Free', 'Pro', 'Enterprise'])
      expect(desktop.getByText(name)).toBeInTheDocument();
    expect(desktop.getByText('$199/month')).toBeInTheDocument();
    expect(desktop.getAllByText('Planned')).toHaveLength(3);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Max', { exact: true })).toBeNull();
    expect(
      screen.getByText(/50 emails, not a recurring allowance/)
    ).toBeInTheDocument();
  });
  it('changes only the selected mobile comparison while retaining focus', () => {
    render(<PricingComparisonChart />);
    const select = screen.getByRole('combobox', {
      name: 'Select Plan To Compare',
    });
    const mobile = within(
      screen.getByRole('table', {
        name: 'Feature comparison for selected plan',
      })
    );
    select.focus();
    fireEvent.change(select, { target: { value: 'enterprise' } });
    expect(select).toHaveFocus();
    expect(mobile.getByText('Enterprise')).toBeInTheDocument();
    expect(mobile.queryByText('Planned')).toBeNull();
    fireEvent.change(select, { target: { value: 'free' } });
    expect(mobile.getByText('Free')).toBeInTheDocument();
    expect(mobile.getAllByText('Not included')).toHaveLength(3);
    fireEvent.change(select, { target: { value: 'pro' } });
    expect(mobile.getAllByText('Planned')).toHaveLength(3);
  });
});
