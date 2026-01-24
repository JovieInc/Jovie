/**
 * TanStack Query mutations for tour dates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  connectBandsintownArtist,
  createTourDate,
  deleteTourDate,
  disconnectBandsintown,
  syncFromBandsintown,
  updateTourDate,
} from '@/app/app/dashboard/tour-dates/actions';
import { queryKeys } from './keys';

/**
 * Connect Bandsintown artist mutation
 */
export function useConnectBandsintownMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: connectBandsintownArtist,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.list(profileId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.connection(profileId),
        }),
      ]);
    },
  });
}

/**
 * Sync from Bandsintown mutation
 */
export function useSyncFromBandsintownMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncFromBandsintown,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.list(profileId),
      });
    },
  });
}

/**
 * Disconnect Bandsintown mutation
 */
export function useDisconnectBandsintownMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectBandsintown,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.list(profileId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.connection(profileId),
        }),
      ]);
    },
  });
}

/**
 * Create tour date mutation
 */
export function useCreateTourDateMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTourDate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.list(profileId),
      });
    },
  });
}

/**
 * Update tour date mutation
 */
export function useUpdateTourDateMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTourDate,
    onSuccess: async updated => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.list(profileId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.detail(updated.id),
        }),
      ]);
    },
  });
}

/**
 * Delete tour date mutation
 */
export function useDeleteTourDateMutation(profileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTourDate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.list(profileId),
      });
    },
  });
}
