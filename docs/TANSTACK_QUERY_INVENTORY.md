# TanStack Query Inventory

> Last updated: 2026-02-05

Complete inventory of TanStack Query usage across the Jovie codebase. All hooks live in `/apps/web/lib/queries/`.

---

## Queries (useQuery hooks) — 24 total

| # | Hook | File | Query Key | Endpoint / Source | Cache Strategy |
|---|------|------|-----------|-------------------|----------------|
| 1 | `useChatConversationsQuery()` | `useChatConversationsQuery.ts` | `chat.conversations()` | GET `/api/chat/conversations` | Custom (30s stale, 5min gc) |
| 2 | `useChatConversationQuery({ conversationId })` | `useChatConversationQuery.ts` | `chat.conversation(id)` | GET `/api/chat/conversations/{id}` | Custom (10s stale, 5min gc) |
| 3 | `useBillingStatusQuery()` | `useBillingStatusQuery.ts` | `billing.status()` | GET `/api/billing/status` | FREQUENT_CACHE (1min/10min) |
| 4 | `useIsPro()` (derived) | `useBillingStatusQuery.ts` | `billing.status()` | select: `isPro` field | FREQUENT_CACHE |
| 5 | `usePricingOptionsQuery()` | `usePricingOptionsQuery.ts` | `billing.pricingOptions()` | GET `/api/billing/pricing-options` | STABLE_CACHE (15min/1hr) |
| 6 | `useDashboardProfileQuery()` | `useDashboardProfileQuery.ts` | `user.profile()` | GET `/api/dashboard/profile` | STANDARD_CACHE (5min/30min) |
| 7 | `useDashboardSocialLinksQuery(profileId)` | `useDashboardSocialLinksQuery.ts` | `dashboard.socialLinks(profileId)` | GET `/api/dashboard/social-links` | Custom (30s stale) |
| 8 | `useDashboardAnalyticsQuery({ profileId, range })` | `useDashboardAnalyticsQuery.ts` | `dashboard.analytics(range)` | GET `/api/dashboard/analytics` | Custom (1min stale, 30min gc) |
| 9 | `useActivityFeedQuery({ profileId, range })` | `useActivityFeedQuery.ts` | `dashboard.activityFeed(profileId, range)` | GET `/api/dashboard/activity/recent` | Custom (60s stale, 5min poll) |
| 10 | `useDspMatchesQuery({ profileId, status })` | `useDspMatchesQuery.ts` | `dspEnrichment.matches(profileId, status)` | GET `/api/dsp/matches` | STANDARD_CACHE equivalent (5min/30min inline) |
| 11 | `useDspEnrichmentStatusQuery({ profileId })` | `useDspEnrichmentStatusQuery.ts` | `dspEnrichment.status(profileId)` | GET `/api/dsp/enrichment/status` | Custom (1s stale, 10min gc, dynamic polling) |
| 12 | `useReleasesQuery(profileId)` | `useReleasesQuery.ts` | `releases.matrix(profileId)` | Server Action: `loadReleaseMatrix()` | STANDARD_CACHE |
| 13 | `useArtistSearchQuery({ query, limit })` | `useArtistSearchQuery.ts` | `spotify.artistSearch(query, limit)` | GET `/api/spotify/artist-search` | Custom (1min stale, 10min gc) |
| 14 | `useSuggestionsQuery({ profileId })` | `useSuggestionsQuery.ts` | `suggestions.list(profileId)` | GET `/api/dashboard/suggestions` | Custom (1min stale, 10min gc, adaptive polling) |
| 15 | `useNotificationStatusQuery({ artistId, email, phone })` | `useNotificationStatusQuery.ts` | `notifications.status(...)` | GET `/api/notifications/status` | STANDARD_CACHE equivalent (5min/30min inline) |
| 16 | `usePublicProfileQuery(username)` | `usePublicProfileQuery.ts` | `profile.byUsername(username)` | GET `/api/profiles/{username}` | STABLE_CACHE (15min/1hr) |
| 17 | `useHandleAvailabilityQuery({ handle })` | `useHandleAvailabilityQuery.ts` | `handle.availability(handle)` | GET `/api/auth/check-handle-availability` | Custom (30s stale, 5min gc) |
| 18 | `useAdminSocialLinksQuery(profileId)` | `useAdminSocialLinksQuery.ts` | `creators.socialLinks(profileId)` | GET `/app/admin/creators/{id}/social-links` | Custom (5min stale, 30min gc) |
| 19 | `useImpersonationQuery()` | `useImpersonationQuery.ts` | `admin.impersonation()` | GET `/api/admin/impersonate` | Custom (30s stale) |
| 20 | `useCampaignInvitesPreviewQuery({ threshold, limit })` | `useCampaignInvites.ts` | `campaign.preview(...)` | GET `/app/admin/campaign-invites/preview` | Custom (1min stale, 5min gc) |
| 21 | `useCampaignStatsQuery()` | `useCampaignInvites.ts` | `campaign.stats()` | GET `/app/admin/campaign-invites/stats` | Custom (30s stale, dynamic polling) |
| 22 | `useBuildInfoQuery()` | `useBuildInfoQuery.ts` | `health.buildInfo()` | GET `/api/health/build-info` | Custom (5min polling) |
| 23 | `useEnvHealthQuery()` | `useEnvHealthQuery.ts` | `health.all` | GET `/api/health/env` | Custom (5min stale, 10min gc) |
| 24 | `useWaitlistStatusQuery({ email })` | `useWaitlistStatusQuery.ts` | `waitlist.status()` | POST `/api/waitlist/status` | Custom (1min stale, 5min gc) |

