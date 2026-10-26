import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useArtistSearchQuery } from './useArtistSearchQuery';

const fetchSearch = vi.hoisted(() => vi.fn());
vi.mock('./fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch')>()),
  fetchWithTimeout: fetchSearch,
}));

function usePickerSearch() {
  const result = useArtistSearchQuery({ debounceMs: 5 });
  const { search } = result;
  useEffect(() => {
    search('Missing Artist');
  }, [search]);
  return result;
}

describe('artist picker search', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('settles empty results without restarting the debounce on consumer renders', async () => {
    fetchSearch.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender, unmount } = renderHook(usePickerSearch, {
      wrapper,
    });
    try {
      await waitFor(() => expect(result.current.state).toBe('empty'));
      expect(result.current.isPending).toBe(false);
      rerender();
      expect(result.current.state).toBe('empty');
      expect(result.current.isPending).toBe(false);
      expect(fetchSearch).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      client.clear();
    }
  });
});
