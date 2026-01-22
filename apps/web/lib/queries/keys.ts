/**
 * Query key factory for TanStack Query.
 *
 * Provides consistent, hierarchical query keys for cache management.
 * Use these factories to ensure proper cache invalidation and organization.
 *
 * @example
 * // Using in a query hook
 * useQuery({
 *   queryKey: queryKeys.billing.status(),
 *   queryFn: fetchBillingStatus,
 * });
 *
 * @example
 * // Invalidating related queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
 */

export const queryKeys = {
  // Billing queries
  billing: {
    all: ['billing'] as const,
    status: () => [...queryKeys.billing.all, 'status'] as const,
    subscription: () => [...queryKeys.billing.all, 'subscription'] as const,
    invoices: () => [...queryKeys.billing.all, 'invoices'] as const,
    pricingOptions: () =>
      [...queryKeys.billing.all, 'pricing-options'] as const,
  },

  // User/profile queries
  user: {
    all: ['user'] as const,
    profile: () => [...queryKeys.user.all, 'profile'] as const,
    settings: () => [...queryKeys.user.all, 'settings'] as const,
    notifications: () => [...queryKeys.user.all, 'notifications'] as const,
  },

  // Dashboard data queries
  dashboard: {
    all: ['dashboard'] as const,
    analytics: (view?: string, range?: string) =>
      [
        ...queryKeys.dashboard.all,
        'analytics',
        ...(view === undefined ? [] : [{ view, range }]),
      ] as const,
    links: () => [...queryKeys.dashboard.all, 'links'] as const,
    socialLinks: () => [...queryKeys.dashboard.all, 'social-links'] as const,
    activityFeed: (profileId?: string, range?: string) =>
      [
        ...queryKeys.dashboard.all,
        'activity-feed',
        ...(profileId === undefined ? [] : [{ profileId, range }]),
      ] as const,
  },

  // Creator profiles (admin)
  creators: {
    all: ['creators'] as const,
    list: (filters?: Record<string, unknown>) =>
      [
        ...queryKeys.creators.all,
        'list',
        ...(filters === undefined ? [] : [filters]),
      ] as const,
    detail: (id: string) => [...queryKeys.creators.all, 'detail', id] as const,
    featured: () => [...queryKeys.creators.all, 'featured'] as const,
    socialLinks: (profileId: string) =>
      [...queryKeys.creators.all, 'social-links', profileId] as const,
  },

  // Admin users
  adminUsers: {
    all: ['admin-users'] as const,
    list: (filters?: Record<string, unknown>) =>
      [
        ...queryKeys.adminUsers.all,
        'list',
        ...(filters === undefined ? [] : [filters]),
      ] as const,
    detail: (id: string) =>
      [...queryKeys.adminUsers.all, 'detail', id] as const,
  },

  // Admin waitlist
  waitlist: {
    all: ['waitlist'] as const,
    list: (filters?: Record<string, unknown>) =>
      [
        ...queryKeys.waitlist.all,
        'list',
        ...(filters === undefined ? [] : [filters]),
      ] as const,
    entry: (id: string) => [...queryKeys.waitlist.all, 'entry', id] as const,
  },

  // Public profile queries
  profile: {
    all: ['profile'] as const,
    byUsername: (username: string) =>
      [...queryKeys.profile.all, 'username', username] as const,
    links: (profileId: string) =>
      [...queryKeys.profile.all, 'links', profileId] as const,
  },

  // Notifications (fan-facing subscriptions)
  notifications: {
    all: ['notifications'] as const,
    status: (params: {
      artistId: string;
      email?: string | null;
      phone?: string | null;
    }) =>
      [
        ...queryKeys.notifications.all,
        'status',
        {
          artistId: params.artistId,
          email: params.email ?? null,
          phone: params.phone ?? null,
        },
      ] as const,
  },

  // Spotify search queries
  spotify: {
    all: ['spotify'] as const,
    artistSearch: (query: string, limit: number) =>
      [...queryKeys.spotify.all, 'artist-search', { query, limit }] as const,
  },

  // Dashboard suggestions polling
  suggestions: {
    all: ['suggestions'] as const,
    list: (profileId: string) =>
      [...queryKeys.suggestions.all, 'list', profileId] as const,
  },

  // DSP enrichment queries
  dspEnrichment: {
    all: ['dsp-enrichment'] as const,
    matches: (profileId: string, status?: string) =>
      [
        ...queryKeys.dspEnrichment.all,
        'matches',
        profileId,
        status ?? 'all',
      ] as const,
    matchDetail: (matchId: string) =>
      [...queryKeys.dspEnrichment.all, 'match', matchId] as const,
    status: (profileId: string) =>
      [...queryKeys.dspEnrichment.all, 'status', profileId] as const,
    providerData: (profileId: string, providerId: string) =>
      [
        ...queryKeys.dspEnrichment.all,
        'provider',
        profileId,
        providerId,
      ] as const,
  },

  // Releases queries
  releases: {
    all: ['releases'] as const,
    matrix: (profileId: string) =>
      [...queryKeys.releases.all, 'matrix', profileId] as const,
    dspStatus: (releaseId: string) =>
      [...queryKeys.releases.all, 'dsp-status', releaseId] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