---

## Mutations (useMutation hooks) — 57+ total

### Chat (4)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useCreateConversationMutation()` | `useChatMutations.ts` | POST | `/api/chat/conversations` |
| `useAddMessagesMutation()` | `useChatMutations.ts` | POST | `/api/chat/conversations/{id}/messages` |
| `useUpdateConversationMutation()` | `useChatMutations.ts` | PATCH | `/api/chat/conversations/{id}` |
| `useDeleteConversationMutation()` | `useChatMutations.ts` | DELETE | `/api/chat/conversations/{id}` |

### Billing (2)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useCheckoutMutation()` | `useBillingMutations.ts` | POST | `/api/stripe/checkout` |
| `usePortalMutation()` | `useBillingMutations.ts` | POST | `/api/stripe/portal` |

### Dashboard Profile (2)

| Hook | File | Method | Endpoint | Notes |
|------|------|--------|----------|-------|
| `useUpdateDashboardProfileMutation()` | `useDashboardProfileQuery.ts` | PATCH | `/api/dashboard/profile` | Optimistic update |
| `useUpdateVenmoMutation()` | `useDashboardProfileQuery.ts` | PUT | `/api/dashboard/profile` | — |

### Social Links (3)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useSaveSocialLinksMutation(profileId)` | `useDashboardSocialLinksQuery.ts` | PUT | `/api/dashboard/social-links` |
| `useAcceptSuggestionMutation()` | `useSocialLinksMutation.ts` | POST | `/api/dashboard/social-links/suggestion/accept` |
| `useDismissSuggestionMutation()` | `useSocialLinksMutation.ts` | POST | `/api/dashboard/social-links/suggestion/dismiss` |

### Releases (3)

| Hook | File | Method | Endpoint | Notes |
|------|------|--------|----------|-------|
| `useSaveProviderOverrideMutation()` | `useReleaseMutations.ts` | — | Server Action | Optimistic |
| `useResetProviderOverrideMutation()` | `useReleaseMutations.ts` | — | Server Action | Optimistic |
| `useSyncReleasesFromSpotifyMutation(profileId)` | `useReleaseMutations.ts` | — | Server Action | — |

### Tour Dates (8)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useConnectBandsintownMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useSyncFromBandsintownMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useDisconnectBandsintownMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useCreateTourDateMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useUpdateTourDateMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useDeleteTourDateMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useSaveBandsintownApiKeyMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |
| `useRemoveBandsintownApiKeyMutation(profileId)` | `useTourDateMutations.ts` | — | Server Action |

### DSP Enrichment (3)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useConfirmDspMatchMutation()` | `useDspEnrichmentMutations.ts` | POST | `/api/dsp/matches/confirm` |
| `useRejectDspMatchMutation()` | `useDspEnrichmentMutations.ts` | POST | `/api/dsp/matches/reject` |
| `useTriggerDiscoveryMutation()` | `useDspEnrichmentMutations.ts` | POST | `/api/dsp/enrichment/trigger-discovery` |

### Admin Creators (4+)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useToggleFeaturedMutation()` | `useCreatorMutations.ts` | POST | `/app/admin/creators/toggle-featured` |
| `useToggleMarketingMutation()` | `useCreatorMutations.ts` | POST | `/app/admin/creators/toggle-marketing` |
| `useDeleteCreatorMutation()` | `useCreatorMutations.ts` | POST | `/app/admin/creators/delete` |
| `useCreatorVerificationMutation()` | `useCreatorVerificationMutation.ts` | POST | `/api/admin/creators/verify` |
| Creator action mutations | `useCreatorActionsMutation.ts` | — | Various |

### Ingestion (2)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useIngestRefreshMutation()` | `useIngestRefreshMutation.ts` | POST | `/app/admin/creators/bulk-refresh` |
| `useIngestProfileMutation()` | `useIngestProfileMutation.ts` | POST | `/api/admin/ingest-profile` |

### Settings (3)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useUpdateSettingsMutation()` | `useSettingsMutation.ts` | PATCH | `/api/dashboard/settings` |
| `useThemeMutation()` | `useSettingsMutation.ts` | PATCH | `/api/dashboard/settings/theme` |
| `useNotificationSettingsMutation()` | `useSettingsMutation.ts` | PATCH | `/api/dashboard/settings/notifications` |

### Notifications (2)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useSubscribeNotificationsMutation()` | `useNotificationStatusQuery.ts` | POST | `/api/notifications/subscribe` |
| `useUnsubscribeNotificationsMutation()` | `useNotificationStatusQuery.ts` | POST | `/api/notifications/unsubscribe` |

