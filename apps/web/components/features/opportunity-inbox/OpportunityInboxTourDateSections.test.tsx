import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  OpportunityInboxConfirmedTourDates,
  OpportunityInboxRejectedTourDates,
} from './OpportunityInboxTourDateSections';

const ITEM: OpportunityInboxTourDateItem = {
  id: 'section-cert-1',
  title: 'The Troubadour, Los Angeles',
  startDate: '2026-11-05',
  startTime: '20:00',
  venueName: 'The Troubadour',
  location: 'Los Angeles, CA',
  providerLabel: 'Bandsintown',
  status: 'confirmed',
};

describe('OpportunityInboxTourDateSections certificate', () => {
  it('renders nothing for empty confirmed and rejected lists', () => {
    const { container } = render(
      <>
        <OpportunityInboxConfirmedTourDates items={[]} />
        <OpportunityInboxRejectedTourDates items={[]} onUndoReject={vi.fn()} />
      </>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists confirmed dates, including partial, long and Arabic text', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OpportunityInboxConfirmedTourDates
          items={[
            { ...ITEM, startTime: null, venueName: '', location: '' },
            {
              ...ITEM,
              id: 'section-cert-2',
              title:
                'Annual Midsummer Festival Of Independent Music, Main Stage, Late Night Set With Special Guests',
            },
            {
              ...ITEM,
              id: 'section-cert-3',
              title: 'حفل موسيقي في لوس أنجلوس',
            },
          ]}
        />
      </div>
    );

    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('حفل موسيقي في لوس أنجلوس')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('undoes a rejection and disables the pending one', async () => {
    const user = userEvent.setup();
    const onUndoReject = vi.fn();
    const items = [
      { ...ITEM, status: 'rejected' as const },
      { ...ITEM, id: 'section-cert-2', status: 'rejected' as const },
    ];
    const { container, rerender } = render(
      <OpportunityInboxRejectedTourDates
        items={items}
        onUndoReject={onUndoReject}
      />
    );

    await user.click(screen.getByText('Rejected Tour Dates (2)'));
    await user.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    expect(onUndoReject).toHaveBeenCalledWith('section-cert-1');
    await expectNoA11yViolations(container);

    rerender(
      <OpportunityInboxRejectedTourDates
        items={items}
        onUndoReject={onUndoReject}
        pendingUndoId='section-cert-1'
      />
    );
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
