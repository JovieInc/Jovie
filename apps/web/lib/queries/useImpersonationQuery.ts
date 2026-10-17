'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from '@/components/feedback';
import { applyCacheScope } from './cache-isolation';
import { createQueryFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

export interface ImpersonationState {
  enabled: boolean;
  isImpersonating: boolean;
  effectiveUserId?: string;
  actorUserId?: string;
  timeRemainingMs?: number;
  timeRemainingMinutes?: number;
  expiresAt?: number;
}

const fetchImpersonationStatus = createQueryFn<ImpersonationState>(
  '/api/admin/impersonate'
);

interface StartImpersonationInput {
  readonly targetUserId: string;
}

interface StartImpersonationResponse {
  readonly success: true;
  readonly effectiveUserId: string;
  readonly expiresInMinutes: number;
}

const START_TOAST_ID = 'admin-impersonation-start';
const END_TOAST_ID = 'admin-impersonation-end';

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
  const query = useQuery({
    queryKey: queryKeys.admin.impersonation(),
    queryFn: fetchImpersonationStatus,
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes after unmount
    refetchOnWindowFocus: false,
  });

  const impersonation = query.data;
  useEffect(() => {
    applyCacheScope({
      impersonationSubject: impersonation?.isImpersonating
        ? (impersonation.effectiveUserId ?? 'impersonating')
        : null,
    });
  }, [impersonation?.effectiveUserId, impersonation?.isImpersonating]);

  return query;
}

/** Start an effective-user session and fence all prior client query state. */
export function useStartImpersonationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetUserId }: StartImpersonationInput) =>
      fetchWithTimeout<StartImpersonationResponse>('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      }),
    onMutate: () => {
      toast.loading('Starting impersonation…', { id: START_TOAST_ID });
    },
    onSuccess: data => {
      queryClient.setQueryData<ImpersonationState>(
        queryKeys.admin.impersonation(),
        {
          enabled: true,
          isImpersonating: true,
          effectiveUserId: data.effectiveUserId,
          timeRemainingMinutes: data.expiresInMinutes,
        }
      );
      applyCacheScope({ impersonationSubject: data.effectiveUserId });
      toast.dismiss(START_TOAST_ID);
    },
    onError: error => {
      toast.dismiss(START_TOAST_ID);
      handleMutationError(error, 'Failed to start impersonation');
    },
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
    onMutate: () => {
      toast.loading('Ending impersonation…', { id: END_TOAST_ID });
    },
    onSuccess: () => {
      // Update cache to reflect ended impersonation
      queryClient.setQueryData(
        queryKeys.admin.impersonation(),
        (old: ImpersonationState | undefined) =>
          old ? { ...old, isImpersonating: false } : old
      );
      applyCacheScope({ impersonationSubject: null });
      toast.dismiss(END_TOAST_ID);
    },
    onError: error => {
      toast.dismiss(END_TOAST_ID);
      handleMutationError(error, 'Failed to end impersonation');
    },
  });
}
