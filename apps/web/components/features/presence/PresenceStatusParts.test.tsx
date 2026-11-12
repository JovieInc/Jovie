import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PresenceSignalList, PresenceStatusBadge } from './PresenceStatusParts';

describe('PresenceStatusBadge', () => {
  // JOV-8964: warning-tone statuses render in the neutral design-system token
  // (the loud accent-orange read as an alarm) on every surface that shares the
  // badge.
  it('renders the warning status tone in the neutral token', () => {
    render(
      <TooltipProvider>
        <PresenceStatusBadge
          status={{
            label: 'Needs Review',
            nextAction: 'Review the flagged checks.',
            tone: 'warning',
            needsAttention: true,
            sortPriority: 2,
          }}
        />
      </TooltipProvider>
    );
    const badge = screen.getByText('Needs Review').parentElement;
    expect(badge).toHaveClass('text-secondary-token');
    expect(badge).not.toHaveClass('text-warning');
  });
});

describe('shared Presence status vocabulary', () => {
  it.each(['success', 'warning', 'error', 'neutral'] as const)(
    'shows the %s status and explains the next action',
    async tone => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <PresenceStatusBadge
            status={{
              label: 'Source status',
              tone,
              needsAttention: tone !== 'success',
              nextAction: 'Reconnect this source.',
              sortPriority: 1,
            }}
          />
        </TooltipProvider>
      );

      await user.hover(screen.getByText('Source status'));
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent('Reconnect this source.');
    }
  );

  // Raw mint (#3ffa8b) as text fails 4.5:1 on light surfaces; status copy
  // uses the derived AA-safe -text token (axe color-contrast).
  it('renders the success and error tones in the AA-safe -text tokens', () => {
    render(
      <TooltipProvider>
        <PresenceStatusBadge
          status={{
            label: 'Connected',
            tone: 'success',
            needsAttention: false,
            nextAction: 'All good.',
            sortPriority: 1,
          }}
        />
        <PresenceStatusBadge
          status={{
            label: 'Disconnected',
            tone: 'error',
            needsAttention: true,
            nextAction: 'Reconnect this source.',
            sortPriority: 2,
          }}
        />
      </TooltipProvider>
    );

    // The tone sits on the badge, beside the icon. The label is an inner span
    // that only carries layout classes, same as the warning assertion above.
    const connected = screen.getByText('Connected').parentElement;
    expect(connected).toHaveClass('text-success-text');
    expect(connected).not.toHaveClass('text-success');
    const disconnected = screen.getByText('Disconnected').parentElement;
    expect(disconnected).toHaveClass('text-error-text');
    expect(disconnected).not.toHaveClass('text-error');
  });

  it('does not invent evidence for an empty signal list', () => {
    render(<PresenceSignalList signals={[]} />);
    expect(screen.getByTestId('presence-signal-list')).toBeEmptyDOMElement();
  });
});
