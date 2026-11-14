import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TriageDeck } from './TriageDeck';

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

function suggestion(creatorId: string, reasons?: string[]): ListMember {
  return {
    creatorId,
    state: 'suggested',
    rating: null,
    favorite: false,
    source: 'suggestion',
    addedAt: '2026-10-04T03:00:00.000Z',
    suggestionReasons: reasons,
  };
}

const CREATORS = new Map<string, ListCreator>([
  [
    'a',
    {
      id: 'a',
      username: 'ava',
      displayName: 'Ava',
      avatarUrl: null,
      genres: ['indie pop'],
    },
  ],
  ['b', { id: 'b', username: 'bo', displayName: 'Bo', avatarUrl: null }],
  [
    'long',
    {
      id: 'long',
      username: 'aurelia',
      displayName: LONG_NAME,
      avatarUrl: null,
    },
  ],
  [
    'rtl',
    { id: 'rtl', username: 'layla', displayName: 'ليلى', avatarUrl: null },
  ],
]);

function renderDeck(
  props: Partial<React.ComponentProps<typeof TriageDeck>> = {},
  dir?: 'rtl'
) {
  const onDecide = vi.fn();
  const result = render(
    <TooltipProvider>
      <div dir={dir}>
        <TriageDeck
          suggestions={[
            suggestion('a', ['Shares indie pop with 2 of 2 picks']),
            suggestion('b'),
          ]}
          creatorsById={CREATORS}
          busy={false}
          onDecide={onDecide}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
  return { ...result, onDecide };
}

describe('TriageDeck certificate states', () => {
  it('says what to do next when there is nothing to decide', async () => {
    const { container } = renderDeck({ suggestions: [] });
    expect(
      screen.getByText(
        'All suggestions decided. Use Suggest More to keep training this list.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('adds, passes and favorites from the visible buttons', async () => {
    const user = userEvent.setup();
    const { container, onDecide } = renderDeck({
      suggestions: [suggestion('a'), suggestion('b'), suggestion('long')],
    });
    expect(
      screen.getByRole('region', { name: 'Triage suggestions: Ava' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'b', direction: 'left' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Favorite' }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'long', direction: 'right' },
      { type: 'favorite', creatorId: 'long', favorite: true },
    ]);
    expect(onDecide).toHaveBeenCalledTimes(3);
  });

  it('adds with a rating from the stars and from a number key', async () => {
    const user = userEvent.setup();
    const { onDecide } = renderDeck();

    await user.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
      { type: 'rate', creatorId: 'a', rating: 4 },
    ]);
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    await user.keyboard('2');
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'b', direction: 'right' },
      { type: 'rate', creatorId: 'b', rating: 2 },
    ]);
  });

  it('disables every control and ignores shortcuts while busy', async () => {
    const user = userEvent.setup();
    const { container, onDecide } = renderDeck({ busy: true });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    await user.keyboard('{ArrowRight}');
    expect(onDecide).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('truncates a long name and lists every reason', async () => {
    const reasons = [
      'Shares indie pop, chamber pop and dream pop with 9 of 10 picks on this list',
      'Released a single in the last 30 days with a label you already favorited',
    ];
    const { container } = renderDeck({
      suggestions: [suggestion('long', reasons)],
    });
    expect(screen.getByRole('heading', { name: LONG_NAME })).toHaveClass(
      'truncate'
    );
    const why = screen.getByRole('list', {
      name: 'Why Jovie Suggested This Creator',
    });
    expect(
      within(why)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(reasons);
    await expectNoA11yViolations(container);
  });

  it('falls back to a placeholder when the creator is gone', () => {
    renderDeck({ suggestions: [suggestion('missing')] });
    expect(
      screen.getByRole('heading', { name: 'Unknown creator' })
    ).toBeInTheDocument();
    expect(screen.getByText('Profile no longer available')).toBeInTheDocument();
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = renderDeck(
      { suggestions: [suggestion('rtl')] },
      'rtl'
    );
    expect(screen.getByRole('heading', { name: 'ليلى' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
