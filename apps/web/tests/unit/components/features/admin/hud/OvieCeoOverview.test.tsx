import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders exactly three scan-first metrics with provenance and drill-downs', () => {
    render(<OvieCeoOverview metrics={buildMetrics()} />);

    expect(screen.getByTestId('ovie-ceo-overview')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^ovie-core-metric-/)).toHaveLength(3);
    expect(screen.getByText('Alive')).toBeInTheDocument();
    expect(screen.getAllByText('Not Measured')).toHaveLength(2);
    expect(screen.getAllByText('Summer')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: /Inspect Stripe/i })
    ).toHaveAttribute('href', 'https://dashboard.stripe.com/');
    expect(
      screen.getByRole('link', { name: /Inspect Customers/i })
    ).toHaveAttribute('href', '/app/ov/people');
    expect(
      screen.getByRole('link', { name: /Inspect Releases/i })
    ).toHaveAttribute('href', '/app/ov/releases');
  });

  it('reserves fixed rows when financial telemetry degrades', () => {
    const metrics = buildMetrics();
    const onRetry = vi.fn();
    const { rerender } = render(
      <OvieCeoOverview metrics={metrics} onRetry={onRetry} />
    );

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
    rerender(<OvieCeoOverview metrics={metrics} onRetry={onRetry} />);

    const rows = screen.getAllByTestId(/^ovie-core-metric-/);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.className).toContain('h-72');
      expect(row.className).toContain('lg:h-40');
    }
    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveAttribute('data-state', 'degraded');
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Inspect Mercury/i })
    ).toHaveAttribute('href', 'https://app.mercury.com/');
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('preserves presentation-specific value density classes', () => {
    render(
      <OvieCeoOverview
        metrics={buildMetrics()}
        primaryValueClassName='text-7xl'
        secondaryValueClassName='text-4xl'
      />
    );

    expect(screen.getByText('Alive')).toHaveClass('text-7xl');
    for (const value of screen.getAllByText('Not Measured')) {
      expect(value).toHaveClass('text-4xl');
    }
  });

  it('ages retained metrics from fresh to stale on the live client clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T18:00:00.000Z'));
    const metrics = buildMetrics();
    render(<OvieCeoOverview metrics={metrics} onRetry={() => {}} />);

    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveAttribute('data-state', 'fresh');

    act(() => {
      vi.advanceTimersByTime(6 * 60 * 1000);
    });

    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveAttribute('data-state', 'stale');
  });

  it('does not flash fresh polled sources as unknown before the clock effect runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T18:00:00.000Z'));
    const metrics = buildMetrics();
    const { rerender } = render(<OvieCeoOverview metrics={metrics} />);

    const nextObservedAt = '2026-08-22T18:00:30.000Z';
    metrics.generatedAtIso = nextObservedAt;
    metrics.sources.stripe = {
      ...metrics.sources.stripe,
      fetchedAtIso: nextObservedAt,
    };
    metrics.sources.mercury = {
      ...metrics.sources.mercury,
      fetchedAtIso: nextObservedAt,
    };
    rerender(<OvieCeoOverview metrics={metrics} />);

    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toHaveAttribute('data-state', 'fresh');
  });
});
