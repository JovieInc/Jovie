import { render, screen } from '@testing-library/react';
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
  });
});
