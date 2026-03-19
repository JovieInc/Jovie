import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FunnelMetricsStrip } from '@/features/admin/FunnelMetricsStrip';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

const defaultMetrics: AdminFunnelMetrics = {
  outreachSent7d: 150,
  claimClicks7d: 30,
  claimRate: 0.2,
  signups7d: 10,
  signupRate: 0.333,
  paidConversions7d: 2,
  paidConversionRate: 0.2,
  mrrUsd: 500,
  arrUsd: 6000,
  payingCustomers: 12,
  runwayMonths: null,
  defaultAliveDate: null,
  wowGrowthRate: null,
  momGrowthRate: 0.25,
  churnRate: null,
  retention30d: null,
  retention60d: null,
  retention90d: null,
  engagementActiveProfiles30d: null,
  cacUsd: null,
  ltvUsd: null,
  paybackPeriodMonths: null,
  stripeAvailable: true,
  errors: [],
  outreachToSignupRate: 0.067,
  signupToPaidRate: 0.2,
  dollarPerOutreach: 0.003,
  magicMomentRate: 0.75,
  magicMomentCount: 15,
  enrichmentFailureRate: 0.1,
};

describe('FunnelMetricsStrip', () => {
  it('renders growth KPI metrics', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('MRR')).toBeInTheDocument();
    expect(screen.getByText('ARR')).toBeInTheDocument();
    expect(screen.getByText('Runway')).toBeInTheDocument();
    expect(screen.getByText('Paying customers')).toBeInTheDocument();
    expect(screen.getByText('YC metrics')).toBeInTheDocument();
  });

  it('displays paying customer count', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('displays growth rates summary', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('WoW — · MoM 25.0%')).toBeInTheDocument();
  });

  it('displays MRR formatted as currency', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows dashes when stripe is unavailable', () => {
    const noStripeMetrics: AdminFunnelMetrics = {
      ...defaultMetrics,
      stripeAvailable: false,
      mrrUsd: 0,
    };

    render(<FunnelMetricsStrip metrics={noStripeMetrics} />);

    // MRR and Runway both show fallback placeholders
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows actionable message when runway cannot be calculated (no balance data)', () => {
    const noBalanceMetrics: AdminFunnelMetrics = {
      ...defaultMetrics,
      mrrUsd: 39,
      runwayMonths: 0,
    };

    render(<FunnelMetricsStrip metrics={noBalanceMetrics} />);

    expect(screen.getByText('No balance')).toBeInTheDocument();
    expect(
      screen.getByText('Add bank balance to calculate')
    ).toBeInTheDocument();
  });

  it('shows infinite runway when revenue covers burn', () => {
    const infiniteRunwayMetrics: AdminFunnelMetrics = {
      ...defaultMetrics,
      mrrUsd: 6000,
      runwayMonths: null,
    };

    render(<FunnelMetricsStrip metrics={infiniteRunwayMetrics} />);

    expect(screen.getByText('Infinite')).toBeInTheDocument();
    expect(screen.getByText('Revenue covers burn')).toBeInTheDocument();
  });

  it('does not render old vanity metrics', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.queryByText('Balance')).not.toBeInTheDocument();
    expect(screen.queryByText('Burn rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Claimed creators')).not.toBeInTheDocument();
    expect(screen.queryByText('Waitlist')).not.toBeInTheDocument();
  });
});
