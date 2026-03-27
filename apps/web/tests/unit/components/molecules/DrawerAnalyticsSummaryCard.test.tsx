import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerAnalyticsSummaryCard } from '@/components/molecules/drawer';

describe('DrawerAnalyticsSummaryCard', () => {
  it('renders large metrics and an optional footer', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { label: 'Profile views', value: '120', hint: 'Visitors' },
          { label: 'Link clicks', value: '42', hint: 'Outbound' },
        ]}
        state='ready'
        footer={<button type='button'>Last 30 days</button>}
      />
    );

    expect(screen.getByText('Profile views')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
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
    const { container } = render(
      <DrawerAnalyticsSummaryCard
        metrics={[
          { label: 'Profile views', value: '0' },
          { label: 'Link clicks', value: '0' },
        ]}
        state='loading'
      />
    );

    expect(container.querySelectorAll('.skeleton')).toHaveLength(6);
  });
});
