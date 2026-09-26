import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from './keys';
import {
  useDeleteReleaseMutation,
  useSaveProviderOverrideMutation,
  useSaveReleaseMetadataMutation,
} from './useReleaseMutations';

const { mockSaveReleaseMetadata, mockSaveProviderOverride, mockDeleteRelease } =
  vi.hoisted(() => ({
    mockSaveReleaseMetadata: vi.fn(),
    mockSaveProviderOverride: vi.fn(),
    mockDeleteRelease: vi.fn(),
  }));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  deleteRelease: mockDeleteRelease,
  formatReleaseLyrics: vi.fn(),
  refreshRelease: vi.fn(),
  rescanIsrcLinks: vi.fn(),
  resetProviderOverride: vi.fn(),
  saveCanvasStatus: vi.fn(),
  savePrimaryIsrc: vi.fn(),
  saveProviderOverride: mockSaveProviderOverride,
  saveReleaseLyrics: vi.fn(),
  saveReleaseMetadata: mockSaveReleaseMetadata,
  saveReleaseStatus: vi.fn(),
  syncFromSpotify: vi.fn(),
}));

let queryClient: QueryClient;

function TestWrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Lost In The Light',
    status: 'released',
    slug: 'lost-in-the-light',
    smartLinkPath: '/tim/lost-in-the-light',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...overrides,
  };
}

const matrixKey = queryKeys.releases.matrix('profile-1');
const detailKey = queryKeys.releases.detail('profile-1', 'release-1');

describe('useReleaseMutations detail-cache convergence', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    queryClient.setQueryData(matrixKey, [makeRelease()]);
    queryClient.setQueryData(detailKey, makeRelease());
  });

  it('writes the updated release into the detail cache on metadata save', async () => {
    const updated = makeRelease({ title: 'New Title' });
    mockSaveReleaseMetadata.mockResolvedValueOnce(updated);

    const { result } = renderHook(
      () => useSaveReleaseMetadataMutation('profile-1'),
      { wrapper: TestWrapper }
    );

    await result.current.mutateAsync({
      profileId: 'profile-1',
      releaseId: 'release-1',
      upc: null,
      label: null,
    });

    expect(queryClient.getQueryData(detailKey)).toEqual(updated);
    expect(
      queryClient.getQueryData<ReleaseViewModel[]>(matrixKey)?.[0]?.title
    ).toBe('New Title');
  });

  it('converges the detail cache to the refetched matrix row after provider override settles', async () => {
    mockSaveProviderOverride.mockResolvedValueOnce(makeRelease());

    const { result } = renderHook(() => useSaveProviderOverrideMutation(), {
      wrapper: TestWrapper,
    });

    await result.current.mutateAsync({
      profileId: 'profile-1',
      releaseId: 'release-1',
      provider: 'spotify',
      url: 'https://open.spotify.com/album/x',
    });

    const detail = queryClient.getQueryData<ReleaseViewModel>(detailKey);
    const row = queryClient
      .getQueryData<ReleaseViewModel[]>(matrixKey)
      ?.find(r => r.id === 'release-1');
    expect(detail).toEqual(row);
    expect(detail?.providers[0]?.url).toBe('https://open.spotify.com/album/x');
  });

  it('restores the detail snapshot when the provider override fails', async () => {
    mockSaveProviderOverride.mockRejectedValueOnce(new Error('nope'));

    const { result } = renderHook(() => useSaveProviderOverrideMutation(), {
      wrapper: TestWrapper,
    });

    await expect(
      result.current.mutateAsync({
        profileId: 'profile-1',
        releaseId: 'release-1',
        provider: 'spotify',
        url: 'https://open.spotify.com/album/x',
      })
    ).rejects.toThrow('nope');

    await waitFor(() =>
      expect(
        queryClient.getQueryData<ReleaseViewModel>(detailKey)?.providers
      ).toEqual([])
    );
  });

  it('removes the detail cache entry when the release is deleted', async () => {
    mockDeleteRelease.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useDeleteReleaseMutation('profile-1'), {
      wrapper: TestWrapper,
    });

    await result.current.mutateAsync({ releaseId: 'release-1' });

    await waitFor(() =>
      expect(queryClient.getQueryData(detailKey)).toBeUndefined()
    );
  });
});
