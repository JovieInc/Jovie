import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';

const ITEM: OpportunityInboxTourDateItem = {
  id: 'tour-date-cert-1',
  title: 'The Troubadour, Los Angeles',
  startDate: '2026-11-05',
  startTime: '20:00',
  venueName: 'The Troubadour',
  location: 'Los Angeles, CA',
  providerLabel: 'Bandsintown',
  status: 'pending',
};

function renderRow(
  item: OpportunityInboxTourDateItem,
  isBusy = false,
  dir?: 'rtl'
) {
  const onConfirm = vi.fn();
  const onReject = vi.fn();
  const view = render(
    <ul dir={dir} lang={dir ? 'ar' : undefined}>
      <OpportunityInboxTourDateRow
        item={item}
        onConfirm={onConfirm}
        onReject={onReject}
        isBusy={isBusy}
      />
    </ul>
  );
  return { ...view, onConfirm, onReject };
}

describe('OpportunityInboxTourDateRow certificate', () => {
  it('confirms and rejects a pending date and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onConfirm, onReject } = renderRow(ITEM);

    await user.click(screen.getByRole('button', { name: 'Confirm Tour Date' }));
    await user.click(screen.getByRole('button', { name: 'Reject Tour Date' }));

    expect(onConfirm).toHaveBeenCalledWith('tour-date-cert-1');
    expect(onReject).toHaveBeenCalledWith('tour-date-cert-1');
    await expectNoA11yViolations(container);
  });

  it('ignores decisions while busy', async () => {
    const user = userEvent.setup();
    const { container, onConfirm, onReject } = renderRow(ITEM, true);

    await user.click(screen.getByRole('button', { name: 'Confirm Tour Date' }));
    await user.click(screen.getByRole('button', { name: 'Reject Tour Date' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows a confirmed date without a confirm action', async () => {
    const user = userEvent.setup();
    const { container, onConfirm } = renderRow({
      ...ITEM,
      status: 'confirmed',
    });

    await user.click(screen.getByRole('button', { name: 'Confirmed' }));

    expect(onConfirm).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders a missing start time, long text and Arabic text', async () => {
    const partial = renderRow({ ...ITEM, startTime: null });
    expect(screen.getByText('The Troubadour, Los Angeles')).toBeVisible();
    await expectNoA11yViolations(partial.container);
    partial.unmount();

    const long = renderRow({
      ...ITEM,
      title:
        'Annual Midsummer Festival Of Independent Music, Main Stage, Late Night Set With Special Guests',
      venueName: 'The Grand Ballroom At The Historic Riverside Convention Hall',
    });
    expect(screen.getByText(/Annual Midsummer Festival/)).toBeVisible();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = renderRow(
      { ...ITEM, title: 'حفل موسيقي في لوس أنجلوس' },
      false,
      'rtl'
    );
    expect(screen.getByText('حفل موسيقي في لوس أنجلوس')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
