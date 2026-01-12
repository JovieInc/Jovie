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
    analytics: (period?: string) =>
      [...queryKeys.dashboard.all, 'analytics', period] as const,
    links: () => [...queryKeys.dashboard.all, 'links'] as const,
    socialLinks: () => [...queryKeys.dashboard.all, 'social-links'] as const,
    activityFeed: (page?: number) =>
      [...queryKeys.dashboard.all, 'activity-feed', page] as const,
  },

  // Creator profiles (admin)
  creators: {
    all: ['creators'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.creators.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.creators.all, 'detail', id] as const,
    featured: () => [...queryKeys.creators.all, 'featured'] as const,
  },

  // Public profile queries
  profile: {
    all: ['profile'] as const,
    byUsername: (username: string) =>
      [...queryKeys.profile.all, 'username', username] as const,
    links: (profileId: string) =>
      [...queryKeys.profile.all, 'links', profileId] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