### Profile/Avatar (4)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useProfileMutation()` | `useProfileMutation.ts` | PUT | `/api/dashboard/profile` |
| `useAvatarMutation()` | `useProfileMutation.ts` | POST | `/api/user/avatar` |
| `useUserAvatarMutation()` | `useUserAvatarMutation.ts` | POST | `/api/user/avatar` |
| `useAvatarUploadMutation()` | `useAvatarUploadMutation.ts` | POST | `/api/upload/avatar` |
| `useArtistThemeMutation()` | `useArtistThemeMutation.ts` | POST | `/api/artist/theme` |

### Waitlist (3)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useWaitlistSubmitMutation()` | `useWaitlistMutations.ts` | POST | `/api/waitlist` |
| `useApproveWaitlistMutation()` | `useWaitlistMutations.ts` | POST | `/app/admin/waitlist/approve` |
| `useUpdateWaitlistStatusMutation()` | `useWaitlistMutations.ts` | PATCH | `/app/admin/waitlist/status` |

### Other (5)

| Hook | File | Method | Endpoint |
|------|------|--------|----------|
| `useEndImpersonationMutation()` | `useImpersonationQuery.ts` | DELETE | `/api/admin/impersonate` |
| `useInviteMutation()` | `useInviteMutation.ts` | POST | `/api/invites` |
| `useLinkVerificationMutation()` | `useLinkVerificationMutation.ts` | POST | `/api/links/verify` |
| `usePixelSettingsMutation()` | `usePixelSettingsMutation.ts` | PUT | `/api/dashboard/pixels/settings` |
| `useWrapLinkMutation()` | `useWrapLinkMutation.ts` | POST | `/api/links/wrap` |

---

## Infrastructure

### Query Keys: `keys.ts`

18 domains organized as a factory pattern:

`billing` · `user` · `dashboard` · `creators` · `adminUsers` · `waitlist` · `profile` · `notifications` · `spotify` · `suggestions` · `dspEnrichment` · `releases` · `tourDates` · `handle` · `links` · `health` · `admin` · `campaign` · `chat`

### Cache Strategies: `cache-strategies.ts`

| Strategy | Stale Time | GC Time | Use Case |
|----------|-----------|---------|----------|
| `REALTIME_CACHE` | 0ms | 5min | Live feeds (opt-in polling) |
| `FREQUENT_CACHE` | 1min | 10min | Billing, stats |
| `STANDARD_CACHE` | 5min | 30min | Profiles, settings |
| `STABLE_CACHE` | 15min | 1hr | Feature flags, public profiles |
| `STATIC_CACHE` | 1hr | 2hr | Platform lists |
| `PAGINATED_CACHE` | 5min | 30min | Infinite scroll (unused) |

### Fetch Utilities: `fetch.ts`

| Export | Purpose |
|--------|---------|
| `fetchWithTimeout<T>()` | Edge-compatible fetch with timeout + abort signal linking |
| `createQueryFn<T>(url)` | Factory for query functions with signal pass-through |
| `createMutationFn<TInput, TOutput>(url, method)` | Factory for mutation functions with JSON serialization |
| `FetchError` | Custom error class with status code and retry detection |

### Mutation Utilities: `mutation-utils.ts`

| Export | Purpose |
|--------|---------|
| `handleMutationError(error, fallback)` | Toast + Sentry error reporting |
| `handleMutationSuccess(message)` | Success toast |
| `createMutationCallbacks(options)` | Factory for standard onSuccess/onError callbacks |
| `getErrorMessage(error, fallback)` | Status-aware error message extraction |

### SSR Support: `server.ts`

- `prefetchQuery()` / `prefetchQueries()` for server-side prefetching
- `HydrateClient.tsx` for hydration boundary
- `QueryErrorBoundary.tsx` for error boundaries with query reset

---

## Not Used

- `useInfiniteQuery` — 0 instances
- `useSuspenseQuery` — 0 instances

---

## Raw Fetch Patterns (Migration Candidates)

Files that still use raw `fetch()` instead of TanStack Query hooks.

### High Priority

| File | Endpoint | Pattern | Notes |
|------|----------|---------|-------|
| `ProfileEditPreviewCard.tsx` | POST `/api/chat/confirm-edit` | Inline fetch in handler | Needs new `useConfirmChatEditMutation()` |
| `useLinksManager.ts` | POST `/api/dashboard/tipping/enable` | Fire-and-forget | Needs new `useTippingEnableMutation()` |

### Medium Priority (Standardization)

| File | Issue | Notes |
|------|-------|-------|
| `useChatMutations.ts` (3 mutations) | Raw `fetch()` inside `useMutation` functions | Should use `createMutationFn` or `fetchWithTimeout` |

### Low Priority (Intentionally Raw)

These use fire-and-forget tracking patterns with `keepalive` — appropriate to keep as-is:

- `ProfileViewTracker.tsx` — POST `/api/profile/view`
- `useProfileTracking.ts` — POST `/api/audience/visit`, `/api/track`
- `SocialLink.tsx` — POST `/api/track`
- `useAnimatedListenInterface.ts` — POST `/api/track`
- `JoviePixel.tsx` — POST `/api/px`
