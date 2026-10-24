import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityRow } from './OpportunityRow';

const props = {
  id: 'opportunity-1',
  state: 'new' as const,
  title: 'Review An Opportunity',
  metadata: 'Promoter matched your audience.',
};

describe('OpportunityRow interactions', () => {
  it('reserves one action slot and reveals both distinct actions on hover or keyboard focus', async () => {
    const user = userEvent.setup();
    const actions = { onPrimaryAction: vi.fn(), onDismiss: vi.fn() };
    const { onPrimaryAction, onDismiss } = actions;
    render(<OpportunityRow {...props} {...actions} />);
    const row = screen.getByRole('listitem');
    const primary = screen.getByRole('button', { name: 'Plan Opportunity' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss Opportunity' });
    const slot = primary.parentElement;
    expect(row).toHaveClass('group');
    expect(row.querySelectorAll('[data-slot="hover-reveal"]')).toHaveLength(1);
    expect(slot).toBe(dismiss.parentElement);
    expect(slot).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      'shrink-0',
      'motion-reduce:transition-none'
    );
    expect(slot).not.toHaveClass('hidden', 'invisible', 'pointer-events-none');
    expect(primary).toHaveTextContent('→');
    expect(dismiss).toHaveTextContent('×');
    await user.hover(row);
    await user.unhover(row);
    expect(primary.parentElement).toBe(slot);
    await user.tab();
    expect(primary).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPrimaryAction).toHaveBeenCalledExactlyOnceWith(props.id);
    await user.tab();
    expect(dismiss).toHaveFocus();
    await user.keyboard(' ');
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(props.id);
  });

  it('keeps busy actions visible after pointer exit and blocks duplicate submissions, including swipes', async () => {
    const user = userEvent.setup();
    const actions = { onPrimaryAction: vi.fn(), onDismiss: vi.fn() };
    const { onPrimaryAction, onDismiss } = actions;
    const { rerender } = render(
      <OpportunityRow {...props} {...actions} isBusy />
    );
    const row = screen.getByRole('listitem');
    const primary = screen.getByRole('button', { name: 'Plan Opportunity' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss Opportunity' });
    await user.hover(row);
    await user.unhover(row);
    expect(primary.parentElement).toHaveClass('opacity-100');
    expect(primary).toBeDisabled();
    expect(dismiss).toBeDisabled();
    await user.click(primary);
    await user.click(dismiss);
    const surface = row.firstElementChild;
    expect(surface).not.toBeNull();
    if (!surface) throw new Error('Missing row surface');
    fireEvent.touchStart(surface, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchStart(surface, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 0 }] });
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    rerender(<OpportunityRow {...props} {...actions} />);
    expect(primary.parentElement).toHaveClass('opacity-0');
    await user.click(primary);
    expect(onPrimaryAction).toHaveBeenCalledExactlyOnceWith(props.id);
  });

  it('preserves explicit approval labels and persistent accepted indicators', () => {
    const { rerender } = render(
      <OpportunityRow {...props} primaryActionLabel='Approve Buyer' />
    );
    expect(
      screen.getByRole('button', { name: 'Approve Buyer' }).parentElement
    ).toHaveClass('opacity-100');
    rerender(<OpportunityRow {...props} state='accepted' />);
    expect(
      screen.getByRole('button', { name: 'Planned' }).parentElement
    ).toHaveClass('opacity-100');
    expect(
      screen.queryByRole('button', { name: 'Dismiss Opportunity' })
    ).not.toBeInTheDocument();
    rerender(<OpportunityRow {...props} state='rejected' />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<OpportunityRow {...props} state='reported' />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
