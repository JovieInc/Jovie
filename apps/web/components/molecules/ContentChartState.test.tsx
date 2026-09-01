import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentChartSkeleton, ContentChartState } from './ContentChartState';

describe('ContentChartState', () => {
  it('renders a stable chart loading frame with a named status', () => {
    render(
      <ContentChartSkeleton
        label='Loading revenue chart'
        heightClassName='h-50'
        testId='chart-loading'
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveClass('h-50', 'bg-surface-0');
    expect(screen.getByTestId('chart-loading')).toBe(status);
    expect(screen.getByText('Loading revenue chart')).toHaveClass('sr-only');
  });

  it('keeps empty chart copy inside the same stable frame', () => {
    render(
      <ContentChartState
        state='empty'
        title='No usage data'
        message='No usage data available yet.'
        testId='chart-empty'
      />
    );

    expect(screen.getByTestId('chart-empty')).toHaveClass(
      'h-64',
      'bg-surface-0'
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByText('No usage data')).toBeInTheDocument();
    expect(
      screen.getByText('No usage data available yet.')
    ).toBeInTheDocument();
  });

  it('renders error chart copy with an alert and recovery action slot', () => {
    render(
      <ContentChartState
        state='error'
        title='Chart unavailable'
        message='Could not load metrics.'
        action={<button type='button'>Retry</button>}
        testId='chart-error'
      />
    );

    expect(screen.getByTestId('chart-error')).toHaveClass('h-64');
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'error');
    expect(
      screen.getByRole('button', { name: 'Retry' })
    ).toBeInTheDocument();
  });
});
