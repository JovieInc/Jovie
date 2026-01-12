'use client';

import {
  isServer,
  QueryClient,
  type QueryClientConfig,
  QueryClientProvider,
} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { type ReactNode, useState } from 'react';

// Lazy load devtools only in development to avoid production bundle bloat
const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then(mod => ({
      default: mod.ReactQueryDevtools,
    })),
  { ssr: false }
);

function DevToolsLoader() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  return (
    <ReactQueryDevtools initialIsOpen={false} buttonPosition='bottom-left' />
  );
}

/**
 * Client-side QueryClient configuration.
 *
 * Optimized for authenticated app pages with:
 * - 5 min stale time for responsive UX
 * - Background refetching on window focus
 * - Retry with exponential backoff
 * - 30 min garbage collection
 *
 * Note: Public profile pages use Next.js SSR caching (unstable_cache + ISR)
 * and don't need TanStack Query for initial data. TanStack Query is
 * primarily for authenticated dashboard/app functionality.
 */
const createQueryClientConfig = (): QueryClientConfig => ({
  defaultOptions: {
    queries: {
      // Stale time: 5 minutes - data is considered fresh for this duration
      // This prevents unnecessary refetches while keeping data reasonably fresh
      staleTime: 5 * 60 * 1000,

      // Cache time: 30 minutes - unused data stays in cache
      // Allows instant back-navigation without refetching
      gcTime: 30 * 60 * 1000,

      // Retry failed requests up to 3 times with exponential backoff
      // Handles transient network issues gracefully
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus in production only
      // Keeps data fresh when users switch tabs back to the app
      refetchOnWindowFocus: process.env.NODE_ENV === 'production',

      // Refetch on mount if data is stale
      // Ensures fresh data when navigating between pages
      refetchOnMount: true,

      // Always refetch on reconnect to sync after offline periods
      refetchOnReconnect: 'always',
    },
    mutations: {
      // Disable automatic retries for mutations by default.
      // Mutations are often non-idempotent (e.g., creating records, charging payments)
      // and automatic retries can cause duplicate side effects.
      // Opt-in to retries per-mutation where the operation is safe/idempotent:
      //   useMutation({ mutationFn, retry: 3 })
      // Or use queryClient.setMutationDefaults for specific mutation keys.
      retry: 0,
      // Delay available for mutations that opt-in to retries
      retryDelay: 1000,
    },
  },
});

// Browser: singleton QueryClient for consistent cache across navigations
// Server: new client per request (handled by server.ts)
let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) {
    // Server: always create new client (prevents cross-request data leakage)
    return new QueryClient(createQueryClientConfig());
  }

  // Browser: reuse singleton for cache persistence across navigations
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient(createQueryClientConfig());
  }
  return browserQueryClient;
}

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * TanStack Query provider for client-side data fetching.
 *
 * Features:
 * - Singleton QueryClient in browser for persistent cache
 * - Separate QueryClient per SSR request (via server.ts)
 * - DevTools in development mode
 * - Optimized defaults for authenticated app pages
 *
 * Architecture:
 * - Public profiles: Use Next.js SSR caching (fast TTFB, ISR)
 * - Dashboard/app: Use TanStack Query (client caching, background refresh)
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // Use useState to ensure client gets the singleton on hydration
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <DevToolsLoader />
    </QueryClientProvider>
  );
}
