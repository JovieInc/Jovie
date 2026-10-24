import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RevenueLiftDashboardView } from '@/app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView';
import { presentCreatorOutcomeDashboard } from '@/lib/metrics/creator-outcomes';
import type { RevenueLiftDashboardData } from '@/lib/metrics/revenue-lift-dashboard';

const OBSERVED_AT = '2026-10-21T15:04:00.000Z';

function source(state: 'ok' | 'no_data') {
  return {
    label: 'IRPAA',
    source: 'getRolling30DayIRPAA',
    fetchedAtIso: OBSERVED_AT,
    state,
    errorMessage: null,
  } as const;
}

function noDataDashboard(): RevenueLiftDashboardData {
  return {
    generatedAtIso: OBSERVED_AT,
    irpaa: null,
    irpaaPrior: null,
    irpaaSource: source('no_data'),
    creatorOutcomes: presentCreatorOutcomeDashboard({
      verifiedGmvCents: null,
      verifiedTipsCents: null,
      causalStatus: 'inconclusive',
    }),
    kpiTree: [],
    interpretationTable: [],
    cohorts: {
      activeCount: 0,
      controlCount: 0,
      activeMedianLiftCents: null,
      controlMedianLiftCents: null,
      activeMedianVerifiedMoneyLiftCents: null,
      controlMedianVerifiedMoneyLiftCents: null,
      rows: [],
      source: source('no_data'),
    },
    agents: [],
    agentsSource: source('no_data'),
  };
}

describe('RevenueLiftDashboardView measurement honesty', () => {
  it('shows No data instead of a measured $0.00 or a baseline-less delta', () => {
    render(<RevenueLiftDashboardView data={noDataDashboard()} />);

    const hero = screen.getByTestId('revenue-lift-irpaa-hero');
    expect(hero).toHaveTextContent('No data');
    expect(hero).not.toHaveTextContent('$0.00');
    expect(hero).not.toHaveTextContent('vs prior 30d');

    const money = screen.getByTestId('revenue-lift-verified-money');
    expect(money).toHaveTextContent('Unmeasured');
    expect(money).not.toHaveTextContent('$0.00');
  });

  it('shows the actual observed timestamp, not a relative "just now"', () => {
    render(<RevenueLiftDashboardView data={noDataDashboard()} />);

    expect(screen.queryByText(/Generated just now/)).not.toBeInTheDocument();
    const times = document.querySelectorAll(`time[datetime="${OBSERVED_AT}"]`);
    expect(times.length).toBeGreaterThan(0);
    expect(times[times.length - 1]).toHaveTextContent('Oct 21, 2026');
  });
});
