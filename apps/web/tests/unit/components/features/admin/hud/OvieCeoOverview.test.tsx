import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieCeoOverview } from '@/components/features/admin/hud/OvieCeoOverview';
import type { HudMetrics } from '@/types/hud';

function buildMetrics(): HudMetrics {
  return {
    overview: {
      mrrUsd: 5200,
      activeSubscribers: 42,
      balanceUsd: 100_000,
      burnRateUsd: 30_000,
      runwayMonths: 4,
      defaultStatus: 'alive',
      defaultStatusDetail: 'Runway covers the profitability horizon.',
      financialDataAvailable: true,
    },
    sources: {
      stripe: {
        key: 'stripe',
        label: 'Stripe',
        state: 'ok',
        fetchedAtIso: new Date().toISOString(),
        errorMessage: null,
        dashboardUrl: 'https://dashboard.stripe.com/',
        configureUrl: null,
        nextStep: null,
      },
      mercury: {
        key: 'mercury',
        label: 'Mercury',
        state: 'ok',
        fetchedAtIso: new Date().toISOString(),
        errorMessage: null,
        dashboardUrl: 'https://app.mercury.com/',
        configureUrl: null,
        nextStep: null,
      },
    },
    aiOps: {
      counts: {
        blocked: 1,
        failed: 1,
      },
    },
    generatedAtIso: new Date().toISOString(),
  } as HudMetrics;
}

describe('OvieCeoOverview', () => {
  it('renders exactly three scan-first metrics with provenance and drill-downs', () => {
    render(<OvieCeoOverview metrics={buildMetrics()} />);

    expect(screen.getByTestId('ovie-ceo-overview')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^ovie-core-metric-/)).toHaveLength(3);
    expect(screen.getByText('Alive')).toBeInTheDocument();
    expect(screen.getAllByText('Not Measured')).toHaveLength(2);
    expect(screen.getAllByText('Summer')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: /Inspect Revenue Source/i })
    ).toHaveAttribute('href', 'https://dashboard.stripe.com/');
    expect(
      screen.getByRole('link', { name: /Inspect Customers/i })
    ).toHaveAttribute('href', '/app/ov/people');
    expect(
      screen.getByRole('link', { name: /Inspect Releases/i })
    ).toHaveAttribute('href', '/app/ov/releases');
  });

  it('reserves the same three rows when financial telemetry degrades', () => {
    const metrics = buildMetrics();
    const { rerender } = render(<OvieCeoOverview metrics={metrics} />);

    metrics.overview = {
      ...metrics.overview,
      burnRateUsd: 0,
      runwayMonths: null,
      defaultStatus: 'unknown',
      financialDataAvailable: false,
      defaultStatusDetail: 'Mercury transaction window timed out.',
    };
    metrics.sources.mercury = {
      ...metrics.sources.mercury,
      state: 'degraded',
    };
    rerender(<OvieCeoOverview metrics={metrics} />);

    const rows = screen.getAllByTestId(/^ovie-core-metric-/);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.className).toContain('min-h-32');
    }
    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveAttribute('data-state', 'degraded');
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
