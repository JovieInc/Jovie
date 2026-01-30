'use client';

/**
 * Social links mutation hooks for accepting/dismissing suggestions.
 *
 * Provides React Query mutations for link suggestion actions with:
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Consistent error handling with toasts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';
import type { SuggestionsQueryResult } from './useSuggestionsQuery';

/**
 * Input for accepting a link suggestion.
 */
export interface AcceptSuggestionInput {
  profileId: string;
  linkId: string;
}

/**
 * Input for dismissing a link suggestion.
 */
export interface DismissSuggestionInput {
  profileId: string;
  linkId: string;
}

/**
 * Response from the suggestion action API.
 */
interface SuggestionActionResponse {
  link?: {
    id: string;
    platform: string;
    platformType: string;
    url: string;
    state: string;
    sortOrder?: number;
    isActive?: boolean;
    [key: string]: unknown;
  };
  success?: boolean;
  error?: string;
}

/**
 * Accept a link suggestion via PATCH.
 */
async function acceptSuggestion(
  input: AcceptSuggestionInput
): Promise<SuggestionActionResponse> {
  return fetchWithTimeout<SuggestionActionResponse>(
    '/api/dashboard/social-links',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: input.profileId,
        linkId: input.linkId,
        action: 'accept',
      }),
    }
  );
}

/**
 * Dismiss a link suggestion via PATCH.
 */
async function dismissSuggestion(
  input: DismissSuggestionInput
): Promise<SuggestionActionResponse> {
  return fetchWithTimeout<SuggestionActionResponse>(
    '/api/dashboard/social-links',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: input.profileId,
        linkId: input.linkId,
        action: 'dismiss',
      }),
    }
  );
}

/**
 * Hook for accepting a link suggestion.
 *
 * Uses optimistic updates to immediately move the suggestion to an "accepting" state,
 * with automatic rollback on error.
 *
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const { mutate: accept, isPending } = useAcceptSuggestionMutation(profileId);
 *
 * const handleAccept = (linkId: string) => {
 *   accept({ profileId, linkId });
 * };
 * ```
 */
export function useAcceptSuggestionMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptSuggestion,

    // Optimistic update: mark the suggestion as being accepted
    onMutate: async variables => {
      if (!profileId) return;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.suggestions.list(profileId),
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<SuggestionsQueryResult>(
        queryKeys.suggestions.list(profileId)
      );

      // Optimistically update - mark the link as 'active' (accepted)
      if (previousData) {
        queryClient.setQueryData<SuggestionsQueryResult>(
          queryKeys.suggestions.list(profileId),
          {
            ...previousData,
            links: previousData.links.map(link =>
              link.id === variables.linkId
                ? { ...link, state: 'active' as const }
                : link
            ),
          }
        );
      }

      return { previousData };
    },

    onSuccess: () => {
      handleMutationSuccess('Link added to your list');
    },

    // On error, rollback to the previous value
    onError: (error, _variables, context) => {
      if (context?.previousData && profileId) {
        queryClient.setQueryData(
          queryKeys.suggestions.list(profileId),
          context.previousData
        );
      }
      handleMutationError(error, 'Failed to accept link');
    },

    // Always refetch after error or success to ensure cache is in sync
    onSettled: () => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.list(profileId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.socialLinks(),
        });
      }
    },
  });
}

/**
 * Hook for dismissing a link suggestion.
 *
 * Uses optimistic updates to immediately remove the suggestion from the UI,
 * with automatic rollback on error.
 *
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const { mutate: dismiss, isPending } = useDismissSuggestionMutation(profileId);
 *
 * const handleDismiss = (linkId: string) => {
 *   dismiss({ profileId, linkId });
 * };
 * ```
 */
export function useDismissSuggestionMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissSuggestion,

    // Optimistic update: immediately remove the suggestion from cache
    onMutate: async variables => {
      if (!profileId) return;

      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.suggestions.list(profileId),
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<SuggestionsQueryResult>(
        queryKeys.suggestions.list(profileId)
      );

      // Optimistically update the cache
      if (previousData) {
        queryClient.setQueryData<SuggestionsQueryResult>(
          queryKeys.suggestions.list(profileId),
          {
            ...previousData,
            links: previousData.links.filter(
              link => link.id !== variables.linkId
            ),
          }
        );
      }

      // Return context with the previous data for rollback
      return { previousData };
    },

    onSuccess: () => {
      handleMutationSuccess('Suggestion dismissed');
    },

    // On error, rollback to the previous value
    onError: (error, _variables, context) => {
      if (context?.previousData && profileId) {
        queryClient.setQueryData(
          queryKeys.suggestions.list(profileId),
          context.previousData
        );
      }
      handleMutationError(error, 'Failed to dismiss suggestion');
    },

    // Always refetch after error or success to ensure cache is in sync
    onSettled: () => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.list(profileId),
        });
      }
    },
  });
}

/**
 * Combined hook providing both accept and dismiss mutations.
 *
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const {
 *   acceptMutation,
 *   dismissMutation,
 *   isAccepting,
 *   isDismissing,
 * } = useSuggestionMutations(profileId);
 *
 * // Accept a suggestion
 * acceptMutation.mutate({ profileId, linkId: suggestion.id });
 *
 * // Dismiss a suggestion
 * dismissMutation.mutate({ profileId, linkId: suggestion.id });
 * ```
 */
export function useSuggestionMutations(profileId: string | undefined) {
  const acceptMutation = useAcceptSuggestionMutation(profileId);
  const dismissMutation = useDismissSuggestionMutation(profileId);

  return {
    acceptMutation,
    dismissMutation,
    isAccepting: acceptMutation.isPending,
    isDismissing: dismissMutation.isPending,
    isAnyPending: acceptMutation.isPending || dismissMutation.isPending,
  };
}
