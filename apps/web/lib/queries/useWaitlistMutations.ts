'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { FetchError, fetchWithTimeout } from './fetch';
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

export interface WaitlistSubmitInput {
  primaryGoal: string;
  primarySocialUrl: string;
  spotifyUrl: string | null;
  spotifyArtistName: string | null;
  heardAbout: string | null;
  selectedPlan: string | null;
}

export interface WaitlistSubmitResponse {
  success: boolean;
  error?: string;
  errors?: Record<string, string[]>;
}

/**
 * Mutation function for approving a waitlist entry.
 */
async function approveWaitlistEntry(
  input: ApproveWaitlistInput
): Promise<WaitlistMutationResponse> {
  try {
    const payload = await fetchWithTimeout<{
      success?: boolean;
      status?: string;
      error?: string;
    }>(`${APP_ROUTES.ADMIN_WAITLIST}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!payload.success) {
      throw new Error(payload.error ?? 'Failed to approve waitlist entry');
    }

    return {
      success: true,
      status: payload.status ?? 'invited',
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to approve waitlist entry');
    }
    throw error;
  }
}

/**
 * Mutation function for updating waitlist entry status.
 */
async function updateWaitlistStatus(
  input: UpdateWaitlistStatusInput
): Promise<WaitlistMutationResponse> {
  try {
    const payload = await fetchWithTimeout<{
      success?: boolean;
      status?: string;
      error?: string;
    }>(`${APP_ROUTES.ADMIN_WAITLIST}/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!payload.success) {
      throw new Error(payload.error ?? 'Failed to update waitlist status');
    }

    return {
      success: true,
      status: payload.status ?? input.status,
    };
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error('Failed to update waitlist status');
    }
    throw error;
  }
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

/**
 * Mutation function for submitting a new waitlist entry.
 */
async function submitWaitlistEntry(
  input: WaitlistSubmitInput
): Promise<WaitlistSubmitResponse> {
  const response = await fetch('/api/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new FetchError(
      `Expected JSON but got ${contentType}`,
      response.status,
      response
    );
  }

  const result = (await response.json()) as WaitlistSubmitResponse;

  if (!response.ok) {
    // Preserve field errors for form validation
    if (result.errors) {
      const error = new FetchError(
        result.error ?? 'Validation failed',
        response.status,
        response
      );
      (error as FetchError & { errors?: Record<string, string[]> }).errors =
        result.errors;
      throw error;
    }
    throw new FetchError(
      result.error ?? 'Failed to submit waitlist entry',
      response.status,
      response
    );
  }

  return result;
}

/**
 * TanStack Query mutation hook for submitting a waitlist entry.
 *
 * @example
 * const { mutate: submitWaitlist, isPending } = useWaitlistSubmitMutation();
 *
 * submitWaitlist(
 *   {
 *     primaryGoal: 'streams',
 *     primarySocialUrl: 'https://instagram.com/artist',
 *     spotifyUrl: null,
 *     heardAbout: null,
 *     selectedPlan: null,
 *   },
 *   {
 *     onSuccess: () => setIsSubmitted(true),
 *     onError: (error) => {
 *       if ('errors' in error) {
 *         setFieldErrors(error.errors);
 *       }
 *     },
 *   }
 * );
 */
export function useWaitlistSubmitMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitWaitlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all });
    },
  });
}
