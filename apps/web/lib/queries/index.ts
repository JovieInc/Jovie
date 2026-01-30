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
export {
  type QueryKeys,
  queryKeys,
} from './keys';
// Mutation utilities
export {
  createMutationCallbacks,
  getErrorMessage,
  handleMutationError,
  handleMutationSuccess,
  type MutationCallbackOptions,
} from './mutation-utils';
// Error boundary with automatic query reset
export { QueryErrorBoundary } from './QueryErrorBoundary';
// Query hooks
export { useActivityFeedQuery } from './useActivityFeedQuery';
// Admin social links query
export {
  type AdminSocialLink,
  type UseAdminSocialLinksQueryOptions,
  useAdminSocialLinksQuery,
} from './useAdminSocialLinksQuery';
export {
  type ArtistSearchState,
  type SpotifyArtistResult,
  type UseArtistSearchQueryOptions,
  type UseArtistSearchQueryReturn,
  useArtistSearchQuery,
} from './useArtistSearchQuery';
// Artist theme mutation
export {
  type ArtistTheme,
  type ArtistThemeInput,
  type ArtistThemeResponse,
  useArtistThemeMutation,
} from './useArtistThemeMutation';
export {
  type CheckoutInput,
  type CheckoutResponse,
  type PortalResponse,
  useCheckoutMutation,
  usePortalMutation,
} from './useBillingMutations';
export {
  type BillingStatusData,
  useBillingStatusQuery,
} from './useBillingStatusQuery';
// Build info / version monitoring
export {
  type BuildInfo,
  type UseVersionMonitorOptions,
  type UseVersionMonitorResult,
  useBuildInfoQuery,
  useVersionMonitor,
  type VersionMismatchInfo,
} from './useBuildInfoQuery';
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
// Dashboard social links query and mutation
export {
  type DashboardSocialLink,
  type SaveSocialLinksInput,
  useDashboardSocialLinksQuery,
  useSaveSocialLinksMutation,
} from './useDashboardSocialLinksQuery';
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
// Handle availability query
export {
  type HandleAvailabilityResponse,
  type UseHandleAvailabilityQueryOptions,
  useHandleAvailabilityQuery,
  useInvalidateHandleAvailability,
} from './useHandleAvailabilityQuery';
// Admin impersonation query and mutation
export {
  type ImpersonationState,
  useEndImpersonationMutation,
  useImpersonationQuery,
} from './useImpersonationQuery';
// Ingest refresh mutation
export {
  type IngestRefreshInput,
  type IngestRefreshResponse,
  useIngestRefreshMutation,
} from './useIngestRefreshMutation';
// Link verification mutation
export {
  type LinkVerificationInput,
  type LinkVerificationResponse,
  type UseLinkVerificationMutationOptions,
  useLinkVerificationMutation,
} from './useLinkVerificationMutation';
// Notification status/subscription
export {
  useNotificationStatusQuery,
  useSubscribeNotificationsMutation,
  useUnsubscribeNotificationsMutation,
} from './useNotificationStatusQuery';
// Pixel settings mutation
export {
  type PixelSettingsInput,
  type PixelSettingsResponse,
  usePixelSettingsMutation,
} from './usePixelSettingsMutation';
export {
  type PricingOption,
  type PricingOptionsResponse,
  usePricingOptionsQuery,
} from './usePricingOptionsQuery';
// Profile editor mutations (TanStack Query + Pacer integration)
export {
  type ProfileData,
  type ProfileUpdateInput,
  type ProfileUpdateResponse,
  type UseAvatarMutationOptions,
  type UseProfileMutationOptions,
  useAvatarMutation,
  useProfileMutation,
  useProfileSaveMutation,
} from './useProfileMutation';
// Public profile query
export {
  type PublicProfileData,
  type UsePublicProfileQueryOptions,
  usePublicProfileQuery,
} from './usePublicProfileQuery';
export {
  useResetProviderOverrideMutation,
  useSaveProviderOverrideMutation,
  useSyncReleasesFromSpotifyMutation,
} from './useReleaseMutations';
// Release queries and mutations
export { useReleasesQuery } from './useReleasesQuery';
// Settings mutations
export {
  type SettingsUpdateInput,
  useNotificationSettingsMutation,
  useThemeMutation,
  useUpdateSettingsMutation,
} from './useSettingsMutation';
// Social links mutations
export {
  type AcceptSuggestionInput,
  type DismissSuggestionInput,
  useAcceptSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionMutations,
} from './useSocialLinksMutation';
export {
  type SuggestionsQueryResult,
  type UseSuggestionsQueryOptions,
  useSuggestionsQuery,
} from './useSuggestionsQuery';
// User avatar upload mutation
export {
  type UseUserAvatarMutationOptions,
  useUserAvatarMutation,
} from './useUserAvatarMutation';
// Waitlist mutations (admin + public)
export {
  type ApproveWaitlistInput,
  type UpdateWaitlistStatusInput,
  useApproveWaitlistMutation,
  useUpdateWaitlistStatusMutation,
  useWaitlistSubmitMutation,
  type WaitlistMutationResponse,
  type WaitlistSubmitInput,
  type WaitlistSubmitResponse,
} from './useWaitlistMutations';
