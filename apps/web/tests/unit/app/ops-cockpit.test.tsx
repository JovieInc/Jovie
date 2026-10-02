import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudBottlenecksCard } from '@/components/features/admin/hud/HudBottlenecksCard';
import { HudCompanyMetricCards } from '@/components/features/admin/hud/HudCompanyMetricCards';
import { HudExceptionsStrip } from '@/components/features/admin/hud/HudExceptionsStrip';
import { HudShippingStrip } from '@/components/features/admin/hud/HudShippingStrip';
import { cockpitMetrics, cockpitShipping } from '@/tests/fixtures/hud-cockpit';

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-28T12:00:00.000Z'));
});
afterEach(() => vi.restoreAllMocks());

describe('Ops cockpit sections', () => {
  it('renders the four compact company metric cards', () => {
    render(
      <HudCompanyMetricCards
        metrics={cockpitMetrics()}
        shipping={cockpitShipping}
      />
    );

    expect(screen.getByTestId('hud-company-metrics')).toBeInTheDocument();
    expect(
      screen.getByTestId('ovie-core-metric-company-survival')
    ).toBeInTheDocument();
    expect(screen.getByTestId('hud-metric-shipping')).toBeInTheDocument();
    expect(screen.getByTestId('hud-metric-blockers')).toBeInTheDocument();
  });

  it('renders the shipping strip with queue, CI, and merge rate chips', () => {
    render(<HudShippingStrip view={cockpitShipping} />);

    expect(screen.getByTestId('hud-shipping-strip')).toBeInTheDocument();
    expect(screen.getByTestId('hud-shipping-chip-ci')).toHaveTextContent(
      'Green'
    );
    expect(
      screen.getByRole('link', { name: /open shipping/i })
    ).toHaveAttribute('href', expect.stringContaining('shipping'));
  });

  it('renders a nominal exceptions strip when nothing needs attention', () => {
    render(<HudExceptionsStrip metrics={cockpitMetrics()} />);

    expect(screen.getByTestId('hud-exceptions')).toHaveTextContent(
      'No exceptions'
    );
  });

  it('lists exceptions in plain language when systems degrade', () => {
    render(
      <HudExceptionsStrip
        metrics={cockpitMetrics({
          operations: { status: 'degraded', dbLatencyMs: 240 },
        })}
      />
    );

    expect(screen.getByTestId('hud-exceptions')).toHaveTextContent(
      'Database is degraded'
    );
  });

  it('shows the empty state when no bottlenecks constrain the company', () => {
    render(<HudBottlenecksCard metrics={cockpitMetrics()} />);

    expect(screen.getByTestId('hud-bottlenecks')).toHaveTextContent(
      'No bottlenecks detected'
    );
  });

  it('ranks a failed deploy as the top bottleneck', () => {
    render(
      <HudBottlenecksCard
        metrics={cockpitMetrics({
          deployments: {
            current: { status: 'failure', branch: 'main', url: null },
          },
        })}
      />
    );

    expect(screen.getByTestId('hud-bottlenecks')).toHaveTextContent(
      'Shipping pipeline is failing'
    );
  });
});
