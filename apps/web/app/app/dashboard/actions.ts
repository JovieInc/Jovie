/**
 * Dashboard actions re-export file.
 *
 * This file re-exports all public APIs from the actions/ subdirectory,
 * maintaining backward compatibility with existing imports from
 * '@/app/app/dashboard/actions'.
 *
 * For new code, consider importing directly from the domain-specific modules:
 * - ./actions/tipping-stats - TippingStats type and helpers
 * - ./actions/profile-selection - Profile selection logic
 * - ./actions/social-links - Social links types and server actions
 * - ./actions/settings - User dashboard settings server actions
 * - ./actions/creator-profile - Creator profile management server actions
 * - ./actions/dashboard-data - Core dashboard data fetching
 */

// Types (imported directly from source to avoid "use server" conflicts)
export type { DashboardData } from './actions/dashboard-data';
// Server actions (from barrel)
export {
  createEmptyTippingStats,
  getDashboardData,
  getDashboardDataCached,
  getDashboardDataFresh,
  getProfileSocialLinks,
  prefetchDashboardData,
  profileIsPublishable,
  publishProfileBasics,
  selectDashboardProfile,
  setSidebarCollapsed,
  updateCreatorProfile,
} from './actions/index';
export type { DspPlatform, ProfileSocialLink } from './actions/social-links';
export { DSP_PLATFORMS } from './actions/social-links';
export type { TippingStats } from './actions/tipping-stats';
