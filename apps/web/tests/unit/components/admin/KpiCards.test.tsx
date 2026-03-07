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
  it('renders all 5 YC-ready funnel metrics', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('Outreach Sent (7d)')).toBeInTheDocument();
    expect(screen.getByText('Claim Rate')).toBeInTheDocument();
    expect(screen.getByText('Signup Rate')).toBeInTheDocument();
    expect(screen.getByText('Paid Conversion')).toBeInTheDocument();
    expect(screen.getByText('MRR + Runway')).toBeInTheDocument();
  });

  it('displays correct outreach count', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('displays formatted percentages for rates', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    // Claim rate and paid conversion rate are both 20.0%
    const twentyPercents = screen.getAllByText('20.0%');
    expect(twentyPercents).toHaveLength(2);
    expect(screen.getByText('33.3%')).toBeInTheDocument(); // signup rate
  });

  it('displays MRR formatted as currency', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows dashes when rates are null (no data)', () => {
    const emptyMetrics: AdminFunnelMetrics = {
      ...defaultMetrics,
      outreachSent7d: 0,
      claimClicks7d: 0,
      claimRate: null,
      signups7d: 0,
      signupRate: null,
      paidConversions7d: 0,
      paidConversionRate: null,
    };

    render(<FunnelMetricsStrip metrics={emptyMetrics} />);

    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('shows dashes for MRR when stripe is unavailable', () => {
    const noStripeMetrics: AdminFunnelMetrics = {
      ...defaultMetrics,
      stripeAvailable: false,
      mrrUsd: 0,
    };

    render(<FunnelMetricsStrip metrics={noStripeMetrics} />);

    // MRR should show '--' and runway should show '--'
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render old vanity metrics', () => {
    render(<FunnelMetricsStrip metrics={defaultMetrics} />);

    expect(screen.queryByText('Balance')).not.toBeInTheDocument();
    expect(screen.queryByText('Burn rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Claimed creators')).not.toBeInTheDocument();
    expect(screen.queryByText('Waitlist')).not.toBeInTheDocument();
  });
});
