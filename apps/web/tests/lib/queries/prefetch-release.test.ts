import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchReleaseDetailData } from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const makeRelease = (overrides = {}) => ({
  id: 'release-1',
  profileId: 'profile-1',
  totalTracks: 3,
  ...overrides,
});

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

  it.each([{ totalTracks: 0 }, { profileId: '' }, { id: '' }])(
    'does not prefetch for %o',
    overrides => {
      prefetchReleaseDetailData(queryClient, makeRelease(overrides));
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );
});
