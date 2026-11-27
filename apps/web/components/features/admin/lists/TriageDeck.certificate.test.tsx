import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TriageDeck } from './TriageDeck';

const member: ListMember = {
  creatorId: 'a',
  state: 'suggested',
  rating: null,
  favorite: false,
  source: 'suggestion',
  addedAt: '2026-10-04T03:00:00.000Z',
  suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
};
const creators = new Map<string, ListCreator>([
  ['a', { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null }],
]);

function setup(suggestions: readonly ListMember[], busy = false) {
  const onDecide = vi.fn();
  const view = render(
    <TooltipProvider>
      <TriageDeck
        suggestions={suggestions}
        creatorsById={creators}
        busy={busy}
        onDecide={onDecide}
      />
    </TooltipProvider>
  );
  return { onDecide, ...view };
}

describe('TriageDeck certificate', () => {
  it('renders a suggestion axe-clean and decides with the Add button', async () => {
    const { onDecide, container } = setup([member]);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(onDecide).toHaveBeenCalledWith([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
    ]);
  });

  it('ends on the all-decided message axe-clean', async () => {
    const { container } = setup([member]);
    await userEvent.click(screen.getByRole('button', { name: /Pass/ }));
    expect(screen.getByText(/All suggestions decided/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('is empty and axe-clean with no suggestions', async () => {
    const { container } = setup([]);
    expect(screen.getByText(/All suggestions decided/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('disables every decision while busy', async () => {
    const { container, onDecide } = setup([member], true);
    for (const name of [/Pass/, /Favorite/, /Add/]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await userEvent.keyboard('{ArrowRight}');
    expect(onDecide).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
