'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

/**
 * Response from the handle availability check API.
 */
export interface HandleAvailabilityResponse {
  available: boolean;
  error?: string;
}

/**
 * Fetch handle availability from the API.
 */
async function fetchHandleAvailability(
  handle: string,
  signal?: AbortSignal
): Promise<HandleAvailabilityResponse> {
  const url = `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`;

  try {
    return await fetchWithTimeout<HandleAvailabilityResponse>(url, { signal });
  } catch (error) {
    if (error instanceof FetchError) {
      // Parse error response if available
      const errorMessage = error.message || 'Error checking availability';
      return { available: false, error: errorMessage };
    }
    throw error;
  }
}

export interface UseHandleAvailabilityQueryOptions {
  /**
   * The handle to check. Query is disabled if null/undefined/empty or too short.
   */
  handle: string | null | undefined;
  /**
   * Whether the query is enabled. Defaults to true (when handle is valid).
   */
  enabled?: boolean;
}

/**
 * Query hook for checking handle availability.
 *
 * Uses the /api/handle/check endpoint with TanStack Query benefits:
 * - Automatic caching (30s stale time to match existing validation cache)
 * - Background refetching on mount
 * - Deduplication of concurrent requests
 * - Automatic retry on failure
 *
 * @example
 * function HandleInput() {
 *   const [handle, setHandle] = useState('');
 *   const { data, isLoading, isFetching } = useHandleAvailabilityQuery({
 *     handle: handle.length >= 3 ? handle : null,
 *   });
 *
 *   return (
 *     <div>
 *       <input value={handle} onChange={e => setHandle(e.target.value)} />
 *       {isFetching && <Spinner />}
 *       {data?.available && <CheckIcon />}
 *       {data?.error && <ErrorText>{data.error}</ErrorText>}
 *     </div>
 *   );
 * }
 */
export function useHandleAvailabilityQuery({
  handle,
  enabled = true,
}: UseHandleAvailabilityQueryOptions) {
  return useQuery({
    queryKey: queryKeys.handle.availability(handle ?? ''),
    queryFn: ({ signal }): Promise<HandleAvailabilityResponse> =>
      fetchHandleAvailability(handle!, signal),
    // Only enable when handle is at least 3 characters
    enabled: enabled && Boolean(handle) && handle!.length >= 3,
    // Match existing validation cache TTL (30 seconds)
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    // Don't refetch aggressively - user is actively typing
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1, // Single retry for transient failures
  });
}

/**
 * Hook to invalidate handle availability cache.
 *
 * Call this after a username is successfully claimed to ensure
 * the cache reflects the new state.
 *
 * @example
 * const invalidate = useInvalidateHandleAvailability();
 *
 * async function onClaimSuccess(handle: string) {
 *   await invalidate(handle);
 * }
 */
export function useInvalidateHandleAvailability() {
  const queryClient = useQueryClient();

  return async (handle: string) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.handle.availability(handle),
    });
  };
}
