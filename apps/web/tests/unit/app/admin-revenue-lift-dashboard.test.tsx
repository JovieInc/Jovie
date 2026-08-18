import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RevenueLiftDashboardView } from '@/app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView';
import type { RevenueLiftDashboardData } from '@/lib/metrics/revenue-lift-dashboard';

const source = {
  label: 'Revenue metrics',
  source: 'workflow_run_outcomes',
  fetchedAtIso: '2099-01-01T00:00:00.000Z',
  state: 'ok' as const,
  errorMessage: null,
};

const tile = {
  id: 'gmv-lift',
  tier: 'B' as const,
  label: 'Direct GMV Lift',
  valueLabel: '$125.00',
  signal: 'Settled revenue',
  vcInterpretation: 'Revenue attributed through automations.',
  source,
};

const DATA: RevenueLiftDashboardData = {
  generatedAtIso: source.fetchedAtIso,
  irpaa: null,
  irpaaPrior: null,
  irpaaSource: source,
  kpiTree: [{ ...tile, id: 'irpaa', tier: 'A', label: 'IRPAA' }, tile],
  interpretationTable: [tile],
  cohorts: {
    activeCount: 0,
    controlCount: 0,
    activeMedianLiftCents: null,
    controlMedianLiftCents: null,
    rows: [],
    source,
  },
  agents: [
    {
      agent: 'outreach',
      totalTasks: 8,
      successRate: 0.75,
      humanOverrideRate: 0.125,
      costPerOpportunityUsd: 1.5,
      totalCostUsd: 12,
    },
  ],
  agentsSource: source,
};

describe('RevenueLiftDashboardView', () => {
  it('uses canonical cards and table surfaces without changing metric copy', () => {
    render(<RevenueLiftDashboardView data={DATA} />);

    expect(screen.getByTestId('revenue-lift-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('revenue-lift-irpaa-hero')).toHaveClass(
      'rounded-xl',
      'border-(--app-shell-border)'
    );
    expect(screen.getByTestId('revenue-lift-kpi-gmv-lift')).toHaveClass(
      'rounded-lg',
      'border-(--app-shell-border)'
    );
    expect(screen.getAllByRole('table')).toHaveLength(3);
    expect(screen.getByTestId('revenue-lift-map-gmv-lift')).toHaveTextContent(
      'Revenue attributed through automations.'
    );
    expect(screen.getByTestId('revenue-lift-agent-outreach')).toHaveTextContent(
      '75.0%'
    );
  });

  it('preserves cohort empty-state and source trust labels', () => {
    render(<RevenueLiftDashboardView data={DATA} />);

    expect(
      screen.getByText(
        'No cohort rows yet. Artists are tagged when automation outcomes land.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Source: workflow_run_outcomes').length
    ).toBeGreaterThan(1);
  });
});
