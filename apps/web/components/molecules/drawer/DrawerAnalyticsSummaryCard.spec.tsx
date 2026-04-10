import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerAnalyticsSummaryCard } from './DrawerAnalyticsSummaryCard';

describe('DrawerAnalyticsSummaryCard', () => {
  it('renders large metrics and an optional footer', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          {
            id: 'profile-views',
            label: 'Profile views',
            value: '120',
            hint: 'Visitors',
          },
          {
            id: 'link-clicks',
            label: 'Link clicks',
            value: '42',
            hint: 'Outbound',
          },
        ]}
        state='ready'
        footer={<button type='button'>Last 30 days</button>}
      />
    );

    expect(screen.getByText('Profile views')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-analytics-metric-profile-views')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-analytics-metric-value-profile-views')
    ).toHaveTextContent('120');
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toBeVisible();
  });

  it('renders an error message when analytics are unavailable', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[]}
        state='error'
        errorMessage='No data yet.'
      />
    );

    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });

  it('renders loading placeholders while data is pending', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '0' },
          { id: 'link-clicks', label: 'Link clicks', value: '0' },
        ]}
        state='loading'
        testId='analytics-card'
      />
    );

    expect(screen.getByTestId('analytics-card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      screen.getByRole('status', { name: 'Loading analytics' })
    ).toBeInTheDocument();
  });

  it('marks the whole card busy when dimmed content includes a footer', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { id: 'profile-views', label: 'Profile views', value: '120' },
        ]}
        state='ready'
        dimmed={true}
        footer={<button type='button'>Last 30 days</button>}
        testId='analytics-card'
      />
    );

    expect(screen.getByTestId('analytics-card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
