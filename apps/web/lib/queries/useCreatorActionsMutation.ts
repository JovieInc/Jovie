'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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

// Mutation functions
async function toggleFeatured(
  input: ToggleFeaturedInput
): Promise<ToggleFeaturedResponse> {
  const response = await fetch('/app/admin/creators/toggle-featured', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    isFeatured?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Failed to update featured status');
  }

  return {
    success: true,
    isFeatured: payload.isFeatured,
  };
}

async function toggleMarketing(
  input: ToggleMarketingInput
): Promise<ToggleMarketingResponse> {
  const response = await fetch('/app/admin/creators/toggle-marketing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    marketingOptOut?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Failed to update marketing preferences');
  }

  return {
    success: true,
    marketingOptOut: payload.marketingOptOut,
  };
}

async function deleteCreator(
  input: DeleteCreatorInput
): Promise<CreatorActionResponse> {
  const response = await fetch('/app/admin/creators/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Failed to delete creator/user');
  }

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
