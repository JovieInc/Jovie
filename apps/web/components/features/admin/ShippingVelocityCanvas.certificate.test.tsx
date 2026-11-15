import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ShippingVelocityCanvas } from './ShippingVelocityCanvas';

type ChartConfig = {
  data: { datasets: { borderWidth?: number; hidden?: boolean }[] };
  options: {
    onClick: (event: unknown, elements: { datasetIndex: number }[]) => void;
  };
};

const charts = vi.hoisted(
  () => [] as { config: ChartConfig; destroy: () => void }[]
);
vi.mock('chart.js', () => {
  class Chart {
    static register() {}
    config: ChartConfig;
    destroy = vi.fn();
    constructor(_canvas: unknown, config: ChartConfig) {
      this.config = config;
      charts.push(this);
    }
  }
  return {
    Chart,
    CategoryScale: {},
    Legend: {},
    LinearScale: {},
    LineController: {},
    LineElement: {},
    PointElement: {},
    Tooltip: {},
  };
});

const rows = [
  { date: '2026-09-01', merged: 2, opened: 4, closed: 1, mergeP50Hours: 3.5 },
  { date: '2026-09-02', merged: 0, opened: 1, closed: 0, mergeP50Hours: null },
];

function renderCanvas(overrides: { spotlight?: string | null } = {}) {
  const onLineClick = vi.fn();
  const onChartClick = vi.fn();
  const view = render(
    <ShippingVelocityCanvas
      data={rows}
      spotlight={overrides.spotlight ?? null}
      showClosed={false}
      onLineClick={onLineClick}
      onChartClick={onChartClick}
    />
  );
  return { ...view, onLineClick, onChartClick };
}

const latest = () => {
  const chart = charts.at(-1);
  if (!chart) throw new Error('no chart drawn');
  return chart;
};

describe('ShippingVelocityCanvas certificate', () => {
  beforeEach(() => {
    charts.length = 0;
  });

  it('routes a click on a line to that series and a blank click to the chart', () => {
    const { onLineClick, onChartClick } = renderCanvas();
    const { onClick } = latest().config.options;

    onClick({}, [{ datasetIndex: 1 }]);
    expect(onLineClick).toHaveBeenCalledWith('opened');
    onClick({}, [{ datasetIndex: 2 }]);
    expect(onLineClick).toHaveBeenLastCalledWith('closed');
    onClick({}, []);
    expect(onChartClick).toHaveBeenCalledOnce();
  });

  it('thickens only the spotlit series and destroys the chart on unmount', () => {
    const { unmount } = renderCanvas({ spotlight: 'merged' });
    const chart = latest();

    expect(
      chart.config.data.datasets.map(series => series.borderWidth)
    ).toEqual([2, 1, 1]);
    expect(chart.config.data.datasets[2]?.hidden).toBe(true);
    unmount();
    expect(chart.destroy).toHaveBeenCalled();
  });

  it('opens the accessible daily data table from the disclosure', async () => {
    const user = userEvent.setup();
    const { container } = renderCanvas();

    expect(
      screen.getByRole('img', {
        name: 'Daily GitHub Pull Request Counts. Full Data Follows.',
      })
    ).toBeInTheDocument();
    await user.click(screen.getByText('View daily data and lead time'));
    expect(container.querySelector('details')).toHaveAttribute('open');

    const table = screen.getByRole('table');
    const [, first, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('2026-09-01');
    expect(first).toHaveTextContent('3.5');
    expect(second).toHaveTextContent('UNKNOWN');
    await expectNoA11yViolations(container);
  });

  it('keeps empty and RTL tables axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ShippingVelocityCanvas
          data={[]}
          spotlight={null}
          showClosed
          onLineClick={vi.fn()}
          onChartClick={vi.fn()}
        />
      </div>
    );

    expect(screen.getAllByRole('row', { hidden: true })).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
