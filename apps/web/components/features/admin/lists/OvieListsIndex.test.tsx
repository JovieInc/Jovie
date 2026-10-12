import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  query: {} as Record<string, unknown>,
}));

vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  useOvieSidebarListsQuery: () => mocks.query,
}));

import { OvieListsIndex } from './OvieListsIndex';

describe('OvieListsIndex', () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.query = { data: undefined, isError: false, refetch: mocks.refetch };
  });

  it('shows a busy placeholder before data loads', () => {
    render(<OvieListsIndex />);
    expect(
      screen.getByRole('status', { name: 'Loading Lists' })
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('links each list and matching smart view with its counts', () => {
    mocks.query.data = {
      lists: [
        { id: 'collab', name: 'Collab list', count: 12, pendingSuggestions: 3 },
        { id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 },
      ],
      smartViews: [{ id: 'favorites', name: 'Favorites', count: 4 }],
    };
    render(<OvieListsIndex />);

    const rows = screen.getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(screen.getByText('12 · 3 suggested')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Favorites/ })).toBeInTheDocument();
  });

  it('shows the empty state when there are no lists', () => {
    mocks.query.data = { lists: [], smartViews: [] };
    render(<OvieListsIndex />);
    expect(screen.getByText('No lists yet')).toBeInTheDocument();
  });

  it('offers a retry when the lists fail to load', () => {
    mocks.query.isError = true;
    render(<OvieListsIndex />);
    expect(screen.getByText('Lists unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
