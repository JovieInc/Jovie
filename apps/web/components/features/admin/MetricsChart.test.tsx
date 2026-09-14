import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { MetricsChart } from './MetricsChart';
import { MetricsChartClient } from './MetricsChartClient';

const dynamicState = vi.hoisted(() => ({ loading: false }));
vi.mock('next/dynamic', () => ({
  default: (_loader: unknown, options: { loading: () => React.ReactNode }) =>
    function DynamicChart({ data }: { data?: unknown[] }) {
      return dynamicState.loading ? (
        options.loading()
      ) : (
        <div data-testid='usage-plot'>{JSON.stringify(data)}</div>
      );
    },
}));

const points = (values: number[]): AdminUsagePoint[] =>
  values.map((value, index) => ({ label: `Day ${index + 1}`, value }));

describe('MetricsChart consumer states', () => {
  beforeEach(() => {
    dynamicState.loading = false;
  });

  it.each([
    [[10, 20], '+100.0%', '15', '20'],
    [[20, 10], '-50.0%', '15', '20'],
    [[0, 0], '+0.0%', '0', '0'],
  ])(
    'renders truthful delta, average and peak for %j',
    (values, delta, average, peak) => {
      render(<MetricsChart points={points(values as number[])} />);
      expect(
        screen.getByText(/Daily active users changed/).parentElement
      ).toHaveTextContent(delta as string);
      expect(screen.getByText('Average DAU').parentElement).toHaveTextContent(
        average as string
      );
      expect(screen.getByText('Peak Day').parentElement).toHaveTextContent(
        peak as string
      );
    }
  );

  it('distinguishes missing observations from observed zero activity', () => {
    const { rerender } = render(<MetricsChart points={[]} />);
    expect(screen.getByTestId('admin-usage-chart-empty')).toHaveClass('h-64');
    expect(screen.getByRole('status')).toHaveTextContent('No usage data');
    expect(screen.getByTestId('admin-usage-chart-summary')).toHaveClass(
      'invisible'
    );
    expect(screen.getByTestId('admin-usage-chart-summary')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    rerender(<MetricsChart points={points([0])} />);
    expect(screen.queryByText('No usage data')).not.toBeInTheDocument();
    expect(screen.getByText('Current DAU').parentElement).toHaveTextContent(
      '0'
    );
  });

  it('reserves the chart height during the inner lazy load', () => {
    dynamicState.loading = true;
    render(<MetricsChart points={points([4, 8])} />);
    expect(screen.getByTestId('admin-usage-chart-loading')).toHaveClass('h-64');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Current DAU')).toBeInTheDocument();
  });

  it('renders a chart and three stat placeholders during the outer lazy load', () => {
    dynamicState.loading = true;
    render(<MetricsChartClient points={points([4, 8])} />);
    expect(
      within(screen.getByRole('status')).getByText(
        'Loading Daily Active Users Chart'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('h-64');
  });
});
