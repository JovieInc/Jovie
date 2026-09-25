import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartState = vi.hoisted(() => ({
  instances: [] as Array<{
    readonly destroy: ReturnType<typeof vi.fn>;
    readonly config: unknown;
  }>,
  register: vi.fn(),
}));

const FakeChart = vi.hoisted(() => {
  class ChartMock {
    static register = chartState.register;
    readonly destroy = vi.fn();

    constructor(
      _canvas: unknown,
      readonly config: unknown
    ) {
      chartState.instances.push({ destroy: this.destroy, config });
    }
  }

  return ChartMock;
});

vi.mock('chart.js', () => ({
  CategoryScale: {},
  Chart: FakeChart,
  Legend: {},
  LineController: {},
  LineElement: {},
  LinearScale: {},
  PointElement: {},
  Tooltip: {},
}));

import { ShippingVelocityCanvas } from '@/components/features/admin/ShippingVelocityCanvas';

const DATA = [
  {
    date: '2026-09-01',
    merged: 2,
    opened: 4,
    closed: 1,
    mergeP50Hours: 3.5,
  },
];

describe('ShippingVelocityCanvas lifecycle', () => {
  beforeEach(() => {
    chartState.instances.length = 0;
    chartState.register.mockClear();
    document.documentElement.className = '';
    const fontStyle = document.createElement('style');
    fontStyle.textContent = 'canvas { font-family: Inter, sans-serif; }';
    document.head.append(fontStyle);
    document.documentElement.style.cssText =
      'font-family: Inter, sans-serif; --color-accent-blue: rgb(30, 64, 175); --color-accent-purple: rgb(126, 34, 206); --color-accent-gray: rgb(75, 85, 99); --color-text-secondary-token: rgb(55, 65, 81); --color-border-subtle: rgb(209, 213, 219);';
  });

  it('mounts responsively, exposes the data table, and rebuilds on theme changes', async () => {
    const onLineClick = vi.fn();
    const onChartClick = vi.fn();
    const { unmount } = render(
      <ShippingVelocityCanvas
        data={DATA}
        spotlight={null}
        showClosed={false}
        onLineClick={onLineClick}
        onChartClick={onChartClick}
      />
    );

    await waitFor(() => expect(chartState.instances).toHaveLength(1));
    const config = chartState.instances[0]?.config as {
      options?: {
        animation?: boolean;
        font?: { family?: string };
        onClick?: (
          event: unknown,
          elements: Array<{ datasetIndex: number }>
        ) => void;
        responsive?: boolean;
      };
    };
    expect(config.options).toMatchObject({
      animation: false,
      font: { family: 'Inter, sans-serif' },
      responsive: true,
    });
    config.options?.onClick?.({}, []);
    expect(onChartClick).toHaveBeenCalledTimes(1);
    config.options?.onClick?.({}, [{ datasetIndex: 0 }]);
    expect(onLineClick).toHaveBeenCalledWith('merged');
    expect(
      screen.getByRole('img', {
        name: 'Daily GitHub Pull Request Counts. Full Data Follows.',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent(
      'Median hours to merge'
    );
    expect(
      screen.getByText('View daily data and lead time')
    ).toBeInTheDocument();

    act(() => {
      document.documentElement.classList.add('dark');
    });

    await waitFor(() => expect(chartState.instances).toHaveLength(2));
    expect(chartState.instances[0]?.destroy).toHaveBeenCalledTimes(1);

    unmount();
    expect(chartState.instances[1]?.destroy).toHaveBeenCalledTimes(1);
  });
});
