import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { PricingComparisonChart } from './PricingComparisonChart';

describe('PricingComparisonChart', () => {
  it('renders named comparison tables from monthly-only public offer truth', () => {
    const { container } = render(<PricingComparisonChart />);

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

    expect(
      screen.queryByRole('switch', { name: 'Toggle Annual Billing' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Save ~20%')).not.toBeInTheDocument();
    expect(within(desktopTable).getByText('$199')).toBeInTheDocument();
    expect(within(desktopTable).getByText('/mo')).toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
    expect(screen.queryByText('$149')).not.toBeInTheDocument();
    expect(
      container.querySelector(
        `[data-offer-contract="${ARTIST_VISIBILITY_OFFER_CONTRACT_ID}"]`
      )
    ).not.toBeNull();
    expect(screen.queryByText('Automated follow-ups')).not.toBeInTheDocument();

    const selector = screen.getByRole('combobox', {
      name: 'Select Plan To Compare',
    });
    fireEvent.change(selector, { target: { value: 'free' } });
    expect(selector).toHaveValue('free');
    expect(within(mobileTable).getByText('Free')).toBeInTheDocument();
  });
});
