import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistGateFunnel } from './WaitlistGateFunnel';

describe('WaitlistGateFunnel', () => {
  it('shows submissions by role and invite conversion per stage', () => {
    render(
      <WaitlistGateFunnel
        funnel={{
          byRole: [
            { role: 'artist', count: 12 },
            { role: 'manager', count: 3 },
            { role: 'label', count: 1 },
            { role: 'producer_songwriter', count: 4 },
            { role: 'other', count: 0 },
          ],
          invite: {
            sent: 10,
            opened: 8,
            accountCreated: 6,
            goldenPathEntered: 5,
            goldenPathCompleted: 2,
          },
          p50HoursSentToGoldenPath: 30,
        }}
      />
    );

    expect(screen.getByText('Producer/Songwriter')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Golden Path Entered')).toBeInTheDocument();
    expect(screen.getByText('50% of sent')).toBeInTheDocument();
    expect(screen.getByText('30.0h')).toBeInTheDocument();
  });

  it('shows a dash for latency before any invitee converts', () => {
    render(
      <WaitlistGateFunnel
        funnel={{
          byRole: [],
          invite: {
            sent: 0,
            opened: 0,
            accountCreated: 0,
            goldenPathEntered: 0,
            goldenPathCompleted: 0,
          },
          p50HoursSentToGoldenPath: null,
        }}
      />
    );
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.queryByText(/of sent/)).toBeNull();
  });
});
