import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  PresenceSignalList,
  PresenceStatusBadge,
} from '@/components/features/presence/PresenceStatusParts';

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

  it('does not invent evidence for an empty signal list', () => {
    render(<PresenceSignalList signals={[]} />);
    expect(screen.getByTestId('presence-signal-list')).toBeEmptyDOMElement();
  });
});
