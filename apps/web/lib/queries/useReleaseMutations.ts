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
    onSuccess: (updated, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
    },
  });
}

export function useResetProviderOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetProviderOverride,
    onSuccess: (updated, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.releases.matrix(variables.profileId),
      });
    },
  });
}

export function useSyncReleasesFromSpotifyMutation(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncFromSpotify,
    onSuccess: result => {
      if (result.success) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.releases.matrix(profileId),
        });
      }
    },
  });
}
