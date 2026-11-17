import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MetricsChartClient } from './MetricsChartClient';

const dynamicState = vi.hoisted(() => ({ loading: false }));
vi.mock('next/dynamic', () => ({
  default: (_loader: unknown, options: { loading: () => React.ReactNode }) =>
    function DynamicChart(props: {
      points?: AdminUsagePoint[];
      data?: unknown[];
    }) {
      if (dynamicState.loading) return options.loading();
      const count = props.points?.length ?? props.data?.length ?? 0;
      return <div data-testid='lazy-chart'>{count} points</div>;
    },
}));

const points = (values: number[]): AdminUsagePoint[] =>
  values.map((value, index) => ({ label: `Day ${index + 1}`, value }));

describe('MetricsChartClient', () => {
  beforeEach(() => {
    dynamicState.loading = false;
  });

  it('hands every point to the lazy chart', async () => {
    const { container } = render(
      <MetricsChartClient points={points([834, 902, 950])} />
    );

    expect(screen.getByTestId('lazy-chart')).toHaveTextContent('3 points');
    await expectNoA11yViolations(container);
  });

  it('shows a labelled chart skeleton and three stat placeholders while loading', async () => {
    dynamicState.loading = true;
    const { container } = render(
      <MetricsChartClient points={points([4, 8])} />
    );

    const status = screen.getByRole('status');
    expect(
      within(status).getByText('Loading Daily Active Users Chart')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-chart')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('passes empty, long and RTL data through unchanged', async () => {
    const { container, rerender } = render(<MetricsChartClient points={[]} />);
    expect(screen.getByTestId('lazy-chart')).toHaveTextContent('0 points');

    rerender(
      <div dir='rtl' lang='ar'>
        <MetricsChartClient
          points={points(Array.from({ length: 90 }, (_, i) => i * 1000))}
        />
      </div>
    );
    expect(screen.getByTestId('lazy-chart')).toHaveTextContent('90 points');
    await expectNoA11yViolations(container);
  });
});
