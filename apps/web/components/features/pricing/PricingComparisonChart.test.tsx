import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { PricingComparisonChart } from './PricingComparisonChart';

describe('PricingComparisonChart', () => {
  it('names the profile feature as a Jovie profile, not an artist profile', () => {
    const { container } = render(<PricingComparisonChart />);

    expect(
      screen.getAllByText('Public Jovie profile page').length
    ).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/artist profile/i);
  });

  it('renders named comparison tables from monthly-only public offer truth', () => {
    const { container } = render(<PricingComparisonChart />);

    const desktopTable = screen.getByRole('table', {
      name: 'Feature comparison by plan',
    });
    const mobileTable = screen.getByRole('table', {
      name: 'Feature comparison for selected plan',
    });

    for (const table of [desktopTable, mobileTable]) {
      expect(
        within(table).getByRole('columnheader', { name: 'Feature' })
      ).toHaveAttribute('scope', 'col');
      for (const header of table.querySelectorAll('thead th')) {
        expect(header).toHaveAccessibleName();
        expect(header).toHaveClass('whitespace-nowrap');
        expect(header).not.toHaveAttribute('data-wrap', 'feature-label');
      }
    }

    const feature = within(mobileTable).getByRole('rowheader', {
      name: 'Contact / subscriber capture',
    });
    expect(feature).toHaveAttribute('scope', 'row');
    expect(feature).toHaveAttribute('data-wrap', 'feature-label');
    expect(feature.className).not.toMatch(
      /line-clamp|truncate|whitespace-nowrap/
    );

    expect(within(desktopTable).getByText('Free')).toBeInTheDocument();
    expect(
      within(desktopTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    expect(
      within(mobileTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    expect(within(desktopTable).getAllByText('Included')).toHaveLength(2);
    expect(within(mobileTable).getAllByText('Included')).toHaveLength(1);
    expect(desktopTable.querySelector('svg')).toBeNull();
    expect(mobileTable.querySelector('svg')).toBeNull();
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
    expect(within(mobileTable).getByText('$0')).toBeInTheDocument();
    expect(within(mobileTable).getByText('Up to 100')).toBeInTheDocument();
    expect(within(mobileTable).queryByText('/mo')).not.toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'unknown-plan' } });
    expect(selector).toHaveValue('free');
    expect(within(mobileTable).getByText('$0')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'pro' } });
    expect(selector).toHaveValue('pro');
    expect(
      within(mobileTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    expect(within(mobileTable).getByText('$199')).toBeInTheDocument();
    expect(within(mobileTable).getByText('/mo')).toBeInTheDocument();
    expect(within(mobileTable).getByText('Unlimited')).toBeInTheDocument();
  });
});
