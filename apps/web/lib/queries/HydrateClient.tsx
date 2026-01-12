'use client';

import {
  HydrationBoundary,
  type HydrationBoundaryProps,
} from '@tanstack/react-query';

/**
 * Client-side hydration boundary for TanStack Query.
 *
 * Wraps children with HydrationBoundary to rehydrate prefetched queries
 * from the server. This component must be a Client Component because
 * it accesses the QueryClient context.
 *
 * @example
 * // In a Server Component layout:
 * import { getQueryClient, getDehydratedState } from '@/lib/queries/server';
 * import { HydrateClient } from '@/lib/queries/HydrateClient';
 *
 * export default async function DashboardLayout({ children }) {
 *   const queryClient = getQueryClient();
 *
 *   await queryClient.prefetchQuery({
 *     queryKey: queryKeys.user.profile(),
 *     queryFn: fetchProfile,
 *   });
 *
 *   return (
 *     <HydrateClient state={getDehydratedState()}>
 *       {children}
 *     </HydrateClient>
 *   );
 * }
 */
export function HydrateClient(props: HydrationBoundaryProps) {
  return <HydrationBoundary {...props} />;
}
