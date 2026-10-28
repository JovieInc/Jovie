import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistRankedQueuePanel } from './WaitlistRankedQueuePanel';

const capacity = { dailyLimit: 10, usedToday: 4, autoAcceptEnabled: true };

describe('WaitlistRankedQueuePanel', () => {
  it('shows spend order, the score components and the hold reason', () => {
    render(
      <WaitlistRankedQueuePanel
        queue={{
          capacity,
          rows: [
            {
              entryId: 'a',
              artistName: 'Mid Artist',
              status: 'waitlisted',
              waitlistedAt: null,
              score: 61.4,
              components: {
                identity: 30,
                audience: 19.4,
                catalog: 0,
                intent: 12,
              },
              unmeasured: ['catalog'],
              followers: 3200,
              holdReason: 'hold_outranked',
            },
          ],
        }}
      />
    );
    expect(screen.getByText(/6 of 10 slots left today/)).toBeTruthy();
    expect(screen.getByText('61.4')).toBeTruthy();
    expect(screen.getByText(/identity 30, audience 19.4/)).toBeTruthy();
    expect(screen.getByText(/not measured: catalog/)).toBeTruthy();
    expect(screen.getByText(/Outranked today/)).toBeTruthy();
  });

  it('says so when auto-accept is off, the queue is empty or unreadable', () => {
    const { rerender } = render(
      <WaitlistRankedQueuePanel
        queue={{
          capacity: { ...capacity, autoAcceptEnabled: false },
          rows: [],
        }}
      />
    );
    expect(screen.getByText(/Auto-accept is off/)).toBeTruthy();
    expect(screen.getByText('Nobody is waiting.')).toBeTruthy();
    rerender(<WaitlistRankedQueuePanel queue={null} />);
    expect(screen.getByText('The queue could not be read.')).toBeTruthy();
  });
});
