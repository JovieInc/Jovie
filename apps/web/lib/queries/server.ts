import 'server-only';

import { dehydrate, QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

/**
 * Server-side TanStack Query utilities for SSR prefetching.
 *
 * This module provides utilities for prefetching queries on the server
 * and passing them to the client for hydration, enabling:
 * - Zero-latency initial data (no loading spinners)
 * - Seamless SSR → client handoff
 * - Background refetching after hydration
 *
 * @example
 * // In a Server Component (page.tsx or layout.tsx):
 * import { getQueryClient, HydrateClient } from '@/lib/queries/server';
 * import { queryKeys } from '@/lib/queries';
 *
 * export default async function DashboardLayout({ children }) {
 *   const queryClient = getQueryClient();
 *
 *   // Prefetch data on the server
 *   await queryClient.prefetchQuery({
 *     queryKey: queryKeys.user.profile(),
 *     queryFn: fetchProfileOnServer,
 *   });
 *
 *   return (
 *     <HydrateClient>
 *       {children}
 *     </HydrateClient>
 *   );
 * }
 */

/**
 * Server-side QueryClient configuration.
 * Optimized for SSR with no retries and throwing on errors.
 */
const createServerQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry on server - let errors propagate for error boundaries
        retry: false,
        // Longer stale time for SSR - data is already fresh from server
        staleTime: 60 * 1000, // 1 minute
        // Don't refetch on server
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      dehydrate: {
        // Include successful queries in dehydration
        shouldDehydrateQuery: query => query.state.status === 'success',
      },
    },
  });

/**
 * Get or create a QueryClient for the current request.
 * Uses React's cache() to ensure one client per request in RSC.
 *
 * This prevents sharing query data between different users/requests
 * while allowing multiple components to share the same prefetch.
 */
export const getQueryClient = cache(() => createServerQueryClient());

/**
 * Dehydrate the current request's QueryClient for client hydration.
 * Call this after all prefetching is complete.
 */
export const getDehydratedState = () => dehydrate(getQueryClient());

/**
 * Prefetch a query on the server and return the dehydrated state.
 *
 * Convenience wrapper that handles the common pattern of:
 * 1. Get the request-scoped QueryClient
 * 2. Prefetch the query
 * 3. Return dehydrated state for HydrateClient
 *
 * @example
 * // In a Server Component
 * import { prefetchQuery, HydrateClient } from '@/lib/queries/server';
 * import { queryKeys } from '@/lib/queries';
 *
 * export default async function ProfilePage() {
 *   const dehydratedState = await prefetchQuery({
 *     queryKey: queryKeys.user.profile(),
 *     queryFn: () => fetchProfileFromDB(),
 *   });
 *
 *   return (
 *     <HydrateClient state={dehydratedState}>
 *       <ProfileContent />
 *     </HydrateClient>
 *   );
 * }
 */
export async function prefetchQuery<T>(options: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
}) {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(options);
  return getDehydratedState();
}

/**
 * Prefetch multiple queries in parallel on the server.
 *
 * Use this when a page needs multiple data sources prefetched.
 * All queries run concurrently for optimal performance.
 *
 * @example
 * // In a Server Component
 * import { prefetchQueries, HydrateClient } from '@/lib/queries/server';
 * import { queryKeys } from '@/lib/queries';
 *
 * export default async function DashboardPage() {
 *   const dehydratedState = await prefetchQueries([
 *     {
 *       queryKey: queryKeys.user.profile(),
 *       queryFn: () => fetchProfileFromDB(),
 *     },
 *     {
 *       queryKey: queryKeys.billing.status(),
 *       queryFn: () => fetchBillingFromDB(),
 *     },
 *   ]);
 *
 *   return (
 *     <HydrateClient state={dehydratedState}>
 *       <DashboardContent />
 *     </HydrateClient>
 *   );
 * }
 */
export async function prefetchQueries(
  queries: Array<{
    queryKey: readonly unknown[];
    queryFn: () => Promise<unknown>;
  }>
) {
  const queryClient = getQueryClient();
  await Promise.all(queries.map(query => queryClient.prefetchQuery(query)));
  return getDehydratedState();
}

export { dehydrate };
