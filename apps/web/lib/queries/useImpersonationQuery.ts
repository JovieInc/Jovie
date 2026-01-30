'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createQueryFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ImpersonationState {
  enabled: boolean;
  isImpersonating: boolean;
  effectiveClerkId?: string;
  effectiveDbId?: string;
  realAdminClerkId?: string;
  timeRemainingMs?: number;
  timeRemainingMinutes?: number;
  expiresAt?: number;
}

const fetchImpersonationStatus = createQueryFn<ImpersonationState>(
  '/api/admin/impersonate'
);

/**
 * TanStack Query hook for fetching admin impersonation status.
 *
 * @example
 * const { data: impersonation, isLoading } = useImpersonationQuery();
 *
 * if (impersonation?.isImpersonating) {
 *   // Show impersonation banner
 * }
 */
export function useImpersonationQuery() {
  return useQuery({
    queryKey: queryKeys.admin.impersonation(),
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * TanStack Query mutation hook for ending admin impersonation.
 *
 * @example
 * const { mutate: endImpersonation, isPending } = useEndImpersonationMutation();
 *
 * endImpersonation(undefined, {
 *   onSuccess: () => window.location.reload(),
 * });
 */
export function useEndImpersonationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await fetchWithTimeout<{ success: boolean }>('/api/admin/impersonate', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      // Update cache to reflect ended impersonation
      queryClient.setQueryData(
        queryKeys.admin.impersonation(),
        (old: ImpersonationState | undefined) =>
          old ? { ...old, isImpersonating: false } : old
      );
    },
    onError: error => {
      handleMutationError(error, 'Failed to end impersonation');
    },
  });
}
