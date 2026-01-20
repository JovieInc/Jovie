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
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const { mutate: accept, isPending } = useAcceptSuggestionMutation(profileId);
 *
 * const handleAccept = (linkId: string) => {
 *   accept({ profileId, linkId }, {
 *     onSuccess: (data) => {
 *       // Add link to active links list
 *       if (data.link) {
 *         setLinks(prev => [...prev, transformLink(data.link)]);
 *       }
 *     },
 *   });
 * };
 * ```
 */
export function useAcceptSuggestionMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptSuggestion,

    onSuccess: () => {
      handleMutationSuccess('Link added to your list');

      // Invalidate suggestions query to refresh the list
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.list(profileId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.socialLinks(),
        });
      }
    },

    onError: error => {
      handleMutationError(error, 'Failed to accept link');
    },
  });
}

/**
 * Hook for dismissing a link suggestion.
 *
 * @param profileId - The profile ID for cache invalidation
 *
 * @example
 * ```tsx
 * const { mutate: dismiss, isPending } = useDismissSuggestionMutation(profileId);
 *
 * const handleDismiss = (linkId: string) => {
 *   dismiss({ profileId, linkId }, {
 *     onSuccess: () => {
 *       // Remove suggestion from local state
 *       setSuggestedLinks(prev => prev.filter(s => s.id !== linkId));
 *     },
 *   });
 * };
 * ```
 */
export function useDismissSuggestionMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissSuggestion,

    onSuccess: () => {
      handleMutationSuccess('Suggestion dismissed');

      // Invalidate suggestions query to refresh the list
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.list(profileId),
        });
      }
    },

    onError: error => {
      handleMutationError(error, 'Failed to dismiss suggestion');
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
