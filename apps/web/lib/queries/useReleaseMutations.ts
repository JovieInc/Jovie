'use client';

import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  deleteRelease,
  formatReleaseLyrics,
  refreshRelease,
  rescanIsrcLinks,
  resetProviderOverride,
  saveCanvasStatus,
  savePrimaryIsrc,
  saveProviderOverride,
  saveReleaseLyrics,
  saveReleaseMetadata,
  saveReleaseStatus,
  syncFromSpotify,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { updateNowPlayingForRelease } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from './keys';

/** Converge every cached view of a mutated release: matrix row, detail
 * query, open track list, and now-playing metadata. Playback is untouched. */
function applyReleaseUpdate(
  queryClient: QueryClient,
  profileId: string,
  release: ReleaseViewModel
): void {
  const matrixKey = queryKeys.releases.matrix(profileId);
  const current = queryClient.getQueryData<ReleaseViewModel[]>(matrixKey);
  if (current) {
    queryClient.setQueryData(
      matrixKey,
      current.map(r => (r.id === release.id ? release : r))
    );
  }
  queryClient.setQueryData(
    queryKeys.releases.detail(profileId, release.id),
    release
  );
  void queryClient.invalidateQueries({
    queryKey: queryKeys.releases.tracks(release.id),
  });
  updateNowPlayingForRelease(release);
}

/** Invalidate every cached view of a release after an override mutation. */
async function invalidateReleaseViews(
  queryClient: QueryClient,
  profileId: string,
  releaseId: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.releases.matrix(profileId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.releases.detail(profileId, releaseId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.releases.tracks(releaseId),
    }),
  ]);
}

/** Drop all cached views of a deleted release. */
function removeReleaseCaches(
  queryClient: QueryClient,
  profileId: string,
  releaseId: string
): void {
  queryClient.removeQueries({
    queryKey: queryKeys.releases.detail(profileId, releaseId),
  });
  queryClient.removeQueries({
    queryKey: queryKeys.releases.tracks(releaseId),
  });
}

/**
 * Optimistically update a release's provider URL in the cache.
 * Returns the updated releases array.
 */
function updateReleaseProvider(
  releases: ReleaseViewModel[],
  releaseId: string,
  provider: ProviderKey,
  url: string
): ReleaseViewModel[] {
  return releases.map(release => {
    if (release.id !== releaseId) return release;

    // Find existing provider or create a new entry
    const existingProviderIndex = release.providers.findIndex(
      p => p.key === provider
    );

    const updatedProviders = [...release.providers];
    const now = new Date().toISOString();

    if (existingProviderIndex >= 0) {
      // Update existing provider
      updatedProviders[existingProviderIndex] = {
        ...updatedProviders[existingProviderIndex],
        url,
        source: 'manual',
        updatedAt: now,
      };
    } else {
      // Add new provider entry (will be corrected with full data on server response)
      updatedProviders.push({
        key: provider,
        label: provider, // Temporary label, will be corrected on sync
        url,
        source: 'manual',
        updatedAt: now,
        path: '', // Will be corrected on sync
        isPrimary: false,
      });
    }

    return {
      ...release,
      providers: updatedProviders,
    };
  });
}

/**
 * Mutation to save provider URL override with optimistic updates.
 * The UI updates immediately while the server request is in flight,
 * making the experience feel instant.
 */
export function useSaveProviderOverrideMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveProviderOverride,

    // Optimistic update: immediately update the UI before server responds
    onMutate: async variables => {
      // Cancel any outgoing refetches to prevent overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });

      // Snapshot the previous value for rollback on error
      const previousReleases = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(variables.profileId)
      );

      // Optimistically update the cache
      if (previousReleases) {
        const optimisticReleases = updateReleaseProvider(
          previousReleases,
          variables.releaseId,
          variables.provider,
          variables.url
        );
        queryClient.setQueryData(
          queryKeys.releases.matrix(variables.profileId),
          optimisticReleases
        );
      }

      // Return context with the snapshotted value
      return { previousReleases };
    },

    // On error, rollback to the previous value
    onError: (_err, variables, context) => {
      if (context?.previousReleases) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(variables.profileId),
          context.previousReleases
        );
      }
    },

    // Always refetch after error or success to ensure cache consistency
    onSettled: async (_data, _error, variables) => {
      await invalidateReleaseViews(
        queryClient,
        variables.profileId,
        variables.releaseId
      );
    },
  });
}

