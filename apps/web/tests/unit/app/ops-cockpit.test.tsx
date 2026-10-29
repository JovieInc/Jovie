import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudBottlenecksCard } from '@/components/features/admin/hud/HudBottlenecksCard';
import { HudCompanyMetricCards } from '@/components/features/admin/hud/HudCompanyMetricCards';
import { HudExceptionsStrip } from '@/components/features/admin/hud/HudExceptionsStrip';
import { HudShippingStrip } from '@/components/features/admin/hud/HudShippingStrip';
import { cockpitMetrics, cockpitShipping } from '@/tests/fixtures/hud-cockpit';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it('shows LogYourBody production as failing and how far behind main it is', () => {
    const view = {
      ...cockpitShipping,
      delivery: {
        ...cockpitShipping.delivery,
        lanes: {
          ...cockpitShipping.delivery.lanes,
          deployHealth: {
            observedAt: '2026-10-25T06:40:00.000Z',
            healthy: false,
            repos: [
              {
                repo: 'JovieInc/LogYourBody',
                status: 'failing' as const,
                failedStreak: 15,
                behindMain: 54,
                oldestUnshippedAgeSeconds: 140083,
                lastSuccessAt: '2026-10-23T16:03:00.000Z',
              },
            ],
          },
        },
      },
    };
    render(<HudShippingStrip view={view} />);

    expect(
      screen.getByTestId('hud-shipping-chip-lyb-behind')
    ).toHaveTextContent('Failing, 54 behind');
  });

  it('shows LogYourBody behind main as not measured until the feed publishes it', () => {
    render(<HudShippingStrip view={cockpitShipping} />);

    expect(
      screen.getByTestId('hud-shipping-chip-lyb-behind')
    ).toHaveTextContent('—');
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

describe('HudBottlenecksCard list semantics (JOV-8873)', () => {
  it('exposes ranked bottlenecks as list items', () => {
    render(
      <HudBottlenecksCard
        metrics={cockpitMetrics({
          deployments: {
            current: { status: 'failure', branch: 'main', url: null },
          },
        })}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveTextContent('Shipping pipeline is failing');
  });
});
