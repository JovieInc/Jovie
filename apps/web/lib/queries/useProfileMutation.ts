'use client';

/**
 * Profile mutation hooks using TanStack Query.
 *
 * Provides consistent mutation handling for profile updates with:
 * - Optimistic updates for instant feedback
 * - Automatic cache invalidation
 * - Error handling with rollback
 * - Toast notifications
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn, FetchError } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

// ============================================================================
// Types
// ============================================================================

/**
 * Profile settings update payload.
 */
export interface ProfileSettingsUpdate {
  hide_branding?: boolean;
}

/**
 * Profile update payload for display name, username, avatar, and other fields.
 */
export interface ProfileUpdateInput {
  profileId?: string;
  updates: {
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    bio?: string;
    // Music links
    spotify_url?: string | null;
    apple_music_url?: string | null;
    youtube_url?: string | null;
    // Settings object for feature flags
    settings?: ProfileSettingsUpdate;
  };
}

/**
 * Profile data returned from API.
 */
export interface ProfileData {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  creatorType: string | null;
  isPublic: boolean;
}

/**
 * Response from profile update API.
 */
export interface ProfileUpdateResponse {
  profile: ProfileData;
  warning?: string;
}

/**
 * Avatar upload response.
 */
interface AvatarUploadResponse {
  blobUrl: string;
}

// ============================================================================
// Mutation Functions
// ============================================================================

const updateProfileApi = createMutationFn<
  ProfileUpdateInput,
  ProfileUpdateResponse
>('/api/dashboard/profile', 'PUT');

async function uploadAvatarApi(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new FetchError(
      body.error ?? 'Failed to upload image',
      response.status,
      response
    );
  }

  const body = (await response.json()) as AvatarUploadResponse;
  if (!body.blobUrl) {
    throw new FetchError('Upload failed: no URL returned', 500);
  }

  return body.blobUrl;
}

// ============================================================================
// Profile Update Mutation
// ============================================================================

export interface UseProfileMutationOptions {
  /** Called on successful update */
  onSuccess?: (data: ProfileUpdateResponse) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Suppress toast notifications */
  silent?: boolean;
}

/**
 * Hook for updating profile (display name, username).
 *
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic rollback on error
 * - Cache invalidation for related queries
 *
 * @example
 * ```tsx
 * const { mutate: updateProfile, isPending } = useProfileMutation({
 *   onSuccess: (data) => console.log('Updated:', data.profile),
 * });
 *
 * // Update display name
 * updateProfile({ updates: { displayName: 'New Name' } });
 * ```
 */
export function useProfileMutation(options: UseProfileMutationOptions = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError, silent = false } = options;

  return useMutation({
    mutationFn: updateProfileApi,

    onMutate: async variables => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.user.profile() });
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard.all });

      // Snapshot current state for rollback
      const previousProfile = queryClient.getQueryData(
        queryKeys.user.profile()
      );

      // Optimistically update the cache
      if (previousProfile && variables.updates) {
        queryClient.setQueryData(
          queryKeys.user.profile(),
          (old: ProfileData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              ...variables.updates,
            };
          }
        );
      }

      return { previousProfile };
    },

    onSuccess: (data, _variables, _context) => {
      // Update cache with server response
      queryClient.setQueryData(queryKeys.user.profile(), data.profile);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      onSuccess?.(data);
    },

    onError: (error, _variables, context) => {
      // Rollback to previous state
      if (context?.previousProfile) {
        queryClient.setQueryData(
          queryKeys.user.profile(),
          context.previousProfile
        );
      }

      if (!silent) {
        handleMutationError(error, 'Failed to update profile');
      }

      onError?.(error instanceof Error ? error : new Error('Update failed'));
    },

    // Don't retry on validation errors
    retry: (failureCount, error) => {
      if (error instanceof FetchError && error.isClientError()) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

// ============================================================================
// Avatar Upload Mutation
// ============================================================================

export interface UseAvatarMutationOptions {
  /** Called on successful upload with the new avatar URL */
  onSuccess?: (avatarUrl: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Hook for uploading and updating profile avatar.
 *
 * Handles the two-step process:
 * 1. Upload image to blob storage
 * 2. Update profile with new avatar URL
 *
 * @example
 * ```tsx
 * const { mutate: uploadAvatar, isPending } = useAvatarMutation({
 *   onSuccess: (url) => console.log('New avatar:', url),
 * });
 *
 * // Upload avatar
 * uploadAvatar(file);
 * ```
 */
export function useAvatarMutation(options: UseAvatarMutationOptions = {}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError } = options;

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      // Step 1: Upload to blob storage
      const blobUrl = await uploadAvatarApi(file);

      // Step 2: Update profile with new URL
      await updateProfileApi({ updates: { avatarUrl: blobUrl } });

      return blobUrl;
    },

    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.user.profile() });

      // Snapshot for rollback
      const previousProfile = queryClient.getQueryData(
        queryKeys.user.profile()
      );

      return { previousProfile };
    },

    onSuccess: avatarUrl => {
      // Update cache with new avatar
      queryClient.setQueryData(
        queryKeys.user.profile(),
        (old: ProfileData | undefined) => {
          if (!old) return old;
          return { ...old, avatarUrl };
        }
      );

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      onSuccess?.(avatarUrl);
    },

    onError: (error, _variables, context) => {
      // Rollback to previous state
      if (context?.previousProfile) {
        queryClient.setQueryData(
          queryKeys.user.profile(),
          context.previousProfile
        );
      }

      handleMutationError(error, 'Failed to upload avatar');
      onError?.(error instanceof Error ? error : new Error('Upload failed'));
    },

    retry: false, // Don't retry uploads
  });
}

// ============================================================================
// Combined Profile Save (for auto-save scenarios)
// ============================================================================

/**
 * Lightweight mutation for silent profile saves (used by auto-save).
 * No toasts, optimized for frequent calls.
 */
export function useProfileSaveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfileApi,

    onSuccess: data => {
      // Silently update cache
      queryClient.setQueryData(queryKeys.user.profile(), data.profile);
    },

    onError: () => {
      // Invalidate to refetch correct state
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
    },

    // Don't retry - auto-save will trigger again
    retry: false,
  });
}
