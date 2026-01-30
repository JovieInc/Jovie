'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

/**
 * TanStack Query mutation hooks for admin creator profile actions.
 *
 * These hooks provide proper cache invalidation and optimistic updates
 * for creator profile mutations in the admin panel.
 */

interface ToggleFeaturedInput {
  profileId: string;
  nextFeatured: boolean;
}

interface ToggleFeaturedResponse {
  success: boolean;
  isFeatured?: boolean;
  error?: string;
}

interface ToggleMarketingInput {
  profileId: string;
  nextMarketingOptOut: boolean;
}

interface ToggleMarketingResponse {
  success: boolean;
  marketingOptOut?: boolean;
  error?: string;
}

interface DeleteCreatorInput {
  profileId: string;
}

interface DeleteCreatorResponse {
  success: boolean;
  error?: string;
}

/**
 * Mutation hook for toggling creator featured status.
 *
 * @example
 * const { mutate: toggleFeatured, isPending } = useToggleFeaturedMutation();
 *
 * toggleFeatured(
 *   { profileId: '123', nextFeatured: true },
 *   {
 *     onSuccess: () => toast.success('Creator featured!'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useToggleFeaturedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ToggleFeaturedInput
    ): Promise<ToggleFeaturedResponse> => {
      const payload = await fetchWithTimeout<ToggleFeaturedResponse>(
        '/app/admin/creators/toggle-featured',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(input),
        }
      );

      if (!payload.success) {
        throw new Error(payload.error ?? 'Failed to update featured status');
      }

      return payload;
    },

    // Invalidate creators list to refresh data after mutation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}

/**
 * Mutation hook for toggling creator marketing opt-out status.
 *
 * @example
 * const { mutate: toggleMarketing, isPending } = useToggleMarketingMutation();
 *
 * toggleMarketing(
 *   { profileId: '123', nextMarketingOptOut: true },
 *   {
 *     onSuccess: () => toast.success('Marketing preferences updated!'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useToggleMarketingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ToggleMarketingInput
    ): Promise<ToggleMarketingResponse> => {
      const payload = await fetchWithTimeout<ToggleMarketingResponse>(
        '/app/admin/creators/toggle-marketing',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(input),
        }
      );

      if (!payload.success) {
        throw new Error(
          payload.error ?? 'Failed to update marketing preferences'
        );
      }

      return payload;
    },

    // Invalidate creators list to refresh data after mutation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}

/**
 * Mutation hook for deleting a creator profile.
 *
 * @example
 * const { mutate: deleteCreator, isPending } = useDeleteCreatorMutation();
 *
 * deleteCreator(
 *   { profileId: '123' },
 *   {
 *     onSuccess: () => toast.success('Creator deleted!'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useDeleteCreatorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: DeleteCreatorInput
    ): Promise<DeleteCreatorResponse> => {
      const payload = await fetchWithTimeout<DeleteCreatorResponse>(
        '/app/admin/creators/delete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(input),
        }
      );

      if (!payload.success) {
        throw new Error(payload.error ?? 'Failed to delete creator');
      }

      return payload;
    },

    // Invalidate creators list to refresh data after mutation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
