import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { CreatorSourcingRow, creatorFacts } from './CreatorSourcingRow';

const CREATOR: ListCreator = {
  id: 'a',
  username: 'ava',
  displayName: 'Ava',
  avatarUrl: null,
  genres: ['indie pop', 'dream pop', 'shoegaze'],
  spotifyFollowers: 25_000,
  location: 'Los Angeles, CA',
};

function member(overrides: Partial<ListMember> = {}): ListMember {
  return {
    creatorId: 'a',
    state: 'member',
    rating: 3,
    favorite: true,
    source: 'manual',
    addedAt: '2026-10-04T03:00:00.000Z',
    ...overrides,
  };
}

function renderRow(m: ListMember, handlers: Record<string, () => void> = {}) {
  return render(
    <ul>
      <CreatorSourcingRow
        creator={CREATOR}
        member={m}
        onRate={vi.fn()}
        onFavorite={handlers.onFavorite ?? vi.fn()}
        onAccept={handlers.onAccept}
        onReject={handlers.onReject}
      />
    </ul>
  );
}

describe('CreatorSourcingRow', () => {
  it('summarizes ingestion facts with the learner follower tiers', () => {
    expect(creatorFacts(CREATOR)).toBe(
      'indie pop, dream pop · 10K-100K · Los Angeles'
    );
    expect(creatorFacts(undefined)).toBe('Profile no longer available');
  });

  it('shows rating and a pressed favorite for members', () => {
    const onFavorite = vi.fn();
    renderRow(member(), { onFavorite });
    expect(
      screen.getByRole('button', { name: 'Clear 3-star rating' })
    ).toHaveAttribute('aria-pressed', 'true');
    const favorite = screen.getByRole('button', {
      name: 'Remove Ava from favorites',
    });
    expect(favorite).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(favorite);
    expect(onFavorite).toHaveBeenCalled();
  });

  it('shows the top WHY and Add/Skip for suggestions, no rating', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderRow(
      member({
        state: 'suggested',
        rating: null,
        favorite: false,
        suggestionReasons: [
          'Shares indie pop with 4 of 5 picks',
          'Based in los angeles',
        ],
      }),
      { onAccept, onReject }
    );
    expect(
      screen.getByText('Shares indie pop with 4 of 5 picks')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('star-rating')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Ava to the list' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip Ava' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
