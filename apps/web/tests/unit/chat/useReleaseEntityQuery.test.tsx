import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import { useReleaseEntityQuery } from '@/lib/queries/useReleaseEntityQuery';

const { mockLoadReleaseEntity } = vi.hoisted(() => ({
  mockLoadReleaseEntity: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  loadReleaseEntity: mockLoadReleaseEntity,
}));

let queryClient: QueryClient;

function TestWrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeRelease(id = 'release-1'): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id,
    title: 'Lost In The Light',
    status: 'released',
    slug: 'lost-in-the-light',
    smartLinkPath: '/tim/lost-in-the-light',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
  };
}

describe('useReleaseEntityQuery', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    mockLoadReleaseEntity.mockReset();
  });

  it('uses a cached matrix row without fetching the catalog or detail action', () => {
    const cachedRelease = makeRelease();
    queryClient.setQueryData(queryKeys.releases.matrix('profile-1'), [
      cachedRelease,
    ]);

    const { result } = renderHook(
      () => useReleaseEntityQuery('profile-1', 'release-1'),
      { wrapper: TestWrapper }
    );

    expect(result.current.data).toEqual(cachedRelease);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockLoadReleaseEntity).not.toHaveBeenCalled();
  });

  it('fetches only the selected release when no matrix row is cached', async () => {
    const selectedRelease = makeRelease();
    mockLoadReleaseEntity.mockResolvedValueOnce(selectedRelease);

    const { result } = renderHook(
      () => useReleaseEntityQuery('profile-1', 'release-1'),
      { wrapper: TestWrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(selectedRelease);
    expect(mockLoadReleaseEntity).toHaveBeenCalledWith({
      profileId: 'profile-1',
      releaseId: 'release-1',
    });
  });

  it('forwards the matrix dataUpdatedAt to seeded detail data so it is not stale at t=0', () => {
    const cachedRelease = makeRelease();
    const matrixKey = queryKeys.releases.matrix('profile-1');
    queryClient.setQueryData(matrixKey, [cachedRelease]);

    const matrixState =
      queryClient.getQueryState<ReleaseViewModel[]>(matrixKey);
    expect(matrixState?.dataUpdatedAt).toBeGreaterThan(0);

    const { result } = renderHook(
      () => useReleaseEntityQuery('profile-1', 'release-1'),
      { wrapper: TestWrapper }
    );

    // The detail entry's dataUpdatedAt must equal the matrix's dataUpdatedAt
    // so STANDARD_NO_REMOUNT_CACHE's staleTime applies; otherwise TanStack
    // treats seeded data as stale from t=0.
    expect(result.current.dataUpdatedAt).toBe(matrixState?.dataUpdatedAt);
    expect(result.current.isStale).toBe(false);
  });
});
