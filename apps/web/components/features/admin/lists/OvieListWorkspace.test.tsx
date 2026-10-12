import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListDetail } from '@/lib/ovie/lists/types';

const mocks = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  mutate: vi.fn(),
  suggest: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { info: mocks.info, error: vi.fn() },
}));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'failed',
  useOvieListDetailQuery: () => mocks.detail,
  useOvieListActionsMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
  }),
  useSuggestOvieListMutation: () => ({
    mutate: mocks.suggest,
    isPending: false,
  }),
  useOvieListCreatorSearchQuery: () => ({ data: undefined }),
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

describe('OvieListWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detail = { isPending: false, data: undefined, refetch: vi.fn() };
  });

  it('shows a busy placeholder while the list loads', () => {
    mocks.detail.isPending = true;
    renderWorkspace();
    expect(screen.getByRole('status', { name: 'Loading List' })).toBeVisible();
  });

  it('offers a retry when the list cannot load', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('rates members and accepts suggestions as list actions', () => {
    mocks.detail.data = detail([
      member('a'),
      member('b', { state: 'suggested', source: 'suggestion' }),
    ]);
    renderWorkspace();

    fireEvent.click(screen.getAllByRole('button', { name: 'Rate 5 stars' })[0]);
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'collab',
        actions: [{ type: 'rate', creatorId: 'a', rating: 5 }],
      },
      expect.anything()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Bo to the list' }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'collab',
        actions: [{ type: 'accept_suggestion', creatorId: 'b' }],
      },
      expect.anything()
    );
  });

  it('asks for more signal when a suggest run returns nothing', () => {
    mocks.detail.data = detail([]);
    mocks.suggest.mockImplementation((_v, { onSuccess }) =>
      onSuccess({ list: detail([]).list })
    );
    renderWorkspace();
    expect(screen.getByText('Collab list is empty')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest More' }));
    expect(mocks.info).toHaveBeenCalledTimes(1);
  });
});
