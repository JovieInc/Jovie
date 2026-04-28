import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PerformanceCard } from './PerformanceCard';

describe('PerformanceCard', () => {
  it('renders the title and metric label', () => {
    render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{ '7d': [10, 12, 14, 16, 18, 20, 22] }}
        trend='up'
        delta={12}
      />
    );
    expect(screen.getByText('Smart link')).toBeInTheDocument();
    expect(screen.getByText('clicks')).toBeInTheDocument();
  });

  it('hides the range selector when only one range is supplied', () => {
    render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{ '7d': [10, 12, 14] }}
        trend='up'
        delta={5}
      />
    );
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders a tab for every supplied range', () => {
    render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{
          '7d': [1, 2],
          '30d': [3, 4],
          '90d': [5, 6],
        }}
        trend='flat'
        delta={0}
      />
    );
    expect(screen.getAllByRole('tab').length).toBe(3);
  });

  it('switches the active range when a tab is clicked', () => {
    render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{ '7d': [1, 2], '30d': [3, 4] }}
        trend='flat'
        delta={0}
        initialRange='7d'
      />
    );
    expect(
      screen.getByRole('tab', { name: '7d', selected: true })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '30d' }));
    expect(
      screen.getByRole('tab', { name: '30d', selected: true })
    ).toBeInTheDocument();
  });

  it('shows the down arrow when trend is down', () => {
    const { container } = render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{ '7d': [10, 8, 6] }}
        trend='down'
        delta={-15}
      />
    );
    // The delta block uses rose color for down
    expect(container.innerHTML).toContain('rose-300');
  });

  it('falls back to the first surfaced range when initialRange is missing', () => {
    render(
      <PerformanceCard
        title='Smart link'
        metricLabel='clicks'
        pointsByRange={{ '30d': [1, 2, 3], '90d': [4, 5, 6, 7] }}
        trend='up'
        delta={1}
        initialRange='7d'
      />
    );
    expect(
      screen.getByRole('tab', { name: '30d', selected: true })
    ).toBeInTheDocument();
  });
});
