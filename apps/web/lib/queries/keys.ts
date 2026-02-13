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
    analytics: (range?: string) =>
      [
        ...queryKeys.dashboard.all,
        'analytics',
        ...(range === undefined ? [] : [range]),
      ] as const,
    links: () => [...queryKeys.dashboard.all, 'links'] as const,
    socialLinks: (profileId?: string) =>
      [
        ...queryKeys.dashboard.all,
        'social-links',
        ...(profileId === undefined ? [] : [profileId]),
      ] as const,
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
    status: () => [...queryKeys.waitlist.all, 'status'] as const,
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

  // Apple Music search queries
  appleMusic: {
    all: ['apple-music'] as const,
    artistSearch: (query: string, limit: number) =>
      [...queryKeys.appleMusic.all, 'artist-search', { query, limit }] as const,
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

  // Contacts queries
  contacts: {
    all: ['contacts'] as const,
    list: (profileId: string) =>
      [...queryKeys.contacts.all, 'list', profileId] as const,
  },

  // Tour dates queries
  tourDates: {
    all: ['tour-dates'] as const,
    list: (profileId: string) =>
      [...queryKeys.tourDates.all, 'list', profileId] as const,
    upcoming: (profileId: string) =>
      [...queryKeys.tourDates.all, 'upcoming', profileId] as const,
    detail: (id: string) => [...queryKeys.tourDates.all, 'detail', id] as const,
    connection: (profileId: string) =>
      [...queryKeys.tourDates.all, 'connection', profileId] as const,
  },

  // Handle/username availability queries
  handle: {
    all: ['handle'] as const,
    availability: (handle: string) =>
      [...queryKeys.handle.all, 'availability', handle.toLowerCase()] as const,
  },

  // Link wrapping queries
  links: {
    all: ['links'] as const,
    wrapped: () => [...queryKeys.links.all, 'wrapped'] as const,
  },

  // Health monitoring
  health: {
    all: ['health'] as const,
    buildInfo: () => [...queryKeys.health.all, 'build-info'] as const,
  },

  // Admin queries
  admin: {
    all: ['admin'] as const,
    impersonation: () => [...queryKeys.admin.all, 'impersonation'] as const,
  },

  // Campaign invite queries (admin)
  campaign: {
    all: ['campaign-invites'] as const,
    preview: (threshold: number, limit: number) =>
      [...queryKeys.campaign.all, 'preview', { threshold, limit }] as const,
    stats: () => [...queryKeys.campaign.all, 'stats'] as const,
  },

  // AI Insights
  insights: {
    all: ['insights'] as const,
    list: (filters?: Record<string, unknown>) =>
      [
        ...queryKeys.insights.all,
        'list',
        ...(filters === undefined ? [] : [filters]),
      ] as const,
    summary: () => [...queryKeys.insights.all, 'summary'] as const,
    detail: (id: string) => [...queryKeys.insights.all, 'detail', id] as const,
  },

  // Chat conversations
  chat: {
    all: ['chat'] as const,
    conversations: (limit?: number) =>
      [
        ...queryKeys.chat.all,
        'conversations',
        ...(limit === undefined ? [] : [{ limit }]),
      ] as const,
    conversation: (id: string) =>
      [...queryKeys.chat.all, 'conversation', id] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
