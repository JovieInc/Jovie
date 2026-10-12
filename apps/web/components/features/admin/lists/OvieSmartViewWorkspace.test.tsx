import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  view: {} as Record<string, unknown>,
  mutate: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'failed',
  useOvieSmartViewQuery: () => mocks.view,
  useOvieListActionsMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
  }),
}));

import { OvieSmartViewWorkspace } from './OvieSmartViewWorkspace';

const renderView = () =>
  render(
    <TooltipProvider>
      <OvieSmartViewWorkspace viewId='favorites' />
    </TooltipProvider>
  );

describe('OvieSmartViewWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view = { isPending: false, data: undefined, refetch: vi.fn() };
  });

  it('shows a busy placeholder while the view loads', () => {
    mocks.view.isPending = true;
    renderView();
    expect(screen.getByRole('status', { name: 'Loading View' })).toBeVisible();
  });

  it('offers a retry when the view cannot load', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.view.refetch).toHaveBeenCalledTimes(1);
  });

  it('says the view is empty when nothing matches', () => {
    mocks.view.data = {
      view: { id: 'favorites', name: 'Favorites' },
      rows: [],
      creators: [],
    };
    renderView();
    expect(screen.getByText('Nothing in Favorites')).toBeVisible();
  });

  it('links each row to its list and writes edits to that list', () => {
    mocks.view.data = {
      view: { id: 'favorites', name: 'Favorites' },
      rows: [
        {
          listId: 'press',
          listName: 'Press',
          member: {
            creatorId: 'a',
            state: 'member',
            rating: 4,
            favorite: true,
            source: 'manual',
            addedAt: '2026-10-04T03:00:00.000Z',
          },
        },
      ],
      creators: [
        { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null },
      ],
    };
    renderView();

    expect(screen.getByRole('link', { name: 'Press' })).toHaveAttribute(
      'href',
      expect.stringContaining('/press')
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Ava from favorites' })
    );
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'press',
        actions: [{ type: 'favorite', creatorId: 'a', favorite: false }],
      },
      expect.anything()
    );
  });
});
