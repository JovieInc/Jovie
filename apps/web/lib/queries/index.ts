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

// Admin infinite queries
export {
  type AdminCreatorProfileRow,
  type AdminCreatorProfilesSort,
  type AdminUserRow,
  type AdminUserStatus,
  type AdminUsersSort,
  useAdminCreatorsInfiniteQuery,
  useAdminUsersInfiniteQuery,
  useAdminWaitlistInfiniteQuery,
  type WaitlistEntryRow,
} from './admin-infinite';
// Audience infinite query
export { useAudienceInfiniteQuery } from './audience-infinite';
// Cache strategy presets
export {
  FREQUENT_CACHE,
  PAGINATED_CACHE,
  REALTIME_CACHE,
  SEARCH_CACHE,
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
// Account mutations (GDPR)
export {
  useDeleteAccountMutation,
  useExportDataMutation,
} from './useAccountMutations';
// Query hooks
export { useActivityFeedQuery } from './useActivityFeedQuery';
// Admin bulk refresh mutation
export { useAdminBulkRefreshMutation } from './useAdminBulkRefreshMutation';
// Admin feedback mutation
export { useDismissFeedbackMutation } from './useAdminFeedbackMutation';
export {
  type AdminLead,
  type AdminLeadKeyword,
  type AdminLeadListResponse,
  type LeadPipelineSettings,
  useAddLeadKeywordsMutation,
  useDeleteLeadKeywordMutation,
  useLeadKeywordsQuery,
  useLeadPipelineSettingsQuery,
  useLeadsListQuery,
  useMarkLeadDmSentMutation,
  useQueueLeadUrlsMutation,
  useRunLeadDiscoveryMutation,
  useRunLeadQualificationMutation,
  useSeedLeadKeywordsMutation,
  useToggleLeadKeywordMutation,
  useUpdateLeadPipelineSettingsMutation,
  useUpdateLeadStatusMutation,
} from './useAdminLeadsPrimitives';
// Admin social links query
export {
  type AdminSocialLink,
  type UseAdminSocialLinksQueryOptions,
  useAdminSocialLinksQuery,
} from './useAdminSocialLinksQuery';
export {
  type AppleMusicArtistResult,
  type AppleMusicSearchState,
  type UseAppleMusicArtistSearchQueryOptions,
  type UseAppleMusicArtistSearchQueryReturn,
  useAppleMusicArtistSearchQuery,
} from './useAppleMusicArtistSearchQuery';
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
// Artwork download mutation
export { useArtworkDownloadMutation } from './useArtworkDownloadMutation';
// Avatar upload mutation (admin)
export {
  type AvatarUploadInput,
  type UseAvatarUploadMutationOptions,
  updateCreatorAvatar,
  uploadAvatarToBlob,
  useAvatarUploadMutation,
} from './useAvatarUploadMutation';
// Bandsintown connection status
export { useBandsintownConnectionQuery } from './useBandsintownConnectionQuery';
// Batch ingest mutation (admin)
export {
  type BatchIngestApiResponse,
  type BatchIngestInput,
  type BatchResult,
  useBatchIngestMutation,
} from './useBatchIngestMutation';
export {
  type BillingHistoryEntry,
  useBillingHistoryQuery,
} from './useBillingHistoryQuery';
export {
  type CancelSubscriptionResponse,
  type CheckoutInput,
  type CheckoutResponse,
  type PortalResponse,
  useCancelSubscriptionMutation,
  useCheckoutMutation,
  usePortalMutation,
} from './useBillingMutations';
export {
  type BillingStatusData,
  billingStatusQueryOptions,
  useBillingStatusQuery,
  useIsPro,
} from './useBillingStatusQuery';
// Build info / version monitoring
export {
  type BuildInfo,
  fetchBuildInfo,
  type UseVersionMonitorOptions,
  type UseVersionMonitorResult,
  useBuildInfoQuery,
  useVersionMonitor,
  type VersionMismatchInfo,
} from './useBuildInfoQuery';
// Campaign invites
export {
  type CampaignPreviewResponse,
  type CampaignStats,
  type CampaignStatsResponse,
  type JobQueueStats,
  type SendCampaignInvitesInput,
  type SendCampaignInvitesResponse,
  useCampaignInvitesQuery,
  useCampaignOverviewQuery,
  useCampaignPreviewQuery,
  useCampaignSettings,
  useCampaignStatsQuery,
  useSaveCampaignSettings,
  useSendCampaignInvitesMutation,
} from './useCampaignInvites';
// Chat conversation query
export { useChatConversationQuery } from './useChatConversationQuery';
// Chat conversations list query
export {
  type ChatConversation,
  useChatConversationsQuery,
} from './useChatConversationsQuery';
// Chat mutations
export {
  type ChatMessage,
  useAddMessagesMutation,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useUpdateConversationMutation,
} from './useChatMutations';
// Chat usage query
export {
  type ChatUsageData,
  chatUsageQueryOptions,
  useChatUsageQuery,
} from './useChatUsageQuery';
// Confirm chat edit mutation
export {
  type ConfirmChatEditInput,
  useConfirmChatEditMutation,
} from './useConfirmChatEditMutation';
// Confirm chat link mutation
export {
  type ConfirmChatLinkInput,
  useConfirmChatLinkMutation,
} from './useConfirmChatLinkMutation';
// Confirm chat remove link mutation
export {
  type ConfirmChatRemoveLinkInput,
  useConfirmChatRemoveLinkMutation,
} from './useConfirmChatRemoveLinkMutation';
// Contacts query
export { useContactsQuery } from './useContactsQuery';
// Admin creator mutations
export {
  useDeleteCreatorMutation,
  useToggleFeaturedMutation,
  useToggleMarketingMutation,
} from './useCreatorMutations';
// Creator verification mutation
export {
  type ToggleVerificationInput,
  type ToggleVerificationResponse,
  useToggleVerificationMutation,
} from './useCreatorVerificationMutation';
export { useDashboardAnalyticsQuery } from './useDashboardAnalyticsQuery';
export {
  type DashboardProfile,
  useDashboardProfileQuery,
  useUpdateDashboardProfileMutation,
  useUpdateVenmoMutation,
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
// Earnings query
export {
  type EarningsResponse,
  type EarningsStats,
  type TipperRow,
  useEarningsQuery,
} from './useEarningsQuery';
// Environment health query
export {
  type EnvHealthResponse,
  useEnvHealthQuery,
} from './useEnvHealthQuery';
// Feedback mutation
export { useFeedbackMutation } from './useFeedbackMutation';
// Growth plan early access request
export {
  type GrowthAccessRequestInput,
  type GrowthAccessRequestResponse,
  useGrowthAccessRequestMutation,
} from './useGrowthAccessRequestMutation';
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
// Ingest profile mutation
export {
  type IngestProfileInput,
  type IngestProfileResponse,
  useIngestProfileMutation,
} from './useIngestProfileMutation';
// Ingest refresh mutation
export {
  type IngestRefreshInput,
  type IngestRefreshResponse,
  useIngestRefreshMutation,
} from './useIngestRefreshMutation';
// Insights mutation
export {
  useGenerateInsightsMutation,
  useUpdateInsightMutation,
} from './useInsightsMutation';
// Insights query
export {
  useInsightsQuery,
  useInsightsSummaryQuery,
} from './useInsightsQuery';
// Invite mutation
export {
  type CreateInviteInput,
  type CreateInviteResponse,
  useCreateInviteMutation,
} from './useInviteMutation';
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
  useUpdateContentPreferencesMutation,
  useVerifyEmailOtpMutation,
} from './useNotificationStatusQuery';
export {
  type PixelSettingsInput,
  type PixelSettingsResponse,
  usePixelSettingsDeleteMutation,
  usePixelSettingsMutation,
} from './usePixelSettingsMutation';
// Pixel settings query and mutation
export {
  type PixelSettingsData,
  usePixelSettingsQuery,
} from './usePixelSettingsQuery';
// Plan gate hook
export { type PlanGateEntitlements, usePlanGate } from './usePlanGate';
// Pre-save mutation
export { useApplePreSaveMutation } from './usePreSaveMutation';
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
// QR code download mutation
export { useQrCodeDownloadMutation } from './useQrCodeDownloadMutation';
export {
  useFormatReleaseLyricsMutation,
  useRefreshReleaseMutation,
  useRescanIsrcLinksMutation,
  useResetProviderOverrideMutation,
  useSaveCanvasStatusMutation,
  useSaveProviderOverrideMutation,
  useSaveReleaseLyricsMutation,
  useSyncReleasesFromSpotifyMutation,
} from './useReleaseMutations';
// Release queries and mutations
export { useReleasesQuery } from './useReleasesQuery';

export {
  type ReleaseTrack,
  useReleaseTracksQuery,
} from './useReleaseTracksQuery';
// Remove social link mutation
export {
  type RemoveSocialLinkInput,
  useRemoveSocialLinkMutation,
} from './useRemoveSocialLinkMutation';
// Settings mutations
export {
  type SettingsUpdateInput,
  useAnalyticsFilterMutation,
  useBrandingSettingsMutation,
  useHighContrastMutation,
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
// Tour date mutations
export {
  useConnectBandsintownMutation,
  useCreateTourDateMutation,
  useDeleteTourDateMutation,
  useDisconnectBandsintownMutation,
  useRemoveBandsintownApiKeyMutation,
  useSaveBandsintownApiKeyMutation,
  useSyncFromBandsintownMutation,
  useUpdateTourDateMutation,
} from './useTourDateMutations';
// Tracking mutation (fire-and-forget)
export { useTrackingMutation } from './useTrackingMutation';
// Unified artist search query
export { useUnifiedArtistSearchQuery } from './useUnifiedArtistSearchQuery';
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
  useDisapproveWaitlistMutation,
  useUpdateWaitlistStatusMutation,
  useWaitlistSubmitMutation,
  type WaitlistMutationResponse,
  type WaitlistSubmitInput,
  type WaitlistSubmitResponse,
} from './useWaitlistMutations';
// Waitlist settings query and mutation (admin)
export {
  useWaitlistSettingsMutation,
  useWaitlistSettingsQuery,
  type WaitlistSettingsResponse,
  type WaitlistSettingsUpdateInput,
} from './useWaitlistSettingsQuery';
// Waitlist status query
export {
  useWaitlistStatusQuery,
  type WaitlistStatusResponse,
} from './useWaitlistStatusQuery';
// Wrap link mutation
export {
  useWrapLinkMutation,
  type WrapLinkInput,
  type WrapLinkResponse,
} from './useWrapLinkMutation';
