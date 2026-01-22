'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

// Types
export interface ApproveWaitlistInput {
  entryId: string;
}

export interface UpdateWaitlistStatusInput {
  entryId: string;
  status: 'new' | 'invited' | 'claimed';
}

export interface WaitlistMutationResponse {
  success: boolean;
  status?: string;
  error?: string;
}

/**
 * Mutation function for approving a waitlist entry.
 */
async function approveWaitlistEntry(
  input: ApproveWaitlistInput
): Promise<WaitlistMutationResponse> {
  const response = await fetch('/app/admin/waitlist/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    status?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? 'Failed to approve waitlist entry');
  }

  return {
    success: true,
    status: payload.status ?? 'invited',
  };
}

/**
 * Mutation function for updating waitlist entry status.
 */
async function updateWaitlistStatus(
  input: UpdateWaitlistStatusInput
): Promise<WaitlistMutationResponse> {
  const response = await fetch('/app/admin/waitlist/update-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    status?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? 'Failed to update waitlist status');
  }

  return {
    success: true,
    status: payload.status ?? input.status,
  };
}

/**
 * TanStack Query mutation hook for approving a waitlist entry.
 *
 * @example
 * const { mutate: approve, isPending } = useApproveWaitlistMutation();
 *
 * approve(
 *   { entryId: '123' },
 *   {
 *     onSuccess: () => toast.success('Entry approved'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useApproveWaitlistMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveWaitlistEntry,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all });
    },
  });
}

/**
 * TanStack Query mutation hook for updating waitlist entry status.
 *
 * @example
 * const { mutate: updateStatus, isPending } = useUpdateWaitlistStatusMutation();
 *
 * updateStatus(
 *   { entryId: '123', status: 'invited' },
 *   {
 *     onSuccess: () => toast.success('Status updated'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useUpdateWaitlistStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWaitlistStatus,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all });
    },
  });
}
