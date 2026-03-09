import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FunnelMetricsStrip } from '@/components/admin/FunnelMetricsStrip';
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
  runwayMonths: null,
  stripeAvailable: true,
  errors: [],
};

describe('FunnelMetricsStrip', () => {
  it('renders growth KPI metrics', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('Signups (7d)')).toBeInTheDocument();
    expect(screen.getByText('Paid Conversions (7d)')).toBeInTheDocument();
    expect(screen.getByText('MRR')).toBeInTheDocument();
    expect(screen.getByText('Runway')).toBeInTheDocument();
  });

  it('displays correct signups count', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays paid conversion rate in subtitle', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('20.0% of signups')).toBeInTheDocument();
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

    // MRR and Runway both show '--'
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('does not render outreach funnel metrics (moved to pipeline card)', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.queryByText('Outreach Sent (7d)')).not.toBeInTheDocument();
    expect(screen.queryByText('Claim Rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Signup Rate')).not.toBeInTheDocument();
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
