import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppleMusicArtistSearchQuery } from '@/lib/queries';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useAppleMusicArtistSearchQuery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  it('enforces minimum query length by default', () => {
    const { result } = renderHook(() => useAppleMusicArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.search('a');
    });

    expect(result.current.state).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches results from the Apple Music endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'am-1',
            name: 'Apple Artist',
            url: 'https://music.apple.com/us/artist/apple-artist/am-1',
          },
        ]),
    });

    const { result } = renderHook(() => useAppleMusicArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('apple artist');
    });

    await waitFor(() => {
      expect(result.current.state).toBe('success');
    });

    expect(result.current.results[0]?.id).toBe('am-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/apple-music/search'),
      expect.any(Object)
    );
  });
});
