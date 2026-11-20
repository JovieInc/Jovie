import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { HudMetrics } from '@/types/hud';
import { HudCashMrrBand } from './HudCashMrrBand';
import storyMeta from './HudCashMrrBand.stories';

const healthy = storyMeta.args.metrics;

function degraded(): HudMetrics {
  return {
    ...healthy,
    overview: {
      ...healthy.overview,
      defaultStatus: 'unknown',
      defaultStatusDetail: 'Mercury transaction window timed out.',
      financialDataAvailable: false,
      runwayMonths: null,
    },
    sources: {
      ...healthy.sources,
      mercury: { ...healthy.sources.mercury, state: 'degraded' },
    },
  };
}

describe('HudCashMrrBand certificate', () => {
  it('renders healthy company numbers axe-clean', async () => {
    const { container } = render(
      <HudCashMrrBand
        metrics={healthy}
        mrrValueClass='text-3xl'
        runwayValueClass='text-2xl'
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText('Company Now')).toBeInTheDocument();
    expect(screen.getByText('Alive')).toHaveClass('text-3xl');
    await expectNoA11yViolations(container);
  });

  it('retries degraded financial telemetry by keyboard and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <HudCashMrrBand
        metrics={degraded()}
        mrrValueClass='text-3xl'
        runwayValueClass='text-2xl'
        onRetry={onRetry}
      />
    );
    const retry = screen.getByRole('button', { name: /Retry/i });
    retry.focus();
    await user.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <HudCashMrrBand
          metrics={healthy}
          mrrValueClass='text-3xl'
          runwayValueClass='text-2xl'
          onRetry={vi.fn()}
        />
      </div>
    );
    expect(screen.getByTestId('ovie-ceo-overview')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
