import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { StarRating } from './StarRating';
import { decisionForKey, TriageDeck, triageActions } from './TriageDeck';

const NOW = '2026-10-04T03:00:00.000Z';

function suggestion(creatorId: string): ListMember {
  return {
    creatorId,
    state: 'suggested',
    rating: null,
    favorite: false,
    source: 'suggestion',
    addedAt: NOW,
    suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
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
]);

function renderDeck(onDecide = vi.fn()) {
  render(
    <TooltipProvider>
      <TriageDeck
        suggestions={[suggestion('a'), suggestion('b')]}
        creatorsById={CREATORS}
        busy={false}
        onDecide={onDecide}
      />
      <input aria-label='Elsewhere' />
    </TooltipProvider>
  );
  return onDecide;
}

describe('triage swipe → label flow', () => {
  it('maps each decision to label-producing list actions', () => {
    expect(triageActions('a', 'pass')).toEqual([
      { type: 'swipe', creatorId: 'a', direction: 'left' },
    ]);
    expect(triageActions('a', 'add')).toEqual([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
    ]);
    expect(triageActions('a', 'favorite')).toEqual([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
      { type: 'favorite', creatorId: 'a', favorite: true },
    ]);
    expect(triageActions('a', { rating: 4 })).toEqual([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
      { type: 'rate', creatorId: 'a', rating: 4 },
    ]);
  });

  it('maps only the documented keys', () => {
    expect(decisionForKey('ArrowLeft')).toBe('pass');
    expect(decisionForKey('ArrowRight')).toBe('add');
    expect(decisionForKey('ArrowUp')).toBe('favorite');
    expect(decisionForKey('3')).toEqual({ rating: 3 });
    expect(decisionForKey('6')).toBeNull();
    expect(decisionForKey('a')).toBeNull();
  });

  it('shows why, decides by keyboard and advances with progress', () => {
    const onDecide = renderDeck();
    expect(screen.getByText('Ava')).toBeInTheDocument();
    expect(
      screen.getByText('Shares indie pop with 2 of 2 picks')
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'a', direction: 'right' },
    ]);
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('keeps the visible buttons equivalent to the shortcuts', () => {
    const onDecide = renderDeck();
    fireEvent.click(screen.getByRole('button', { name: /Pass/ }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'a', direction: 'left' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Favorite/ }));
    expect(onDecide).toHaveBeenLastCalledWith([
      { type: 'swipe', creatorId: 'b', direction: 'right' },
      { type: 'favorite', creatorId: 'b', favorite: true },
    ]);
    expect(screen.getByText(/All suggestions decided/)).toBeInTheDocument();
  });

  it('never steals keys from text fields or modifier shortcuts', () => {
    const onDecide = renderDeck();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Elsewhere' }), {
      key: 'ArrowLeft',
    });
    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true });
    expect(onDecide).not.toHaveBeenCalled();
  });
});

describe('StarRating', () => {
  it('rates, and choosing the current rating clears it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StarRating value={null} onChange={onChange} label='Rating for Ava' />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    rerender(
      <StarRating value={4} onChange={onChange} label='Rating for Ava' />
    );
    const current = screen.getByRole('button', { name: 'Clear 4-star rating' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(current);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
