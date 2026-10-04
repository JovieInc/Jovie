import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  data: undefined as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'failed',
  useOvieSidebarListsQuery: () => ({ data: mocks.data }),
  useCreateOvieListMutation: () => ({
    mutate: mocks.create,
    isPending: false,
  }),
}));

import { OperatorListsNav } from './OperatorListsNav';

function renderNav(pathname = '/app/ov/hud') {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <OperatorListsNav pathname={pathname} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe('OperatorListsNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = {
      lists: [
        { id: 'l1', name: 'Collab list', count: 12, pendingSuggestions: 3 },
        { id: 'l2', name: 'Press', count: 0, pendingSuggestions: 0 },
      ],
      smartViews: [{ id: 'favorites', name: 'Favorites', count: 4 }],
    };
  });

  it('links lists and server-filtered smart views with counts', () => {
    renderNav('/app/ov/lists/l1');
    const collab = screen.getByRole('link', { name: 'Collab list' });
    expect(collab).toHaveAttribute('href', '/app/ov/lists/l1');
    expect(collab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Press' })).toHaveAttribute(
      'href',
      '/app/ov/lists/l2'
    );
    expect(screen.getByRole('link', { name: 'Favorites' })).toHaveAttribute(
      'href',
      '/app/ov/lists/views/favorites'
    );
    expect(screen.getByLabelText('12 creators')).toHaveTextContent('12');
    expect(screen.getByLabelText('4 creators')).toHaveTextContent('4');
  });

  it('creates a list inline with Enter and cancels with Escape', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'New List' }));
    const input = screen.getByRole('textbox', { name: 'New List Name' });
    fireEvent.change(input, { target: { value: 'Press' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.create).toHaveBeenCalledWith('Press', expect.any(Object));

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(
      screen.getByRole('button', { name: 'New List' })
    ).toBeInTheDocument();
  });

  it('still offers New list before any data loads', () => {
    mocks.data = undefined;
    renderNav();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'New List' })
    ).toBeInTheDocument();
  });
});
