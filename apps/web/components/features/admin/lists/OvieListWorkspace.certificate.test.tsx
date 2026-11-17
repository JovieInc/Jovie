import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListDetail } from '@/lib/ovie/lists/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  search: {} as Record<string, unknown>,
  searchQuery: vi.fn(),
  mutate: vi.fn(),
  actionsPending: false,
  suggest: vi.fn(),
  suggestPending: false,
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { info: mocks.info, error: mocks.error },
}));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'That change did not save. Try again.',
  useOvieListDetailQuery: () => mocks.detail,
  useOvieListActionsMutation: () => ({
    mutate: mocks.mutate,
    isPending: mocks.actionsPending,
  }),
  useSuggestOvieListMutation: () => ({
    mutate: mocks.suggest,
    isPending: mocks.suggestPending,
  }),
  useOvieListCreatorSearchQuery: (query: string) => {
    mocks.searchQuery(query);
    return mocks.search;
  },
}));

import { OvieListWorkspace } from './OvieListWorkspace';

const AT = '2026-10-04T03:00:00.000Z';
const member = (creatorId: string, extra: Partial<ListMember> = {}) =>
  ({
    creatorId,
    state: 'member',
    rating: null,
    favorite: false,
    source: 'manual',
    addedAt: AT,
    ...extra,
  }) as ListMember;
const suggested = (creatorId: string) =>
  member(creatorId, {
    state: 'suggested',
    source: 'suggestion',
    suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
  });

function detail(members: ListMember[]): ListDetail {
  return {
    list: {
      id: 'collab',
      name: 'Collab list',
      pinned: true,
      createdAt: AT,
      updatedAt: AT,
      members,
      labels: [],
    },
    creators: [
      { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null },
      { id: 'b', username: 'bo', displayName: 'Bo', avatarUrl: null },
    ],
    precision: { accepted: 0, rejected: 0, pending: 0, precision: null },
  };
}

const renderWorkspace = () =>
  render(
    <TooltipProvider>
      <OvieListWorkspace listId='collab' />
    </TooltipProvider>
  );

const lastAction = () => mocks.mutate.mock.calls.at(-1)?.[0];

describe('OvieListWorkspace certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.suggest.mockReset();
    mocks.actionsPending = false;
    mocks.suggestPending = false;
    mocks.detail = { isPending: false, data: undefined, refetch: vi.fn() };
    mocks.search = { data: undefined, isError: false, isSuccess: false };
  });

  it('renders the loading placeholder axe-clean', async () => {
    mocks.detail.isPending = true;
    const { container } = renderWorkspace();

    expect(
      screen.getByRole('status', { name: 'Loading List' })
    ).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('retries an unavailable list, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspace();

    expect(screen.getByText('List unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('favorites, removes and skips rows as list actions, axe-clean', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([member('a'), suggested('b')]);
    const { container } = renderWorkspace();

    expect(screen.getByRole('button', { name: 'List 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('suggestion-precision')).toHaveTextContent(
      'No suggestion decisions yet'
    );
    expect(
      screen.getByRole('list', { name: 'Collab list creators' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Favorite Ava' }));
    expect(lastAction()).toEqual({
      listId: 'collab',
      actions: [{ type: 'favorite', creatorId: 'a', favorite: true }],
    });
    await user.click(
      screen.getByRole('button', { name: 'Remove Ava from the list' })
    );
    expect(lastAction().actions).toEqual([{ type: 'remove', creatorId: 'a' }]);

    const section = screen.getByRole('region', { name: 'Suggested By Jovie' });
    await user.click(within(section).getByRole('button', { name: 'Skip Bo' }));
    expect(lastAction().actions).toEqual([
      { type: 'reject_suggestion', creatorId: 'b' },
    ]);
  });

  it('toasts the list error when an action fails', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([member('a')]);
    mocks.mutate.mockImplementation((_input, { onError }) =>
      onError(new Error('boom'))
    );
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Favorite Ava' }));
    expect(mocks.error).toHaveBeenCalledWith(
      'That change did not save. Try again.'
    );
  });

  it('searches for creators and adds one that is not on the list', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([member('a')]);
    mocks.search = {
      isError: false,
      isSuccess: true,
      data: {
        creators: [
          { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null },
          { id: 'z', username: 'zed', displayName: 'Zed', avatarUrl: null },
        ],
      },
    };
    renderWorkspace();

    expect(
      screen.queryByRole('list', { name: 'Creator Search Results' })
    ).toBeNull();
    await user.type(screen.getByPlaceholderText('Find a creator to add'), 'ze');
    // The search bar debounces before it reports the query.
    await waitFor(() =>
      expect(mocks.searchQuery).toHaveBeenLastCalledWith('ze')
    );

    const results = await screen.findByRole('list', {
      name: 'Creator Search Results',
    });
    expect(within(results).getByText('Zed')).toBeInTheDocument();
    expect(within(results).queryByText('Ava')).toBeNull();
    await user.click(within(results).getByRole('button', { name: 'Add' }));
    expect(lastAction().actions).toEqual([{ type: 'add', creatorId: 'z' }]);
  });

  it('explains a failed and an empty creator search, axe-clean', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([]);
    mocks.search = { data: undefined, isError: true, isSuccess: false };
    const { container, rerender } = renderWorkspace();

    await user.type(
      screen.getByPlaceholderText('Find a creator to add'),
      'zed'
    );
    expect(
      await screen.findByText('Search failed. Edit the query to retry.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    mocks.search = { data: { creators: [] }, isError: false, isSuccess: true };
    rerender(
      <TooltipProvider>
        <OvieListWorkspace listId='collab' />
      </TooltipProvider>
    );
    expect(screen.getByText('No creators match.')).toBeInTheDocument();
  });

  it('switches to triage and decides the suggestion there, axe-clean', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([member('a'), suggested('b')]);
    const { container } = renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Triage 1' }));
    expect(screen.getByRole('button', { name: 'Triage 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Favorite Ava' })).toBeNull();
    expect(screen.getByLabelText('Triage suggestions: Bo')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'List 1' }));
    expect(screen.getByRole('button', { name: 'Favorite Ava' })).toBeVisible();
  });

  it('opens triage after a suggest run that found creators', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([member('a'), suggested('b')]);
    mocks.suggest.mockImplementation((_input, { onSuccess }) =>
      onSuccess({ list: detail([member('a'), suggested('b')]).list })
    );
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Suggest More' }));
    expect(mocks.suggest).toHaveBeenCalledTimes(1);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Triage 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('suggests from the empty triage state and toasts a failed run, axe-clean', async () => {
    const user = userEvent.setup();
    mocks.detail.data = detail([]);
    mocks.suggest.mockImplementation((_input, { onError }) =>
      onError(new Error('boom'))
    );
    const { container } = renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Triage 0' }));
    const heading = screen.getByText('Nothing to triage');
    expect(heading).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const buttons = screen.getAllByRole('button', { name: 'Suggest More' });
    await user.click(buttons[buttons.length - 1]);
    expect(mocks.suggest).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith(
      'That change did not save. Try again.'
    );
  });

  it('disables suggesting and row controls while requests are pending', async () => {
    mocks.detail.data = detail([member('a')]);
    mocks.actionsPending = true;
    mocks.suggestPending = true;
    renderWorkspace();

    expect(screen.getByRole('button', { name: 'Suggesting' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Favorite Ava' })).toBeDisabled();
  });
});
