import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { HudMetrics } from '@/types/hud';
import { HudSystemHealthStrip } from './HudSystemHealthStrip';

function metrics({
  ledgerValid = true,
  withinRetryBudget = true,
  running = 2,
  gbrain = 'ok' as 'ok' | 'down' | 'unknown',
  version = '0.42.0' as string | null,
} = {}): HudMetrics {
  return {
    gbrain: { status: gbrain, version, checkedAtIso: null },
    deployments: { availability: 'not_configured', current: null, recent: [] },
    testing: {
      quarantine: {
        activeCount: 1200,
        isValid: ledgerValid,
        withinRetryBudget,
      },
    },
    aiOps: { counts: { running } },
  } as unknown as HudMetrics;
}

describe('HudSystemHealthStrip', () => {
  it('renders the four healthy entries inside a labelled card, axe-clean', async () => {
    const { container } = render(<HudSystemHealthStrip metrics={metrics()} />);

    const strip = screen.getByTestId('hud-system-health-strip');
    expect(strip).toHaveAttribute('aria-label', 'System Health');
    expect(within(strip).getByText('System health')).toBeInTheDocument();
    for (const name of ['gbrain', 'CI', 'Ledger', 'Jobs']) {
      expect(within(strip).getByText(name)).toBeInTheDocument();
    }
    expect(within(strip).getByText('OK · v0.42.0')).toBeInTheDocument();
    expect(
      within(strip).getByText('Valid | 1,200 quarantined')
    ).toBeInTheDocument();
    expect(within(strip).getByText('2 running')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports a down gbrain, an invalid ledger and idle jobs, axe-clean', async () => {
    const { container } = render(
      <HudSystemHealthStrip
        metrics={metrics({ ledgerValid: false, running: 0, gbrain: 'down' })}
      />
    );

    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText('0 running')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows No Signal for an unreadable gbrain and OK without a version', () => {
    const { rerender } = render(
      <HudSystemHealthStrip metrics={metrics({ gbrain: 'unknown' })} />
    );
    expect(screen.getByText('No Signal')).toBeInTheDocument();

    rerender(<HudSystemHealthStrip metrics={metrics({ version: null })} />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders as a labelled region in page presentation, axe-clean', async () => {
    const { container } = render(
      <HudSystemHealthStrip metrics={metrics()} presentation='page' />
    );

    const region = screen.getByRole('region', { name: 'System Health' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveAttribute('data-testid', 'hud-system-health-strip');
    await expectNoA11yViolations(container);
  });
});
