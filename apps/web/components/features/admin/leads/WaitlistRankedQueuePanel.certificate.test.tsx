import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RankedQueue } from '@/lib/waitlist/ranked-queue';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistRankedQueuePanel } from './WaitlistRankedQueuePanel';

const capacity = { dailyLimit: 10, usedToday: 4, autoAcceptEnabled: true };

const row: RankedQueue['rows'][number] = {
  entryId: 'a',
  artistName: 'Mid Artist',
  status: 'waitlisted',
  waitlistedAt: null,
  score: 61.4,
  components: { identity: 30, audience: 19.4, catalog: 0, intent: 12 },
  unmeasured: ['catalog'],
  followers: 3200,
  holdReason: 'hold_capacity_full',
};

describe('WaitlistRankedQueuePanel certificate', () => {
  it('renders an ordered queue with scored and unscored rows, axe-clean', async () => {
    const { container } = render(
      <WaitlistRankedQueuePanel
        queue={{
          capacity,
          rows: [
            row,
            {
              ...row,
              entryId: 'b',
              artistName: null,
              score: null,
              components: null,
              unmeasured: [],
              holdReason: 'hold_brand_new_reason',
            },
          ],
        }}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Admission Queue' })
    ).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('Mid Artist');
    expect(items[0]).toHaveTextContent(
      'identity 30, audience 19.4, catalog 0, intent 12 (not measured: catalog). Daily budget used'
    );
    expect(items[1]).toHaveTextContent('Unnamed artist');
    expect(items[1]).toHaveTextContent('unscored');
    expect(items[1]).toHaveTextContent(
      'queued before scoring. hold_brand_new_reason'
    );
    await expectNoA11yViolations(container);
  });

  it('never shows negative slots and is axe-clean when empty', async () => {
    const { container } = render(
      <WaitlistRankedQueuePanel
        queue={{
          capacity: { dailyLimit: 5, usedToday: 9, autoAcceptEnabled: true },
          rows: [],
        }}
      />
    );

    expect(screen.getByText(/^0 of 5 slots left today/)).toBeInTheDocument();
    expect(screen.getByText('Nobody is waiting.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when the queue is unreadable', async () => {
    const { container } = render(<WaitlistRankedQueuePanel queue={null} />);

    expect(
      screen.getByText('The queue could not be read.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/slots left today/)).toBeNull();
    await expectNoA11yViolations(container);
  });
});
