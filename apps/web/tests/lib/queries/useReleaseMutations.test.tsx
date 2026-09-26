import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries/keys';
import {
  useDeleteReleaseMutation,
  useSaveReleaseMetadataMutation,
} from '@/lib/queries/useReleaseMutations';

const updateNowPlayingForRelease = vi.fn();
vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  updateNowPlayingForRelease: (...args: unknown[]) =>
    updateNowPlayingForRelease(...args),
}));

const saveReleaseMetadata = vi.fn();
const deleteRelease = vi.fn();
vi.mock(
  '@/app/app/(shell)/dashboard/releases/actions',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/app/app/(shell)/dashboard/releases/actions')
    >()),
    saveReleaseMetadata: (...args: unknown[]) => saveReleaseMetadata(...args),
    deleteRelease: (...args: unknown[]) => deleteRelease(...args),
  })
);

const K = queryKeys.releases;

function makeRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Old Title',
    status: 'released',
    slug: 'old-title',
    smartLinkPath: '/old-title',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 2,
    ...overrides,
  };
}

describe('release mutation cache convergence', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('updates matrix, detail, and now-playing for the mutated release only', async () => {
    const stale = makeRelease();
    const other = makeRelease({ id: 'release-2', title: 'Untouched' });
    const updated = makeRelease({ title: 'New Title' });

    queryClient.setQueryData(K.matrix('profile-1'), [stale, other]);
    queryClient.setQueryData(K.detail('profile-1', 'release-1'), stale);
    queryClient.setQueryData(K.detail('profile-1', 'release-2'), other);
    queryClient.setQueryData(K.tracks('release-1'), [{ id: 'track-1' }]);

    saveReleaseMetadata.mockResolvedValueOnce(updated);

    const { result } = renderHook(
      () => useSaveReleaseMetadataMutation('profile-1'),
      { wrapper }
    );
    await result.current.mutateAsync({
      profileId: 'profile-1',
      releaseId: 'release-1',
      upc: null,
      label: null,
    });

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<ReleaseViewModel[]>(K.matrix('profile-1'))
          ?.find(r => r.id === 'release-1')?.title
      ).toBe('New Title');
    });

    expect(
      queryClient.getQueryData<ReleaseViewModel>(
        K.detail('profile-1', 'release-1')
      )?.title
    ).toBe('New Title');
    expect(
      queryClient.getQueryData<ReleaseViewModel>(
        K.detail('profile-1', 'release-2')
      )?.title
    ).toBe('Untouched');

    expect(
      queryClient.getQueryState(K.tracks('release-1'))?.isInvalidated
    ).toBe(true);
    expect(updateNowPlayingForRelease).toHaveBeenCalledWith(updated);
  });

  it('removes detail and tracks caches when a release is deleted', async () => {
    const release = makeRelease();
    queryClient.setQueryData(K.matrix('profile-1'), [release]);
    queryClient.setQueryData(K.detail('profile-1', 'release-1'), release);
    queryClient.setQueryData(K.tracks('release-1'), [{ id: 'track-1' }]);

    deleteRelease.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useDeleteReleaseMutation('profile-1'), {
      wrapper,
    });
    await result.current.mutateAsync({ releaseId: 'release-1' });

    await waitFor(() => {
      expect(queryClient.getQueryData(K.matrix('profile-1'))).toEqual([]);
    });
    expect(
      queryClient.getQueryData(K.detail('profile-1', 'release-1'))
    ).toBeUndefined();
    expect(queryClient.getQueryData(K.tracks('release-1'))).toBeUndefined();
  });
});
