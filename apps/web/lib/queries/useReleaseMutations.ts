'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  resetProviderOverride,
  saveProviderOverride,
  syncFromSpotify,
} from '@/app/app/dashboard/releases/actions';
import { queryKeys } from './keys';

export function useSaveProviderOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveProviderOverride,
    onSuccess: async (updated, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
    },
  });
}

export function useResetProviderOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetProviderOverride,
    onSuccess: async (updated, variables) => {
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
