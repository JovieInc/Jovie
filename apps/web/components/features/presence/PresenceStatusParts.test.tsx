import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresenceStatusBadge } from './PresenceStatusParts';

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
