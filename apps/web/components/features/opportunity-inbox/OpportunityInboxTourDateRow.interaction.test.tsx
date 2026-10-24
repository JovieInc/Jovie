import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  OpportunityInboxTourDateRow,
  type OpportunityInboxTourDateRowProps,
} from './OpportunityInboxTourDateRow';

const item = {
  id: 'tour-1',
  title: 'Detroit Show',
  startDate: '2026-11-01',
  startTime: null,
  venueName: 'Magic Stick',
  location: 'Detroit',
  providerLabel: 'Bandsintown',
  status: 'pending' as const,
};

function renderRow(overrides: Partial<OpportunityInboxTourDateRowProps> = {}) {
  const props = { item, onConfirm: vi.fn(), onReject: vi.fn(), ...overrides };
  const view = render(<OpportunityInboxTourDateRow {...props} />);
  return {
    ...props,
    rerenderRow: (next: Partial<OpportunityInboxTourDateRowProps>) =>
      view.rerender(<OpportunityInboxTourDateRow {...props} {...next} />),
  };
}

describe('OpportunityInboxTourDateRow interactions', () => {
  it('reveals a single reserved pair of distinct actions on row hover and keyboard focus', async () => {
    const user = userEvent.setup();
    const { onConfirm, onReject } = renderRow();
    const row = screen.getByRole('listitem');
    const confirm = screen.getByRole('button', { name: 'Confirm Tour Date' });
    const reject = screen.getByRole('button', { name: 'Reject Tour Date' });
    expect(row).toHaveClass('group');
    expect(row.querySelectorAll('[data-slot="hover-reveal"]')).toHaveLength(1);
    expect(confirm.parentElement).toBe(reject.parentElement);
    expect(confirm.parentElement).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'shrink-0',
      'motion-reduce:transition-none'
    );
    expect(confirm.parentElement).not.toHaveClass(
      'hidden',
      'invisible',
      'pointer-events-none'
    );
    expect(confirm).toHaveTextContent('✓');
    expect(reject).toHaveTextContent('×');
    await user.hover(row);
    await user.unhover(row);
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(item.id);
    await user.tab();
    expect(reject).toHaveFocus();
    await user.keyboard(' ');
    expect(onReject).toHaveBeenCalledExactlyOnceWith(item.id);
  });

  it('preserves touch confirmation and rejection and ignores swipes while busy', () => {
    const { onConfirm, onReject, rerenderRow } = renderRow();
    const surface = screen.getByRole('listitem').firstElementChild;
    if (!surface) throw new Error('Missing tour date surface');
    const swipe = (endX: number) => {
      fireEvent.touchStart(surface, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(surface, { changedTouches: [{ clientX: endX }] });
    };
    swipe(200);
    swipe(0);
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(item.id);
    expect(onReject).toHaveBeenCalledExactlyOnceWith(item.id);
    rerenderRow({ isBusy: true });
    swipe(200);
    swipe(0);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('retains disabled busy controls and the confirmed indicator, and removes rejected actions', async () => {
    const user = userEvent.setup();
    const { onConfirm, onReject, rerenderRow } = renderRow({ isBusy: true });
    const confirm = screen.getByRole('button', { name: 'Confirm Tour Date' });
    const reject = screen.getByRole('button', { name: 'Reject Tour Date' });
    await user.hover(screen.getByRole('listitem'));
    await user.unhover(screen.getByRole('listitem'));
    expect(confirm.parentElement).toHaveClass('opacity-100');
    expect(confirm).toBeDisabled();
    expect(reject).toBeDisabled();
    await user.click(confirm);
    await user.click(reject);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    rerenderRow({ item: { ...item, status: 'confirmed' }, isBusy: false });
    expect(screen.getByRole('button', { name: 'Confirmed' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Confirmed' }).parentElement
    ).toHaveClass('opacity-100');
    expect(
      screen.queryByRole('button', { name: 'Reject Tour Date' })
    ).not.toBeInTheDocument();
    rerenderRow({ item: { ...item, status: 'rejected' }, isBusy: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
