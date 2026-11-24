import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeLoopLatency } from './HomeLoopLatency';

const rows = [
  {
    id: 'remediation:classified',
    label: 'Remediation · Classified',
    p50: '54m',
    p95: '2.3d',
    samples: 126,
    regressed: true,
  },
  {
    id: 'shipping:ready',
    label: 'Shipping · Ready',
    p50: '3m',
    p95: '6.5h',
    samples: 571,
    regressed: false,
  },
];

describe('HomeLoopLatency', () => {
  it('lists stages with p50, p95 and runs, naming regressions in text', async () => {
    const { container } = render(
      <HomeLoopLatency
        rows={rows}
        otherRegressions={['Queue Wait']}
        coverage='14 of 31 stages measured'
      />
    );

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'compact');
    expect(table.style.getPropertyValue('--table-row-height')).toBe('40px');
    expect(within(table).getByText('Slowest stages by 7-day p95')).toBeTruthy();
    const tableRows = screen.getAllByTestId('home-loop-latency-row');
    expect(tableRows).toHaveLength(2);
    expect(within(tableRows[0]).getByText('Regressed')).toBeInTheDocument();
    expect(within(tableRows[0]).getByText('2.3d')).toHaveClass('text-warning');
    expect(within(tableRows[1]).queryByText('Regressed')).toBeNull();
    expect(within(tableRows[1]).getByText('571')).toBeInTheDocument();
    expect(screen.getByTestId('home-loop-latency')).toHaveTextContent(
      'Also regressed: Queue Wait · 14 of 31 stages measured'
    );
    await expectNoA11yViolations(container);
  });

  it('shows coverage alone when nothing else regressed', async () => {
    const { container } = render(
      <HomeLoopLatency
        rows={rows.slice(1)}
        coverage='1 of 31 stages measured'
      />
    );

    expect(screen.queryByText(/Also regressed/)).toBeNull();
    expect(screen.getByText('1 of 31 stages measured')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders no footer and no rows for an empty read', async () => {
    const { container } = render(<HomeLoopLatency rows={[]} coverage={null} />);

    expect(screen.queryAllByTestId('home-loop-latency-row')).toHaveLength(0);
    expect(
      screen.getByTestId('home-loop-latency').querySelector('p')
    ).toBeNull();
    await expectNoA11yViolations(container);
  });
});
