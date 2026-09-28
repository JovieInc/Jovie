import { describe, expect, it } from 'vitest';
import { shippingChartData } from './ShippingVelocityCanvas';

describe('ShippingVelocityCanvas', () => {
  const rows = [
    {
      date: '2026-09-01',
      merged: 2,
      opened: 4,
      closed: 1,
      mergeP50Hours: 3.5,
    },
    {
      date: '2026-09-02',
      merged: 0,
      opened: 1,
      closed: 0,
      mergeP50Hours: null,
    },
  ];

  it('maps daily buckets to labelled source series', () => {
    const chart = shippingChartData(rows, ['blue', 'purple', 'gray'], false);

    expect(chart.labels).toEqual(['2026-09-01', '2026-09-02']);
    expect(chart.datasets).toMatchObject([
      { label: 'Merged Pull Requests', data: [2, 0], borderColor: 'blue' },
      { label: 'Opened Pull Requests', data: [4, 1], borderColor: 'purple' },
      {
        label: 'Closed Without Merge',
        data: [1, 0],
        borderColor: 'gray',
        hidden: true,
      },
    ]);
  });

  it('shows closed pull requests only when requested', () => {
    expect(
      shippingChartData(rows, ['blue', 'purple', 'gray'], true).datasets[2]
    ).toMatchObject({ hidden: false });
  });
});
