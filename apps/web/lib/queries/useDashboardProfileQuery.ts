import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STANDARD_CACHE } from './cache-strategies';
import { createMutationFn, createQueryFn } from './fetch';
import { queryKeys } from './keys';

export interface DashboardProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// Use shared fetch utilities for consistent timeout and error handling
const fetchDashboardProfile = createQueryFn<DashboardProfile>(
  '/api/dashboard/profile'
);

interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

// Use shared mutation helper for consistent error handling
const updateDashboardProfile = createMutationFn<
  UpdateProfileInput,
  DashboardProfile
>('/api/dashboard/profile', 'PATCH');

/**
 * Query hook for fetching the current user's dashboard profile.
 *
 * @example
 * function ProfileHeader() {
 *   const { data: profile, isLoading } = useDashboardProfileQuery();
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return <h1>{profile?.displayName ?? profile?.username}</h1>;
 * }
 */
export function useDashboardProfileQuery() {
  return useQuery({
    queryKey: queryKeys.user.profile(),
    queryFn: fetchDashboardProfile,
    // Use STANDARD_CACHE preset (5 min stale time) to prevent frequent refetches
    ...STANDARD_CACHE,
  });
}

/**
 * Mutation hook for updating the current user's dashboard profile.
 *
 * Features optimistic updates for instant UI feedback:
 * - `onMutate`: Immediately updates cache with expected values
 * - `onError`: Rolls back to previous state if mutation fails
 * - `onSettled`: Ensures cache is in sync after mutation completes
 *
 * @example
 * function ProfileForm() {
 *   const { mutate, isPending } = useUpdateDashboardProfileMutation();
 *
 *   const handleSubmit = (data: UpdateProfileInput) => {
 *     mutate(data, {
 *       onSuccess: () => toast.success('Profile updated!'),
 *       onError: (error) => toast.error(error.message),
 *     });
 *   };
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useUpdateDashboardProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDashboardProfile,

    // Optimistic update: apply changes immediately before server responds
    onMutate: async (newData: UpdateProfileInput) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.user.profile() });

      // Snapshot the previous value for rollback
      const previousProfile = queryClient.getQueryData<DashboardProfile>(
        queryKeys.user.profile()
      );

      // Optimistically update the cache
      if (previousProfile) {
        queryClient.setQueryData<DashboardProfile>(queryKeys.user.profile(), {
          ...previousProfile,
          ...newData,
          updatedAt: new Date().toISOString(),
        });
      }

      // Return context with snapshot for rollback
      return { previousProfile };
    },

    // Rollback on error
    onError: (_error, _newData, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(
          queryKeys.user.profile(),
          context.previousProfile
        );
      }
    },

    // Always refetch after error or success to ensure server state
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
    },
  });
}
