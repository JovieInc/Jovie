'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  refreshRelease,
  resetProviderOverride,
  saveProviderOverride,
  syncFromSpotify,
} from '@/app/app/(shell)/dashboard/releases/actions';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from './keys';

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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
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
 */
export function useRefreshReleaseMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: refreshRelease,
    onSuccess: async updated => {
      // Update just this release in the matrix cache
      const current = queryClient.getQueryData<ReleaseViewModel[]>(
        queryKeys.releases.matrix(profileId)
      );
      if (current) {
        queryClient.setQueryData(
          queryKeys.releases.matrix(profileId),
          current.map(r => (r.id === updated.id ? updated : r))
        );
      }
    },
  });
}