/**
 * Mutation to reset provider URL override with optimistic updates.
 */
export function useResetProviderOverrideMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resetProviderOverride,

    // Optimistic update: immediately show the reset state
    onMutate: async variables => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });

      const previousReleases = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(variables.profileId)
      );

      // For reset, we can't know the original ingested URL optimistically,
      // so we just mark the source as 'ingested' to show the UI state change
      if (previousReleases) {
        const optimisticReleases = previousReleases.map(release => {
          if (release.id !== variables.releaseId) return release;

          return {
            ...release,
            providers: release.providers.map(p =>
              p.key === variables.provider
                ? { ...p, source: 'ingested' as const }
                : p
            ),
          };
        });
        queryClient.setQueryData(
          queryKeys.releases.matrix(variables.profileId),
          optimisticReleases
        );
      }

      return { previousReleases };
    },

    onError: (_err, variables, context) => {
      if (context?.previousReleases) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(variables.profileId),
          context.previousReleases
        );
      }
    },

    onSettled: async (_data, _error, variables) => {
      await invalidateReleaseViews(
        queryClient,
        variables.profileId,
        variables.releaseId
      );
    },
  });
}

export function useSyncReleasesFromSpotifyMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncFromSpotify,
    onSuccess: async result => {
      if (result.success) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.releases.matrix(profileId),
        });
      }
    },
  });
}

/**
 * Mutation to refresh a single release from the database.
 * Updates only the specific release in the matrix cache without refetching all releases.
 * Returns rate limit info so the UI can show "Available again in X".
 */
export function useRefreshReleaseMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshRelease,
    onSuccess: async result => {
      if (!result.rateLimited) {
        applyReleaseUpdate(queryClient, profileId, result.release);
      }
    },
  });
}

/**
 * Mutation to rescan a release's ISRC/UPC codes to discover new DSP links.
 * Returns both the updated release and rate limit info.
 */
export function useRescanIsrcLinksMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rescanIsrcLinks,
    onSuccess: async result => {
      if (!result.rateLimited) {
        applyReleaseUpdate(queryClient, profileId, result.release);
      }
    },
  });
}

/**
 * Mutation to delete a release with optimistic removal from the cache.
 */
export function useDeleteReleaseMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRelease,

    onMutate: async variables => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.releases.matrix(profileId),
      });

      const previousReleases = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(profileId)
      );

      if (previousReleases) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(profileId),
          previousReleases.filter(r => r.id !== variables.releaseId)
        );
      }

      return { previousReleases };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousReleases) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(profileId),
          context.previousReleases
        );
      }
    },

    onSettled: async (_data, _error, variables) => {
      removeReleaseCaches(queryClient, profileId, variables.releaseId);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(profileId),
      });
    },
  });
}

/** Factory for release mutations that optimistically update the matrix cache. */
function useReleaseMutation<T>(
  profileId: string,
  mutationFn: (params: T) => Promise<ReleaseViewModel>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async updated => {
      applyReleaseUpdate(queryClient, profileId, updated);
    },
  });
}

export function useSaveReleaseLyricsMutation(profileId: string) {
  return useReleaseMutation(profileId, saveReleaseLyrics);
}

export function useSaveCanvasStatusMutation(profileId: string) {
  return useReleaseMutation(profileId, saveCanvasStatus);
}

export function useSaveReleaseMetadataMutation(profileId: string) {
  return useReleaseMutation(profileId, saveReleaseMetadata);
}

export function useSavePrimaryIsrcMutation(profileId: string) {
  return useReleaseMutation(profileId, savePrimaryIsrc);
}

export function useSaveReleaseStatusMutation(profileId: string) {
  return useReleaseMutation(profileId, saveReleaseStatus);
}

export function useFormatReleaseLyricsMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: formatReleaseLyrics,
    onSuccess: async ({ release }) => {
      applyReleaseUpdate(queryClient, profileId, release);
    },
  });
}
