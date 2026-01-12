import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

async function fetchDashboardProfile(): Promise<DashboardProfile> {
  const response = await fetch('/api/dashboard/profile');

  if (!response.ok) {
    throw new Error('Failed to fetch profile');
  }

  return response.json() as Promise<DashboardProfile>;
}

interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

async function updateDashboardProfile(
  input: UpdateProfileInput
): Promise<DashboardProfile> {
  const response = await fetch('/api/dashboard/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to update profile');
  }

  return response.json() as Promise<DashboardProfile>;
}

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
  });
}

/**
 * Mutation hook for updating the current user's dashboard profile.
 * Automatically invalidates the profile query on success.
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
    onSuccess: updatedProfile => {
      // Update the cache with the new profile data
      queryClient.setQueryData(queryKeys.user.profile(), updatedProfile);
    },
  });
}
