import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient as render } from '@/tests/utils/test-utils';
import { HeaderSearchSurface } from './HeaderSearchSurface';
import type { SearchableRelease } from './header-search-results';

describe('HeaderSearchSurface remote search cache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps matching results on screen while the next query loads and reuses a cached query', async () => {
    vi.useFakeTimers();
    const pending: Array<{
      readonly query: string;
      readonly resolve: (releases: readonly SearchableRelease[]) => void;
    }> = [];
    const searchLibraryAssets = vi.fn(
      (query: string, _signal: AbortSignal) =>
        new Promise<readonly SearchableRelease[]>(resolve => {
          pending.push({ query, resolve });
        })
    );
    render(
      <HeaderSearchSurface
        isOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
        searchLibraryAssets={searchLibraryAssets}
      />
    );
    const input = screen.getByRole('combobox', { name: 'Search Jovie' });

    fireEvent.change(input, { target: { value: 'mid' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    pending[0]?.resolve([
      {
        id: 'midnight-drive',
        title: 'Midnight Drive',
        artistNames: ['Midnight Artist'],
        smartLinkPath: '/midnight-artist/midnight-drive',
      },
    ]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Midnight Drive')).toBeVisible();

    // Typing on: the previous match stays instead of flashing to "Searching…".
    fireEvent.change(input, { target: { value: 'midn' } });
    expect(screen.getByText('Midnight Drive')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchLibraryAssets).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Midnight Drive')).toBeVisible();
    pending[1]?.resolve([]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByText('Midnight Drive')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No matching results');

    // Backspacing to the earlier query is answered from the cache.
    fireEvent.change(input, { target: { value: 'mid' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText('Midnight Drive')).toBeVisible();
    expect(searchLibraryAssets).toHaveBeenCalledTimes(2);
  });
});
