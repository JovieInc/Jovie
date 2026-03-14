import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys, useReleaseTracksQuery } from '@/lib/queries';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useReleaseTracksQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  it('fetches tracks and stores data under shared release tracks query key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'track-1',
            releaseId: 'release-1',
            title: 'Song One',
            slug: 'song-one',
            smartLinkPath: '/song-one',
            trackNumber: 1,
            discNumber: 1,
            durationMs: 182000,
            isrc: null,
            isExplicit: false,
            previewUrl: null,
            audioUrl: null,
            audioFormat: null,
            providers: [],
          },
        ]),
    });

    const { result } = renderHook(() => useReleaseTracksQuery('release-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dashboard/releases/release-1/tracks',
      expect.any(Object)
    );
    expect(
      queryClient.getQueryData(queryKeys.releases.tracks('release-1'))
    ).toEqual(result.current.data);
  });

  it('does not run when disabled', () => {
    const { result } = renderHook(
      () => useReleaseTracksQuery('release-1', false),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
