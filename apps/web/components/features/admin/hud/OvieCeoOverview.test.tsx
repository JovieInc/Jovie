import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { HudMetrics } from '@/types/hud';
import { OvieCeoOverview } from './OvieCeoOverview';

function buildMetrics(stripeState = 'ok'): HudMetrics {
  const now = new Date().toISOString();
  const source = (key: string, label: string, state: string) => ({
    key,
    label,
    state,
    fetchedAtIso: now,
    errorMessage: null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
  });
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
      stripe: source('stripe', 'Stripe', stripeState),
      mercury: source('mercury', 'Mercury', 'ok'),
    },
    aiOps: { counts: { blocked: 0, failed: 0 } },
    generatedAtIso: now,
  } as unknown as HudMetrics;
}

describe('OvieCeoOverview certificate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the company metrics axe-clean', async () => {
    const { container } = render(<OvieCeoOverview metrics={buildMetrics()} />);
    expect(screen.getByTestId('ovie-ceo-overview')).toBeVisible();
    expect(screen.getByText('Company Now')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('forwards Retry for a stale visible metric', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T18:00:00.000Z'));
    const onRetry = vi.fn();
    const at = '2026-08-22T18:00:00.000Z';
    const base = buildMetrics();
    const metrics = {
      ...base,
      generatedAtIso: at,
      sources: {
        ...base.sources,
        stripe: { ...base.sources.stripe, fetchedAtIso: at },
        mercury: { ...base.sources.mercury, fetchedAtIso: at },
      },
    } as HudMetrics;
    render(<OvieCeoOverview metrics={metrics} onRetry={onRetry} />);
    act(() => {
      vi.advanceTimersByTime(6 * 60 * 1000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits Retry when no handler is provided', () => {
    render(<OvieCeoOverview metrics={buildMetrics('unavailable')} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('hides unmeasured tiles and surfaces syncing copy', () => {
    render(<OvieCeoOverview metrics={buildMetrics('unavailable')} />);
    expect(screen.getByTestId('ovie-ceo-syncing')).toBeVisible();
    expect(screen.queryByText('Not Measured')).toBeNull();
  });
});
