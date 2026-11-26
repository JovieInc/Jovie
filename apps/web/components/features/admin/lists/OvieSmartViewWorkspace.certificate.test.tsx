import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

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

describe('OvieSmartViewWorkspace certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view = { isPending: false, data: undefined, refetch: vi.fn() };
  });

  it('is axe-clean while loading', async () => {
    mocks.view.isPending = true;
    const { container } = renderView();
    await expectNoA11yViolations(container);
  });

  it('retries from the error state axe-clean', async () => {
    const { container } = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.view.refetch).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when the view is empty', async () => {
    mocks.view.data = {
      view: { id: 'favorites', name: 'Favorites' },
      rows: [],
      creators: [],
    };
    const { container } = renderView();
    expect(screen.getByText('Nothing in Favorites')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('lists creators axe-clean with a link back to their list', async () => {
    mocks.view.data = {
      view: { id: 'favorites', name: 'Favorites' },
      rows: [
        {
          listId: 'press',
          listName: 'Press',
          member: {
            creatorId: 'a',
            state: 'member',
            rating: 5,
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
    const { container } = renderView();
    expect(screen.getByRole('link', { name: 'Press' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
