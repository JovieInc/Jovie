import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkAnalyticsPanel } from './LinkAnalyticsPanel';

const numberFormatter = new Intl.NumberFormat();

describe('LinkAnalyticsPanel', () => {
  it('renders the shipped analytics panel from a fixed click fixture', () => {
    render(<LinkAnalyticsPanel />);

    const panel = screen.getByTestId('release-smart-link-analytics');
    expect(panel).toBeVisible();
    expect(panel).toHaveAttribute('data-variant', 'flat');
    expect(screen.getByText('Total Clicks')).toBeVisible();
    expect(
      screen.getByTestId('drawer-analytics-metric-value-total-clicks')
    ).toHaveTextContent(numberFormatter.format(1842));
    expect(screen.getByText('Top: Spotify')).toBeVisible();
    expect(screen.getByText('Last Click')).toBeVisible();
    expect(
      screen.getByText(`${numberFormatter.format(126)} in last 7 days`)
    ).toBeVisible();
    expect(screen.getByTestId('release-smart-link-control')).toHaveTextContent(
      'northline/harbor'
    );
    expect(screen.queryByText(/fans/i)).toBeNull();
    expect(
      screen.getByTestId('drawer-analytics-metric-value-last-click')
    ).toHaveTextContent('Oct 23, 2026');
  });

  it('changes the demo time series and total together without fetching customer data', () => {
    render(<LinkAnalyticsPanel />);
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('img', {
        name: 'Clicks over time: 126 clicks in 7 days',
      })
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByRole('img', {
        name: 'Clicks over time: 1842 clicks in 30 days',
      })
    ).toBeVisible();
    expect(screen.getByText('1,842 clicks in 30 days')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(
      screen.getByRole('img', {
        name: 'Clicks over time: 126 clicks in 7 days',
      })
    ).toBeVisible();
  });
});
