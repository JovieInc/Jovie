/**
 * TanStack Query hooks and utilities.
 *
 * This module provides centralized query hooks for data fetching with:
 * - Automatic caching and background refetching
 * - Request deduplication
 * - Optimistic updates support
 * - Consistent error handling
 * - SSR prefetching with hydration
 *
 * Architecture:
 * - Public profiles (jov.ie): Use Next.js SSR caching for fast TTFB
 * - Dashboard/app: Use TanStack Query for client-side caching
 *
 * @example
 * // Client-side usage
 * import { useBillingStatusQuery, queryKeys } from '@/lib/queries';
 *
 * const { data, isLoading } = useBillingStatusQuery();
 *
 * // Invalidate queries
 * const queryClient = useQueryClient();
 * queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
 *
 * @example
 * // SSR prefetching (in Server Component)
 * import { getQueryClient, getDehydratedState } from '@/lib/queries/server';
 * import { HydrateClient } from '@/lib/queries';
 *
 * export default async function Layout({ children }) {
 *   const queryClient = getQueryClient();
 *   await queryClient.prefetchQuery({ queryKey: [...], queryFn: ... });
 *
 *   return (
 *     <HydrateClient state={getDehydratedState()}>
 *       {children}
 *     </HydrateClient>
 *   );
 * }
 */

// Cache strategy presets
export {
  FREQUENT_CACHE,
  PAGINATED_CACHE,
  REALTIME_CACHE,
  STABLE_CACHE,
  STANDARD_CACHE,
  STATIC_CACHE,
} from './cache-strategies';
// Fetch utilities (Edge-compatible)
export {
  createMutationFn,
  createQueryFn,
  FetchError,
  fetchWithTimeout,
} from './fetch';

// Client-side hydration boundary
export { HydrateClient } from './HydrateClient';
// Query key factories
export { type QueryKeys, queryKeys } from './keys';
// Error boundary with automatic query reset
export { QueryErrorBoundary } from './QueryErrorBoundary';

// Query hooks
export { useActivityFeedQuery } from './useActivityFeedQuery';
export {
  type ArtistSearchState,
  type SpotifyArtistResult,
  type UseArtistSearchQueryOptions,
  type UseArtistSearchQueryReturn,
  useArtistSearchQuery,
} from './useArtistSearchQuery';
export {
  type BillingStatusData,
  useBillingStatusQuery,
} from './useBillingStatusQuery';
// Admin creator mutations
export {
  useDeleteCreatorMutation,
  useToggleFeaturedMutation,
  useToggleMarketingMutation,
} from './useCreatorMutations';
export { useDashboardAnalyticsQuery } from './useDashboardAnalyticsQuery';
export {
  type DashboardProfile,
  useDashboardProfileQuery,
  useUpdateDashboardProfileMutation,
} from './useDashboardProfileQuery';
// DSP enrichment queries and mutations
export {
  type ConfirmDspMatchInput,
  type ConfirmDspMatchResponse,
  type RejectDspMatchInput,
  type RejectDspMatchResponse,
  type TriggerDiscoveryInput,
  type TriggerDiscoveryResponse,
  useConfirmDspMatchMutation,
  useDspEnrichmentMutations,
  useRejectDspMatchMutation,
  useTriggerDiscoveryMutation,
} from './useDspEnrichmentMutations';
export {
  type EnrichmentPhase,
  type EnrichmentStatus,
  getPhaseLabel,
  getTotalTracksEnriched,
  isEnrichmentComplete,
  isEnrichmentInProgress,
  type ProviderEnrichmentStatus,
  type UseDspEnrichmentStatusQueryOptions,
  useDspEnrichmentStatusQuery,
} from './useDspEnrichmentStatusQuery';
export {
  countMatchesByStatus,
  type DspMatch,
  getBestMatchPerProvider,
  groupMatchesByProvider,
  type UseDspMatchesQueryOptions,
  useDspMatchesQuery,
} from './useDspMatchesQuery';
export {
  type SuggestionsQueryResult,
  type UseSuggestionsQueryOptions,
  useSuggestionsQuery,
} from './useSuggestionsQuery';
