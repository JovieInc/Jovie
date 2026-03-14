import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  );
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  loadReleaseMatrix: vi.fn(),
}));

import {
  queryKeys,
  STANDARD_CACHE,
  useBuildInfoQuery,
  useReleasesQuery,
} from '@/lib/queries';

describe('query gcTime coverage', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({ data: null, isLoading: false });
  });

  it('useBuildInfoQuery sets explicit gcTime', () => {
    useBuildInfoQuery();

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.health.buildInfo(),
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      })
    );
  });

  it('useReleasesQuery uses STANDARD_CACHE (includes gcTime)', () => {
    useReleasesQuery('profile_123');

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.releases.matrix('profile_123'),
        staleTime: STANDARD_CACHE.staleTime,
        gcTime: STANDARD_CACHE.gcTime,
      })
    );
  });

  it('STANDARD_CACHE and STABLE_CACHE include gcTime', async () => {
    const { STABLE_CACHE } = await import('@/lib/queries/cache-strategies');

    expect(STANDARD_CACHE.gcTime).toBeDefined();
    expect(STABLE_CACHE.gcTime).toBeDefined();
  });

  it('removes inactive query entries after gcTime expires', async () => {
    vi.useFakeTimers();

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 10,
          staleTime: 0,
        },
      },
    });

    queryClient.setQueryData(['gc-test'], { ok: true });
    expect(queryClient.getQueryData(['gc-test'])).toEqual({ ok: true });

    await vi.advanceTimersByTimeAsync(20);

    expect(queryClient.getQueryData(['gc-test'])).toBeUndefined();

    queryClient.clear();
    vi.useRealTimers();
  });
});
