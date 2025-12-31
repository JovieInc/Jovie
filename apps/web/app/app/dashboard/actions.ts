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

export {
  // Tipping statistics types and helpers
  type TippingStats,
  createEmptyTippingStats,
  // Profile selection logic
  profileIsPublishable,
  selectDashboardProfile,
  // Social links types, constants, and server actions
  type ProfileSocialLink,
  type DspPlatform,
  DSP_PLATFORMS,
  getProfileSocialLinks,
  // User dashboard settings server actions
  setSidebarCollapsed,
  // Creator profile management server actions
  updateCreatorProfile,
  publishProfileBasics,
  // Core dashboard data fetching
  type DashboardData,
  prefetchDashboardData,
  getDashboardData,
  getDashboardDataFresh,
  getDashboardDataCached,
} from './actions/index';
