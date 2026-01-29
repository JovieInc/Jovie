/**
 * Dashboard actions re-export file.
 *
 * This file re-exports all public APIs from the actions/ subdirectory,
 * maintaining backward compatibility with existing imports from
 * '@/app/app/dashboard/actions'.
 *
 * For new code, consider importing directly from the domain-specific modules:
 * - @/lib/db/server - Server-safe utilities (profileIsPublishable, selectDashboardProfile, TippingStats, createEmptyTippingStats)
 * - @/lib/services/social-links/types - Social links types and constants (DSP_PLATFORMS, DspPlatform)
 * - ./actions/dashboard-data - Core dashboard data fetching
 * - ./actions/social-links - Social links server actions
 * - ./actions/settings - User dashboard settings server actions
 * - ./actions/creator-profile - Creator profile management server actions
 */

// Non-async utilities (from server-safe module)
export {
  createEmptyTippingStats,
  profileIsPublishable,
  selectDashboardProfile,
  type TippingStats,
} from '@/lib/db/server';
export type { DspPlatform } from '@/lib/services/social-links/types';
export { DSP_PLATFORMS } from '@/lib/services/social-links/types';
// Types and constants (imported directly from source to avoid "use server" conflicts)
export type { DashboardData } from './actions/dashboard-data';
// Server actions (from barrel - all async)
export {
  getDashboardData,
  getDashboardDataCached,
  getDashboardDataFresh,
  getProfileSocialLinks,
  prefetchDashboardData,
  publishProfileBasics,
  setSidebarCollapsed,
  updateCreatorProfile,
} from './actions/index';
// Social links types and constants (from canonical source)
export type { ProfileSocialLink } from './actions/social-links';
