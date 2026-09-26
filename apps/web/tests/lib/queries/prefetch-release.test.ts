import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchReleaseDetailData } from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeRelease(
  overrides: Partial<{
    id: string;
    profileId: string;
    totalTracks: number;
  }> = {}
) {
  return {
    id: 'release-1',
    profileId: 'profile-1',
    totalTracks: 3,
    ...overrides,
  };
}

describe('prefetchReleaseDetailData', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('warms the release tracks query on intent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'track-1', title: 'Song One' }]),
    });

    prefetchReleaseDetailData(queryClient, makeRelease());

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.releases.tracks('release-1'))
      ).toEqual([{ id: 'track-1', title: 'Song One' }]);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      '/api/dashboard/releases/release-1/tracks'
    );
  });

  it('does not prefetch when the release has no tracks', () => {
    prefetchReleaseDetailData(queryClient, makeRelease({ totalTracks: 0 }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not prefetch without a profile or release id', () => {
    prefetchReleaseDetailData(queryClient, makeRelease({ profileId: '' }));
    prefetchReleaseDetailData(queryClient, makeRelease({ id: '' }));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
