import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorSourcingRow } from './CreatorSourcingRow';

const creator: ListCreator = {
  id: 'a',
  username: 'ava',
  displayName: 'Ava',
  avatarUrl: null,
  genres: ['indie pop', 'dream pop'],
  spotifyFollowers: 25_000,
  location: 'Los Angeles, CA',
};

function member(overrides: Partial<ListMember> = {}): ListMember {
  return {
    creatorId: 'a',
    state: 'member',
    rating: 3,
    favorite: false,
    source: 'manual',
    addedAt: '2026-10-04T03:00:00.000Z',
    ...overrides,
  };
}

function renderRow(
  props: Partial<ComponentProps<typeof CreatorSourcingRow>> = {}
) {
  const handlers = {
    onRate: vi.fn(),
    onFavorite: vi.fn(),
    onRemove: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };
  const view = render(
    <ul>
      <CreatorSourcingRow
        creator={creator}
        member={member()}
        {...handlers}
        {...props}
      />
    </ul>
  );
  return { ...view, ...handlers };
}

describe('CreatorSourcingRow certificate', () => {
  it('rates, favorites and removes a member, axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onRate, onFavorite, onRemove } = renderRow({
      meta: 'From Summer openers',
    });

    expect(screen.getByTestId('creator-sourcing-row')).toHaveAttribute(
      'data-state',
      'member'
    );
    expect(screen.getByText('From Summer openers')).toBeInTheDocument();
    expect(
      screen.getByText('indie pop, dream pop · 10K-100K · Los Angeles')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Favorite Ava' }));
    expect(onFavorite).toHaveBeenCalledWith(true);

    await user.click(
      screen.getByRole('button', { name: 'Clear 3-star rating' })
    );
    expect(onRate).toHaveBeenCalledWith(null);

    await user.click(
      screen.getByRole('button', { name: 'Remove Ava from the list' })
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('unfavorites a favorite and hides Remove without a handler', async () => {
    const user = userEvent.setup();
    const { onFavorite } = renderRow({
      member: member({ favorite: true }),
      onRemove: undefined,
    });

    await user.click(
      screen.getByRole('button', { name: 'Remove Ava from favorites' })
    );
    expect(onFavorite).toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole('button', { name: 'Remove Ava from the list' })
    ).toBeNull();
  });

  it('adds or skips a suggestion and shows the top reason, axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onAccept, onReject } = renderRow({
      member: member({
        state: 'suggested',
        rating: null,
        suggestionReasons: ['Shares indie pop with 2 of 2 picks', 'Nearby'],
      }),
    });

    expect(
      screen.getByText('Shares indie pop with 2 of 2 picks')
    ).toBeInTheDocument();
    expect(screen.queryByText('Nearby')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Favorite Ava' })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Add Ava to the list' })
    );
    expect(onAccept).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Skip Ava' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('disables every control while busy, axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onFavorite, onRemove } = renderRow({ busy: true });

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    await user.click(screen.getByRole('button', { name: 'Favorite Ava' }));
    await user.click(
      screen.getByRole('button', { name: 'Remove Ava from the list' })
    );
    expect(onFavorite).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('falls back for a missing profile and a nameless creator, axe-clean', async () => {
    const first = renderRow({ creator: undefined });
    expect(screen.getByText('Unknown creator')).toBeInTheDocument();
    expect(screen.getByText('Profile no longer available')).toBeInTheDocument();
    await expectNoA11yViolations(first.container);
    first.unmount();

    renderRow({ creator: { ...creator, displayName: '  ' } });
    expect(screen.getByText('@ava')).toBeInTheDocument();
  });
});
