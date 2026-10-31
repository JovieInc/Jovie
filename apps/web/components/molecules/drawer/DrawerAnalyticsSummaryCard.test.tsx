import { Button } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerAnalyticsSummaryCard } from './DrawerAnalyticsSummaryCard';

const metrics = [
  { id: 'views', label: 'Views', value: '12.4k', hint: '+8% vs last week' },
  { id: 'clicks', label: 'Clicks', value: '3,204', hint: '+2% vs last week' },
];

describe('DrawerAnalyticsSummaryCard', () => {
  it('renders ready metrics', () => {
    render(
      <DrawerAnalyticsSummaryCard
        metrics={metrics}
        state='ready'
        testId='summary'
      />
    );
    expect(
      screen.getByTestId('drawer-analytics-metric-views')
    ).toHaveTextContent('12.4k');
  });

  it('shows the default error copy without dead-end wording', () => {
    render(<DrawerAnalyticsSummaryCard metrics={metrics} state='error' />);
    expect(screen.getByText("Couldn't load analytics")).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it('renders a caller-provided retry action in the error state', () => {
    const onRetry = vi.fn();
    render(
      <DrawerAnalyticsSummaryCard
        metrics={metrics}
        state='error'
        testId='summary'
        errorAction={
          <Button variant='ghost' size='sm' onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
