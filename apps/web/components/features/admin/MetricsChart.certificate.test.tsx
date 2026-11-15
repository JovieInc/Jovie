import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MetricsChart } from './MetricsChart';

const dynamicState = vi.hoisted(() => ({ loading: false }));
vi.mock('next/dynamic', () => ({
  default: (_loader: unknown, options: { loading: () => React.ReactNode }) =>
    function DynamicChart({ data }: { data?: unknown[] }) {
      return dynamicState.loading ? (
        options.loading()
      ) : (
        <div data-testid='usage-plot'>{data?.length ?? 0} points</div>
      );
    },
}));

const points = (values: number[]): AdminUsagePoint[] =>
  values.map((value, index) => ({ label: `Day ${index + 1}`, value }));

describe('MetricsChart certificate', () => {
  beforeEach(() => {
    dynamicState.loading = false;
  });

  it('keeps the populated chart axe-clean', async () => {
    const { container } = render(<MetricsChart points={points([834, 902])} />);

    expect(screen.getByTestId('usage-plot')).toHaveTextContent('2 points');
    expect(
      screen.getByText(/Daily active users changed/).parentElement
    ).toHaveTextContent('+8.2%');
    await expectNoA11yViolations(container);
  });

  it('keeps the empty state axe-clean', async () => {
    const { container } = render(<MetricsChart points={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent('No usage data');
    expect(screen.queryByTestId('usage-plot')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the loading skeleton axe-clean', async () => {
    dynamicState.loading = true;
    const { container } = render(<MetricsChart points={points([4, 8])} />);

    expect(screen.getByTestId('admin-usage-chart-loading')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps ninety days of large counts axe-clean in RTL', async () => {
    const long = Array.from({ length: 90 }, (_, i) => 1_000_000 + i * 12_345);
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MetricsChart points={points(long)} />
      </div>
    );

    expect(screen.getByTestId('usage-plot')).toHaveTextContent('90 points');
    expect(screen.getByText('Peak Day').parentElement).toHaveTextContent(
      (2_098_705).toLocaleString()
    );
    await expectNoA11yViolations(container);
  });
});
