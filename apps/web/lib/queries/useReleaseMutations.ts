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
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from './keys';

/**
 * Keep the release detail cache (`useReleaseEntityQuery`) aligned with matrix
 * writes. The detail query seeds from the matrix row via initialData, which
 * only applies at query creation — without this, an already-mounted detail
 * view keeps serving the stale title/artwork after a mutation updates the row.
 */
function syncReleaseDetailCache(
  queryClient: QueryClient,
  profileId: string,
  release: ReleaseViewModel
): void {
  queryClient.setQueryData<ReleaseViewModel>(
    queryKeys.releases.detail(profileId, release.id),
    release
  );
}

/**
 * After a matrix refetch settles, copy the authoritative row into the detail
 * cache so optimistic edits converge to the server result.
 */
function convergeReleaseDetailCache(
  queryClient: QueryClient,
  profileId: string,
  releaseId: string
): void {
  const row = queryClient
    .getQueryData<ReleaseViewModel[]>(queryKeys.releases.matrix(profileId))
    ?.find(r => r.id === releaseId);
  if (row) {
    syncReleaseDetailCache(queryClient, profileId, row);
  }
}

interface ReleaseMutationContext {
  previousReleases?: ReleaseViewModel[];
  previousDetail?: ReleaseViewModel;
}

interface ReleaseVariables {
  profileId: string;
  releaseId: string;
}

/**
 * Snapshot the matrix and detail caches, then apply an optimistic matrix
 * update and mirror the touched row into the detail cache.
 */
function optimisticReleaseUpdate(
  queryClient: QueryClient,
  variables: ReleaseVariables,
  update: (releases: ReleaseViewModel[]) => ReleaseViewModel[]
): ReleaseMutationContext {
  const previousReleases = queryClient.getQueryData<ReleaseViewModel[]>(
    queryKeys.releases.matrix(variables.profileId)
  );
  const previousDetail = queryClient.getQueryData<ReleaseViewModel>(
    queryKeys.releases.detail(variables.profileId, variables.releaseId)
  );

  if (previousReleases) {
    const optimisticReleases = update(previousReleases);
    queryClient.setQueryData(
      queryKeys.releases.matrix(variables.profileId),
      optimisticReleases
    );
    const optimisticRelease = optimisticReleases.find(
      r => r.id === variables.releaseId
    );
    if (optimisticRelease) {
      syncReleaseDetailCache(
        queryClient,
        variables.profileId,
        optimisticRelease
      );
    }
  }

  return { previousReleases, previousDetail };
}

/** Restore the snapshotted matrix/detail caches after a failed mutation. */
function rollbackReleaseCaches(
  queryClient: QueryClient,
  variables: ReleaseVariables,
  context?: ReleaseMutationContext
): void {
  if (context?.previousReleases) {
    queryClient.setQueryData(
      queryKeys.releases.matrix(variables.profileId),
      context.previousReleases
    );
  }
  if (context?.previousDetail) {
    syncReleaseDetailCache(
      queryClient,
      variables.profileId,
      context.previousDetail
    );
  }
}

/** Invalidate the matrix and converge the detail cache once a mutation settles. */
async function settleReleaseMutation(
  queryClient: QueryClient,
  variables: ReleaseVariables
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.releases.matrix(variables.profileId),
  });
  convergeReleaseDetailCache(
    queryClient,
    variables.profileId,
    variables.releaseId
  );
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

      // Snapshot the previous value for rollback on error, then apply the optimistic cache update
      return optimisticReleaseUpdate(queryClient, variables, releases =>
        updateReleaseProvider(
          releases,
          variables.releaseId,
          variables.provider,
          variables.url
        )
      );
    },

    // On error, rollback to the previous value
    onError: (_err, variables, context) => {
      rollbackReleaseCaches(queryClient, variables, context);
    },

    // Always refetch after error or success to ensure cache consistency
    onSettled: (_data, _error, variables) =>
      settleReleaseMutation(queryClient, variables),
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

      // For reset, we can't know the original ingested URL optimistically,
      // so we just mark the source as 'ingested' to show the UI state change
      return optimisticReleaseUpdate(queryClient, variables, releases =>
        releases.map(release =>
          release.id !== variables.releaseId
            ? release
            : {
                ...release,
                providers: release.providers.map(p =>
                  p.key === variables.provider
                    ? { ...p, source: 'ingested' as const }
                    : p
                ),
              }
        )
      );
    },

    onError: (_err, variables, context) => {
      rollbackReleaseCaches(queryClient, variables, context);
    },

    onSettled: (_data, _error, variables) =>
      settleReleaseMutation(queryClient, variables),
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
        // Update just this release in the matrix cache
        const current = queryClient.getQueryData<ReleaseViewModel[]>(
          queryKeys.releases.matrix(profileId)
        );
        if (current) {
          queryClient.setQueryData(
            queryKeys.releases.matrix(profileId),
            current.map(r => (r.id === result.release.id ? result.release : r))
          );
        }
        syncReleaseDetailCache(queryClient, profileId, result.release);
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
        // Update this release in the matrix cache
        const current = queryClient.getQueryData<ReleaseViewModel[]>(
          queryKeys.releases.matrix(profileId)
        );
        if (current) {
          queryClient.setQueryData(
            queryKeys.releases.matrix(profileId),
            current.map(r => (r.id === result.release.id ? result.release : r))
          );
        }
        syncReleaseDetailCache(queryClient, profileId, result.release);
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

    onSettled: async (_data, error, variables) => {
      if (!error) {
        queryClient.removeQueries({
          queryKey: queryKeys.releases.detail(profileId, variables.releaseId),
        });
      }
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
      const current = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(profileId)
      );
      if (current) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(profileId),
          current.map(r => (r.id === updated.id ? updated : r))
        );
      }
      syncReleaseDetailCache(queryClient, profileId, updated);
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
      const current = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(profileId)
      );
      if (current) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(profileId),
          current.map(r => (r.id === release.id ? release : r))
        );
      }
      syncReleaseDetailCache(queryClient, profileId, release);
    },
  });
}
