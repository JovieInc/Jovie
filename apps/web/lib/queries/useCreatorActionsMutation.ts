'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

// Types
export interface ToggleFeaturedInput {
  profileId: string;
  nextFeatured: boolean;
}

export interface ToggleMarketingInput {
  profileId: string;
  nextMarketingOptOut: boolean;
}

export interface DeleteCreatorInput {
  profileId: string;
}

export interface CreatorActionResponse {
  success: boolean;
  error?: string;
}

interface ToggleFeaturedResponse extends CreatorActionResponse {
  isFeatured?: boolean;
}

interface ToggleMarketingResponse extends CreatorActionResponse {
  marketingOptOut?: boolean;
}

// Common fetch helper using fetchWithTimeout
async function postJSON<T>(
  url: string,
  body: unknown,
  errorMessage: string
): Promise<T> {
  try {
    const payload = await fetchWithTimeout<
      { success?: boolean; error?: string } & T
    >(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!payload.success) {
      throw new Error(payload.error ?? errorMessage);
    }

    return payload;
  } catch (error) {
    if (error instanceof FetchError) {
      throw new Error(errorMessage);
    }
    throw error;
  }
}

// Mutation functions
async function toggleFeatured(
  input: ToggleFeaturedInput
): Promise<ToggleFeaturedResponse> {
  const payload = await postJSON<{ isFeatured?: boolean }>(
    APP_ROUTES.ADMIN_CREATORS_TOGGLE_FEATURED,
    input,
    'Failed to update featured status'
  );
  return { success: true, isFeatured: payload.isFeatured };
}

async function toggleMarketing(
  input: ToggleMarketingInput
): Promise<ToggleMarketingResponse> {
  const payload = await postJSON<{ marketingOptOut?: boolean }>(
    APP_ROUTES.ADMIN_CREATORS_TOGGLE_MARKETING,
    input,
    'Failed to update marketing preferences'
  );
  return { success: true, marketingOptOut: payload.marketingOptOut };
}

async function deleteCreator(
  input: DeleteCreatorInput
): Promise<CreatorActionResponse> {
  await postJSON(
    APP_ROUTES.ADMIN_CREATORS_DELETE,
    input,
    'Failed to delete creator/user'
  );
  return { success: true };
}

/**
 * TanStack Query mutation hook for toggling creator featured status.
 *
 * @example
 * const { mutate: toggleFeatured, isPending } = useToggleFeaturedMutation();
 *
 * toggleFeatured(
 *   { profileId: '123', nextFeatured: true },
 *   {
 *     onSuccess: () => toast.success('Featured status updated'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useToggleFeaturedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleFeatured,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}

/**
 * TanStack Query mutation hook for toggling creator marketing opt-out.
 *
 * @example
 * const { mutate: toggleMarketing, isPending } = useToggleMarketingMutation();
 *
 * toggleMarketing(
 *   { profileId: '123', nextMarketingOptOut: true },
 *   {
 *     onSuccess: () => toast.success('Marketing preferences updated'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useToggleMarketingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleMarketing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}

/**
 * TanStack Query mutation hook for deleting a creator/user.
 *
 * @example
 * const { mutate: deleteCreator, isPending } = useDeleteCreatorMutation();
 *
 * deleteCreator(
 *   { profileId: '123' },
 *   {
 *     onSuccess: () => toast.success('Creator deleted'),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useDeleteCreatorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCreator,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
