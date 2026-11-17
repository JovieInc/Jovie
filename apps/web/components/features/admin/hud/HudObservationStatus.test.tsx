import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  HUD_OBSERVATION_LABELS,
  HUD_OBSERVATION_STATES,
} from '@/lib/hud/observation';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudObservationStatus } from './HudObservationStatus';

describe('HudObservationStatus', () => {
  it.each(HUD_OBSERVATION_STATES)(
    'renders the %s state with its label, axe-clean',
    async state => {
      const { container } = render(
        <HudObservationStatus
          state={state}
          message={`Message for ${state}`}
          freshnessLabel='Updated 2m ago'
          onRetry={vi.fn()}
        />
      );

      const root = screen.getByTestId('hud-observation-status');
      expect(root).toHaveAttribute('data-state', state);
      expect(
        screen.getByText(HUD_OBSERVATION_LABELS[state])
      ).toBeInTheDocument();
      expect(screen.getByText(`Message for ${state}`)).toBeInTheDocument();
      expect(root).toHaveTextContent('· Updated 2m ago');
      const retryShown = state === 'unavailable' || state === 'stale';
      expect(screen.queryAllByRole('button', { name: 'Retry' })).toHaveLength(
        retryShown ? 1 : 0
      );
      await expectNoA11yViolations(container);
    }
  );

  it('calls onRetry once when Retry is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <HudObservationStatus
        state='unavailable'
        message='Source down'
        onRetry={onRetry}
        testId='velocity-status'
      />
    );

    await user.click(screen.getByTestId('velocity-status-retry'));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits Retry and the freshness label when neither is given', async () => {
    const { container } = render(
      <HudObservationStatus state='stale' message='Old numbers' />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('hud-observation-status')).not.toHaveTextContent(
      '·'
    );
    await expectNoA11yViolations(container);
  });
});
