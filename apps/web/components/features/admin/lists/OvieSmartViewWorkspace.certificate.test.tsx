import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  view: {} as Record<string, unknown>,
  mutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'That change did not save. Try again.',
  useOvieSmartViewQuery: () => mocks.view,
  useOvieListActionsMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
  }),
}));

import { OvieSmartViewWorkspace } from './OvieSmartViewWorkspace';

const ADDED_AT = '2026-10-04T03:00:00.000Z';
const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

function member(creatorId: string, state: 'member' | 'suggested') {
  return {
    creatorId,
    state,
    rating: state === 'member' ? 4 : null,
    favorite: false,
    source: state === 'member' ? 'manual' : 'suggestion',
    addedAt: ADDED_AT,
    suggestionReasons:
      state === 'suggested'
        ? ['Shares indie pop with 2 of 2 picks']
        : undefined,
  };
}

const DETAIL = {
  view: { id: 'favorites', name: 'Favorites' },
  rows: [
    { listId: 'press', listName: 'Press', member: member('a', 'member') },
    { listId: 'collab', listName: 'Collab', member: member('b', 'suggested') },
  ],
  creators: [
    { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null },
    { id: 'b', username: 'bo', displayName: 'Bo', avatarUrl: null },
  ],
};

function renderView(dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <OvieSmartViewWorkspace viewId='favorites' />
      </div>
    </TooltipProvider>
  );
}

describe('OvieSmartViewWorkspace certificate states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view = { isPending: false, data: undefined, refetch: vi.fn() };
  });

  it('announces a named busy region while the view loads', async () => {
    mocks.view.isPending = true;
    const { container } = renderView();
    expect(
      screen.getByRole('status', { name: 'Loading View' })
    ).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('retries from the unavailable state a failed or offline request leaves', async () => {
    const user = userEvent.setup();
    const { container } = renderView();
    expect(screen.getByText('View unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.view.refetch).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('names the view in its empty state', async () => {
    mocks.view.data = { ...DETAIL, rows: [], creators: [] };
    const { container } = renderView();
    expect(screen.getByText('Nothing in Favorites')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('writes a rating and a favorite to the row’s own list', async () => {
    const user = userEvent.setup();
    mocks.view.data = DETAIL;
    const { container } = renderView();

    expect(
      screen.getByRole('list', { name: 'Favorites creators' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rate 5 stars' }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'press',
        actions: [{ type: 'rate', creatorId: 'a', rating: 5 }],
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );

    await user.click(screen.getByRole('button', { name: 'Favorite Ava' }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'press',
        actions: [{ type: 'favorite', creatorId: 'a', favorite: true }],
      },
      expect.anything()
    );
    await expectNoA11yViolations(container);
  });

  it('accepts and rejects a suggestion on its own list', async () => {
    const user = userEvent.setup();
    mocks.view.data = DETAIL;
    renderView();

    await user.click(
      screen.getByRole('button', { name: 'Add Bo to the list' })
    );
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'collab',
        actions: [{ type: 'accept_suggestion', creatorId: 'b' }],
      },
      expect.anything()
    );
    await user.click(screen.getByRole('button', { name: 'Skip Bo' }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      {
        listId: 'collab',
        actions: [{ type: 'reject_suggestion', creatorId: 'b' }],
      },
      expect.anything()
    );
  });

  it('reports a failed edit as a toast', async () => {
    const user = userEvent.setup();
    mocks.view.data = DETAIL;
    renderView();
    await user.click(screen.getByRole('button', { name: 'Rate 5 stars' }));
    const [, options] = mocks.mutate.mock.calls[0] as [
      unknown,
      { onError: (error: unknown) => void },
    ];
    options.onError(new Error('offline'));
    expect(mocks.toastError).toHaveBeenCalledWith(
      'That change did not save. Try again.'
    );
  });

  it('links a long list name and stays axe clean right to left', async () => {
    mocks.view.data = {
      view: { id: 'favorites', name: 'المفضلة' },
      rows: [
        { listId: 'press', listName: 'الصحافة', member: member('a', 'member') },
      ],
      creators: [
        {
          id: 'a',
          username: 'aurelia',
          displayName: LONG_NAME,
          avatarUrl: null,
        },
      ],
    };
    const { container } = renderView('rtl');
    expect(screen.getByRole('link', { name: 'الصحافة' })).toHaveAttribute(
      'href',
      expect.stringContaining('/press')
    );
    expect(screen.getByText(LONG_NAME)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
