import { useQuery } from '@tanstack/react-query';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

/**
 * Public profile data returned from the /api/creator endpoint.
 */
export interface PublicProfileData {
  id: string;
  username: string;
  usernameNormalized: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  creatorType: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  spotifyId: string | null;
  isPublic: boolean;
  isVerified: boolean;
  isClaimed: boolean;
  isFeatured: boolean;
  marketingOptOut: boolean;
  settings: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  socialLinks: Array<{
    id: string;
    platform: string;
    platformType: string | null;
    url: string;
    displayText: string | null;
    clicks: number;
    isActive: boolean;
    sortOrder: number;
  }>;
}

/**
 * Fetch public profile data by username.
 * Uses the /api/creator endpoint which returns public-only profile data.
 */
async function fetchPublicProfile(
  username: string,
  signal?: AbortSignal
): Promise<PublicProfileData> {
  const url = `/api/creator?username=${encodeURIComponent(username)}`;

  try {
    return await fetchWithTimeout<PublicProfileData>(url, { signal });
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      throw new FetchError('Creator not found', 404, error.response);
    }
    throw error;
  }
}

export interface UsePublicProfileQueryOptions {
  /**
   * The username to fetch. Query is disabled if null/undefined/empty.
   */
  username: string | null | undefined;
  /**
   * Whether the query is enabled. Defaults to true (when username is provided).
   */
  enabled?: boolean;
}

/**
 * Query hook for fetching public profile data by username.
 *
 * Uses the /api/creator endpoint with TanStack Query benefits:
 * - Automatic caching (15 min stale time via STABLE_CACHE)
 * - Background refetching on mount
 * - Deduplication of concurrent requests
 * - Automatic retry on failure
 *
 * @example
 * function NotificationsPage() {
 *   const params = useParams();
 *   const { data, isLoading, error } = usePublicProfileQuery({
 *     username: params.username as string,
 *   });
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage />;
 *
 *   return <SubscribeForm artistId={data.id} />;
 * }
 */
export function usePublicProfileQuery({
  username,
  enabled = true,
}: UsePublicProfileQueryOptions) {
  return useQuery({
    queryKey: queryKeys.profile.byUsername(username ?? ''),
    queryFn: ({ signal }): Promise<PublicProfileData> =>
      fetchPublicProfile(username!, signal),
    enabled: enabled && Boolean(username),
    // STABLE_CACHE: 15 min stale, 1 hr gc - public profiles rarely change
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
