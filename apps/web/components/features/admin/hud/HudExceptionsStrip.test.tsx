import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudExceptionsStrip } from './HudExceptionsStrip';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HudExceptionsStrip', () => {
  it('shows the nominal line when nothing needs attention', async () => {
    const { container } = render(
      <HudExceptionsStrip metrics={cockpitMetrics()} />
    );

    expect(screen.getByTestId('hud-exceptions')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(
      screen.getByText('No exceptions — systems nominal.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists each exception with its detail as the chip title', async () => {
    const { container } = render(
      <HudExceptionsStrip
        metrics={cockpitMetrics({
          operations: { status: 'degraded', dbLatencyMs: 240 },
          reliability: { unresolvedSentryIssues24h: 3, p95LatencyMs: 900 },
          gbrain: { status: 'down' },
        })}
      />
    );

    expect(
      screen.queryByText('No exceptions — systems nominal.')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Database is degraded')).toHaveAttribute(
      'title',
      'Latency 240ms'
    );
    expect(screen.getByText('3 unresolved errors in 24h')).toHaveAttribute(
      'title',
      'p95 900ms'
    );
    expect(screen.getByText('Company memory is down')).not.toHaveAttribute(
      'title'
    );
    await expectNoA11yViolations(container);
  });

  it('flags a source whose observation went stale', async () => {
    const { container } = render(
      <HudExceptionsStrip
        metrics={cockpitMetrics({
          sources: {
            stripe: {
              key: 'stripe',
              label: 'Stripe',
              state: 'ok',
              fetchedAtIso: '2026-08-28T12:00:00.000Z',
              errorMessage: null,
              dashboardUrl: null,
              configureUrl: null,
              nextStep: null,
            },
          },
        })}
      />
    );

    expect(screen.getByText('Stripe data is stale')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
